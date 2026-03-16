-- ============================================================
-- LEADERBOARD RLS FIX — Run this in Supabase SQL Editor
-- ============================================================
-- Problem: swaygers RLS only lets users see their own rows.
--          fetchAllSettled() returns a user-scoped slice, so
--          the leaderboard computes different stats per viewer.
-- Fix: SECURITY DEFINER RPC that returns all settled swaygers
--      regardless of who's calling (any authenticated user).
-- ============================================================

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
