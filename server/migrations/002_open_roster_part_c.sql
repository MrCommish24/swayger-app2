-- ============================================================
-- Migration 002 — Part C: FIX add_fantasy_season_participant_v2
-- Run this block in the Supabase SQL Editor.
-- Safe to re-run (CREATE OR REPLACE).
--
-- Part B had a bug: it referenced fantasy_season_members.fantasy_team_id
-- which does not exist (the link is via fantasy_team_managers instead).
-- This part corrects the function body without changing the signature.
-- ============================================================

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

  -- Recovery path: existing league_member_id provided (seat-claim / re-add flows)
  IF p_league_member_id IS NOT NULL THEN
    -- fantasy_season_members does NOT have a fantasy_team_id column;
    -- the team link is stored in fantasy_team_managers.
    SELECT sm.id, ftm.fantasy_team_id
    INTO   v_existing_sm_id, v_existing_team_id
    FROM   fantasy_season_members sm
    LEFT JOIN fantasy_team_managers ftm
           ON ftm.season_member_id = sm.id AND ftm.is_active = true
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

  -- Season member (no fantasy_team_id column here — link is via fantasy_team_managers)
  INSERT INTO fantasy_season_members (
    league_season_id, league_member_id, role, is_active, draft_day_eligible
  ) VALUES (
    p_league_season_id, v_league_member_id, 'member', true, p_draft_day_eligible
  ) RETURNING id INTO v_season_member_id;

  -- Fantasy team
  INSERT INTO fantasy_teams (league_season_id, team_name)
  VALUES (p_league_season_id, trim(p_team_name))
  RETURNING id INTO v_team_id;

  -- Team manager record links the team to the season member
  INSERT INTO fantasy_team_managers (fantasy_team_id, season_member_id, role, is_active)
  VALUES (v_team_id, v_season_member_id, 'manager', true)
  RETURNING id INTO v_manager_id;

  -- ── Answer-universe append (when Draft Day card is open) ─────────────────
  -- Executed whenever p_room_id IS NOT NULL.
  -- The route passes p_room_id for any open card regardless of pick_count.
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
      WHERE  card_id            = v_card_id
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
      WHERE  card_id            = v_card_id
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

-- ── Verification ─────────────────────────────────────────────
-- With a random UUID, should say 'Fantasy league not found: …' (not a column error).
-- SELECT public.add_fantasy_season_participant_v2(
--   '00000000-0000-0000-0000-000000000000',
--   '00000000-0000-0000-0000-000000000000',
--   'Test', 'Test FC'
-- );
