-- NFL Sunday Slate V1 — additive migration; legacy NFL rooms remain Single Game.
-- Apply after supabase/gameday-nfl-v1-migration.sql in the Supabase SQL Editor.

BEGIN;

-- Rooms store their chosen NFL format and the host-entered candidate lists.
-- NULL is intentional for historical rows and is treated as nfl_single_game.
ALTER TABLE gameday_rooms
  ADD COLUMN IF NOT EXISTS template_type TEXT,
  ADD COLUMN IF NOT EXISTS slate_config JSONB;

ALTER TABLE gameday_rooms
  DROP CONSTRAINT IF EXISTS gameday_rooms_template_type_check;
ALTER TABLE gameday_rooms
  ADD CONSTRAINT gameday_rooms_template_type_check
  CHECK (template_type IS NULL OR template_type IN ('nfl_single_game', 'nfl_sunday_slate'));

-- Keep Sunday Slate library entries separate from the existing NFL Single Game
-- picker. Existing NFL library rows are explicitly classified without changing
-- their questions, defaults, or answers.
ALTER TABLE gameday_prop_library
  ADD COLUMN IF NOT EXISTS template_type TEXT;

UPDATE gameday_prop_library
  SET template_type = 'nfl_single_game'
  WHERE sport = 'nfl' AND template_type IS NULL;

ALTER TABLE gameday_prop_library
  DROP CONSTRAINT IF EXISTS gameday_prop_library_template_type_check;
ALTER TABLE gameday_prop_library
  ADD CONSTRAINT gameday_prop_library_template_type_check
  CHECK (template_type IS NULL OR template_type IN ('nfl_single_game', 'nfl_sunday_slate'));

INSERT INTO gameday_prop_library
  (id, sport, template_type, phase, question, answer_options, settlement_window, display_order, is_default, is_active)
VALUES
  ('nfl_slate_early_qb_passing_yards', 'nfl', 'nfl_sunday_slate', 'pregame', 'Which Early Slate QB has the most passing yards?', '["{{SLATE_QBS}}"]'::jsonb, 'End Early Slate', 0, true, true),
  ('nfl_slate_early_rushing_yards', 'nfl', 'nfl_sunday_slate', 'pregame', 'Which Early Slate RB has the most rushing yards?', '["{{SLATE_RBS}}"]'::jsonb, 'End Early Slate', 1, true, true),
  ('nfl_slate_early_receiving_yards', 'nfl', 'nfl_sunday_slate', 'pregame', 'Which Early Slate WR/TE has the most receiving yards?', '["{{SLATE_RECEIVERS}}"]'::jsonb, 'End Early Slate', 2, true, true),
  ('nfl_slate_early_team_points', 'nfl', 'nfl_sunday_slate', 'pregame', 'Which Early Slate team scores the most points?', '["{{SLATE_TEAMS}}"]'::jsonb, 'End Early Slate', 3, true, true),
  ('nfl_slate_early_fewest_points_allowed', 'nfl', 'nfl_sunday_slate', 'pregame', 'Which Early Slate team allows the fewest points?', '["{{SLATE_TEAMS}}"]'::jsonb, 'End Early Slate', 4, true, true),
  ('nfl_slate_early_highest_total_game', 'nfl', 'nfl_sunday_slate', 'pregame', 'Which Early Slate game has the highest combined score?', '["{{SLATE_EARLY_GAMES}}"]'::jsonb, 'End Early Slate', 5, true, true),
  ('nfl_slate_early_closest_game', 'nfl', 'nfl_sunday_slate', 'pregame', 'Which Early Slate game has the closest final margin?', '["{{SLATE_EARLY_GAMES}}"]'::jsonb, 'End Early Slate', 6, true, true),
  ('nfl_slate_early_close_games_count', 'nfl', 'nfl_sunday_slate', 'pregame', 'How many Early Slate games finish within 7 points?', '["0–2","3–5","6+","Tie / Multiple tied"]'::jsonb, 'End Early Slate', 7, true, true),
  ('nfl_slate_late_qb_passing_yards', 'nfl', 'nfl_sunday_slate', 'halftime', 'Which Late Slate QB has the most passing yards?', '["{{SLATE_QBS}}"]'::jsonb, 'End Late Slate', 8, true, true),
  ('nfl_slate_late_team_points', 'nfl', 'nfl_sunday_slate', 'halftime', 'Which Late Slate team scores the most points?', '["{{SLATE_TEAMS}}"]'::jsonb, 'End Late Slate', 9, true, true),
  ('nfl_slate_late_highest_total_game', 'nfl', 'nfl_sunday_slate', 'halftime', 'Which Late Slate game has the highest combined score?', '["{{SLATE_LATE_GAMES}}"]'::jsonb, 'End Late Slate', 10, true, true),
  ('nfl_slate_late_overtime', 'nfl', 'nfl_sunday_slate', 'halftime', 'Will any Late Slate game go to overtime?', '["Yes","No"]'::jsonb, 'End Late Slate', 11, true, true),
  ('nfl_slate_late_fewest_points_allowed', 'nfl', 'nfl_sunday_slate', 'halftime', 'Which Late Slate team allows the fewest points?', '["{{SLATE_TEAMS}}"]'::jsonb, 'End Late Slate', 12, true, true),
  ('nfl_slate_snf_winner', 'nfl', 'nfl_sunday_slate', 'fourth', 'Who wins Sunday Night Football?', '["{{TEAM_A}}","{{TEAM_B}}"]'::jsonb, 'End Game', 13, true, true),
  ('nfl_slate_snf_first_score', 'nfl', 'nfl_sunday_slate', 'fourth', 'Which team scores first on Sunday Night?', '["{{TEAM_A}}","{{TEAM_B}}"]'::jsonb, 'Opening Drive', 14, true, true),
  ('nfl_slate_snf_margin', 'nfl', 'nfl_sunday_slate', 'fourth', 'What is the Sunday Night final margin?', '["1–7","8–14","15+","Tie / Multiple tied"]'::jsonb, 'End Game', 15, true, true)
ON CONFLICT (id) DO NOTHING;

COMMIT;