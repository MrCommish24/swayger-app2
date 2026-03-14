-- Migration 016: Make accept_swayger race-condition safe
--
-- Problem: The previous version did a SELECT then UPDATE in two steps.
-- If two users tapped Accept simultaneously both could pass the SELECT
-- checks before either UPDATE committed, causing the last write to silently
-- overwrite the first acceptance.
--
-- Fix: Move the guard conditions (status = 'pending_invite' AND opponent_id IS NULL)
-- into the UPDATE WHERE clause. PostgreSQL acquires a row-level lock on UPDATE,
-- so only one concurrent transaction can commit. The second transaction re-evaluates
-- the WHERE after the first commits — and sees status='active', so 0 rows match.
-- ROW_COUNT = 0 means someone else got there first → return a clear error.

DROP FUNCTION IF EXISTS accept_swayger(UUID, TEXT);

CREATE OR REPLACE FUNCTION accept_swayger(p_swayger_id UUID, p_opponent_pick TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID;
  v_owner_id  UUID;
  v_rows      INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Basic checks that don't need to be in the atomic UPDATE
  SELECT owner_id INTO v_owner_id
  FROM workspaces WHERE id = p_swayger_id;

  IF v_owner_id IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

  IF v_owner_id = v_user_id THEN
    RETURN json_build_object('error', 'You cannot accept your own Swayger.');
  END IF;

  IF NOT is_workspace_member(p_swayger_id) THEN
    RETURN json_build_object('error', 'You must join this Swayger first.');
  END IF;

  IF p_opponent_pick IS NULL OR trim(p_opponent_pick) = '' THEN
    RETURN json_build_object('error', 'You must enter your pick.');
  END IF;

  -- Atomic check-and-set: the WHERE clause is evaluated under a row lock.
  -- If two requests race, only one UPDATE will match (ROW_COUNT = 1).
  -- The other sees status already 'active' or opponent_id already set → ROW_COUNT = 0.
  UPDATE workspaces
  SET opponent_id   = v_user_id,
      opponent_pick = trim(p_opponent_pick),
      status        = 'active',
      updated_at    = now()
  WHERE id          = p_swayger_id
    AND status      = 'pending_invite'   -- guard: not yet accepted
    AND opponent_id IS NULL;             -- guard: no opponent yet

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN json_build_object('error', 'This Swayger was just accepted by someone else.');
  END IF;

  RETURN json_build_object('error', NULL);
END;
$$;
