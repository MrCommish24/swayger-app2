-- Fix gameday_rooms status constraint: 'final' → 'finalized'
-- Run this once in the Supabase SQL editor.
ALTER TABLE gameday_rooms DROP CONSTRAINT IF EXISTS gameday_rooms_status_check;
ALTER TABLE gameday_rooms ADD CONSTRAINT gameday_rooms_status_check
  CHECK (status IN ('draft', 'active', 'finalized'));
