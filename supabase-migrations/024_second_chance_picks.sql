-- Migration 024: Second Chance Picks
-- Adds points_multiplier to mm_special_picks so second-chance users earn half points.
-- Adds is_second_chance flag to mm_pick_scores for leaderboard display.

-- 1. points_multiplier on individual picks (1.0 = full, 0.5 = second chance)
ALTER TABLE mm_special_picks
  ADD COLUMN IF NOT EXISTS points_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0;

-- 2. Flag on scoring row so leaderboard can badge second-chance users
ALTER TABLE mm_pick_scores
  ADD COLUMN IF NOT EXISTS is_second_chance BOOLEAN NOT NULL DEFAULT FALSE;
