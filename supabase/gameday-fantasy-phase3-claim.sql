-- Swayger Fantasy Phase 3: claim_fantasy_seat RPC + unique active-claim index
-- ============================================================
-- SWAYGER FANTASY PHASE 3 — MEMBER CLAIM
-- File: supabase/gameday-fantasy-phase3-claim.sql
--
-- INSTRUCTIONS: Apply in Supabase SQL Editor BEFORE deploying
-- server code that calls these functions.
-- https://app.supabase.com/project/vlxvoienyxzhyaiimccp/sql/new
--
-- What this migration adds:
--   1. Partial unique index: one active claim per seat (DB-level guard)
--   2. claim_fantasy_seat RPC: atomic claim creation with validation
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Partial unique index — one active claim per league seat
--
-- Prevents two different identities from both holding
-- is_active = true claims on the same league_member_id.
-- The explicit check in claim_fantasy_seat provides a better
-- error message before hitting this constraint.
-- ────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_member_claims_one_active_per_seat
  ON fantasy_member_claims(league_member_id)
  WHERE (is_active = true);

-- ────────────────────────────────────────────────────────────
-- 2. claim_fantasy_seat
--
-- Atomically validates and creates a member seat claim.
--
-- Identity: exactly one of p_user_id / p_guest_token must be
-- provided. The CHECK constraint on fantasy_member_claims
-- enforces the same rule at the DB layer.
--
-- Validation:
--   • p_season_id belongs to p_league_id
--   • p_member_id is active in that season AND belongs to
--     that league (cross-league manipulation protection)
--   • no conflicting active claim from a different identity
--
-- Idempotency:
--   • same identity + same seat → returns existing claim,
--     already_existed = true (safe to retry)
--
-- Returns JSON:
--   claim_id, league_member_id, season_member_id,
--   display_name, team_name, role, already_existed
--
-- Called by: POST /api/fantasy/leagues/:lid/seasons/:sid/claim
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION claim_fantasy_seat(
  p_league_id   UUID,
  p_season_id   UUID,
  p_member_id   UUID,
  p_user_id     UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_season_member_id UUID;
  v_member_role      TEXT;
  v_existing_claim   UUID;
  v_claim_id         UUID;
  v_team_id          UUID;
  v_team_name        TEXT;
  v_display_name     TEXT;
BEGIN
  -- 1. Exactly one identity required
  IF (p_user_id IS NULL AND p_guest_token IS NULL) OR
     (p_user_id IS NOT NULL AND p_guest_token IS NOT NULL) THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_token must be provided.';
  END IF;

  -- 2. Season must belong to the stated league
  IF NOT EXISTS (
    SELECT 1 FROM fantasy_league_seasons
    WHERE id = p_season_id AND league_id = p_league_id
  ) THEN
    RAISE EXCEPTION 'season_not_found';
  END IF;

  -- 3. Member must be active in this season AND belong to this league
  --    (the league_id join prevents cross-league seat manipulation)
  SELECT sm.id, sm.role
  INTO   v_season_member_id, v_member_role
  FROM   fantasy_season_members sm
  JOIN   fantasy_league_members m ON m.id = sm.league_member_id
  WHERE  sm.league_season_id  = p_season_id
    AND  sm.league_member_id  = p_member_id
    AND  sm.is_active         = true
    AND  m.league_id          = p_league_id
    AND  m.is_active          = true;

  IF v_season_member_id IS NULL THEN
    RAISE EXCEPTION 'member_not_found';
  END IF;

  -- 4. Get display name (needed in both idempotent and new-claim paths)
  SELECT display_name
  INTO   v_display_name
  FROM   fantasy_league_members
  WHERE  id = p_member_id;

  -- 5. Check for existing active claim by the SAME identity (idempotent return)
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_existing_claim
    FROM   fantasy_member_claims
    WHERE  league_member_id = p_member_id
      AND  user_id          = p_user_id
      AND  is_active        = true;
  ELSE
    SELECT id INTO v_existing_claim
    FROM   fantasy_member_claims
    WHERE  league_member_id = p_member_id
      AND  guest_token      = p_guest_token
      AND  is_active        = true;
  END IF;

  IF v_existing_claim IS NOT NULL THEN
    -- Already claimed by this identity — idempotent success
    SELECT ft.id, ft.team_name
    INTO   v_team_id, v_team_name
    FROM   fantasy_team_managers ftm
    JOIN   fantasy_teams ft ON ft.id = ftm.fantasy_team_id
    WHERE  ftm.season_member_id = v_season_member_id
      AND  ftm.is_active        = true
    LIMIT  1;

    RETURN json_build_object(
      'claim_id',         v_existing_claim,
      'league_member_id', p_member_id,
      'season_member_id', v_season_member_id,
      'display_name',     v_display_name,
      'team_name',        v_team_name,
      'role',             v_member_role,
      'already_existed',  true
    );
  END IF;

  -- 6. Check for conflicting active claim by ANY different identity.
  --    (The partial unique index also enforces this at the DB level;
  --     this explicit check gives a descriptive error instead of a
  --     cryptic unique-constraint violation.)
  IF EXISTS (
    SELECT 1 FROM fantasy_member_claims
    WHERE  league_member_id = p_member_id
      AND  is_active        = true
  ) THEN
    RAISE EXCEPTION 'seat_already_claimed';
  END IF;

  -- 7. Insert new claim
  INSERT INTO fantasy_member_claims (league_member_id, user_id, guest_token, is_active)
  VALUES (p_member_id, p_user_id, p_guest_token, true)
  RETURNING id INTO v_claim_id;

  -- 8. Fetch team info for this member
  SELECT ft.id, ft.team_name
  INTO   v_team_id, v_team_name
  FROM   fantasy_team_managers ftm
  JOIN   fantasy_teams ft ON ft.id = ftm.fantasy_team_id
  WHERE  ftm.season_member_id = v_season_member_id
    AND  ftm.is_active        = true
  LIMIT  1;

  RETURN json_build_object(
    'claim_id',         v_claim_id,
    'league_member_id', p_member_id,
    'season_member_id', v_season_member_id,
    'display_name',     v_display_name,
    'team_name',        v_team_name,
    'role',             v_member_role,
    'already_existed',  false
  );
END;
$$;
