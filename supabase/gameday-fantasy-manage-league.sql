-- Swayger Fantasy Manage League: draft_day_eligible column, atomic rename RPC, extended add-participant RPC
--
-- Apply manually in Supabase SQL Editor before using the Manage League feature.
-- Run the full file as one block.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS update_fantasy_member(UUID,TEXT,TEXT,UUID);
--   DROP FUNCTION IF EXISTS add_fantasy_season_participant_v2(UUID,UUID,TEXT,TEXT,UUID,BOOLEAN,UUID);
--   ALTER TABLE fantasy_season_members DROP COLUMN IF EXISTS draft_day_eligible;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Draft Day eligibility column
--
-- Defaults TRUE for all existing and new members.
-- Set to FALSE by add_fantasy_season_participant_v2 when pick_count > 0
-- ("Add to League Only" flow). Server-enforced; client value is never trusted.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fantasy_season_members
  ADD COLUMN IF NOT EXISTS draft_day_eligible BOOLEAN NOT NULL DEFAULT TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Atomic member rename RPC
--
-- Updates:
--   fantasy_league_members.display_name
--   fantasy_teams.team_name  (for the member's active team this season)
--
-- Propagates into active (unsettled) Draft Day:
--   gameday_props.answer_options  — label fields matching stable IDs
--   gameday_participants.display_name / team_name  — snapshot for this room
--
-- Settled Draft Day snapshots are NOT modified (historical accuracy).
-- selected_answer values are never modified (UUID-based, rename-safe).
-- Array element order is preserved via WITH ORDINALITY.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_fantasy_member(
  p_season_member_id UUID,
  p_display_name     TEXT,
  p_team_name        TEXT,
  p_season_id        UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_league_member_id UUID;
  v_team_id          UUID;
  v_room_id          UUID;
  v_card_id          UUID;
  v_props_updated    INT  := 0;
  v_participant_rows INT  := 0;
  v_participant_upd  BOOL := false;
BEGIN
  -- ── Input validation ────────────────────────────────────────────────────────
  IF trim(p_display_name) = '' THEN
    RAISE EXCEPTION 'display_name cannot be empty';
  END IF;
  IF trim(p_team_name) = '' THEN
    RAISE EXCEPTION 'team_name cannot be empty';
  END IF;

  -- ── Resolve IDs ─────────────────────────────────────────────────────────────
  SELECT league_member_id
  INTO   v_league_member_id
  FROM   fantasy_season_members
  WHERE  id = p_season_member_id;

  IF v_league_member_id IS NULL THEN
    RAISE EXCEPTION 'Season member not found';
  END IF;

  -- Active team manager assignment for this season member
  SELECT ftm.fantasy_team_id
  INTO   v_team_id
  FROM   fantasy_team_managers ftm
  WHERE  ftm.season_member_id = p_season_member_id
    AND  ftm.is_active = true
  LIMIT  1;

  -- ── Update name tables ──────────────────────────────────────────────────────
  UPDATE fantasy_league_members
  SET    display_name = trim(p_display_name),
         updated_at   = NOW()
  WHERE  id = v_league_member_id;

  IF v_team_id IS NOT NULL THEN
    UPDATE fantasy_teams
    SET    team_name  = trim(p_team_name),
           updated_at = NOW()
    WHERE  id = v_team_id;
  END IF;

  -- ── Find active unsettled Draft Day card for this season ────────────────────
  SELECT gr.id, gpc.id
  INTO   v_room_id, v_card_id
  FROM   gameday_rooms gr
  JOIN   gameday_pick_cards gpc ON gpc.room_id = gr.id
  WHERE  gr.league_season_id = p_season_id
    AND  gr.competition_type  = 'draft_day'
    AND  gr.experience_type   = 'fantasy'
    AND  gr.archived_at IS NULL
    AND  gpc.phase            = 'draft_day'
    AND  gpc.status          != 'settled'
  LIMIT  1;

  -- ── Propagate labels into active Draft Day props ────────────────────────────
  IF v_card_id IS NOT NULL THEN

    -- Update season_member label entries (preserving array order)
    UPDATE gameday_props
    SET    answer_options = (
             SELECT jsonb_agg(
               CASE WHEN (elem ->> 'id') = p_season_member_id::TEXT
                    THEN jsonb_set(elem, '{label}', to_jsonb(trim(p_display_name)))
                    ELSE elem
               END
               ORDER BY ordinality
             )
             FROM jsonb_array_elements(answer_options)
               WITH ORDINALITY AS t(elem, ordinality)
           )
    WHERE  card_id          = v_card_id
      AND  answer_target_type = 'season_member'
      AND  answer_options @> ('[{"id":"' || p_season_member_id::TEXT || '"}]')::jsonb;

    GET DIAGNOSTICS v_props_updated = ROW_COUNT;

    -- Update fantasy_team label entries (preserving array order)
    IF v_team_id IS NOT NULL THEN
      UPDATE gameday_props
      SET    answer_options = (
               SELECT jsonb_agg(
                 CASE WHEN (elem ->> 'id') = v_team_id::TEXT
                      THEN jsonb_set(elem, '{label}', to_jsonb(trim(p_team_name)))
                      ELSE elem
                 END
                 ORDER BY ordinality
               )
               FROM jsonb_array_elements(answer_options)
                 WITH ORDINALITY AS t(elem, ordinality)
             )
      WHERE  card_id          = v_card_id
        AND  answer_target_type = 'fantasy_team'
        AND  answer_options @> ('[{"id":"' || v_team_id::TEXT || '"}]')::jsonb;
    END IF;

    -- ── Update participant snapshot ───────────────────────────────────────────
    UPDATE gameday_participants
    SET    display_name = trim(p_display_name),
           team_name    = trim(p_team_name)
    WHERE  season_member_id = p_season_member_id
      AND  room_id          = v_room_id;

    GET DIAGNOSTICS v_participant_rows = ROW_COUNT;
    v_participant_upd := v_participant_rows > 0;

  END IF;

  RETURN json_build_object(
    'league_member_id',    v_league_member_id,
    'team_id',             v_team_id,
    'props_updated',       v_props_updated,
    'participant_updated', v_participant_upd
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_fantasy_member(UUID,TEXT,TEXT,UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Extended add-participant RPC (v2)
--
-- Extends the original add_fantasy_season_participant with:
--   p_draft_day_eligible  — FALSE for "Add to League Only" when picks exist.
--                           Set by server based on lifecycle; never trust client.
--   p_room_id             — When provided (pick_count=0 path), atomically appends
--                           new member/team to published answer_options snapshots.
--
-- Lifecycle rules (enforced by server before calling this RPC):
--   No Draft Day                → eligible=true,  p_room_id=null
--   Draft Day published, 0 picks→ eligible=true,  p_room_id=<room id>
--   picks > 0 OR locked/settled → eligible=false, p_room_id=null
--
-- The original add_fantasy_season_participant is unchanged and still used by
-- the league setup wizard (pre-Draft-Day path where eligible always = true).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION add_fantasy_season_participant_v2(
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
AS $$
DECLARE
  v_league_member_id UUID;
  v_season_member_id UUID;
  v_team_id          UUID;
  v_manager_id       UUID;
  v_card_id          UUID;
BEGIN
  -- ── Input validation ────────────────────────────────────────────────────────
  IF trim(p_display_name) = '' THEN
    RAISE EXCEPTION 'display_name cannot be empty';
  END IF;
  IF trim(p_team_name) = '' THEN
    RAISE EXCEPTION 'team_name cannot be empty';
  END IF;

  -- ── Verify season belongs to league ────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM fantasy_league_seasons
    WHERE  id = p_league_season_id AND league_id = p_league_id
  ) THEN
    RAISE EXCEPTION 'Season not found or does not belong to this league';
  END IF;

  -- ── Resolve or create league member ────────────────────────────────────────
  IF p_league_member_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM fantasy_league_members
      WHERE  id = p_league_member_id
        AND  league_id = p_league_id
        AND  is_active = true
    ) THEN
      RAISE EXCEPTION 'League member not found or does not belong to this league';
    END IF;
    v_league_member_id := p_league_member_id;
  ELSE
    INSERT INTO fantasy_league_members (league_id, display_name)
    VALUES (p_league_id, trim(p_display_name))
    RETURNING id INTO v_league_member_id;
  END IF;

  -- ── Upsert season member ────────────────────────────────────────────────────
  -- On INSERT: sets draft_day_eligible per p_draft_day_eligible.
  -- On CONFLICT (re-activation): preserves existing role and draft_day_eligible.
  INSERT INTO fantasy_season_members
    (league_season_id, league_member_id, role, is_active, draft_day_eligible)
  VALUES
    (p_league_season_id, v_league_member_id, 'member', true, p_draft_day_eligible)
  ON CONFLICT (league_season_id, league_member_id)
    DO UPDATE SET is_active = true
  RETURNING id INTO v_season_member_id;

  -- ── Check for existing active team-manager (idempotency) ───────────────────
  SELECT ft.id
  INTO   v_team_id
  FROM   fantasy_team_managers ftm
  JOIN   fantasy_teams ft ON ft.id = ftm.fantasy_team_id
  WHERE  ftm.season_member_id = v_season_member_id
    AND  ftm.is_active        = true
    AND  ft.is_active         = true
    AND  ft.league_season_id  = p_league_season_id;

  IF v_team_id IS NOT NULL THEN
    -- Already fully set up — return without modifying anything
    RETURN json_build_object(
      'already_exists',     true,
      'league_member_id',   v_league_member_id,
      'season_member_id',   v_season_member_id,
      'team_id',            v_team_id,
      'manager_id',         NULL,
      'draft_day_eligible', p_draft_day_eligible
    );
  END IF;

  -- ── Create team and manager ─────────────────────────────────────────────────
  INSERT INTO fantasy_teams (league_season_id, team_name)
  VALUES (p_league_season_id, trim(p_team_name))
  RETURNING id INTO v_team_id;

  INSERT INTO fantasy_team_managers (fantasy_team_id, season_member_id, role)
  VALUES (v_team_id, v_season_member_id, 'manager')
  RETURNING id INTO v_manager_id;

  -- ── Snapshot update when pick_count=0 (p_room_id provided) ─────────────────
  IF p_room_id IS NOT NULL THEN
    SELECT gpc.id
    INTO   v_card_id
    FROM   gameday_pick_cards gpc
    WHERE  gpc.room_id = p_room_id
      AND  gpc.phase   = 'draft_day'
    LIMIT  1;

    IF v_card_id IS NOT NULL THEN
      -- Append new season_member entry to props that target season members
      UPDATE gameday_props
      SET    answer_options = answer_options || jsonb_build_array(
               jsonb_build_object(
                 'id',    v_season_member_id::TEXT,
                 'label', trim(p_display_name),
                 'type',  'season_member'
               )
             )
      WHERE  card_id          = v_card_id
        AND  answer_target_type = 'season_member';

      -- Append new fantasy_team entry to props that target fantasy teams
      UPDATE gameday_props
      SET    answer_options = answer_options || jsonb_build_array(
               jsonb_build_object(
                 'id',    v_team_id::TEXT,
                 'label', trim(p_team_name),
                 'type',  'fantasy_team'
               )
             )
      WHERE  card_id          = v_card_id
        AND  answer_target_type = 'fantasy_team';
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

GRANT EXECUTE ON FUNCTION add_fantasy_season_participant_v2(UUID,UUID,TEXT,TEXT,UUID,BOOLEAN,UUID) TO service_role;
