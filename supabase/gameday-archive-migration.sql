-- Game Day Archive Migration
-- Adds soft-delete support to gameday_rooms via an archived_at column.
-- Run this in the Supabase SQL Editor.

ALTER TABLE gameday_rooms
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- Partial index: fast filtering for the common case (active rooms).
CREATE INDEX IF NOT EXISTS idx_gameday_rooms_active
  ON gameday_rooms (created_at DESC)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN gameday_rooms.archived_at IS
  'Soft-delete timestamp. NULL = active. Non-null = archived by an admin. '
  'Archived rooms are hidden from the admin feed and blocked from joins/picks. '
  'All row data is preserved — nothing is hard-deleted.';
