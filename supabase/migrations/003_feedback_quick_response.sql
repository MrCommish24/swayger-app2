-- ─────────────────────────────────────────────────────────────────────────────
-- Swayger · Feedback — Quick Response Columns
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Adds two new columns to feedback_submissions:
--   quick_feedback_response — stores the raw button label from the app-open
--                             prompt ("Good", "Confusing", "Had an issue")
--   current_screen          — where in the app the feedback was triggered
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE feedback_submissions
  ADD COLUMN IF NOT EXISTS quick_feedback_response text,
  ADD COLUMN IF NOT EXISTS current_screen text;

-- Reload PostgREST so the new columns are immediately visible to the API
NOTIFY pgrst, 'reload schema';


-- ─── Verification ────────────────────────────────────────────────────────────
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'feedback_submissions'
-- ORDER BY ordinal_position;
