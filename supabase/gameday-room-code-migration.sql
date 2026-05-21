-- Game Day Swayger — short room code migration
-- Run this in the Supabase SQL Editor after gameday-migration.sql

-- Step 1: Add room_code column (nullable so existing rows don't break)
ALTER TABLE gameday_rooms
  ADD COLUMN IF NOT EXISTS room_code TEXT;

-- Step 2: Unique index (partial — only enforces uniqueness on non-NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS gameday_rooms_room_code_idx
  ON gameday_rooms (room_code)
  WHERE room_code IS NOT NULL;

-- Step 3: Backfill existing rooms that don't yet have a code
DO $$
DECLARE
  r       RECORD;
  chars   TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code TEXT;
  is_unique BOOLEAN;
BEGIN
  FOR r IN SELECT id FROM gameday_rooms WHERE room_code IS NULL LOOP
    LOOP
      new_code := 'GDS-'
        || substr(chars, (floor(random() * 32))::int + 1, 1)
        || substr(chars, (floor(random() * 32))::int + 1, 1)
        || substr(chars, (floor(random() * 32))::int + 1, 1)
        || substr(chars, (floor(random() * 32))::int + 1, 1)
        || substr(chars, (floor(random() * 32))::int + 1, 1);

      SELECT NOT EXISTS (
        SELECT 1 FROM gameday_rooms WHERE room_code = new_code
      ) INTO is_unique;

      EXIT WHEN is_unique;
    END LOOP;

    UPDATE gameday_rooms SET room_code = new_code WHERE id = r.id;
  END LOOP;
END $$;
