-- Migration: Expand gameday_pick_cards phase constraint for soccer/FIFA support
-- Adds 'final_push' (opens ~70th min) and 'penalties' (host opens if shootout)
-- Run in Supabase SQL Editor before creating FIFA Game Day rooms.

ALTER TABLE gameday_pick_cards
  DROP CONSTRAINT IF EXISTS gameday_pick_cards_phase_check;

ALTER TABLE gameday_pick_cards
  ADD CONSTRAINT gameday_pick_cards_phase_check
  CHECK (phase IN ('pregame', 'halftime', 'fourth', 'final_push', 'penalties'));
