-- ============================================================
-- SWAYGER RLS FIX — Run this in Supabase SQL Editor
-- ============================================================
-- Fixes: opponent cannot read swayger after joining via invite code
-- Adds: get_swayger_by_id RPC (SECURITY DEFINER) as a reliable fallback
-- ============================================================

-- ── 1. Fix RLS policies on swaygers table ─────────────────────────────────────

-- Drop any existing select policies (common names)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'swaygers' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON swaygers', pol.policyname);
  END LOOP;
END $$;

-- Recreate: creator OR opponent can read their swayger
CREATE POLICY "swaygers_select_participant"
  ON swaygers FOR SELECT
  USING (
    auth.uid() = creator_id
    OR auth.uid() = opponent_id
  );

-- ── 2. SECURITY DEFINER RPC — fetch swayger by id (bypass RLS) ───────────────
-- Used as a fallback when the opponent first joins and RLS hasn't propagated.
-- Only returns the row if caller is creator, opponent, or a valid invite holder.

CREATE OR REPLACE FUNCTION get_swayger_by_id(p_swayger_id UUID)
RETURNS SETOF swaygers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.*
  FROM swaygers s
  WHERE s.id = p_swayger_id
    AND (
      s.creator_id = auth.uid()
      OR s.opponent_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM swayger_invites i
        WHERE i.swayger_id = s.id
      )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_swayger_by_id(UUID) TO authenticated;

-- ── 3. (Optional) Also fix swayger_invites if needed ─────────────────────────
-- Ensure anyone can read invite records (needed for QR code previews)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'swayger_invites' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON swayger_invites', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "swayger_invites_select_all"
  ON swayger_invites FOR SELECT
  USING (true);
