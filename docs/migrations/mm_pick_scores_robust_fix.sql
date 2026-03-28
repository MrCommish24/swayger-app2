-- Robust fix: each column in its own exception block so one failure
-- doesn't stop the rest. Run this in the Supabase SQL Editor.
DO $$
BEGIN
  -- total_points
  BEGIN
    ALTER TABLE public.mm_pick_scores ALTER COLUMN total_points TYPE numeric USING total_points::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'total_points: %', SQLERRM; END;

  -- sweet_sixteen_pts
  BEGIN
    ALTER TABLE public.mm_pick_scores ALTER COLUMN sweet_sixteen_pts TYPE numeric USING sweet_sixteen_pts::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'sweet_sixteen_pts: %', SQLERRM; END;

  -- elite_eight_pts
  BEGIN
    ALTER TABLE public.mm_pick_scores ALTER COLUMN elite_eight_pts TYPE numeric USING elite_eight_pts::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'elite_eight_pts: %', SQLERRM; END;

  -- final_four_pts
  BEGIN
    ALTER TABLE public.mm_pick_scores ALTER COLUMN final_four_pts TYPE numeric USING final_four_pts::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'final_four_pts: %', SQLERRM; END;

  -- champion_pts
  BEGIN
    ALTER TABLE public.mm_pick_scores ALTER COLUMN champion_pts TYPE numeric USING champion_pts::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'champion_pts: %', SQLERRM; END;

  -- upset_pts: add if missing, else convert
  BEGIN
    ALTER TABLE public.mm_pick_scores ADD COLUMN upset_pts numeric NOT NULL DEFAULT 0;
  EXCEPTION WHEN duplicate_column THEN
    ALTER TABLE public.mm_pick_scores ALTER COLUMN upset_pts TYPE numeric USING upset_pts::numeric;
  END;

  -- correct_upsets: add if missing
  BEGIN
    ALTER TABLE public.mm_pick_scores ADD COLUMN correct_upsets integer NOT NULL DEFAULT 0;
  EXCEPTION WHEN duplicate_column THEN NULL; END;

  -- blowout_pts: add if missing, else convert
  BEGIN
    ALTER TABLE public.mm_pick_scores ADD COLUMN blowout_pts numeric NOT NULL DEFAULT 0;
  EXCEPTION WHEN duplicate_column THEN
    ALTER TABLE public.mm_pick_scores ALTER COLUMN blowout_pts TYPE numeric USING blowout_pts::numeric;
  END;

  -- correct_blowouts: add if missing
  BEGIN
    ALTER TABLE public.mm_pick_scores ADD COLUMN correct_blowouts integer NOT NULL DEFAULT 0;
  EXCEPTION WHEN duplicate_column THEN NULL; END;

  -- high_scorer_pts: add if missing, else convert
  BEGIN
    ALTER TABLE public.mm_pick_scores ADD COLUMN high_scorer_pts numeric NOT NULL DEFAULT 0;
  EXCEPTION WHEN duplicate_column THEN
    ALTER TABLE public.mm_pick_scores ALTER COLUMN high_scorer_pts TYPE numeric USING high_scorer_pts::numeric;
  END;

  -- correct_high_scorers: add if missing
  BEGIN
    ALTER TABLE public.mm_pick_scores ADD COLUMN correct_high_scorers integer NOT NULL DEFAULT 0;
  EXCEPTION WHEN duplicate_column THEN NULL; END;

  -- is_second_chance: add if missing
  BEGIN
    ALTER TABLE public.mm_pick_scores ADD COLUMN is_second_chance boolean NOT NULL DEFAULT false;
  EXCEPTION WHEN duplicate_column THEN NULL; END;

END $$;
