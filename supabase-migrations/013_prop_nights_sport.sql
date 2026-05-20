-- Migration 013: Add sport column to prop_nights
-- Allows prop nights to be categorized by sport (NBA, MLB, Other, etc.)

ALTER TABLE prop_nights
  ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'NBA';

-- Backfill existing rows: assume any night with SGO event props is NBA,
-- the May 18 MLB night gets MLB label based on its ID.
UPDATE prop_nights
  SET sport = 'MLB'
  WHERE id = 'df3de438-fd75-4651-8218-c0d6cd39fe5c';

-- Index for filtering by sport
CREATE INDEX IF NOT EXISTS prop_nights_sport_idx ON prop_nights (sport);
