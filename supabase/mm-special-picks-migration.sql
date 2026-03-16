-- ════════════════════════════════════════════════════════════════
-- March Madness Special Picks Migration
-- Run in Supabase SQL Editor
-- Adds: mm_special_picks, mm_round_matchups
-- Extends: mm_pick_scores with blowout_pts, high_scorer_pts
-- ════════════════════════════════════════════════════════════════

-- 1. Create mm_special_picks (replaces mm_upset_picks)
CREATE TABLE IF NOT EXISTS mm_special_picks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  round_id    TEXT NOT NULL,
  pick_type   TEXT NOT NULL CHECK (pick_type IN ('upset', 'blowout', 'high_scorer')),
  matchup_id  TEXT NOT NULL,
  picked_team TEXT,   -- for upset: the underdog team name; null for blowout/high_scorer
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, round_id, pick_type, matchup_id)
);

ALTER TABLE mm_special_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own special picks"
  ON mm_special_picks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Migrate existing upset picks data
INSERT INTO mm_special_picks (id, user_id, round_id, pick_type, matchup_id, picked_team, created_at)
SELECT id, user_id, round_id, 'upset', matchup_id, upset_team, created_at
FROM mm_upset_picks
ON CONFLICT DO NOTHING;

-- 3. Create mm_round_matchups (ranked matchup cache for scoring)
CREATE TABLE IF NOT EXISTS mm_round_matchups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    TEXT NOT NULL,
  pick_type   TEXT NOT NULL CHECK (pick_type IN ('upset', 'blowout', 'high_scorer')),
  matchup_id  TEXT NOT NULL,
  team_a      TEXT NOT NULL,
  team_b      TEXT NOT NULL,
  seed_a      INTEGER NOT NULL DEFAULT 0,
  seed_b      INTEGER NOT NULL DEFAULT 0,
  rank        INTEGER NOT NULL DEFAULT 0,
  odds_data   JSONB,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (round_id, pick_type, matchup_id)
);

ALTER TABLE mm_round_matchups ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read round matchups (needed for picks display)
CREATE POLICY "Everyone reads round matchups"
  ON mm_round_matchups FOR SELECT
  USING (true);

-- Service role only for writes (handled via server)
CREATE POLICY "Service role manages round matchups"
  ON mm_round_matchups FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Extend mm_pick_scores with new pick type columns
ALTER TABLE mm_pick_scores
  ADD COLUMN IF NOT EXISTS blowout_pts       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_scorer_pts   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_blowouts  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_high_scorers INTEGER NOT NULL DEFAULT 0;
