-- ============================================================
-- Migration 002 — Part A: ADD COLUMNS ONLY
-- Run this block first in Supabase SQL Editor.
-- Safe to re-run (IF NOT EXISTS).
-- ============================================================

ALTER TABLE gameday_pick_cards
  ADD COLUMN IF NOT EXISTS roster_revision INTEGER NOT NULL DEFAULT 0;

ALTER TABLE gameday_picks
  ADD COLUMN IF NOT EXISTS answer_universe_revision INTEGER NOT NULL DEFAULT 0;

-- Verify (you should see 0 errors):
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name='gameday_pick_cards' AND column_name='roster_revision')    AS pick_cards_col,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name='gameday_picks'      AND column_name='answer_universe_revision') AS picks_col;
-- Expected result: pick_cards_col=1, picks_col=1
