-- NFL Weekly Master Slate: Window-Specific Player Candidates
-- Apply in the Supabase SQL editor before deploying the matching server code.

BEGIN;

ALTER TABLE public.nfl_weekly_slate_templates
  ADD COLUMN IF NOT EXISTS early_qb_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS late_qb_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS early_rb_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS late_rb_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS early_receiver_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS late_receiver_candidates JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nfl_weekly_slate_early_qb_candidates_array_check'
      AND conrelid = 'public.nfl_weekly_slate_templates'::regclass
  ) THEN
    ALTER TABLE public.nfl_weekly_slate_templates
      ADD CONSTRAINT nfl_weekly_slate_early_qb_candidates_array_check
      CHECK (jsonb_typeof(early_qb_candidates) = 'array');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nfl_weekly_slate_late_qb_candidates_array_check'
      AND conrelid = 'public.nfl_weekly_slate_templates'::regclass
  ) THEN
    ALTER TABLE public.nfl_weekly_slate_templates
      ADD CONSTRAINT nfl_weekly_slate_late_qb_candidates_array_check
      CHECK (jsonb_typeof(late_qb_candidates) = 'array');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nfl_weekly_slate_early_rb_candidates_array_check'
      AND conrelid = 'public.nfl_weekly_slate_templates'::regclass
  ) THEN
    ALTER TABLE public.nfl_weekly_slate_templates
      ADD CONSTRAINT nfl_weekly_slate_early_rb_candidates_array_check
      CHECK (jsonb_typeof(early_rb_candidates) = 'array');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nfl_weekly_slate_late_rb_candidates_array_check'
      AND conrelid = 'public.nfl_weekly_slate_templates'::regclass
  ) THEN
    ALTER TABLE public.nfl_weekly_slate_templates
      ADD CONSTRAINT nfl_weekly_slate_late_rb_candidates_array_check
      CHECK (jsonb_typeof(late_rb_candidates) = 'array');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nfl_weekly_slate_early_receiver_candidates_array_check'
      AND conrelid = 'public.nfl_weekly_slate_templates'::regclass
  ) THEN
    ALTER TABLE public.nfl_weekly_slate_templates
      ADD CONSTRAINT nfl_weekly_slate_early_receiver_candidates_array_check
      CHECK (jsonb_typeof(early_receiver_candidates) = 'array');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nfl_weekly_slate_late_receiver_candidates_array_check'
      AND conrelid = 'public.nfl_weekly_slate_templates'::regclass
  ) THEN
    ALTER TABLE public.nfl_weekly_slate_templates
      ADD CONSTRAINT nfl_weekly_slate_late_receiver_candidates_array_check
      CHECK (jsonb_typeof(late_receiver_candidates) = 'array');
  END IF;
END
$$;

INSERT INTO public.gameday_prop_library
  (id, sport, template_type, phase, question, answer_options, settlement_window, display_order, is_default, is_active)
VALUES
  ('nfl_slate_late_rushing_yards', 'nfl', 'nfl_sunday_slate', 'halftime', 'Which Late Slate RB has the most rushing yards?', '["{{SLATE_RBS}}"]'::jsonb, 'End Late Slate', 9, true, true),
  ('nfl_slate_late_receiving_yards', 'nfl', 'nfl_sunday_slate', 'halftime', 'Which Late Slate WR/TE has the most receiving yards?', '["{{SLATE_RECEIVERS}}"]'::jsonb, 'End Late Slate', 10, true, true)
ON CONFLICT (id) DO NOTHING;

COMMENT ON COLUMN public.nfl_weekly_slate_templates.early_qb_candidates IS
  'Optional admin-curated Early Slate QB candidates; falls back to qb_candidates when empty.';
COMMENT ON COLUMN public.nfl_weekly_slate_templates.late_qb_candidates IS
  'Optional admin-curated Late Slate QB candidates; falls back to qb_candidates when empty.';
COMMENT ON COLUMN public.nfl_weekly_slate_templates.early_rb_candidates IS
  'Optional admin-curated Early Slate RB candidates; falls back to rb_candidates when empty.';
COMMENT ON COLUMN public.nfl_weekly_slate_templates.late_rb_candidates IS
  'Optional admin-curated Late Slate RB candidates; falls back to rb_candidates when empty.';
COMMENT ON COLUMN public.nfl_weekly_slate_templates.early_receiver_candidates IS
  'Optional admin-curated Early Slate WR/TE candidates; falls back to receiver_candidates when empty.';
COMMENT ON COLUMN public.nfl_weekly_slate_templates.late_receiver_candidates IS
  'Optional admin-curated Late Slate WR/TE candidates; falls back to receiver_candidates when empty.';

COMMIT;