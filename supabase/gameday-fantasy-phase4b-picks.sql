-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 4B: Fantasy Draft Day Participant Idempotency
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Columns season_member_id, fantasy_team_id, team_name were already added to
-- gameday_participants in supabase/gameday-fantasy-foundation.sql (section 11).
-- DO NOT re-add them. This migration ONLY creates the partial unique index.
--
-- APPLY MANUALLY: Supabase Dashboard → SQL Editor → New query → Run.
-- File: supabase/gameday-fantasy-phase4b-picks.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── STEP 1: Duplicate check — run this first and verify zero rows ─────────────
--
-- SELECT room_id, season_member_id, count(*)
-- FROM   gameday_participants
-- WHERE  season_member_id IS NOT NULL
-- GROUP  BY room_id, season_member_id
-- HAVING count(*) > 1;
--
-- Expected: 0 rows returned.
-- If ANY rows are returned → STOP and report them. Do NOT apply the index.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── STEP 2: Partial unique index ──────────────────────────────────────────────
--
-- Ensures exactly one gameday_participants row per Fantasy season member per
-- room. The WHERE clause restricts to Fantasy rows (season_member_id IS NOT
-- NULL), leaving all classic Game Day participants completely unaffected.
--
-- This index is what makes ensureFantasyParticipant idempotent under concurrent
-- requests: two simultaneous enters for the same season_member converge to one
-- row via the SELECT-first / INSERT-retry pattern.

CREATE UNIQUE INDEX IF NOT EXISTS gameday_participants_room_season_member_uniq
  ON gameday_participants (room_id, season_member_id)
  WHERE season_member_id IS NOT NULL;
