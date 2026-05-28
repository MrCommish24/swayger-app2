-- 025_gameday_countdown.sql
-- Adds lightweight manual countdown notice columns to gameday_rooms.
-- Countdowns are host-controlled notices only — they do NOT automatically
-- open or lock cards.
--
-- Run in Supabase SQL Editor before deploying countdown features.

ALTER TABLE gameday_rooms
  ADD COLUMN IF NOT EXISTS countdown_phase       TEXT,
  ADD COLUMN IF NOT EXISTS countdown_type        TEXT,
  ADD COLUMN IF NOT EXISTS countdown_ends_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS countdown_started_at  TIMESTAMPTZ;

ALTER TABLE gameday_rooms
  DROP CONSTRAINT IF EXISTS gameday_rooms_countdown_phase_check;
ALTER TABLE gameday_rooms
  ADD CONSTRAINT gameday_rooms_countdown_phase_check
    CHECK (countdown_phase IS NULL OR countdown_phase IN ('pregame', 'halftime', 'fourth'));

ALTER TABLE gameday_rooms
  DROP CONSTRAINT IF EXISTS gameday_rooms_countdown_type_check;
ALTER TABLE gameday_rooms
  ADD CONSTRAINT gameday_rooms_countdown_type_check
    CHECK (countdown_type IS NULL OR countdown_type IN ('opens_soon', 'locks_soon'));

DO $$
BEGIN
  RAISE NOTICE '025 gameday_countdown migration: OK — countdown columns added to gameday_rooms';
END $$;
