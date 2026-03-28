-- Force all pts columns to numeric — safe to run even if already numeric.
-- Fixes "invalid input syntax for type integer" errors during scoring.

ALTER TABLE public.mm_pick_scores ALTER COLUMN total_points TYPE numeric USING total_points::numeric;
ALTER TABLE public.mm_pick_scores ALTER COLUMN sweet_sixteen_pts TYPE numeric USING sweet_sixteen_pts::numeric;
ALTER TABLE public.mm_pick_scores ALTER COLUMN elite_eight_pts TYPE numeric USING elite_eight_pts::numeric;
ALTER TABLE public.mm_pick_scores ALTER COLUMN final_four_pts TYPE numeric USING final_four_pts::numeric;
ALTER TABLE public.mm_pick_scores ALTER COLUMN champion_pts TYPE numeric USING champion_pts::numeric;

ALTER TABLE public.mm_pick_scores ADD COLUMN IF NOT EXISTS upset_pts numeric NOT NULL DEFAULT 0;
ALTER TABLE public.mm_pick_scores ADD COLUMN IF NOT EXISTS correct_upsets integer NOT NULL DEFAULT 0;
ALTER TABLE public.mm_pick_scores ADD COLUMN IF NOT EXISTS blowout_pts numeric NOT NULL DEFAULT 0;
ALTER TABLE public.mm_pick_scores ADD COLUMN IF NOT EXISTS correct_blowouts integer NOT NULL DEFAULT 0;
ALTER TABLE public.mm_pick_scores ADD COLUMN IF NOT EXISTS high_scorer_pts numeric NOT NULL DEFAULT 0;
ALTER TABLE public.mm_pick_scores ADD COLUMN IF NOT EXISTS correct_high_scorers integer NOT NULL DEFAULT 0;
ALTER TABLE public.mm_pick_scores ADD COLUMN IF NOT EXISTS is_second_chance boolean NOT NULL DEFAULT false;
