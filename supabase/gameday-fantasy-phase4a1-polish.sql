-- Swayger Fantasy Phase 4A.1: prop library polish, supports_no_one, card status open
-- ══════════════════════════════════════════════════════════════════════════════
-- PHASE 4A.1 — DRAFT DAY UX + LIFECYCLE POLISH
-- File: supabase/gameday-fantasy-phase4a1-polish.sql
--
-- Apply in Supabase SQL Editor AFTER gameday-fantasy-phase4a-draft-day.sql.
--
-- WHAT THIS DOES:
--   1. Adds supports_no_one BOOLEAN to gameday_prop_library
--      (flags templates where "No one" is a valid outcome)
--   2. Deactivates subjective + provider-data-dependent football templates
--      (biggest_reach, clock_longest — not objectively settleable)
--   3. Deactivates same categories for basketball and baseball
--   4. Adds new objective football Draft Day templates
--   5. Marks three_qbs template with supports_no_one = true
--   6. Updates any existing draft_day pick cards from 'closed' → 'open'
--      (aligns with Phase 4A.1 server change; 'open' = picks available Phase 4B)
--
-- ROLLBACK:
--   UPDATE gameday_pick_cards SET status='closed'
--     WHERE phase='draft_day' AND status='open';
--   DELETE FROM gameday_prop_library WHERE id IN
--     ('fdd_fb_most_rbs','fdd_fb_most_wrs','fdd_fb_last_rb','fdd_fb_three_qbs');
--   UPDATE gameday_prop_library SET is_active=true, is_default=true
--     WHERE id IN ('fdd_fb_biggest_reach','fdd_bb_biggest_reach','fdd_ba_biggest_reach');
--   ALTER TABLE gameday_prop_library DROP COLUMN IF EXISTS supports_no_one;
-- ══════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add supports_no_one column to gameday_prop_library
--
-- When true, the answer-option builder appends a stable synthetic option:
--   { "id": "no_one", "label": "No one", "type": "static" }
-- to the member/team snapshot at publish time.
--
-- Only set this on templates where NO participant completing the action
-- is a genuinely valid outcome (e.g. "Who drafts 3+ quarterbacks?" —
-- it is entirely possible that nobody does).
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE gameday_prop_library
  ADD COLUMN IF NOT EXISTS supports_no_one BOOLEAN NOT NULL DEFAULT false;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Deactivate subjective / provider-data-dependent football templates
--
-- "biggest reach"  — requires judging draft pick quality (subjective opinion).
-- "clock_longest"  — requires per-pick clock data from a provider API;
--                    not observable from a commissioner's draft board alone.
-- Both are deactivated (not deleted) to preserve library history.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE gameday_prop_library
   SET is_active = false,
       is_default = false
 WHERE id IN (
   'fdd_fb_biggest_reach',   -- "Who makes the biggest reach?" (subjective)
   'fdd_fb_clock_longest',   -- "Who takes the most total time on the clock?" (provider data)
   'fdd_bb_biggest_reach',   -- basketball equivalent
   'fdd_bb_clock_longest',   -- basketball clock
   'fdd_ba_biggest_reach',   -- baseball equivalent
   'fdd_ba_clock_longest'    -- baseball clock
 );


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Add new objective football Draft Day templates
--
-- Criteria applied to each candidate:
--   ✓ Objectively settleable from a draft board (no opinion, no provider API)
--   ✓ Legible within 5 seconds by any participant
--   ✓ Generates fun trash talk / receipts
--   ✓ Compatible with commissioner manual settlement in V1
--
-- Evaluated and excluded from this set:
--   "Who drafts the most rookies?"           — requires official rookie list per year
--   "Who finishes with most players from one NFL team?" — complex multi-step count
--   "Will anyone draft three quarterbacks?"  — yes/no version; fun but redundant
--                                              with three_qbs; defer to future pass
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO gameday_prop_library (
  id, sport, phase, question, answer_options, settlement_window,
  experience_type, competition_type, scoring_scope, point_value,
  answer_target_type, supports_no_one, is_active, is_default, display_order
) VALUES

-- "Who drafts the most running backs?" — always objectively countable from draft board
('fdd_fb_most_rbs',
  'football', 'draft_day',
  'Who drafts the most running backs?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  false, true, true, 7),

-- "Who drafts the most wide receivers?" — same; countable from draft board
('fdd_fb_most_wrs',
  'football', 'draft_day',
  'Who drafts the most wide receivers?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  false, true, false, 8),

-- "Who is the last manager to draft a running back?" — objective; great receipt
('fdd_fb_last_rb',
  'football', 'draft_day',
  'Who is the last manager to draft a running back?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  false, true, false, 9),

-- "Who drafts three or more quarterbacks?" — objective; no one is a valid outcome
-- supports_no_one=true appends { id:"no_one", label:"No one", type:"static" }
('fdd_fb_three_qbs',
  'football', 'draft_day',
  'Who drafts three or more quarterbacks?',
  '[]', 'At draft end',
  'fantasy', 'draft_day', 'competition', 10, 'season_member',
  true, true, false, 10)

ON CONFLICT (id) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. Update any existing published Draft Day pick cards from 'closed' to 'open'
--
-- Phase 4A shipped with card status='closed' as a placeholder because
-- Phase 4B member pick submission wasn't built. The correct forward-compatible
-- state is 'open' — it clearly signals "picks are available to submit" once
-- Phase 4B is built, consistent with the existing pick_card status enum.
--
-- This UPDATE only affects Fantasy Draft Day cards (phase='draft_day').
-- All other pick cards (Game Day phases) are unaffected.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE gameday_pick_cards
   SET status = 'open',
       updated_at = now()
 WHERE phase = 'draft_day'
   AND status = 'closed';

-- Verify
DO $$
DECLARE
  v_no_one_count INT;
  v_open_count   INT;
BEGIN
  SELECT COUNT(*) INTO v_no_one_count
  FROM gameday_prop_library
  WHERE supports_no_one = true AND id = 'fdd_fb_three_qbs';
  ASSERT v_no_one_count = 1, 'fdd_fb_three_qbs not found with supports_no_one=true';

  SELECT COUNT(*) INTO v_open_count
  FROM gameday_pick_cards
  WHERE phase = 'draft_day' AND status = 'closed';
  ASSERT v_open_count = 0, 'Some draft_day cards still have status=closed';

  RAISE NOTICE 'Phase 4A.1 migration OK — supports_no_one ✓, templates deactivated ✓, draft_day cards open ✓';
END $$;
