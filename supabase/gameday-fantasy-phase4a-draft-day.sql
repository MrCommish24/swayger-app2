-- ══════════════════════════════════════════════════════════════════════════════
-- PHASE 4A: FANTASY DRAFT DAY — Commissioner Setup + Publish
-- ══════════════════════════════════════════════════════════════════════════════
--
-- MANUAL APPLICATION REQUIRED.
-- Apply in Supabase SQL Editor AFTER the Phase 1–3 foundation migrations.
--
-- PREREQUISITES (must already be applied):
--   supabase/gameday-fantasy-foundation.sql
--   supabase/gameday-fantasy-phase2-setup.sql
--   supabase/gameday-fantasy-phase3-claim.sql
--
-- WHAT THIS DOES:
--   1. Adds answer_target_type to gameday_props
--      (Library already has it; Prop didn't — needed so Phase 4B renderer knows
--       how to present answer options without re-fetching the library row)
--   2. Seeds Football Draft Day prop templates (6 competition + 4 season)
--   3. Seeds Basketball and Baseball starter sets (3 + 2 each)
--   4. Creates publish_fantasy_draft_day() RPC (atomic: room + card + props)
--
-- ROLLBACK (if needed, in reverse order):
--   DROP FUNCTION IF EXISTS publish_fantasy_draft_day;
--   DELETE FROM gameday_prop_library
--     WHERE experience_type = 'fantasy' AND competition_type = 'draft_day';
--   ALTER TABLE gameday_props
--     DROP CONSTRAINT IF EXISTS gameday_props_answer_target_type_check,
--     DROP COLUMN IF EXISTS answer_target_type;
-- ══════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add answer_target_type to gameday_props
--
-- The prop_library column already exists (added in Foundation Phase 1).
-- Copying the value into the prop at publish-time means Phase 4B pick UI and
-- Phase 4C settlement can determine answer shape without joining back to the
-- library (library rows may change; the prop snapshot must not change).
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE gameday_props
  ADD COLUMN IF NOT EXISTS answer_target_type TEXT;

ALTER TABLE gameday_props
  DROP CONSTRAINT IF EXISTS gameday_props_answer_target_type_check;

ALTER TABLE gameday_props
  ADD CONSTRAINT gameday_props_answer_target_type_check
    CHECK (answer_target_type IS NULL OR
           answer_target_type IN ('season_member','fantasy_team','player','yes_no','static'));

-- Backfill existing Game Day props (all NULL — correct for non-Fantasy props).
-- No UPDATE needed: NULL is valid and the default for all existing rows.


-- ────────────────────────────────────────────────────────────────────────────
-- 2a. Fantasy Draft Day Prop Templates — Football
--
-- Competition props (scoring_scope='competition'):
--   Count toward the Draft Day winner.  Settle at end of draft.
--
-- Season Receipts (scoring_scope='season'):
--   Locked on Draft Day. Settle at end of the fantasy season.
--   Do NOT count toward Draft Day winner.
--
-- answer_options = '[]' for season_member targets: the actual options are
--   built at publish time from the live fantasy_season_members roster and
--   snapshotted into gameday_props.answer_options as structured JSON objects:
--   [{"id": "<sm-uuid>", "label": "Darius", "type": "season_member"}, ...]
--
-- is_default = true marks the recommended starter selection.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO gameday_prop_library (
  id,
  sport,
  phase,
  question,
  answer_options,
  settlement_window,
  experience_type,
  competition_type,
  scoring_scope,
  point_value,
  answer_target_type,
  is_active,
  is_default,
  display_order
) VALUES
-- Competition (Draft Day Picks) ──────────────────────────────────────────────
('fdd_fb_qb_first',
  'football', 'draft_day',
  'Who drafts a quarterback first?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  true, true, 0),

('fdd_fb_rookie_first',
  'football', 'draft_day',
  'Who drafts the first rookie?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  true, true, 1),

('fdd_fb_defense_first',
  'football', 'draft_day',
  'Who takes a defense first?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  true, true, 2),

('fdd_fb_biggest_reach',
  'football', 'draft_day',
  'Who makes the biggest reach of the draft?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  true, true, 3),

('fdd_fb_kicker_first',
  'football', 'draft_day',
  'Who takes a kicker first?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  true, false, 4),

('fdd_fb_qb_last',
  'football', 'draft_day',
  'Who waits the longest to draft a quarterback?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  true, false, 5),

('fdd_fb_clock_longest',
  'football', 'draft_day',
  'Who takes the most total time on the clock?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  true, false, 6),

-- Season Receipts ────────────────────────────────────────────────────────────
('fsr_fb_finish_first',
  'football', 'draft_day',
  'Who finishes first in the league?',
  '[]', 'End of season',
  'fantasy', 'draft_day', 'season', 10, 'season_member',
  true, true, 7),

('fsr_fb_finish_last',
  'football', 'draft_day',
  'Who finishes last in the league?',
  '[]', 'End of season',
  'fantasy', 'draft_day', 'season', 10, 'season_member',
  true, true, 8),

('fsr_fb_most_points',
  'football', 'draft_day',
  'Who scores the most total fantasy points?',
  '[]', 'End of season',
  'fantasy', 'draft_day', 'season', 10, 'season_member',
  true, true, 9),

('fsr_fb_best_record',
  'football', 'draft_day',
  'Who has the best regular-season record?',
  '[]', 'End of season',
  'fantasy', 'draft_day', 'season', 10, 'season_member',
  true, false, 10)

ON CONFLICT (id) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────────
-- 2b. Fantasy Draft Day Prop Templates — Basketball
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO gameday_prop_library (
  id, sport, phase, question, answer_options, settlement_window,
  experience_type, competition_type, scoring_scope, point_value,
  answer_target_type, is_active, is_default, display_order
) VALUES
('fdd_bb_star_first',
  'basketball', 'draft_day',
  'Who grabs the top-ranked player first?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  true, true, 0),

('fdd_bb_biggest_reach',
  'basketball', 'draft_day',
  'Who makes the biggest reach of the draft?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  true, true, 1),

('fdd_bb_clock_longest',
  'basketball', 'draft_day',
  'Who takes the most total time on the clock?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  true, false, 2),

('fsr_bb_finish_first',
  'basketball', 'draft_day',
  'Who finishes first in the league?',
  '[]', 'End of season',
  'fantasy', 'draft_day', 'season', 10, 'season_member',
  true, true, 3),

('fsr_bb_finish_last',
  'basketball', 'draft_day',
  'Who finishes last in the league?',
  '[]', 'End of season',
  'fantasy', 'draft_day', 'season', 10, 'season_member',
  true, true, 4)

ON CONFLICT (id) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────────
-- 2c. Fantasy Draft Day Prop Templates — Baseball
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO gameday_prop_library (
  id, sport, phase, question, answer_options, settlement_window,
  experience_type, competition_type, scoring_scope, point_value,
  answer_target_type, is_active, is_default, display_order
) VALUES
('fdd_ba_star_first',
  'baseball', 'draft_day',
  'Who grabs the top-ranked player first?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  true, true, 0),

('fdd_ba_biggest_reach',
  'baseball', 'draft_day',
  'Who makes the biggest reach of the draft?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  true, true, 1),

('fdd_ba_clock_longest',
  'baseball', 'draft_day',
  'Who takes the most total time on the clock?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  true, false, 2),

('fsr_ba_finish_first',
  'baseball', 'draft_day',
  'Who finishes first in the league?',
  '[]', 'End of season',
  'fantasy', 'draft_day', 'season', 10, 'season_member',
  true, true, 3),

('fsr_ba_finish_last',
  'baseball', 'draft_day',
  'Who finishes last in the league?',
  '[]', 'End of season',
  'fantasy', 'draft_day', 'season', 10, 'season_member',
  true, true, 4)

ON CONFLICT (id) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. publish_fantasy_draft_day() RPC
--
-- Atomically creates a Fantasy Draft Day competition for a league season.
-- Called by POST /api/fantasy/leagues/:lid/seasons/:sid/draft-day/publish.
--
-- Idempotency: if an active Draft Day room already exists for p_league_season_id,
-- the function returns it unchanged. The caller detects already_existed=true and
-- returns the existing room to the client rather than failing or duplicating.
--
-- This RPC does NOT enforce a hard limit of one Draft Day room per season in the
-- database — that constraint lives only here in V1 logic. Future dynasty/startup
-- formats may create multiple draft-day rooms per season without a schema change.
--
-- Props are passed as a JSONB array; each element must have:
--   library_id, question, answer_options (JSONB array), scoring_scope,
--   point_value, answer_target_type, display_order
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION publish_fantasy_draft_day(
  p_league_season_id UUID,
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
  v_room_id   UUID;
  v_card_id   UUID;
  v_prop      JSONB;
BEGIN
  -- ── Idempotency guard ────────────────────────────────────────────────────
  -- Return existing primary Draft Day room rather than creating a duplicate.
  SELECT gr.id INTO v_room_id
  FROM   gameday_rooms gr
  WHERE  gr.league_season_id = p_league_season_id
    AND  gr.competition_type = 'draft_day'
    AND  gr.experience_type  = 'fantasy'
    AND  gr.archived_at IS NULL
  LIMIT 1;

  IF v_room_id IS NOT NULL THEN
    SELECT gpc.id INTO v_card_id
    FROM   gameday_pick_cards gpc
    WHERE  gpc.room_id = v_room_id
    LIMIT 1;

    RETURN jsonb_build_object(
      'room_id',        v_room_id,
      'card_id',        v_card_id,
      'already_existed', true
    );
  END IF;

  -- ── Create room ─────────────────────────────────────────────────────────
  INSERT INTO gameday_rooms (
    room_name, experience_type, competition_type,
    league_season_id, sport, room_code, host_user_id,
    status, is_private
  )
  VALUES (
    p_room_name, 'fantasy', 'draft_day',
    p_league_season_id, p_sport, p_room_code, p_host_user_id,
    'active', true
  )
  RETURNING id INTO v_room_id;

  -- ── Create pick card ─────────────────────────────────────────────────────
  -- status='closed': members cannot submit picks until the commissioner opens
  -- or locks the card. Phase 4B will open/lock via the existing card-status
  -- conventions (PATCH /api/gameday/cards/:cardId/lock).
  INSERT INTO gameday_pick_cards (room_id, title, phase, status, display_order)
  VALUES (v_room_id, 'Draft Day', 'draft_day', 'closed', 0)
  RETURNING id INTO v_card_id;

  -- ── Snapshot props ───────────────────────────────────────────────────────
  FOR v_prop IN SELECT * FROM jsonb_array_elements(p_props) LOOP
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
      v_prop->>'library_id',
      v_prop->>'question',
      v_prop->'answer_options',          -- JSONB: structured [{id,label,type}]
      v_prop->>'scoring_scope',
      (v_prop->>'point_value')::INTEGER,
      v_prop->>'answer_target_type',
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

-- Grant execute to the service role (used by Express server-side).
-- Anon/authenticated roles do NOT need direct RPC access.
GRANT EXECUTE ON FUNCTION publish_fantasy_draft_day TO service_role;
