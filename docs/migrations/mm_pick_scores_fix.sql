-- ─── mm_pick_scores column-type fix + special-picks columns ─────────────────
-- Run this in the Supabase SQL Editor to unblock scoring.
-- Safe to run multiple times (all operations are idempotent).
--
-- What this fixes:
--   1. Converts existing integer pts columns → numeric
--      (required so the 0.5× second-chance multiplier works, e.g. 3pts × 5 picks × 0.5 = 7.5)
--   2. Adds upset_pts / blowout_pts / high_scorer_pts / correct_* columns if missing
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- ── 1. Convert pts columns integer → numeric ────────────────────────────────
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'mm_pick_scores' AND column_name = 'total_points') = 'integer' THEN
    ALTER TABLE mm_pick_scores ALTER COLUMN total_points TYPE numeric USING total_points::numeric;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'mm_pick_scores' AND column_name = 'sweet_sixteen_pts') = 'integer' THEN
    ALTER TABLE mm_pick_scores ALTER COLUMN sweet_sixteen_pts TYPE numeric USING sweet_sixteen_pts::numeric;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'mm_pick_scores' AND column_name = 'elite_eight_pts') = 'integer' THEN
    ALTER TABLE mm_pick_scores ALTER COLUMN elite_eight_pts TYPE numeric USING elite_eight_pts::numeric;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'mm_pick_scores' AND column_name = 'final_four_pts') = 'integer' THEN
    ALTER TABLE mm_pick_scores ALTER COLUMN final_four_pts TYPE numeric USING final_four_pts::numeric;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'mm_pick_scores' AND column_name = 'champion_pts') = 'integer' THEN
    ALTER TABLE mm_pick_scores ALTER COLUMN champion_pts TYPE numeric USING champion_pts::numeric;
  END IF;

  -- ── 2. Add upset_pts / correct_upsets if missing ────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'mm_pick_scores' AND column_name = 'upset_pts') THEN
    ALTER TABLE mm_pick_scores ADD COLUMN upset_pts numeric NOT NULL DEFAULT 0;
  ELSE
    -- Column exists — make sure it's numeric
    IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'mm_pick_scores' AND column_name = 'upset_pts') = 'integer' THEN
      ALTER TABLE mm_pick_scores ALTER COLUMN upset_pts TYPE numeric USING upset_pts::numeric;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'mm_pick_scores' AND column_name = 'correct_upsets') THEN
    ALTER TABLE mm_pick_scores ADD COLUMN correct_upsets integer NOT NULL DEFAULT 0;
  END IF;

  -- ── 3. Add blowout_pts / correct_blowouts if missing ────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'mm_pick_scores' AND column_name = 'blowout_pts') THEN
    ALTER TABLE mm_pick_scores ADD COLUMN blowout_pts numeric NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'mm_pick_scores' AND column_name = 'correct_blowouts') THEN
    ALTER TABLE mm_pick_scores ADD COLUMN correct_blowouts integer NOT NULL DEFAULT 0;
  END IF;

  -- ── 4. Add high_scorer_pts / correct_high_scorers if missing ────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'mm_pick_scores' AND column_name = 'high_scorer_pts') THEN
    ALTER TABLE mm_pick_scores ADD COLUMN high_scorer_pts numeric NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'mm_pick_scores' AND column_name = 'correct_high_scorers') THEN
    ALTER TABLE mm_pick_scores ADD COLUMN correct_high_scorers integer NOT NULL DEFAULT 0;
  END IF;

  -- ── 5. Add is_second_chance if missing ──────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'mm_pick_scores' AND column_name = 'is_second_chance') THEN
    ALTER TABLE mm_pick_scores ADD COLUMN is_second_chance boolean NOT NULL DEFAULT false;
  END IF;

END $$;
