-- ================================================================
-- MARCH MADNESS PICKS MIGRATION
-- Run in Supabase SQL Editor
-- ================================================================

-- 1. Locked Takes: Champion, Final Four, Elite Eight, Sweet Sixteen
CREATE TABLE IF NOT EXISTS mm_locked_takes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  take_type   TEXT NOT NULL CHECK (take_type IN ('champion','final_four','elite_eight','sweet_sixteen')),
  teams       TEXT[] NOT NULL,
  is_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, take_type)
);

ALTER TABLE mm_locked_takes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own locked takes" ON mm_locked_takes;
CREATE POLICY "Users manage own locked takes" ON mm_locked_takes
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can read locked takes" ON mm_locked_takes;
CREATE POLICY "Anyone can read locked takes" ON mm_locked_takes
  FOR SELECT USING (TRUE);

-- 2. Upset Picks: round-based (up to 3/2/1/1 per round)
CREATE TABLE IF NOT EXISTS mm_upset_picks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  round_id    TEXT NOT NULL,
  matchup_id  TEXT NOT NULL,
  upset_team  TEXT NOT NULL,
  is_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, round_id, matchup_id)
);

ALTER TABLE mm_upset_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own upset picks" ON mm_upset_picks;
CREATE POLICY "Users manage own upset picks" ON mm_upset_picks
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can read upset picks" ON mm_upset_picks;
CREATE POLICY "Anyone can read upset picks" ON mm_upset_picks
  FOR SELECT USING (TRUE);

-- 3. Game Results: admin-managed, server writes (open policy for server-side upsert)
CREATE TABLE IF NOT EXISTS mm_game_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id     TEXT NOT NULL,
  matchup_id   TEXT NOT NULL,
  winner_name  TEXT,
  winner_seed  INTEGER,
  loser_name   TEXT,
  loser_seed   INTEGER,
  winner_score INTEGER,
  loser_score  INTEGER,
  was_upset    BOOLEAN DEFAULT FALSE,
  resolved_at  TIMESTAMPTZ,
  resolved_by  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(round_id, matchup_id)
);

ALTER TABLE mm_game_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read game results" ON mm_game_results;
CREATE POLICY "Anyone can read game results" ON mm_game_results
  FOR SELECT USING (TRUE);

-- Open insert/update for server-side admin writes (anon key, no session)
DROP POLICY IF EXISTS "Allow all writes to game results" ON mm_game_results;
CREATE POLICY "Allow all writes to game results" ON mm_game_results
  FOR ALL USING (TRUE);

-- 4. Pick Scores: aggregated per user, recomputable
CREATE TABLE IF NOT EXISTS mm_pick_scores (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_points     INTEGER NOT NULL DEFAULT 0,
  champion_pts     INTEGER NOT NULL DEFAULT 0,
  final_four_pts   INTEGER NOT NULL DEFAULT 0,
  elite_eight_pts  INTEGER NOT NULL DEFAULT 0,
  sweet_sixteen_pts INTEGER NOT NULL DEFAULT 0,
  upset_pts        INTEGER NOT NULL DEFAULT 0,
  correct_upsets   INTEGER NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mm_pick_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read pick scores" ON mm_pick_scores;
CREATE POLICY "Anyone can read pick scores" ON mm_pick_scores
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Allow all writes to pick scores" ON mm_pick_scores;
CREATE POLICY "Allow all writes to pick scores" ON mm_pick_scores
  FOR ALL USING (TRUE);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
