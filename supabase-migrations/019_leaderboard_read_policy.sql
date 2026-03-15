-- Migration 019: Allow all authenticated users to read settled swaygers
-- This is required for the global leaderboard to show consistent results
-- regardless of which user is viewing it. Without this, each user only sees
-- swaygers they participated in, producing incomplete win/loss tallies.

CREATE POLICY "Authenticated users can view settled swaygers"
  ON swaygers FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND status = 'settled'
  );
