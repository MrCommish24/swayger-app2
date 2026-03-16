-- =============================================================================
-- Swayger — March Madness Special Picks Migration
-- Run once in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Safe to re-run: tables use IF NOT EXISTS; policies use DROP IF EXISTS
-- =============================================================================

-- ── 1. mm_locked_takes ───────────────────────────────────────────────────────
-- Stores bracket takes (Sweet 16 / Elite 8 / Final Four / Champion picks)

CREATE TABLE IF NOT EXISTS mm_locked_takes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  take_type    text        NOT NULL CHECK (take_type IN ('sweet_sixteen','elite_eight','final_four','champion')),
  teams        text[]      NOT NULL DEFAULT '{}',
  is_submitted boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, take_type)
);

ALTER TABLE mm_locked_takes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mm_locked_takes_select" ON mm_locked_takes;
DROP POLICY IF EXISTS "mm_locked_takes_insert" ON mm_locked_takes;
DROP POLICY IF EXISTS "mm_locked_takes_update" ON mm_locked_takes;

CREATE POLICY "mm_locked_takes_select" ON mm_locked_takes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mm_locked_takes_insert" ON mm_locked_takes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mm_locked_takes_update" ON mm_locked_takes FOR UPDATE USING (auth.uid() = user_id);


-- ── 2. mm_special_picks ──────────────────────────────────────────────────────
-- Stores per-round upset / blowout / high_scorer picks

CREATE TABLE IF NOT EXISTS mm_special_picks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  round_id    text        NOT NULL,
  pick_type   text        NOT NULL CHECK (pick_type IN ('upset','blowout','high_scorer')),
  matchup_id  text        NOT NULL,
  picked_team text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, round_id, pick_type, matchup_id)
);

ALTER TABLE mm_special_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mm_special_picks_select" ON mm_special_picks;
DROP POLICY IF EXISTS "mm_special_picks_insert" ON mm_special_picks;
DROP POLICY IF EXISTS "mm_special_picks_delete" ON mm_special_picks;

CREATE POLICY "mm_special_picks_select" ON mm_special_picks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mm_special_picks_insert" ON mm_special_picks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mm_special_picks_delete" ON mm_special_picks FOR DELETE USING (auth.uid() = user_id);


-- ── 3. mm_round_matchups ─────────────────────────────────────────────────────
-- Ranked matchup candidates per round, written by the Express backend.
-- Used by the scoring engine to know which matchup won each pick category.

CREATE TABLE IF NOT EXISTS mm_round_matchups (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id   text        NOT NULL,
  pick_type  text        NOT NULL,
  matchup_id text        NOT NULL,
  team_a     text,
  team_b     text,
  seed_a     integer,
  seed_b     integer,
  rank       integer,
  odds_data  jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, pick_type, matchup_id)
);

ALTER TABLE mm_round_matchups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mm_round_matchups_select" ON mm_round_matchups;
DROP POLICY IF EXISTS "mm_round_matchups_insert" ON mm_round_matchups;
DROP POLICY IF EXISTS "mm_round_matchups_update" ON mm_round_matchups;

-- Public read (needed by the picks UI and scoring display)
CREATE POLICY "mm_round_matchups_select" ON mm_round_matchups FOR SELECT USING (true);
-- Backend writes via anon key when serving ranked matchups
CREATE POLICY "mm_round_matchups_insert" ON mm_round_matchups FOR INSERT WITH CHECK (true);
CREATE POLICY "mm_round_matchups_update" ON mm_round_matchups FOR UPDATE USING (true);


-- ── 4. mm_game_results ───────────────────────────────────────────────────────
-- Game outcomes entered by admin. Used by the scoring engine.

CREATE TABLE IF NOT EXISTS mm_game_results (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id     text        NOT NULL,
  matchup_id   text        NOT NULL,
  winner_name  text,
  winner_seed  integer,
  loser_name   text,
  loser_seed   integer,
  winner_score integer,
  loser_score  integer,
  was_upset    boolean     NOT NULL DEFAULT false,
  resolved_at  timestamptz NOT NULL DEFAULT now(),
  resolved_by  text,
  UNIQUE (round_id, matchup_id)
);

ALTER TABLE mm_game_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mm_game_results_select" ON mm_game_results;
DROP POLICY IF EXISTS "mm_game_results_insert" ON mm_game_results;
DROP POLICY IF EXISTS "mm_game_results_update" ON mm_game_results;

CREATE POLICY "mm_game_results_select" ON mm_game_results FOR SELECT USING (true);
CREATE POLICY "mm_game_results_insert" ON mm_game_results FOR INSERT WITH CHECK (true);
CREATE POLICY "mm_game_results_update" ON mm_game_results FOR UPDATE USING (true);


-- ── 5. mm_pick_scores ────────────────────────────────────────────────────────
-- Computed scores per user (written by the admin scoring endpoint).

CREATE TABLE IF NOT EXISTS mm_pick_scores (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_points         integer     NOT NULL DEFAULT 0,
  sweet_sixteen_pts    integer     NOT NULL DEFAULT 0,
  elite_eight_pts      integer     NOT NULL DEFAULT 0,
  final_four_pts       integer     NOT NULL DEFAULT 0,
  champion_pts         integer     NOT NULL DEFAULT 0,
  upset_pts            integer     NOT NULL DEFAULT 0,
  correct_upsets       integer     NOT NULL DEFAULT 0,
  blowout_pts          integer     NOT NULL DEFAULT 0,
  correct_blowouts     integer     NOT NULL DEFAULT 0,
  high_scorer_pts      integer     NOT NULL DEFAULT 0,
  correct_high_scorers integer     NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE mm_pick_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mm_pick_scores_select" ON mm_pick_scores;
DROP POLICY IF EXISTS "mm_pick_scores_insert" ON mm_pick_scores;
DROP POLICY IF EXISTS "mm_pick_scores_update" ON mm_pick_scores;

-- Public read for the leaderboard
CREATE POLICY "mm_pick_scores_select" ON mm_pick_scores FOR SELECT USING (true);
-- Backend writes scores via anon key
CREATE POLICY "mm_pick_scores_insert" ON mm_pick_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "mm_pick_scores_update" ON mm_pick_scores FOR UPDATE USING (true);


-- =============================================================================
-- Done. All 5 tables created (or already existed).
-- =============================================================================
