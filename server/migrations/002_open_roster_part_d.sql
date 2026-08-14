-- ============================================================
-- Migration 002 — Part D: Force-replace add_fantasy_season_participant_v2
--
-- Part C used CREATE OR REPLACE which did not update the live body.
-- This Part uses DROP + CREATE to guarantee a fresh function OID
-- and force plan re-resolution in the idempotent wrapper.
--
-- Run this entire block in the Supabase SQL Editor at once.
-- Safe: idempotent wrapper resolves v2 by name at runtime,
-- not by OID, so it will pick up the new function automatically.
-- ============================================================

-- ── Step 0: DIAGNOSTIC — run this first to confirm the bug is present ─────
-- You should see "fantasy_team_id" in the output.
-- If you do NOT see it, Part C already worked and you can skip Part D.
SELECT prosrc
FROM   pg_proc
WHERE  proname = 'add_fantasy_season_participant_v2';


-- ── Step 1: Drop the old function ─────────────────────────────────────────
-- The idempotent wrapper becomes temporarily invalid but resolves the new
-- function by name on its next call, so no wrapper changes are needed.

DROP FUNCTION IF EXISTS public.add_fantasy_season_participant_v2(
  uuid, uuid, text, text, uuid, boolean, uuid
);


-- ── Step 2: Create the corrected function ─────────────────────────────────
-- Key fix: fantasy_season_members does NOT have a fantasy_team_id column.
-- The team–member link is stored in fantasy_team_managers.
-- Recovery path uses LEFT JOIN fantasy_team_managers instead.
-- New-member path removes the UPDATE fantasy_season_members SET fantasy_team_id line.

CREATE FUNCTION public.add_fantasy_season_participant_v2(
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
  -- NOTE: fantasy_season_members does NOT have a fantasy_team_id column;
  -- the link is stored exclusively in fantasy_team_managers.
  IF p_league_member_id IS NOT NULL THEN
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

  -- Season member
  -- NOTE: no fantasy_team_id column here — link is via fantasy_team_managers
  INSERT INTO fantasy_season_members (
    league_season_id, league_member_id, role, is_active, draft_day_eligible
  ) VALUES (
    p_league_season_id, v_league_member_id, 'member', true, p_draft_day_eligible
  ) RETURNING id INTO v_season_member_id;

  -- Fantasy team
  INSERT INTO fantasy_teams (league_season_id, team_name)
  VALUES (p_league_season_id, trim(p_team_name))
  RETURNING id INTO v_team_id;

  -- Team manager record — this is the only link between team and season member
  INSERT INTO fantasy_team_managers (fantasy_team_id, season_member_id, role, is_active)
  VALUES (v_team_id, v_season_member_id, 'manager', true)
  RETURNING id INTO v_manager_id;

  -- ── Answer-universe append (when Draft Day card is open) ─────────────────
  -- Executed whenever p_room_id IS NOT NULL.
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

-- Restore execute permission (needed after DROP + CREATE; SECURITY DEFINER
-- functions still require explicit grants for the roles that call them).
GRANT EXECUTE ON FUNCTION public.add_fantasy_season_participant_v2(
  uuid, uuid, text, text, uuid, boolean, uuid
) TO service_role, authenticated, anon;


-- ── Step 3: Re-stamp the idempotent wrapper ────────────────────────────────
-- CREATE OR REPLACE here forces PL/pgSQL to recompile the wrapper's plan
-- on the next call, ensuring it resolves to the new v2 OID.
-- The body is identical to the previously-applied version.

CREATE OR REPLACE FUNCTION public.add_fantasy_season_participant_idempotent(
  p_league_id          UUID,
  p_league_season_id   UUID,
  p_display_name       TEXT,
  p_team_name          TEXT,
  p_draft_day_eligible BOOLEAN DEFAULT TRUE,
  p_room_id            UUID    DEFAULT NULL,
  p_idempotency_key    TEXT    DEFAULT NULL,
  p_operator_user_id   UUID    DEFAULT NULL,
  p_request_hash       TEXT    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row_count  INT     := 0;
  v_existing   RECORD;
  v_result     JSON;
  v_status     INT;
BEGIN
  IF p_idempotency_key IS NOT NULL AND p_operator_user_id IS NOT NULL THEN

    INSERT INTO fantasy_participant_operations
      (league_id, league_season_id, operator_user_id, idempotency_key, request_hash)
    VALUES
      (p_league_id, p_league_season_id, p_operator_user_id, p_idempotency_key,
       COALESCE(p_request_hash, ''))
    ON CONFLICT (operator_user_id, idempotency_key) DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      SELECT request_hash, result_json, response_status
        INTO v_existing
        FROM fantasy_participant_operations
       WHERE operator_user_id = p_operator_user_id
         AND idempotency_key  = p_idempotency_key;

      IF v_existing.request_hash IS DISTINCT FROM COALESCE(p_request_hash, '') THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'
          USING DETAIL = 'The idempotency key was previously used with a different request body. Generate a new key for a different add-member operation.';
      END IF;

      RETURN v_existing.result_json;
    END IF;

  END IF;

  SELECT add_fantasy_season_participant_v2(
    p_league_id,
    p_league_season_id,
    p_display_name,
    p_team_name,
    NULL,
    p_draft_day_eligible,
    p_room_id
  ) INTO v_result;

  IF p_idempotency_key IS NOT NULL AND p_operator_user_id IS NOT NULL THEN
    v_status := CASE WHEN (v_result->>'already_exists')::BOOLEAN THEN 200 ELSE 201 END;

    UPDATE fantasy_participant_operations
    SET
      league_member_id = (v_result->>'league_member_id')::UUID,
      season_member_id = (v_result->>'season_member_id')::UUID,
      fantasy_team_id  = (v_result->>'team_id')::UUID,
      response_status  = v_status,
      result_json      = v_result
    WHERE operator_user_id = p_operator_user_id
      AND idempotency_key  = p_idempotency_key;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_fantasy_season_participant_idempotent(
  UUID, UUID, TEXT, TEXT, BOOLEAN, UUID, TEXT, UUID, TEXT
) TO service_role;


-- ── Step 4: VERIFICATION — run after the block above ─────────────────────
-- This uses a temp table to create a throwaway league+season and call the
-- function with real data so execution reaches the INSERT section.
-- Expected: a JSON row with already_exists=false and valid UUIDs.
-- No "fantasy_team_id" column error = Part D succeeded.
DO $$
DECLARE
  v_league_id  UUID;
  v_season_id  UUID;
  v_result     JSON;
BEGIN
  INSERT INTO fantasy_leagues (league_name, sport, is_active)
  VALUES ('__partd_verify__', 'football', true)
  RETURNING id INTO v_league_id;

  INSERT INTO fantasy_league_seasons (league_id, season_year, status)
  VALUES (v_league_id, 2099, 'active')
  RETURNING id INTO v_season_id;

  SELECT add_fantasy_season_participant_v2(
    v_league_id, v_season_id, 'VerifyMember', 'Verify FC'
  ) INTO v_result;

  RAISE NOTICE 'Part D verification OK: %', v_result;

  -- Roll back the temp data so nothing is left behind
  RAISE EXCEPTION 'ROLLBACK_VERIFY' USING DETAIL = 'intentional rollback after verification';
EXCEPTION
  WHEN OTHERS THEN
    IF sqlerrm = 'ROLLBACK_VERIFY' THEN
      RAISE NOTICE 'Verification complete — temp data rolled back cleanly.';
    ELSE
      RAISE;  -- re-raise any unexpected error
    END IF;
END;
$$;
