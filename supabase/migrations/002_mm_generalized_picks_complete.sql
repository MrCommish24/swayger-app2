-- ─────────────────────────────────────────────────────────────────────────────
-- Swayger · MM Generalized Picks — Completion Migration
-- Run in Supabase SQL Editor.  Safe to re-run (idempotent throughout).
--
-- Adds everything not covered by 001 / the earlier mm-picks-migration:
--   A. mm_special_picks        — add points_multiplier column
--   B. mm_locked_takes         — add is_second_chance column
--   C. mm_round_matchups       — ensure open write policy for anon key
--   D. get_all_mm_special_picks — SECURITY DEFINER RPC (create/replace)
--   E. get_all_mm_locked_takes  — SECURITY DEFINER RPC (create/replace)
--   F. feedback_submissions     — user feedback table
-- ─────────────────────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────────
-- A. mm_special_picks — add points_multiplier if missing
--    saveSpecialPick() inserts this; get_all_mm_special_picks() selects it.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE mm_special_picks
  ADD COLUMN IF NOT EXISTS points_multiplier NUMERIC NOT NULL DEFAULT 1.0;


-- ────────────────────────────────────────────────────────────────────────────
-- B. mm_locked_takes — add is_second_chance if missing
--    saveTake() upserts this; get_all_mm_locked_takes() returns it.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE mm_locked_takes
  ADD COLUMN IF NOT EXISTS is_second_chance BOOLEAN NOT NULL DEFAULT FALSE;


-- ────────────────────────────────────────────────────────────────────────────
-- C. mm_round_matchups — ensure the server (anon key, no JWT) can write rows.
--    The backend calls supabase.from("mm_round_matchups").insert(...) using
--    the public anon key. Replace the old service_role-only policy if present.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role manages round matchups" ON mm_round_matchups;
DROP POLICY IF EXISTS "Service can write round matchups"   ON mm_round_matchups;

CREATE POLICY "Anon key can write round matchups"
  ON mm_round_matchups FOR ALL
  USING (true)
  WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- D. get_all_mm_special_picks — SECURITY DEFINER so the backend's anon-key
--    Supabase client can read every user's picks for scoring (RLS bypassed).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_all_mm_special_picks()
RETURNS TABLE (
  user_id           uuid,
  round_id          text,
  pick_type         text,
  matchup_id        text,
  picked_team       text,
  points_multiplier numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    user_id,
    round_id,
    pick_type,
    matchup_id,
    picked_team,
    points_multiplier
  FROM mm_special_picks
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_all_mm_special_picks() TO anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- E. get_all_mm_locked_takes — SECURITY DEFINER so the backend can read all
--    submitted bracket takes for scoring without a user JWT.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_all_mm_locked_takes()
RETURNS TABLE (
  user_id          uuid,
  take_type        text,
  teams            text[],
  is_submitted     boolean,
  is_second_chance boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    user_id,
    take_type,
    teams,
    is_submitted,
    is_second_chance
  FROM mm_locked_takes
  WHERE is_submitted = true
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_all_mm_locked_takes() TO anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- F. feedback_submissions — stores user-submitted app feedback.
--    Written directly from the client via the Supabase JS SDK.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback_submissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email      text,
  category   text NOT NULL DEFAULT 'general',
  message    text NOT NULL,
  trigger    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_insert_feedback" ON feedback_submissions;
CREATE POLICY "users_insert_feedback"
  ON feedback_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);


-- ────────────────────────────────────────────────────────────────────────────
-- Reload PostgREST schema cache
-- ────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ────────────────────────────────────────────────────────────────────────────
-- Verification (uncomment to run after the migration)
-- ────────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'mm_special_picks'
-- ORDER BY ordinal_position;
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'mm_locked_takes' AND column_name = 'is_second_chance';
--
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_name IN ('get_all_mm_special_picks','get_all_mm_locked_takes');
