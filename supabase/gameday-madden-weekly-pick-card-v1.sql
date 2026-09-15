-- Madden Weekly Pick Card V1
-- Additive migration. Apply in the Supabase SQL Editor before creating
-- Madden Weekly Pick Card rooms.

BEGIN;

-- Madden weekly rooms do not have one representative matchup or star player.
-- Legacy rooms continue to populate these columns; Madden rooms leave them NULL.
ALTER TABLE gameday_rooms
  ALTER COLUMN team_a_name DROP NOT NULL,
  ALTER COLUMN team_b_name DROP NOT NULL,
  ALTER COLUMN team_a_star DROP NOT NULL,
  ALTER COLUMN team_b_star DROP NOT NULL;

ALTER TABLE gameday_rooms
  ADD COLUMN IF NOT EXISTS format_config JSONB;

ALTER TABLE gameday_rooms
  DROP CONSTRAINT IF EXISTS gameday_rooms_sport_check;
ALTER TABLE gameday_rooms
  ADD CONSTRAINT gameday_rooms_sport_check
  CHECK (sport IS NULL OR sport IN ('nba', 'soccer', 'nfl', 'madden'));

ALTER TABLE gameday_rooms
  DROP CONSTRAINT IF EXISTS gameday_rooms_template_type_check;
ALTER TABLE gameday_rooms
  ADD CONSTRAINT gameday_rooms_template_type_check
  CHECK (
    template_type IS NULL OR
    template_type IN ('nfl_single_game', 'nfl_sunday_slate', 'weekly_pick_card')
  );

ALTER TABLE gameday_props
  ADD COLUMN IF NOT EXISTS line_text TEXT;

COMMENT ON COLUMN gameday_rooms.format_config IS
  'Validated format-specific metadata. V1 supports weekly_pick_card config.';

COMMENT ON COLUMN gameday_props.line_text IS
  'Optional host-entered display text such as a spread or line.';

COMMIT;