-- Swayger Game Day / Fantasy — multiple correct answers
--
-- Additive and backward-compatible:
--   * Existing scalar correct_answer values remain untouched.
--   * New code stores the normalized answer ID set in correct_answer_ids.
--   * Readers must fall back to correct_answer for historical rows.
--   * Participant picks remain one scalar selected_answer per prop.

BEGIN;

ALTER TABLE public.gameday_props
  ADD COLUMN IF NOT EXISTS correct_answer_ids JSONB;

ALTER TABLE public.gameday_props
  DROP CONSTRAINT IF EXISTS gameday_props_correct_answer_ids_array;

ALTER TABLE public.gameday_props
  ADD CONSTRAINT gameday_props_correct_answer_ids_array
  CHECK (
    correct_answer_ids IS NULL
    OR jsonb_typeof(correct_answer_ids) = 'array'
  );

COMMIT;
