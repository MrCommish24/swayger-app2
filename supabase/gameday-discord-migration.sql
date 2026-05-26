-- Game Day Swayger — Discord hybrid bridge migration
-- Run in Supabase SQL Editor after gameday-migration.sql and gameday-room-code-migration.sql

-- Make host_user_id nullable so bot-created rooms don't require a Supabase user UUID.
ALTER TABLE gameday_rooms
  ALTER COLUMN host_user_id DROP NOT NULL;

-- Add source tracking and Discord metadata columns.
ALTER TABLE gameday_rooms
  ADD COLUMN IF NOT EXISTS source             TEXT    NOT NULL DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS discord_guild_id   TEXT,
  ADD COLUMN IF NOT EXISTS discord_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS discord_user_id    TEXT;
