-- Migration 025: March Madness tables (idempotent — CREATE IF NOT EXISTS)
-- These tables were originally created via the Supabase SQL editor.
-- This migration formalises the schema so it can be re-created on a clean DB.

-- ── mm_locked_takes ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mm_locked_takes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  take_type   text NOT NULL CHECK (take_type IN ('sweet_sixteen','elite_eight','final_four','champion')),
  teams       text[] NOT NULL DEFAULT '{}',
  is_submitted boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, take_type)
);
ALTER TABLE mm_locked_takes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='mm_locked_takes' AND policyname='Users manage own locked takes'
  ) THEN
    CREATE POLICY "Users manage own locked takes"
      ON mm_locked_takes FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── mm_special_picks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mm_special_picks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  round_id         text NOT NULL,
  pick_type        text NOT NULL CHECK (pick_type IN ('upset','blowout','high_scorer')),
  matchup_id       text NOT NULL,
  picked_team      text,
  points_multiplier numeric(4,2) NOT NULL DEFAULT 1.0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mm_special_picks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='mm_special_picks' AND policyname='Users manage own special picks'
  ) THEN
    CREATE POLICY "Users manage own special picks"
      ON mm_special_picks FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── mm_round_matchups ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mm_round_matchups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    text NOT NULL,
  pick_type   text NOT NULL,
  matchup_id  text NOT NULL,
  team_a      text,
  team_b      text,
  seed_a      integer,
  seed_b      integer,
  rank        integer,
  odds_data   jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, pick_type, matchup_id)
);
ALTER TABLE mm_round_matchups ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='mm_round_matchups' AND policyname='Public read mm_round_matchups'
  ) THEN
    CREATE POLICY "Public read mm_round_matchups"
      ON mm_round_matchups FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='mm_round_matchups' AND policyname='Service write mm_round_matchups'
  ) THEN
    CREATE POLICY "Service write mm_round_matchups"
      ON mm_round_matchups FOR ALL USING (true);
  END IF;
END $$;

-- ── mm_game_results ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mm_game_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id     text NOT NULL,
  matchup_id   text NOT NULL,
  winner_name  text,
  winner_seed  integer,
  loser_name   text,
  loser_seed   integer,
  winner_score integer,
  loser_score  integer,
  was_upset    boolean NOT NULL DEFAULT false,
  resolved_at  timestamptz,
  resolved_by  text,
  UNIQUE (round_id, matchup_id)
);
ALTER TABLE mm_game_results ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='mm_game_results' AND policyname='Public read mm_game_results'
  ) THEN
    CREATE POLICY "Public read mm_game_results"
      ON mm_game_results FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='mm_game_results' AND policyname='Service write mm_game_results'
  ) THEN
    CREATE POLICY "Service write mm_game_results"
      ON mm_game_results FOR ALL USING (true);
  END IF;
END $$;

-- ── mm_pick_scores ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mm_pick_scores (
  user_id              uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_points         numeric NOT NULL DEFAULT 0,
  champion_pts         numeric NOT NULL DEFAULT 0,
  final_four_pts       numeric NOT NULL DEFAULT 0,
  elite_eight_pts      numeric NOT NULL DEFAULT 0,
  sweet_sixteen_pts    numeric NOT NULL DEFAULT 0,
  upset_pts            numeric NOT NULL DEFAULT 0,
  correct_upsets       integer NOT NULL DEFAULT 0,
  blowout_pts          numeric NOT NULL DEFAULT 0,
  high_scorer_pts      numeric NOT NULL DEFAULT 0,
  correct_blowouts     integer NOT NULL DEFAULT 0,
  correct_high_scorers integer NOT NULL DEFAULT 0,
  is_second_chance     boolean NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mm_pick_scores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='mm_pick_scores' AND policyname='Users read own score'
  ) THEN
    CREATE POLICY "Users read own score"
      ON mm_pick_scores FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='mm_pick_scores' AND policyname='Service write mm_pick_scores'
  ) THEN
    CREATE POLICY "Service write mm_pick_scores"
      ON mm_pick_scores FOR ALL USING (true);
  END IF;
END $$;

-- ── Columns that may not exist yet (safe idempotent adds) ───────────────────
ALTER TABLE mm_special_picks
  ADD COLUMN IF NOT EXISTS points_multiplier numeric(4,2) NOT NULL DEFAULT 1.0;
ALTER TABLE mm_pick_scores
  ADD COLUMN IF NOT EXISTS is_second_chance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blowout_pts numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_scorer_pts numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_blowouts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_high_scorers integer NOT NULL DEFAULT 0;
