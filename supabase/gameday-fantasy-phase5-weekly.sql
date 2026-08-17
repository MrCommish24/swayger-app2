-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 5: Fantasy Weekly Competitions (Week 1 Swayger)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Apply manually before starting Phase 5 implementation.
-- STOP — do not auto-apply.
--
-- What this migration does:
--   1. Adds week_number INTEGER to gameday_rooms
--   2. Partial unique index preventing duplicate weekly rooms per season
--   3. Inserts NFL weekly prop library templates (7 V1 props)
--   4. Creates publish_fantasy_weekly RPC (atomic room + card + props)
--
-- What does NOT need new SQL:
--   - season standings: computed on demand in route layer from existing tables
--   - finalization: reuses application-level status update (same as Draft Day)
--   - open roster: roster_revision / answer_universe_revision columns already exist
--   - participant reuse: ensureFantasyParticipant already handles season_member_id
--   - guest continuity: fantasy_member_claims already covers weekly rooms
--   - pick submission: gameday_picks table already generic
--   - settlement: settlePropCore already generic
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. week_number column
-- ─────────────────────────────────────────────────────────────────────────────
-- Represents the ordinal week of a weekly fantasy competition.
-- NULL for competition_type IN ('draft_day','playoffs','championship') — only
-- set when competition_type = 'weekly'.
-- Future weeks (2, 3 … 17) use the same column without schema changes.

ALTER TABLE gameday_rooms
  ADD COLUMN IF NOT EXISTS week_number INTEGER;

COMMENT ON COLUMN gameday_rooms.week_number IS
  'Ordinal week number for weekly fantasy competitions (competition_type=weekly). '
  'NULL for draft_day, playoffs, and championship rooms.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Uniqueness: one weekly room per (season, week_number)
-- ─────────────────────────────────────────────────────────────────────────────
-- Prevents accidental duplicate Week 1 creation (§29 of Phase 5 spec).
-- Partial index: only enforced for weekly competitions with a known week number.
-- publish_fantasy_weekly uses an application-level idempotency check first;
-- this index is the database-level safety net.

CREATE UNIQUE INDEX IF NOT EXISTS idx_gameday_rooms_weekly_unique
  ON gameday_rooms (league_season_id, competition_type, week_number)
  WHERE competition_type = 'weekly'
    AND league_season_id IS NOT NULL
    AND week_number IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. NFL Weekly Prop Library — V1 template set
-- ─────────────────────────────────────────────────────────────────────────────
-- answer_options = '[]' for roster-target props (fantasy_team / season_member):
--   populated at publish time from current season roster, same as Draft Day.
-- answer_options pre-filled for yes_no props.
--
-- All props:
--   experience_type = 'fantasy'
--   competition_type = 'weekly'
--   scoring_scope = 'competition'
--   sport = 'football'
--
-- Point values deliberately non-uniform (per test spec §40).

INSERT INTO gameday_prop_library (
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
  -- ── Prop 1: Highest-scoring team ──────────────────────────────────────────
  (
    'fantasy_weekly_nfl_highest_scoring_team',
    'football', 'main',
    'Which fantasy team scores the most points this week?',
    '[]'::jsonb, '',
    true, true, 10,
    'fantasy', 'weekly', 'competition',
    15, 'fantasy_team', false
  ),
  -- ── Prop 2: Lowest-scoring team ───────────────────────────────────────────
  (
    'fantasy_weekly_nfl_lowest_scoring_team',
    'football', 'main',
    'Which fantasy team scores the fewest points this week?',
    '[]'::jsonb, '',
    true, true, 20,
    'fantasy', 'weekly', 'competition',
    10, 'fantasy_team', false
  ),
  -- ── Prop 3: Largest margin of victory ─────────────────────────────────────
  (
    'fantasy_weekly_nfl_largest_margin_winner',
    'football', 'main',
    'Which team wins their matchup by the largest margin this week?',
    '[]'::jsonb, '',
    true, true, 30,
    'fantasy', 'weekly', 'competition',
    20, 'fantasy_team', true
  ),
  -- ── Prop 4: Smallest margin of victory ────────────────────────────────────
  (
    'fantasy_weekly_nfl_smallest_margin_winner',
    'football', 'main',
    'Which team wins their matchup by the smallest margin this week?',
    '[]'::jsonb, '',
    true, true, 40,
    'fantasy', 'weekly', 'competition',
    20, 'fantasy_team', true
  ),
  -- ── Prop 5: Team with highest-scoring individual player ───────────────────
  (
    'fantasy_weekly_nfl_highest_player_team',
    'football', 'main',
    'Which fantasy team has the highest-scoring individual player this week?',
    '[]'::jsonb, '',
    true, true, 50,
    'fantasy', 'weekly', 'competition',
    15, 'fantasy_team', false
  ),
  -- ── Prop 6: Any team scores 150+? (yes/no) ────────────────────────────────
  (
    'fantasy_weekly_nfl_score_150_plus',
    'football', 'main',
    'Will any fantasy team score 150 or more points this week?',
    '[{"id":"yes","label":"Yes","type":"yes_no"},{"id":"no","label":"No","type":"yes_no"}]'::jsonb,
    '',
    true, false, 60,
    'fantasy', 'weekly', 'competition',
    10, 'yes_no', false
  ),
  -- ── Prop 7: Any matchup decided by < 5 points? (yes/no) ──────────────────
  (
    'fantasy_weekly_nfl_matchup_under_5',
    'football', 'main',
    'Will any matchup be decided by fewer than 5 points this week?',
    '[{"id":"yes","label":"Yes","type":"yes_no"},{"id":"no","label":"No","type":"yes_no"}]'::jsonb,
    '',
    true, false, 70,
    'fantasy', 'weekly', 'competition',
    10, 'yes_no', false
  )
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC: publish_fantasy_weekly
-- ─────────────────────────────────────────────────────────────────────────────
-- Atomically creates gameday_room + gameday_pick_card + gameday_props for a
-- weekly fantasy competition. Mirrors publish_fantasy_draft_day but accepts
-- p_week_number and uses competition_type='weekly' / phase='weekly'.
--
-- Idempotency: if a non-archived weekly room already exists for
-- (p_league_season_id, p_week_number), returns {already_existed: true} without
-- creating any rows. The unique index (§2 above) provides the DB-level guard.
--
-- Parameters mirror publish_fantasy_draft_day for consistency:
--   p_league_season_id UUID
--   p_week_number      INTEGER   (e.g. 1 for Week 1)
--   p_room_name        TEXT      (e.g. 'Week 1 Swayger — Food Pyramid 2026')
--   p_sport            TEXT      (e.g. 'football')
--   p_room_code        TEXT      (join code, generated by route)
--   p_host_user_id     UUID      (commissioner user_id)
--   p_props            JSONB     (array of prop snapshots with answer_options
--                                 already populated by the route layer)
--
-- Returns JSONB: { room_id, card_id, already_existed }

CREATE OR REPLACE FUNCTION publish_fantasy_weekly(
  p_league_season_id UUID,
  p_week_number      INTEGER,
  p_room_name        TEXT,
  p_sport            TEXT,
  p_room_code        TEXT,
  p_host_user_id     UUID,
  p_props            JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room_id  UUID;
  v_card_id  UUID;
  v_prop     JSONB;
BEGIN
  -- ── Idempotency: return existing room if already published ─────────────────
  SELECT r.id
    INTO v_room_id
    FROM gameday_rooms r
   WHERE r.league_season_id = p_league_season_id
     AND r.competition_type = 'weekly'
     AND r.week_number      = p_week_number
     AND r.experience_type  = 'fantasy'
     AND r.archived_at IS NULL
   LIMIT 1;

  IF v_room_id IS NOT NULL THEN
    SELECT id
      INTO v_card_id
      FROM gameday_pick_cards
     WHERE room_id = v_room_id
     ORDER BY display_order ASC
     LIMIT 1;

    RETURN jsonb_build_object(
      'room_id',         v_room_id,
      'card_id',         v_card_id,
      'already_existed', true
    );
  END IF;

  -- ── Create room ────────────────────────────────────────────────────────────
  INSERT INTO gameday_rooms (
    room_name,
    experience_type,
    competition_type,
    week_number,
    league_season_id,
    sport,
    room_code,
    host_user_id,
    status,
    is_private
  )
  VALUES (
    p_room_name,
    'fantasy',
    'weekly',
    p_week_number,
    p_league_season_id,
    p_sport,
    p_room_code,
    p_host_user_id,
    'active',
    true
  )
  RETURNING id INTO v_room_id;

  -- ── Create pick card ───────────────────────────────────────────────────────
  -- phase='weekly' is already in gameday_pick_cards_phase_check (added in
  -- gameday-fantasy-foundation.sql:280-288). status='open' matches Draft Day.
  INSERT INTO gameday_pick_cards (
    room_id,
    title,
    phase,
    status,
    display_order
  )
  VALUES (
    v_room_id,
    'Week ' || p_week_number || ' Swayger',
    'weekly',
    'open',
    0
  )
  RETURNING id INTO v_card_id;

  -- ── Snapshot props ─────────────────────────────────────────────────────────
  -- answer_options are already resolved by the route layer (same approach as
  -- publish_fantasy_draft_day: route builds the roster snapshot, RPC stores it).
  FOR v_prop IN SELECT * FROM jsonb_array_elements(p_props)
  LOOP
    INSERT INTO gameday_props (
      card_id,
      template_prop_id,
      question,
      answer_options,
      scoring_scope,
      point_value,
      answer_target_type,
      display_order,
      status
    )
    VALUES (
      v_card_id,
      (v_prop->>'library_id')::TEXT,
      (v_prop->>'question')::TEXT,
      (v_prop->'answer_options'),
      (v_prop->>'scoring_scope')::TEXT,
      (v_prop->>'point_value')::INTEGER,
      (v_prop->>'answer_target_type')::TEXT,
      (v_prop->>'display_order')::INTEGER,
      'pending'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'room_id',         v_room_id,
    'card_id',         v_card_id,
    'already_existed', false
  );
END;
$$;
