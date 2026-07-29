-- Game Day Phase 2 — Prop Library + Card Scheduling
-- Run this in the Supabase SQL Editor after gameday-migration.sql

-- ── 1. Prop Library ────────────────────────────────────────────────────────────
-- Master catalog of prop templates. Replaces hardcoded gameday-template.ts.
-- Hosts select from this table when creating rooms.

CREATE TABLE IF NOT EXISTS gameday_prop_library (
  id                TEXT        PRIMARY KEY,  -- stable ID e.g. "pg_scores_first"
  sport             TEXT        NOT NULL CHECK (sport IN ('nba', 'soccer')),
  phase             TEXT        NOT NULL,
  question          TEXT        NOT NULL,
  answer_options    JSONB       NOT NULL DEFAULT '[]',
  settlement_window TEXT        NOT NULL DEFAULT '',
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  is_default        BOOLEAN     NOT NULL DEFAULT false,
  display_order     INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gameday_prop_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gd_prop_library_all" ON gameday_prop_library FOR ALL USING (true) WITH CHECK (true);

-- ── 2. Add template_prop_id to gameday_props ───────────────────────────────────
-- Links each room prop back to its library source for global settlement.

ALTER TABLE gameday_props
  ADD COLUMN IF NOT EXISTS template_prop_id TEXT REFERENCES gameday_prop_library(id) ON DELETE SET NULL;

-- ── 3. Add scheduling columns to gameday_pick_cards ───────────────────────────
-- Auto-open/lock cards at scheduled times. Both nullable — manual control if null.

ALTER TABLE gameday_pick_cards
  ADD COLUMN IF NOT EXISTS scheduled_open_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_lock_at TIMESTAMPTZ;

-- ── 4. Add sport + game_start_time to gameday_rooms ───────────────────────────

ALTER TABLE gameday_rooms
  ADD COLUMN IF NOT EXISTS sport           TEXT CHECK (sport IN ('nba', 'soccer')),
  ADD COLUMN IF NOT EXISTS game_start_time TIMESTAMPTZ;

-- ── 5. Fix phase constraint on gameday_pick_cards ─────────────────────────────
-- Original constraint only allowed pregame/halftime/fourth.
-- Soccer rooms need final_push and penalties.

ALTER TABLE gameday_pick_cards
  DROP CONSTRAINT IF EXISTS gameday_pick_cards_phase_check;

ALTER TABLE gameday_pick_cards
  ADD CONSTRAINT gameday_pick_cards_phase_check
  CHECK (phase IN ('pregame','halftime','fourth','final_push','penalties'));

-- ── 6. Seed NBA props ─────────────────────────────────────────────────────────

INSERT INTO gameday_prop_library (id, sport, phase, question, answer_options, settlement_window, is_active, is_default, display_order) VALUES
-- Pregame
('pg_scores_first',  'nba', 'pregame', 'Which team scores first?',                                      '["{{TEAM_A}}","{{TEAM_B}}"]',                                         'Early 1Q',      true, true,  0),
('pg_first_three',   'nba', 'pregame', 'Which team makes the first 3-pointer?',                         '["{{TEAM_A}}","{{TEAM_B}}","No 3-pointer in Q1"]',                    'Early 1Q',      true, true,  1),
('pg_reach10',       'nba', 'pregame', 'Which team reaches 10 points first?',                           '["{{TEAM_A}}","{{TEAM_B}}"]',                                         'Early 1Q',      true, false, 2),
('pg_q1',            'nba', 'pregame', 'Which team wins the 1st quarter?',                              '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End 1Q',        true, true,  3),
('pg_q1_pts',        'nba', 'pregame', 'Which team scores more points in the 1st quarter?',             '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End 1Q',        true, false, 4),
('pg_star_q1',       'nba', 'pregame', 'Which star scores more points in the 1st quarter?',             '["{{STAR_A}}","{{STAR_B}}","Tie"]',                                   'End 1Q',        true, false, 5),
('pg_q1_30',         'nba', 'pregame', 'Will either team score 30+ points in the 1st quarter?',         '["Yes","No"]',                                                        'End 1Q',        true, false, 6),
('pg_reach20',       'nba', 'pregame', 'Which team reaches 20 points first?',                           '["{{TEAM_A}}","{{TEAM_B}}","Neither team reaches 20 in Q1"]',         'Early 1Q–2Q',   true, false, 7),
('pg_star_halftime', 'nba', 'pregame', 'Which star scores more points in the 1st half?',                '["{{STAR_A}}","{{STAR_B}}","Tie"]',                                   'Halftime',      true, true,  8),
('pg_1h_winner',     'nba', 'pregame', 'Which team wins the first half?',                               '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'Halftime',      true, false, 9),
('pg_lead10_half',   'nba', 'pregame', 'Will either team lead by 10+ points in the 1st half?',          '["Yes","No"]',                                                        'Halftime',      true, false, 10),
('pg_star_pts',      'nba', 'pregame', 'Which star finishes with more total points?',                   '["{{STAR_A}}","{{STAR_B}}","Tie"]',                                   'End Game',      true, false, 11),
('pg_star_threes',   'nba', 'pregame', 'Which star makes more 3-pointers in the game?',                 '["{{STAR_A}}","{{STAR_B}}","Tie"]',                                   'End Game',      true, false, 12),
('pg_threes',        'nba', 'pregame', 'Which team makes more 3-pointers in the game?',                 '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End Game',      true, false, 13),
('pg_turnovers',     'nba', 'pregame', 'Which team has more turnovers in the game?',                    '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End Game',      true, false, 14),
('pg_oreb',          'nba', 'pregame', 'Which team has more offensive rebounds in the game?',           '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End Game',      true, false, 15),
('pg_winner',        'nba', 'pregame', 'Which team wins the game?',                                     '["{{TEAM_A}}","{{TEAM_B}}"]',                                         'End Game',      true, true,  16),
('pg_clutch',        'nba', 'pregame', 'Will the game be within 7 points with 2 minutes left?',         '["Yes","No"]',                                                        'Final 2 Min',   true, true,  17),
('pg_margin7',       'nba', 'pregame', 'Will the final margin be 7 points or fewer?',                   '["Yes","No"]',                                                        'End Game',      true, false, 18),
('pg_total220',      'nba', 'pregame', 'Will the game total be 220+ combined points?',                  '["Yes","No"]',                                                        'End Game',      true, false, 19),
('pg_margin',        'nba', 'pregame', 'Final margin?',                                                 '["1–5","6–10","11–15","16+"]',                                        'End Game',      true, false, 20),
('pg_tech',          'nba', 'pregame', 'Will there be a technical foul?',                               '["Yes","No"]',                                                        'End Game',      true, false, 21),
-- Halftime
('ht_first2h',       'nba', 'halftime', 'Which team scores first in the 2nd half?',                     '["{{TEAM_A}}","{{TEAM_B}}"]',                                         'Early 3Q',      true, true,  0),
('ht_first_three_2h','nba', 'halftime', 'Which team makes the first 3-pointer of the 2nd half?',        '["{{TEAM_A}}","{{TEAM_B}}","No 3-pointer in Q3"]',                    'Early 3Q',      true, false, 1),
('ht_reach15',       'nba', 'halftime', 'Which team reaches 15 second-half points first?',              '["{{TEAM_A}}","{{TEAM_B}}"]',                                         'Mid 3Q',        true, false, 2),
('ht_q3',            'nba', 'halftime', 'Which team wins the 3rd quarter?',                             '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End 3Q',        true, true,  3),
('ht_q3_pts',        'nba', 'halftime', 'Which team scores more points in the 3rd quarter?',            '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End 3Q',        true, false, 4),
('ht_q3_lead_change','nba', 'halftime', 'Will there be a lead change in the 3rd quarter?',              '["Yes","No"]',                                                        'End 3Q',        true, false, 5),
('ht_q3_threes_both','nba', 'halftime', 'Will both teams make at least two 3-pointers in the 3rd quarter?', '["Yes","No"]',                                                   'End 3Q',        true, false, 6),
('ht_within5_4q',    'nba', 'halftime', 'Will the game be within 5 points entering the 4th quarter?',  '["Yes","No"]',                                                        'End 3Q',        true, false, 7),
('ht_star_2h',       'nba', 'halftime', 'Which star player scores more in the 2nd half?',               '["{{STAR_A}}","{{STAR_B}}","Tie"]',                                   'End Game',      true, true,  8),
('ht_star_threes_2h','nba', 'halftime', 'Which star makes more 3-pointers in the 2nd half?',            '["{{STAR_A}}","{{STAR_B}}","Tie"]',                                   'End Game',      true, false, 9),
('ht_star_15',       'nba', 'halftime', 'Will either star score 15+ points in the 2nd half?',           '["Yes","No"]',                                                        'End Game',      true, false, 10),
('ht_2h_pts',        'nba', 'halftime', 'Which team scores more points in the 2nd half?',               '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End Game',      true, false, 11),
('ht_lead15',        'nba', 'halftime', 'Will either team lead by 15+ points at any point in the 2nd half?', '["Yes","No"]',                                                  'End Game',      true, false, 12),
('ht_winner',        'nba', 'halftime', 'Does the halftime leader win the game?',                       '["Yes","No","Game was tied at halftime"]',                            'End Game',      true, true,  13),
('ht_trailing_lead', 'nba', 'halftime', 'Will the team trailing at halftime come back to take the lead?', '["Yes","No","Game was tied at halftime"]',                          'End Game',      true, false, 14),
('ht_comeback',      'nba', 'halftime', 'Will the losing team cut the deficit to one possession?',      '["Yes","No"]',                                                        'End Game',      true, false, 15),
('ht_turnovers_2h',  'nba', 'halftime', 'Which team commits more turnovers in the 2nd half?',           '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End Game',      true, false, 16),
('ht_rebounds_2h',   'nba', 'halftime', 'Which team gets more rebounds in the 2nd half?',               '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End Game',      true, false, 17),
('ht_ft_2h',         'nba', 'halftime', 'Which team makes more free throws in the 2nd half?',           '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End Game',      true, false, 18),
('ht_run',           'nba', 'halftime', 'Will either team go on a 10–0 run in the 2nd half?',           '["Yes","No"]',                                                        'End Game',      true, false, 19),
('ht_game_winner',   'nba', 'halftime', 'Which team wins the game?',                                    '["{{TEAM_A}}","{{TEAM_B}}"]',                                         'End Game',      true, false, 20),
-- 4Q Clutch
('q4_first',         'nba', 'fourth',  'Which team scores first in the 4th quarter?',                   '["{{TEAM_A}}","{{TEAM_B}}"]',                                         'Early 4Q',      true, true,  0),
('q4_first_three',   'nba', 'fourth',  'Which team makes the first 3-pointer of the 4th quarter?',      '["{{TEAM_A}}","{{TEAM_B}}","No 3-pointer in Q4"]',                    'Early 4Q',      true, false, 1),
('q4_winner',        'nba', 'fourth',  'Which team wins the 4th quarter?',                              '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End Game',      true, true,  2),
('q4_pts',           'nba', 'fourth',  'Which team scores more points in the 4th quarter?',             '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End Game',      true, false, 3),
('q4_lead_change',   'nba', 'fourth',  'Will there be a lead change in the 4th quarter?',               '["Yes","No"]',                                                        'End Game',      true, true,  4),
('q4_clutch',        'nba', 'fourth',  'Will the game be within 5 points in the final 2 minutes?',      '["Yes","No"]',                                                        'Final 2 Min',   true, false, 5),
('q4_margin5',       'nba', 'fourth',  'Will the final margin be 5 points or fewer?',                   '["Yes","No"]',                                                        'End Game',      true, false, 6),
('q4_margin10',      'nba', 'fourth',  'Will the final margin be 10 points or fewer?',                  '["Yes","No"]',                                                        'End Game',      true, false, 7),
('q4_star',          'nba', 'fourth',  'Which star player scores more in the 4th quarter?',             '["{{STAR_A}}","{{STAR_B}}","Tie"]',                                   'End Game',      true, false, 8),
('q4_star_10',       'nba', 'fourth',  'Will either star score 10+ points in the 4th quarter?',         '["Yes","No"]',                                                        'End Game',      true, false, 9),
('q4_threes',        'nba', 'fourth',  'Which team makes more 3-pointers in the 4th quarter?',          '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End Game',      true, false, 10),
('q4_fta',           'nba', 'fourth',  'Which team attempts more free throws in the 4th quarter?',      '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End Game',      true, false, 11),
('q4_ftm',           'nba', 'fourth',  'Which team makes more free throws in the 4th quarter?',         '["{{TEAM_A}}","{{TEAM_B}}","Tie"]',                                   'End Game',      true, false, 12),
('q4_trailing_lead', 'nba', 'fourth',  'Will the team trailing entering the 4th quarter take the lead?','["Yes","No","Game was tied entering Q4"]',                            'End Game',      true, false, 13),
('q4_leader_wins',   'nba', 'fourth',  'Will the team leading entering the 4th quarter win the game?',  '["Yes","No","Game was tied entering Q4"]',                            'End Game',      true, false, 14),
('q4_run8',          'nba', 'fourth',  'Will either team go on an 8–0 run or better in the 4th quarter?', '["Yes","No"]',                                                     'End Game',      true, false, 15),
('q4_ot',            'nba', 'fourth',  'Will the game have overtime?',                                  '["Yes","No"]',                                                        'End Game',      true, false, 16),
('q4_game_winner',   'nba', 'fourth',  'Who wins the game?',                                            '["{{TEAM_A}}","{{TEAM_B}}"]',                                         'End Game',      true, false, 17)
ON CONFLICT (id) DO NOTHING;

-- ── 7. Seed Soccer props ───────────────────────────────────────────────────────

INSERT INTO gameday_prop_library (id, sport, phase, question, answer_options, settlement_window, is_active, is_default, display_order) VALUES
-- Pregame
('fifa_pg_scores_first', 'soccer', 'pregame', 'Which team scores first?',                                       '["{{TEAM_A}}","{{TEAM_B}}","No goals in first 20 min"]',          'First 20 Min',  true, true,  0),
('fifa_pg_1h_goals',     'soccer', 'pregame', 'How many goals in the first half?',                              '["0","1","2+"]',                                                  'Halftime',      true, false, 1),
('fifa_pg_1h_winner',    'soccer', 'pregame', 'Who leads at halftime?',                                         '["{{TEAM_A}}","{{TEAM_B}}","Level / 0-0"]',                        'Halftime',      true, true,  2),
('fifa_pg_star_goal_1h', 'soccer', 'pregame', 'Does either star score in the first half?',                      '["{{STAR_A}}","{{STAR_B}}","Both","Neither"]',                     'Halftime',      true, true,  3),
('fifa_pg_corner_1h',    'soccer', 'pregame', 'Which team wins more corners in the first half?',                '["{{TEAM_A}}","{{TEAM_B}}","Equal"]',                             'Halftime',      true, false, 4),
('fifa_pg_winner',       'soccer', 'pregame', 'Who wins after 90 minutes?',                                     '["{{TEAM_A}}","{{TEAM_B}}","Draw"]',                              'End 90 Min',    true, true,  5),
('fifa_pg_total_goals',  'soccer', 'pregame', 'Total goals in the match (90 min)?',                             '["0–1","2","3","4+"]',                                            'End 90 Min',    true, false, 6),
('fifa_pg_star_goal',    'soccer', 'pregame', 'Which star scores in the match?',                                '["{{STAR_A}}","{{STAR_B}}","Both","Neither"]',                     'End 90 Min',    true, false, 7),
('fifa_pg_red_card',     'soccer', 'pregame', 'Will there be a red card?',                                      '["Yes","No"]',                                                    'End Game',      true, false, 8),
('fifa_pg_extra_time',   'soccer', 'pregame', 'Will the match go to extra time?',                               '["Yes","No"]',                                                    'End 90 Min',    true, true,  9),
('fifa_pg_penalties',    'soccer', 'pregame', 'Will there be a penalty shootout?',                              '["Yes","No"]',                                                    'End Game',      true, false, 10),
('fifa_pg_clean_sheet',  'soccer', 'pregame', 'Does either team keep a clean sheet (90 min)?',                  '["{{TEAM_A}}","{{TEAM_B}}","Neither"]',                           'End 90 Min',    true, false, 11),
('fifa_pg_margin',       'soccer', 'pregame', 'Winning margin after 90 min?',                                   '["1 goal","2 goals","3+ goals","Draw"]',                          'End 90 Min',    true, false, 12),
('fifa_pg_comeback',     'soccer', 'pregame', 'Will the team that concedes first come back to equalize or win?','["Yes","No"]',                                                    'End Game',      true, false, 13),
('fifa_pg_trophy',       'soccer', 'pregame', 'Who lifts the trophy?',                                          '["{{TEAM_A}}","{{TEAM_B}}"]',                                     'End Game',      true, true,  14),
-- Halftime
('fifa_ht_next_goal',    'soccer', 'halftime', 'Who scores next?',                                              '["{{TEAM_A}}","{{TEAM_B}}","No more goals"]',                     'Early 2H',      true, true,  0),
('fifa_ht_first_goal_2h','soccer', 'halftime', 'Which team scores first in the 2nd half?',                      '["{{TEAM_A}}","{{TEAM_B}}","No 2nd half goals"]',                 'Early 2H',      true, false, 1),
('fifa_ht_2h_goals',     'soccer', 'halftime', 'How many goals in the 2nd half?',                               '["0","1","2+"]',                                                  'End 90 Min',    true, false, 2),
('fifa_ht_2h_winner',    'soccer', 'halftime', 'Which team wins the 2nd half?',                                 '["{{TEAM_A}}","{{TEAM_B}}","Draw"]',                              'End 90 Min',    true, true,  3),
('fifa_ht_result_holds', 'soccer', 'halftime', 'Does the halftime result hold at full time?',                   '["Yes","No"]',                                                    'End 90 Min',    true, false, 4),
('fifa_ht_comeback',     'soccer', 'halftime', 'Will the team trailing at halftime equalize or win?',           '["Yes","No","Teams are level at halftime"]',                      'End 90 Min',    true, true,  5),
('fifa_ht_star_goal_2h', 'soccer', 'halftime', 'Does either star score in the 2nd half?',                       '["{{STAR_A}}","{{STAR_B}}","Both","Neither"]',                     'End 90 Min',    true, false, 6),
('fifa_ht_extra_time',   'soccer', 'halftime', 'Will the match go to extra time?',                              '["Yes","No"]',                                                    'End 90 Min',    true, true,  7),
('fifa_ht_red_card_2h',  'soccer', 'halftime', 'Will there be a red card in the 2nd half?',                     '["Yes","No"]',                                                    'End Game',      true, false, 8),
('fifa_ht_sub_goal',     'soccer', 'halftime', 'Will a substitute score in the 2nd half?',                      '["Yes","No"]',                                                    'End 90 Min',    true, false, 9),
('fifa_ht_injury_goal',  'soccer', 'halftime', 'Will there be a goal in injury time?',                          '["Yes","No"]',                                                    'End 90 Min',    true, false, 10),
('fifa_ht_winner',       'soccer', 'halftime', 'Who wins the match (90 min)?',                                  '["{{TEAM_A}}","{{TEAM_B}}","Draw"]',                              'End 90 Min',    true, false, 11),
('fifa_ht_corner_2h',    'soccer', 'halftime', 'Which team wins more corners in the 2nd half?',                 '["{{TEAM_A}}","{{TEAM_B}}","Equal"]',                             'End 90 Min',    true, false, 12),
('fifa_ht_trophy',       'soccer', 'halftime', 'Who lifts the trophy?',                                         '["{{TEAM_A}}","{{TEAM_B}}"]',                                     'End Game',      true, false, 13),
-- Final Push
('fifa_fp_next_goal',    'soccer', 'final_push', 'Next goal goes to?',                                          '["{{TEAM_A}}","{{TEAM_B}}","No more goals in 90 min"]',           'End 90 Min',    true, true,  0),
('fifa_fp_goal_last20',  'soccer', 'final_push', 'Will there be a goal in the final 20 minutes?',               '["Yes","No"]',                                                    'End 90 Min',    true, true,  1),
('fifa_fp_injury_time',  'soccer', 'final_push', 'How many minutes of injury time?',                            '["1–4 min","5–7 min","8+ min"]',                                  'End 90 Min',    true, false, 2),
('fifa_fp_extra_time',   'soccer', 'final_push', 'Will the match go to extra time?',                            '["Yes","No"]',                                                    'End 90 Min',    true, true,  3),
('fifa_fp_penalties',    'soccer', 'final_push', 'Will there be a penalty shootout?',                           '["Yes","No"]',                                                    'End Game',      true, false, 4),
('fifa_fp_star_goal',    'soccer', 'final_push', 'Does either star score in the final 20 minutes?',             '["{{STAR_A}}","{{STAR_B}}","Neither"]',                           'End 90 Min',    true, false, 5),
('fifa_fp_comeback',     'soccer', 'final_push', 'Will the trailing team equalize or win from here?',           '["Yes","No","Teams are level"]',                                  'End 90 Min',    true, true,  6),
('fifa_fp_winner_90',    'soccer', 'final_push', 'Who wins after 90 minutes?',                                  '["{{TEAM_A}}","{{TEAM_B}}","Draw / Extra Time"]',                 'End 90 Min',    true, true,  7),
('fifa_fp_trophy',       'soccer', 'final_push', 'Who lifts the trophy?',                                       '["{{TEAM_A}}","{{TEAM_B}}"]',                                     'End Game',      true, false, 8),
('fifa_fp_clean_sheet',  'soccer', 'final_push', 'Does either team keep a clean sheet (90 min)?',               '["{{TEAM_A}}","{{TEAM_B}}","Neither"]',                           'End 90 Min',    true, false, 9),
-- Penalties
('fifa_pen_winner',       'soccer', 'penalties', 'Who wins the penalty shootout?',                               '["{{TEAM_A}}","{{TEAM_B}}"]',                                     'End Shootout',  true, true,  0),
('fifa_pen_first_miss',   'soccer', 'penalties', 'Which team misses first?',                                     '["{{TEAM_A}}","{{TEAM_B}}","No misses"]',                         'End Shootout',  true, true,  1),
('fifa_pen_total_kicks',  'soccer', 'penalties', 'Total penalty kicks taken?',                                   '["5–6","7–8","9–10","11+"]',                                      'End Shootout',  true, true,  2),
('fifa_pen_sudden_death', 'soccer', 'penalties', 'Does it go beyond the first 5 kicks per side?',                '["Yes — sudden death!","No"]',                                    'End Shootout',  true, true,  3),
('fifa_pen_star_scores',  'soccer', 'penalties', 'Does either star take and score a penalty?',                   '["{{STAR_A}}","{{STAR_B}}","Both","Neither"]',                     'End Shootout',  true, true,  4),
('fifa_pen_clean_sweep',  'soccer', 'penalties', 'Does any team score all their kicks perfectly?',               '["Yes","No"]',                                                    'End Shootout',  true, true,  5)
ON CONFLICT (id) DO NOTHING;
