-- ─────────────────────────────────────────────────────────────
-- NBA Playoffs 2026 Challenge — Database Migration
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────

-- 1. Series table: each playoff series (admin-seeded per round)
CREATE TABLE IF NOT EXISTS nba_playoff_series (
  id           TEXT PRIMARY KEY,            -- e.g. '2026-r1-east-1v8'
  season       TEXT NOT NULL DEFAULT '2026',
  round        TEXT NOT NULL,               -- 'round1' | 'round2' | 'conf_finals' | 'finals'
  conference   TEXT,                        -- 'east' | 'west' | NULL for Finals
  seed1        INTEGER,
  seed2        INTEGER,
  team1        TEXT NOT NULL,
  team2        TEXT NOT NULL,
  winner       TEXT,                        -- NULL until admin resolves
  games        INTEGER,                     -- NULL until resolved (4–7)
  starts_at    TIMESTAMPTZ,
  sort_order   INTEGER DEFAULT 0,           -- for display ordering
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bracket picks: one row per user per series
CREATE TABLE IF NOT EXISTS nba_playoff_bracket_picks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_id    TEXT NOT NULL REFERENCES nba_playoff_series(id) ON DELETE CASCADE,
  season       TEXT NOT NULL DEFAULT '2026',
  picked_team  TEXT NOT NULL,
  games_guess  INTEGER,                     -- optional: 4, 5, 6, or 7
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, series_id)
);

-- 3. Scores table: pre-computed leaderboard (updated by admin resolve endpoint)
CREATE TABLE IF NOT EXISTS nba_playoff_scores (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  season           TEXT NOT NULL DEFAULT '2026',
  total_pts        INTEGER NOT NULL DEFAULT 0,
  round1_pts       INTEGER NOT NULL DEFAULT 0,
  round2_pts       INTEGER NOT NULL DEFAULT 0,
  conf_finals_pts  INTEGER NOT NULL DEFAULT 0,
  finals_pts       INTEGER NOT NULL DEFAULT 0,
  correct_picks    INTEGER NOT NULL DEFAULT 0,
  correct_games    INTEGER NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Row Level Security ───────────────────────────────────────

ALTER TABLE nba_playoff_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE nba_playoff_bracket_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE nba_playoff_scores ENABLE ROW LEVEL SECURITY;

-- Series: public read (admin writes via service key from backend)
CREATE POLICY "nba_series_public_read"
  ON nba_playoff_series FOR SELECT USING (true);

-- Bracket picks: users manage their own picks
CREATE POLICY "nba_picks_user_select"
  ON nba_playoff_bracket_picks FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "nba_picks_user_insert"
  ON nba_playoff_bracket_picks FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "nba_picks_user_update"
  ON nba_playoff_bracket_picks FOR UPDATE USING (auth.uid() = user_id);

-- Scores: public read
CREATE POLICY "nba_scores_public_read"
  ON nba_playoff_scores FOR SELECT USING (true);

-- ─── Seed Round 1 matchups ────────────────────────────────────
-- Run AFTER the Play-In Tournament concludes (April 18, 2026).
-- Replace team names and seeds with actual results.
-- This is a template — Darius fills in actual teams from Play-In results.

-- EASTERN CONFERENCE — Round 1
INSERT INTO nba_playoff_series (id, season, round, conference, seed1, seed2, team1, team2, sort_order, starts_at)
VALUES
  ('2026-r1-east-1v8', '2026', 'round1', 'east', 1, 8, 'TBD (E1)', 'TBD (E8)', 1, '2026-04-19T00:00:00Z'),
  ('2026-r1-east-2v7', '2026', 'round1', 'east', 2, 7, 'TBD (E2)', 'TBD (E7)', 2, '2026-04-19T00:00:00Z'),
  ('2026-r1-east-3v6', '2026', 'round1', 'east', 3, 6, 'TBD (E3)', 'TBD (E6)', 3, '2026-04-19T00:00:00Z'),
  ('2026-r1-east-4v5', '2026', 'round1', 'east', 4, 5, 'TBD (E4)', 'TBD (E5)', 4, '2026-04-19T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- WESTERN CONFERENCE — Round 1
INSERT INTO nba_playoff_series (id, season, round, conference, seed1, seed2, team1, team2, sort_order, starts_at)
VALUES
  ('2026-r1-west-1v8', '2026', 'round1', 'west', 1, 8, 'TBD (W1)', 'TBD (W8)', 5, '2026-04-19T00:00:00Z'),
  ('2026-r1-west-2v7', '2026', 'round1', 'west', 2, 7, 'TBD (W2)', 'TBD (W7)', 6, '2026-04-19T00:00:00Z'),
  ('2026-r1-west-3v6', '2026', 'round1', 'west', 3, 6, 'TBD (W3)', 'TBD (W6)', 7, '2026-04-19T00:00:00Z'),
  ('2026-r1-west-4v5', '2026', 'round1', 'west', 4, 5, 'TBD (W4)', 'TBD (W5)', 8, '2026-04-19T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ─── Admin: Update teams after Play-In ───────────────────────
-- Example (fill in real teams after April 18):
--
-- UPDATE nba_playoff_series SET team1='Cleveland Cavaliers', team2='Miami Heat' WHERE id='2026-r1-east-1v8';
-- UPDATE nba_playoff_series SET team1='Boston Celtics', team2='Orlando Magic' WHERE id='2026-r1-east-2v7';
-- UPDATE nba_playoff_series SET team1='New York Knicks', team2='Detroit Pistons' WHERE id='2026-r1-east-3v6';
-- UPDATE nba_playoff_series SET team1='Milwaukee Bucks', team2='Indiana Pacers' WHERE id='2026-r1-east-4v5';
-- UPDATE nba_playoff_series SET team1='Oklahoma City Thunder', team2='TBD (W8)' WHERE id='2026-r1-west-1v8';
-- UPDATE nba_playoff_series SET team1='San Antonio Spurs', team2='TBD (W7)' WHERE id='2026-r1-west-2v7';
-- UPDATE nba_playoff_series SET team1='Denver Nuggets', team2='Los Angeles Clippers' WHERE id='2026-r1-west-3v6';
-- UPDATE nba_playoff_series SET team1='Houston Rockets', team2='Golden State Warriors' WHERE id='2026-r1-west-4v5';
