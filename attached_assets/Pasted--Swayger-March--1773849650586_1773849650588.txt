-- ─────────────────────────────────────────────────────────────────────────────
-- Swayger · March Madness Special Picks System
-- Run this in Supabase SQL Editor (Project Settings → SQL Editor)
--
-- Creates:
--   1. mm_special_picks  — generalized per-round pick storage
--   2. mm_round_matchups — ranked matchup cache for scoring reference
--   3. mm_pick_scores    — scoring leaderboard (create or add columns)
--
-- Safe to re-run: uses IF NOT EXISTS + ADD COLUMN IF NOT EXISTS throughout
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. ── mm_special_picks ───────────────────────────────────────────────────────
-- Stores one row per (user, round, pick_type, matchup).
-- Upset picks: multiple rows per round (one per matchup picked).
-- Blowout / high_scorer: one row per round (delete+insert on change).

CREATE TABLE IF NOT EXISTS mm_special_picks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  round_id    text NOT NULL,
  pick_type   text NOT NULL CHECK (pick_type IN ('upset', 'blowout', 'high_scorer')),
  matchup_id  text NOT NULL,
  picked_team text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS mm_special_picks_user_round
  ON mm_special_picks (user_id, round_id);

CREATE INDEX IF NOT EXISTS mm_special_picks_round_type
  ON mm_special_picks (round_id, pick_type);

-- Row-level security
ALTER TABLE mm_special_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own special picks" ON mm_special_picks;
CREATE POLICY "Users manage own special picks"
  ON mm_special_picks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 2. ── mm_round_matchups ──────────────────────────────────────────────────────
-- Backend-populated cache of ranked matchups per round per pick type.
-- Used by the scoring engine to know which games were candidate picks.

CREATE TABLE IF NOT EXISTS mm_round_matchups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    text NOT NULL,
  pick_type   text NOT NULL CHECK (pick_type IN ('upset', 'blowout', 'high_scorer')),
  matchup_id  text NOT NULL,
  team_a      text NOT NULL,
  team_b      text NOT NULL,
  seed_a      integer NOT NULL DEFAULT 0,
  seed_b      integer NOT NULL DEFAULT 0,
  rank        integer NOT NULL DEFAULT 0,
  odds_data   jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, pick_type, matchup_id)
);

CREATE INDEX IF NOT EXISTS mm_round_matchups_round_type
  ON mm_round_matchups (round_id, pick_type);

-- Public read (backend writes via service key / anon key with no RLS)
ALTER TABLE mm_round_matchups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read round matchups" ON mm_round_matchups;
CREATE POLICY "Public read round matchups"
  ON mm_round_matchups FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service can write round matchups" ON mm_round_matchups;
CREATE POLICY "Service can write round matchups"
  ON mm_round_matchups FOR ALL
  USING (true)
  WITH CHECK (true);


-- 3. ── mm_pick_scores ─────────────────────────────────────────────────────────
-- Leaderboard table: one row per user, upserted after each score recompute.

CREATE TABLE IF NOT EXISTS mm_pick_scores (
  user_id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_points          integer NOT NULL DEFAULT 0,
  sweet_sixteen_pts     integer NOT NULL DEFAULT 0,
  elite_eight_pts       integer NOT NULL DEFAULT 0,
  final_four_pts        integer NOT NULL DEFAULT 0,
  champion_pts          integer NOT NULL DEFAULT 0,
  upset_pts             integer NOT NULL DEFAULT 0,
  correct_upsets        integer NOT NULL DEFAULT 0,
  blowout_pts           integer NOT NULL DEFAULT 0,
  correct_blowouts      integer NOT NULL DEFAULT 0,
  high_scorer_pts       integer NOT NULL DEFAULT 0,
  correct_high_scorers  integer NOT NULL DEFAULT 0,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- If the table already existed without the blowout/high_scorer columns, add them:
ALTER TABLE mm_pick_scores ADD COLUMN IF NOT EXISTS blowout_pts          integer NOT NULL DEFAULT 0;
ALTER TABLE mm_pick_scores ADD COLUMN IF NOT EXISTS correct_blowouts     integer NOT NULL DEFAULT 0;
ALTER TABLE mm_pick_scores ADD COLUMN IF NOT EXISTS high_scorer_pts      integer NOT NULL DEFAULT 0;
ALTER TABLE mm_pick_scores ADD COLUMN IF NOT EXISTS correct_high_scorers integer NOT NULL DEFAULT 0;

ALTER TABLE mm_pick_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read pick scores" ON mm_pick_scores;
CREATE POLICY "Public read pick scores"
  ON mm_pick_scores FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service can write pick scores" ON mm_pick_scores;
CREATE POLICY "Service can write pick scores"
  ON mm_pick_scores FOR ALL
  USING (true)
  WITH CHECK (true);


-- 4. ── mm_game_results ────────────────────────────────────────────────────────
-- Stores resolved game outcomes entered by admin. Needed for scoring.
-- If this table doesn't exist yet, create it.

CREATE TABLE IF NOT EXISTS mm_game_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id     text NOT NULL,
  matchup_id   text NOT NULL,
  winner_name  text NOT NULL,
  winner_seed  integer,
  loser_name   text,
  loser_seed   integer,
  winner_score integer,
  loser_score  integer,
  was_upset    boolean NOT NULL DEFAULT false,
  resolved_at  timestamptz NOT NULL DEFAULT now(),
  resolved_by  text DEFAULT 'admin',
  UNIQUE (round_id, matchup_id)
);

CREATE INDEX IF NOT EXISTS mm_game_results_round
  ON mm_game_results (round_id);

ALTER TABLE mm_game_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read game results" ON mm_game_results;
CREATE POLICY "Public read game results"
  ON mm_game_results FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service can write game results" ON mm_game_results;
CREATE POLICY "Service can write game results"
  ON mm_game_results FOR ALL
  USING (true)
  WITH CHECK (true);


-- 5. ── (Optional) Drop old mm_upset_picks table if it exists ─────────────────
-- Uncomment this block if you previously had a dedicated upset-picks table:
--
-- DROP TABLE IF EXISTS mm_upset_picks CASCADE;


-- ─── Verification ─────────────────────────────────────────────────────────────
-- After running, confirm tables exist:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name LIKE 'mm_%'
-- ORDER BY table_name;
