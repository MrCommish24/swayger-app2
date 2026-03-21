-- Migration 026: Add is_second_chance to mm_locked_takes
ALTER TABLE mm_locked_takes ADD COLUMN IF NOT EXISTS is_second_chance boolean NOT NULL DEFAULT false;
