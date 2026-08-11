-- Swayger Fantasy Phase 2: setup_fantasy_league + add_fantasy_season_participant RPCs
-- ============================================================
-- SWAYGER FANTASY PHASE 2 — COMMISSIONER SETUP RPCs
-- File: supabase/gameday-fantasy-phase2-setup.sql
--
-- INSTRUCTIONS: Apply in Supabase SQL Editor BEFORE deploying
-- the server code that calls these functions.
-- https://app.supabase.com/project/vlxvoienyxzhyaiimccp/sql/new
--
-- Pattern: PL/pgSQL functions called via .rpc() from
-- server/routes-fantasy.ts — same established pattern as
-- supabase/swayger-points-migration.sql (create_swayger, etc.).
--
-- Every multi-record operation is atomic: PL/pgSQL function
-- body executes as a single implicit transaction.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. setup_fantasy_league
--
-- Atomic bootstrap: creates all SEVEN records or none.
--
--   1. fantasy_leagues
--   2. fantasy_league_members  (creator)
--   3. fantasy_member_claims   (user_id → league_member)
--   4. fantasy_league_seasons  (initial season, status='upcoming')
--   5. fantasy_season_members  (creator, role='commissioner')
--   6. fantasy_teams           (commissioner's own team)       ← v2 addition
--   7. fantasy_team_managers   (commissioner manages team)     ← v2 addition
--
-- The commissioner's team is created here rather than in a separate
-- add_fantasy_season_participant call so the invariant is enforced
-- atomically: a successful setup always produces a commissioner with
-- a team. A failed network call after setup returns can never leave
-- the commissioner without a team.
--
-- Called by: POST /api/fantasy/leagues/setup
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION setup_fantasy_league(
  p_user_id               UUID,
  p_league_name           TEXT,
  p_sport                 TEXT,
  p_display_name          TEXT,
  p_team_name             TEXT,
  p_season_year           INTEGER,
  p_reward_description    TEXT DEFAULT NULL,
  p_reward_amount_display TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_league_id        UUID;
  v_league_member_id UUID;
  v_claim_id         UUID;
  v_season_id        UUID;
  v_season_member_id UUID;
  v_team_id          UUID;
  v_manager_id       UUID;
BEGIN
  -- Validate inputs (server also validates, but DB is the authority)
  IF p_sport NOT IN ('football', 'basketball', 'baseball') THEN
    RAISE EXCEPTION 'Invalid sport: %. Must be football, basketball, or baseball.', p_sport;
  END IF;
  IF trim(p_league_name) = '' THEN
    RAISE EXCEPTION 'League name cannot be empty.';
  END IF;
  IF trim(p_display_name) = '' THEN
    RAISE EXCEPTION 'Display name cannot be empty.';
  END IF;
  IF trim(p_team_name) = '' THEN
    RAISE EXCEPTION 'Team name cannot be empty.';
  END IF;
  IF p_season_year < 1900 OR p_season_year > 2100 THEN
    RAISE EXCEPTION 'Season year must be between 1900 and 2100.';
  END IF;

  -- 1. fantasy_leagues
  INSERT INTO fantasy_leagues (league_name, sport, created_by)
  VALUES (trim(p_league_name), p_sport, p_user_id)
  RETURNING id INTO v_league_id;

  -- 2. fantasy_league_members (creator)
  INSERT INTO fantasy_league_members (league_id, display_name)
  VALUES (v_league_id, trim(p_display_name))
  RETURNING id INTO v_league_member_id;

  -- 3. fantasy_member_claims (user_id → league_member)
  INSERT INTO fantasy_member_claims (league_member_id, user_id, is_active)
  VALUES (v_league_member_id, p_user_id, true)
  RETURNING id INTO v_claim_id;

  -- 4. fantasy_league_seasons (initial season)
  INSERT INTO fantasy_league_seasons (
    league_id,
    season_year,
    status,
    default_reward_description,
    default_reward_amount_display
  )
  VALUES (
    v_league_id,
    p_season_year,
    'upcoming',
    p_reward_description,
    p_reward_amount_display
  )
  RETURNING id INTO v_season_id;

  -- 5. fantasy_season_members (creator as commissioner)
  INSERT INTO fantasy_season_members (league_season_id, league_member_id, role)
  VALUES (v_season_id, v_league_member_id, 'commissioner')
  RETURNING id INTO v_season_member_id;

  -- 6. fantasy_teams — commissioner's own team (atomic with league creation)
  INSERT INTO fantasy_teams (league_season_id, team_name)
  VALUES (v_season_id, trim(p_team_name))
  RETURNING id INTO v_team_id;

  -- 7. fantasy_team_managers — commissioner manages their team
  INSERT INTO fantasy_team_managers (fantasy_team_id, season_member_id, role)
  VALUES (v_team_id, v_season_member_id, 'manager')
  RETURNING id INTO v_manager_id;

  RETURN json_build_object(
    'league_id',        v_league_id,
    'league_member_id', v_league_member_id,
    'claim_id',         v_claim_id,
    'season_id',        v_season_id,
    'season_member_id', v_season_member_id,
    'team_id',          v_team_id,
    'manager_id',       v_manager_id
  );
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 2. add_fantasy_season_participant
--
-- Atomic setup row: one commissioner action to add a participant
-- and their fantasy team to a season.
--
-- For a NEW participant (p_league_member_id IS NULL):
--   Creates: fantasy_league_members → fantasy_season_members
--            → fantasy_teams → fantasy_team_managers
--
-- For COMMISSIONER's own row (p_league_member_id IS NOT NULL):
--   Skips league_member creation (uses existing row).
--   Upserts season_member with ON CONFLICT: sets is_active=true
--   but DOES NOT overwrite the existing 'commissioner' role.
--   Creates: fantasy_teams → fantasy_team_managers
--
-- Duplicate prevention:
--   If the resolved season_member already has an active
--   team-manager assignment in this season, returns the existing
--   relationship with already_exists=true. No duplicate is created.
--   Supports the UI disabling submission during pending calls and
--   allows safe retry on network failure.
--
-- Cross-league integrity (enforced atomically inside function):
--   A. p_league_season_id must belong to p_league_id.
--   B. If p_league_member_id is supplied, it must belong to p_league_id.
--
-- Called by: POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/participants
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION add_fantasy_season_participant(
  p_league_id        UUID,
  p_league_season_id UUID,
  p_display_name     TEXT,
  p_team_name        TEXT,
  p_league_member_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_season_league_id    UUID;
  v_member_league_id    UUID;
  v_league_member_id    UUID;
  v_season_member_id    UUID;
  v_team_id             UUID;
  v_manager_id          UUID;
  v_existing_manager_id UUID;
  v_existing_team_id    UUID;
BEGIN
  -- Validate display_name and team_name
  IF trim(p_display_name) = '' THEN
    RAISE EXCEPTION 'Display name cannot be empty.';
  END IF;
  IF trim(p_team_name) = '' THEN
    RAISE EXCEPTION 'Team name cannot be empty.';
  END IF;

  -- Integrity check A: season must belong to this league
  SELECT league_id
  INTO v_season_league_id
  FROM fantasy_league_seasons
  WHERE id = p_league_season_id;

  IF v_season_league_id IS NULL THEN
    RAISE EXCEPTION 'Season not found.';
  END IF;
  IF v_season_league_id <> p_league_id THEN
    RAISE EXCEPTION 'Season does not belong to the specified league.';
  END IF;

  -- Integrity check B: if league_member_id supplied, it must belong to this league
  IF p_league_member_id IS NOT NULL THEN
    SELECT league_id
    INTO v_member_league_id
    FROM fantasy_league_members
    WHERE id = p_league_member_id;

    IF v_member_league_id IS NULL THEN
      RAISE EXCEPTION 'League member not found.';
    END IF;
    IF v_member_league_id <> p_league_id THEN
      RAISE EXCEPTION 'League member does not belong to the specified league.';
    END IF;

    v_league_member_id := p_league_member_id;
  ELSE
    -- New participant: create league member
    INSERT INTO fantasy_league_members (league_id, display_name)
    VALUES (p_league_id, trim(p_display_name))
    RETURNING id INTO v_league_member_id;
  END IF;

  -- Upsert season_member.
  -- ON CONFLICT: if the row already exists (e.g. commissioner's own row),
  -- set is_active=true (no-op if already true) WITHOUT touching role.
  INSERT INTO fantasy_season_members (league_season_id, league_member_id, role)
  VALUES (p_league_season_id, v_league_member_id, 'member')
  ON CONFLICT (league_season_id, league_member_id)
  DO UPDATE SET is_active = true
  RETURNING id INTO v_season_member_id;

  -- Duplicate check: does this season_member already manage an active team
  -- in this season? If so, return existing relationship — no duplicate.
  SELECT ftm.id, ft.id
  INTO v_existing_manager_id, v_existing_team_id
  FROM fantasy_team_managers ftm
  JOIN fantasy_teams ft ON ft.id = ftm.fantasy_team_id
  WHERE ftm.season_member_id = v_season_member_id
    AND ftm.is_active = true
    AND ft.league_season_id = p_league_season_id
    AND ft.is_active = true
  LIMIT 1;

  IF v_existing_manager_id IS NOT NULL THEN
    RETURN json_build_object(
      'already_exists',   true,
      'league_member_id', v_league_member_id,
      'season_member_id', v_season_member_id,
      'team_id',          v_existing_team_id,
      'manager_id',       v_existing_manager_id
    );
  END IF;

  -- Create fantasy team for this season
  INSERT INTO fantasy_teams (league_season_id, team_name)
  VALUES (p_league_season_id, trim(p_team_name))
  RETURNING id INTO v_team_id;

  -- Assign as team manager (role='manager'; co_manager support preserved
  -- for future use via a separate route not built in Phase 2)
  INSERT INTO fantasy_team_managers (fantasy_team_id, season_member_id, role)
  VALUES (v_team_id, v_season_member_id, 'manager')
  RETURNING id INTO v_manager_id;

  RETURN json_build_object(
    'already_exists',   false,
    'league_member_id', v_league_member_id,
    'season_member_id', v_season_member_id,
    'team_id',          v_team_id,
    'manager_id',       v_manager_id
  );
END;
$$;
