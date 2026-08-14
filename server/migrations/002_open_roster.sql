-- ============================================================
-- Migration 002 — Open Roster
-- Apply manually in Supabase SQL Editor.
-- Rerunnable: all statements use IF NOT EXISTS / OR REPLACE.
-- ============================================================

-- ── A. roster_revision on gameday_pick_cards ─────────────────
-- Tracks how many times the open Draft Day answer universe has
-- expanded (member added while card.status='open').
-- Incremented atomically inside add_fantasy_season_participant_v2
-- whenever a new member is appended to answer_options.
-- Classic Game Day cards are unaffected (roster_revision stays 0).

ALTER TABLE gameday_pick_cards
  ADD COLUMN IF NOT EXISTS roster_revision INTEGER NOT NULL DEFAULT 0;

-- ── B. answer_universe_revision on gameday_picks ─────────────
-- Mirrors the card's roster_revision at the time the pick was
-- submitted. When pick.answer_universe_revision < card.roster_revision,
-- the pick was made before the latest roster expansion and should
-- be flagged "Updated — review your pick" in the Draft Day play UI.
-- Backward compatible: existing picks default to 0.

ALTER TABLE gameday_picks
  ADD COLUMN IF NOT EXISTS answer_universe_revision INTEGER NOT NULL DEFAULT 0;

-- ── C. Updated add_fantasy_season_participant_v2 ─────────────
-- Changes from previous version:
--   • Appends new member/team to answer_options whenever
--     p_room_id IS NOT NULL (previously: only when pick_count=0,
--     which was enforced by the route, not the RPC).
--   • Increments gameday_pick_cards.roster_revision atomically
--     after each successful append.
-- The idempotent wrapper (add_fantasy_season_participant_idempotent)
-- is unchanged — replay returns cached result_json without re-calling
-- v2, so roster_revision is NOT double-incremented on replay.

CREATE OR REPLACE FUNCTION public.add_fantasy_season_participant_v2(
  p_league_id          UUID,
  p_league_season_id   UUID,
  p_display_name       TEXT,
  p_team_name          TEXT,
  p_league_member_id   UUID    DEFAULT NULL,
  p_draft_day_eligible BOOLEAN DEFAULT TRUE,
  p_room_id            UUID    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_member_id UUID;
  v_season_member_id UUID;
  v_team_id          UUID;
  v_manager_id       UUID;
  v_card_id          UUID;
  v_existing_sm_id   UUID;
  v_existing_team_id UUID;
BEGIN
  -- Input validation
  IF trim(p_display_name) = '' THEN
    RAISE EXCEPTION 'display_name cannot be empty';
  END IF;
  IF trim(p_team_name) = '' THEN
    RAISE EXCEPTION 'team_name cannot be empty';
  END IF;

  -- Verify league exists
  IF NOT EXISTS (
    SELECT 1 FROM fantasy_leagues WHERE id = p_league_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Fantasy league not found: %', p_league_id;
  END IF;

  -- Verify season belongs to league
  IF NOT EXISTS (
    SELECT 1 FROM fantasy_league_seasons
    WHERE id = p_league_season_id AND league_id = p_league_id
  ) THEN
    RAISE EXCEPTION 'Season % does not belong to league %',
      p_league_season_id, p_league_id;
  END IF;

  -- Recovery path: existing league_member_id provided
  IF p_league_member_id IS NOT NULL THEN
    SELECT sm.id, sm.fantasy_team_id
    INTO   v_existing_sm_id, v_existing_team_id
    FROM   fantasy_season_members sm
    WHERE  sm.league_season_id = p_league_season_id
      AND  sm.league_member_id = p_league_member_id
      AND  sm.is_active        = true
    LIMIT 1;

    IF v_existing_sm_id IS NOT NULL AND v_existing_team_id IS NOT NULL THEN
      SELECT id INTO v_manager_id
      FROM   fantasy_team_managers
      WHERE  fantasy_team_id  = v_existing_team_id
        AND  season_member_id = v_existing_sm_id
        AND  is_active        = true
      LIMIT 1;

      RETURN json_build_object(
        'already_exists',     true,
        'league_member_id',   p_league_member_id,
        'season_member_id',   v_existing_sm_id,
        'team_id',            v_existing_team_id,
        'manager_id',         v_manager_id,
        'draft_day_eligible', p_draft_day_eligible
      );
    END IF;

    v_league_member_id := p_league_member_id;
  ELSE
    -- New league member
    INSERT INTO fantasy_league_members (league_id, display_name, is_active)
    VALUES (p_league_id, trim(p_display_name), true)
    RETURNING id INTO v_league_member_id;
  END IF;

  -- Season member
  INSERT INTO fantasy_season_members (
    league_season_id, league_member_id, role, is_active, draft_day_eligible
  ) VALUES (
    p_league_season_id, v_league_member_id, 'member', true, p_draft_day_eligible
  ) RETURNING id INTO v_season_member_id;

  -- Fantasy team
  INSERT INTO fantasy_teams (league_season_id, team_name)
  VALUES (p_league_season_id, trim(p_team_name))
  RETURNING id INTO v_team_id;

  -- Link team → season member
  UPDATE fantasy_season_members
  SET    fantasy_team_id = v_team_id
  WHERE  id = v_season_member_id;

  -- Team manager
  INSERT INTO fantasy_team_managers (fantasy_team_id, season_member_id, role, is_active)
  VALUES (v_team_id, v_season_member_id, 'manager', true)
  RETURNING id INTO v_manager_id;

  -- ── Answer-universe append (when Draft Day card is open) ──────────────────
  -- Executed whenever p_room_id IS NOT NULL.
  -- The route now passes p_room_id for any open card, regardless of pick_count.
  -- roster_revision is incremented exactly once per successful new-member add;
  -- the idempotency wrapper prevents double-increment on replay.

  IF p_room_id IS NOT NULL THEN
    SELECT id INTO v_card_id
    FROM   gameday_pick_cards
    WHERE  room_id = p_room_id AND phase = 'draft_day'
    LIMIT  1;

    IF v_card_id IS NOT NULL THEN
      -- Append new season_member option to all roster-member props
      UPDATE gameday_props
      SET    answer_options = answer_options || jsonb_build_array(
               jsonb_build_object(
                 'id',    v_season_member_id::text,
                 'label', trim(p_display_name),
                 'type',  'season_member'
               )
             )
      WHERE  card_id           = v_card_id
        AND  answer_target_type = 'season_member';

      -- Append new fantasy_team option to all roster-team props
      UPDATE gameday_props
      SET    answer_options = answer_options || jsonb_build_array(
               jsonb_build_object(
                 'id',    v_team_id::text,
                 'label', trim(p_team_name),
                 'type',  'fantasy_team'
               )
             )
      WHERE  card_id           = v_card_id
        AND  answer_target_type = 'fantasy_team';

      -- Increment roster_revision exactly once for this card
      UPDATE gameday_pick_cards
      SET    roster_revision = roster_revision + 1
      WHERE  id = v_card_id;
    END IF;
  END IF;

  RETURN json_build_object(
    'already_exists',     false,
    'league_member_id',   v_league_member_id,
    'season_member_id',   v_season_member_id,
    'team_id',            v_team_id,
    'manager_id',         v_manager_id,
    'draft_day_eligible', p_draft_day_eligible
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_fantasy_season_participant_v2(
  UUID, UUID, TEXT, TEXT, UUID, BOOLEAN, UUID
) TO service_role, authenticated, anon;
