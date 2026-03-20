-- ============================================================
-- SWAYGER SCORING FIX — Run BOTH sections in Supabase SQL Editor
-- ============================================================

-- ─── SECTION 1: Remove bad auto-scored game results ─────────────────────────
-- The auto-scorer previously inserted one row per game with:
--   - matchup_id = "auto-{gameId}" (not matching any picks)
--   - winner_name = full API name e.g. "Louisville Cardinals" (not matching locked takes)
-- These rows are harmless but dirty. Delete them so the corrected auto-scorer
-- can re-insert the right rows (one per pick_type matchup_id, correct team names).

DELETE FROM mm_game_results
WHERE resolved_by = 'auto-odds-api'
  AND matchup_id LIKE 'auto-%';

-- ─── SECTION 2: Refresh get_all_settled_swaygers RPC ────────────────────────
-- Ensures the leaderboard RPC returns the `category` field so the March Madness
-- filter pill works correctly. Re-running CREATE OR REPLACE is safe and idempotent.

CREATE OR REPLACE FUNCTION get_all_settled_swaygers()
RETURNS TABLE (
  id              UUID,
  creator_id      UUID,
  opponent_id     UUID,
  settled_outcome TEXT,
  stake_units     INTEGER,
  category        TEXT,
  title           TEXT,
  updated_at      TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    creator_id,
    opponent_id,
    settled_outcome,
    stake_units,
    category,
    title,
    updated_at
  FROM swaygers
  WHERE status = 'settled'
    AND settled_outcome IS NOT NULL
  ORDER BY updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_all_settled_swaygers() TO authenticated;

-- ─── SECTION 3: Verify (run these SELECT statements to confirm) ──────────────

-- Check no bad rows remain:
-- SELECT count(*) FROM mm_game_results WHERE matchup_id LIKE 'auto-%';
-- Expected: 0

-- Check settled MM swaygers exist with correct category:
-- SELECT category, count(*) FROM swaygers WHERE status = 'settled' GROUP BY category;
-- Expected: "March Madness" | N

-- Check current mm_game_results (to confirm new rows inserted after backend restart):
-- SELECT round_id, matchup_id, winner_name, loser_name, resolved_by FROM mm_game_results ORDER BY resolved_at DESC;
