-- ════════════════════════════════════════════════════════════════════════════
-- Swayger — March Madness 2026 Special Picks System Migration
-- Run this entire file in the Supabase SQL Editor (once).
-- All statements use IF NOT EXISTS / OR REPLACE so re-running is safe.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. mm_locked_takes ─────────────────────────────────────────────────────
-- Stores pre-tournament bracket picks (Sweet 16, Elite 8, Final Four, Champion)
CREATE TABLE IF NOT EXISTS mm_locked_takes (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  take_type        text NOT NULL CHECK (take_type IN ('sweet_sixteen','elite_eight','final_four','champion')),
  teams            text[] NOT NULL DEFAULT '{}',
  is_submitted     boolean NOT NULL DEFAULT false,
  is_second_chance boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, take_type)
);

-- Enable RLS
ALTER TABLE mm_locked_takes ENABLE ROW LEVEL SECURITY;

-- Users can read and write their own takes
DROP POLICY IF EXISTS "users_own_locked_takes" ON mm_locked_takes;
CREATE POLICY "users_own_locked_takes" ON mm_locked_takes
  FOR ALL USING (auth.uid() = user_id);

-- ─── 2. mm_special_picks ────────────────────────────────────────────────────
-- Generalized per-round special picks: upset, blowout, high_scorer
-- Replaces the old mm_upset_picks table.
CREATE TABLE IF NOT EXISTS mm_special_picks (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  round_id          text NOT NULL,
  pick_type         text NOT NULL CHECK (pick_type IN ('upset','blowout','high_scorer')),
  matchup_id        text NOT NULL,
  picked_team       text,
  points_multiplier numeric NOT NULL DEFAULT 1.0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE mm_special_picks ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own special picks
DROP POLICY IF EXISTS "users_own_special_picks" ON mm_special_picks;
CREATE POLICY "users_own_special_picks" ON mm_special_picks
  FOR ALL USING (auth.uid() = user_id);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS mm_special_picks_user_round
  ON mm_special_picks (user_id, round_id);

CREATE INDEX IF NOT EXISTS mm_special_picks_round_type
  ON mm_special_picks (round_id, pick_type);

-- ─── 3. mm_round_matchups ───────────────────────────────────────────────────
-- Ranked matchup candidates cached per round+type.
-- Written by the backend when a round's matchups are first fetched.
-- Used by scoring to know which matchup_id was the blowout/high_scorer winner.
CREATE TABLE IF NOT EXISTS mm_round_matchups (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id    text NOT NULL,
  pick_type   text NOT NULL CHECK (pick_type IN ('upset','blowout','high_scorer')),
  matchup_id  text NOT NULL,
  team_a      text,
  team_b      text,
  seed_a      integer,
  seed_b      integer,
  rank        integer,
  odds_data   jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, pick_type, matchup_id)
);

-- Service role (backend) needs full access; anon needs read
ALTER TABLE mm_round_matchups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_round_matchups" ON mm_round_matchups;
CREATE POLICY "anon_read_round_matchups" ON mm_round_matchups
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "service_write_round_matchups" ON mm_round_matchups;
CREATE POLICY "service_write_round_matchups" ON mm_round_matchups
  FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS mm_round_matchups_round_type
  ON mm_round_matchups (round_id, pick_type);

-- ─── 4. mm_game_results ─────────────────────────────────────────────────────
-- Final results for each tournament game. Entered by admin; used for scoring.
CREATE TABLE IF NOT EXISTS mm_game_results (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id      text NOT NULL,
  matchup_id    text NOT NULL,
  winner_name   text,
  winner_seed   integer,
  loser_name    text,
  loser_seed    integer,
  winner_score  integer,
  loser_score   integer,
  was_upset     boolean NOT NULL DEFAULT false,
  resolved_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, matchup_id)
);

-- Public read; admin writes via service role
ALTER TABLE mm_game_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_game_results" ON mm_game_results;
CREATE POLICY "public_read_game_results" ON mm_game_results
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "service_write_game_results" ON mm_game_results;
CREATE POLICY "service_write_game_results" ON mm_game_results
  FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS mm_game_results_round
  ON mm_game_results (round_id);

-- ─── 5. mm_pick_scores ──────────────────────────────────────────────────────
-- Aggregated scoring for the picks leaderboard.
-- Upserted by the admin scoring endpoint; one row per user.
CREATE TABLE IF NOT EXISTS mm_pick_scores (
  user_id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_points          numeric NOT NULL DEFAULT 0,
  sweet_sixteen_pts     numeric NOT NULL DEFAULT 0,
  elite_eight_pts       numeric NOT NULL DEFAULT 0,
  final_four_pts        numeric NOT NULL DEFAULT 0,
  champion_pts          numeric NOT NULL DEFAULT 0,
  upset_pts             numeric NOT NULL DEFAULT 0,
  correct_upsets        integer NOT NULL DEFAULT 0,
  blowout_pts           numeric NOT NULL DEFAULT 0,
  correct_blowouts      integer NOT NULL DEFAULT 0,
  high_scorer_pts       numeric NOT NULL DEFAULT 0,
  correct_high_scorers  integer NOT NULL DEFAULT 0,
  is_second_chance      boolean NOT NULL DEFAULT false,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Public read so leaderboard works without auth
ALTER TABLE mm_pick_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_pick_scores" ON mm_pick_scores;
CREATE POLICY "public_read_pick_scores" ON mm_pick_scores
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "service_write_pick_scores" ON mm_pick_scores;
CREATE POLICY "service_write_pick_scores" ON mm_pick_scores
  FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS mm_pick_scores_total_points
  ON mm_pick_scores (total_points DESC);

-- ─── 6. mm_share_events ─────────────────────────────────────────────────────
-- Analytics: logged whenever a user shares a pick receipt.
-- This is also in docs/migrations/mm_share_events.sql — safe to re-run.
CREATE TABLE IF NOT EXISTS mm_share_events (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pick_type   text,
  round_id    text,
  matchup_id  text,
  shared_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mm_share_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_write_share_events" ON mm_share_events;
CREATE POLICY "service_write_share_events" ON mm_share_events
  FOR ALL USING (true);

-- ─── 7. SECURITY DEFINER RPCs ───────────────────────────────────────────────

-- get_all_mm_special_picks
-- Returns all special picks (bypasses RLS) so the scoring endpoint
-- can aggregate across all users using the anon key.
CREATE OR REPLACE FUNCTION get_all_mm_special_picks()
RETURNS SETOF mm_special_picks
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM mm_special_picks;
$$;

-- get_all_notification_profiles
-- Returns profiles that have a notification email set.
-- Used by the email blast system to find who to notify.
CREATE OR REPLACE FUNCTION get_all_notification_profiles()
RETURNS TABLE (
  id                 uuid,
  username           text,
  display_name       text,
  notification_email text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, username, display_name, notification_email
  FROM profiles
  WHERE notification_email IS NOT NULL AND notification_email != '';
$$;

-- ─── 8. Add blowout_pts / high_scorer_pts to mm_pick_scores if upgrading ────
-- Safe to run even if columns already exist (ALTER TABLE IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mm_pick_scores' AND column_name = 'blowout_pts'
  ) THEN
    ALTER TABLE mm_pick_scores ADD COLUMN blowout_pts numeric NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mm_pick_scores' AND column_name = 'correct_blowouts'
  ) THEN
    ALTER TABLE mm_pick_scores ADD COLUMN correct_blowouts integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mm_pick_scores' AND column_name = 'high_scorer_pts'
  ) THEN
    ALTER TABLE mm_pick_scores ADD COLUMN high_scorer_pts numeric NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mm_pick_scores' AND column_name = 'correct_high_scorers'
  ) THEN
    ALTER TABLE mm_pick_scores ADD COLUMN correct_high_scorers integer NOT NULL DEFAULT 0;
  END IF;
END $$;
