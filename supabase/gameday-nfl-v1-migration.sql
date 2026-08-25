-- NFL Game Day V1 — additive and safe for existing NBA, soccer, and Fantasy data.
-- Apply this migration in the Supabase SQL Editor before deploying NFL room creation.

BEGIN;

-- `nfl` is intentionally distinct from the existing generic `football` value.
ALTER TABLE gameday_rooms DROP CONSTRAINT IF EXISTS gameday_rooms_sport_check;
ALTER TABLE gameday_rooms
  ADD CONSTRAINT gameday_rooms_sport_check
  CHECK (sport IS NULL OR sport IN ('nba','soccer','nfl','football','basketball','baseball'));

ALTER TABLE gameday_prop_library DROP CONSTRAINT IF EXISTS gameday_prop_library_sport_check;
ALTER TABLE gameday_prop_library
  ADD CONSTRAINT gameday_prop_library_sport_check
  CHECK (sport IN ('nba','soccer','nfl','football','basketball','baseball'));

-- IDs match the hardcoded fallback template. Existing library customizations
-- are never overwritten.
INSERT INTO gameday_prop_library
  (id, sport, phase, question, answer_options, settlement_window, display_order, is_default, is_active)
VALUES
  ('nfl_pre_winner', 'nfl', 'pregame', 'Who wins the game?', '["{{TEAM_A}}","{{TEAM_B}}"]'::jsonb, 'End Game', 0, true, true),
  ('nfl_pre_first_score', 'nfl', 'pregame', 'Which team scores first?', '["{{TEAM_A}}","{{TEAM_B}}"]'::jsonb, 'Opening Drive', 1, true, true),
  ('nfl_pre_halftime_leader', 'nfl', 'pregame', 'Who leads at halftime?', '["{{TEAM_A}}","{{TEAM_B}}","Tied"]'::jsonb, 'Halftime', 2, true, true),
  ('nfl_pre_qb_td_passes', 'nfl', 'pregame', 'Which QB throws more touchdown passes?', '["{{STAR_A}}","{{STAR_B}}","Tied"]'::jsonb, 'End Game', 3, true, true),
  ('nfl_pre_qb_interception', 'nfl', 'pregame', 'Will either starting QB throw an interception?', '["Yes","No"]'::jsonb, 'End Game', 4, true, true),
  ('nfl_pre_total_touchdowns', 'nfl', 'pregame', 'How many total touchdowns are scored?', '["0–3","4–5","6+"]'::jsonb, 'End Game', 5, true, true),
  ('nfl_ht_winner', 'nfl', 'halftime', 'Who wins the game?', '["{{TEAM_A}}","{{TEAM_B}}"]'::jsonb, 'End Game', 6, true, true),
  ('nfl_ht_first_second_half_score', 'nfl', 'halftime', 'Which team scores first in the second half?', '["{{TEAM_A}}","{{TEAM_B}}","No second-half score"]'::jsonb, 'Third Quarter', 7, true, true),
  ('nfl_ht_second_half_points', 'nfl', 'halftime', 'Which team scores more points in the second half?', '["{{TEAM_A}}","{{TEAM_B}}","Tied"]'::jsonb, 'End Game', 8, true, true),
  ('nfl_ht_fourth_lead_change', 'nfl', 'halftime', 'Will the lead change in the fourth quarter?', '["Yes","No"]'::jsonb, 'End Game', 9, true, true),
  ('nfl_4q_winner', 'nfl', 'fourth', 'Who wins the game?', '["{{TEAM_A}}","{{TEAM_B}}"]'::jsonb, 'End Game', 10, true, true),
  ('nfl_4q_next_score', 'nfl', 'fourth', 'Which team scores next?', '["{{TEAM_A}}","{{TEAM_B}}","No more scores"]'::jsonb, 'End Game', 11, true, true),
  ('nfl_4q_another_touchdown', 'nfl', 'fourth', 'Will there be another touchdown?', '["Yes","No"]'::jsonb, 'End Game', 12, true, true)
ON CONFLICT (id) DO NOTHING;

COMMIT;