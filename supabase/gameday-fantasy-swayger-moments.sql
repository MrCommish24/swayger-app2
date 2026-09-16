-- SWAYGER MOMENTS — named Weekly Fantasy question library
--
-- Additive/idempotent source-library update. Published gameday_props remain
-- immutable snapshots: this migration does not update existing rooms, cards,
-- props, picks, answers, point values, or settlement state.

BEGIN;

INSERT INTO public.gameday_prop_library (
  id,
  sport,
  phase,
  question,
  answer_options,
  settlement_window,
  is_active,
  is_default,
  display_order,
  experience_type,
  competition_type,
  scoring_scope,
  point_value,
  answer_target_type,
  supports_no_one
) VALUES
  (
    'fantasy_weekly_nfl_highest_scoring_team', 'football', 'main',
    'Who will post the highest fantasy score this week?', '[]'::jsonb,
    'Fantasy team with the highest final weekly fantasy score.',
    true, true, 10, 'fantasy', 'weekly', 'competition', 15, 'fantasy_team', false
  ),
  (
    'fantasy_weekly_nfl_lowest_scoring_team', 'football', 'main',
    'Who will finish with the fewest fantasy points this week?', '[]'::jsonb,
    'Fantasy team with the lowest final weekly fantasy score.',
    true, true, 20, 'fantasy', 'weekly', 'competition', 10, 'fantasy_team', false
  ),
  (
    'fantasy_weekly_nfl_largest_margin_winner', 'football', 'main',
    'Who will deliver the biggest win of the week?', '[]'::jsonb,
    'Winning fantasy team with the largest margin of victory.',
    true, true, 30, 'fantasy', 'weekly', 'competition', 20, 'fantasy_team', true
  ),
  (
    'fantasy_weekly_nfl_smallest_margin_winner', 'football', 'main',
    'Who will win by the smallest margin this week?', '[]'::jsonb,
    'Winning fantasy team with the smallest margin of victory.',
    true, true, 40, 'fantasy', 'weekly', 'competition', 20, 'fantasy_team', true
  ),
  (
    'fantasy_weekly_nfl_highest_player_team', 'football', 'main',
    'Which team will roster the highest-scoring individual player this week?', '[]'::jsonb,
    'Fantasy team containing the highest-scoring individual fantasy player for the completed week.',
    true, true, 50, 'fantasy', 'weekly', 'competition', 15, 'fantasy_team', false
  ),
  (
    'fantasy_weekly_nfl_score_150_plus', 'football', 'main',
    'Will anyone score 150+ fantasy points this week?',
    '[{"id":"yes","label":"Yes","type":"yes_no"},{"id":"no","label":"No","type":"yes_no"}]'::jsonb,
    'Yes if at least one fantasy team finishes with 150.0+ points.',
    true, false, 60, 'fantasy', 'weekly', 'competition', 10, 'yes_no', false
  ),
  (
    'fantasy_weekly_nfl_matchup_under_5', 'football', 'main',
    'Will any matchup be decided by fewer than 5 fantasy points?',
    '[{"id":"yes","label":"Yes","type":"yes_no"},{"id":"no","label":"No","type":"yes_no"}]'::jsonb,
    'Yes if at least one completed matchup has an absolute final margin below 5.0 fantasy points.',
    true, false, 70, 'fantasy', 'weekly', 'competition', 10, 'yes_no', false
  ),
  (
    'fantasy_weekly_nfl_bad_beat', 'football', 'main',
    'Who will be the highest-scoring team that still loses?', '[]'::jsonb,
    'Among all losing fantasy teams, select the team with the highest final fantasy score.',
    true, false, 80, 'fantasy', 'weekly', 'competition', 10, 'fantasy_team', false
  ),
  (
    'fantasy_weekly_nfl_got_away_with_one', 'football', 'main',
    'Who will be the lowest-scoring team that still wins?', '[]'::jsonb,
    'Among all winning fantasy teams, select the team with the lowest final fantasy score.',
    true, false, 90, 'fantasy', 'weekly', 'competition', 10, 'fantasy_team', false
  ),
  (
    'fantasy_weekly_nfl_win_under_100', 'football', 'main',
    'Will somebody win with fewer than 100 fantasy points?',
    '[{"id":"yes","label":"Yes","type":"yes_no"},{"id":"no","label":"No","type":"yes_no"}]'::jsonb,
    'Yes if at least one winning fantasy team scores less than 100.0 points.',
    true, false, 100, 'fantasy', 'weekly', 'competition', 10, 'yes_no', false
  ),
  (
    'fantasy_weekly_nfl_130_plus_loss', 'football', 'main',
    'Will somebody score 130+ fantasy points and still lose?',
    '[{"id":"yes","label":"Yes","type":"yes_no"},{"id":"no","label":"No","type":"yes_no"}]'::jsonb,
    'Yes if at least one losing fantasy team finishes with 130.0+ points.',
    true, false, 110, 'fantasy', 'weekly', 'competition', 10, 'yes_no', false
  ),
  (
    'fantasy_weekly_nfl_30_plus_blowout', 'football', 'main',
    'Will somebody win by 30+ fantasy points?',
    '[{"id":"yes","label":"Yes","type":"yes_no"},{"id":"no","label":"No","type":"yes_no"}]'::jsonb,
    'Yes if at least one matchup has a winning margin of 30.0+ fantasy points.',
    true, false, 120, 'fantasy', 'weekly', 'competition', 10, 'yes_no', false
  )
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer_options = EXCLUDED.answer_options,
  settlement_window = EXCLUDED.settlement_window,
  is_active = EXCLUDED.is_active,
  is_default = EXCLUDED.is_default,
  display_order = EXCLUDED.display_order,
  experience_type = EXCLUDED.experience_type,
  competition_type = EXCLUDED.competition_type,
  scoring_scope = EXCLUDED.scoring_scope,
  point_value = EXCLUDED.point_value,
  answer_target_type = EXCLUDED.answer_target_type,
  supports_no_one = EXCLUDED.supports_no_one,
  updated_at = now();

COMMIT;