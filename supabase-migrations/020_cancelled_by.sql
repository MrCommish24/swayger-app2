-- Migration 020: Track who cancelled or declined a swayger
-- Adds cancelled_by column and updates cancel_swayger RPC to record the actor.
-- Declined is always the opponent (inferred from opponent_id), so no extra column needed.

ALTER TABLE swaygers ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id);

-- Update cancel_swayger to record who cancelled (now targets swaygers table directly)
CREATE OR REPLACE FUNCTION cancel_swayger(p_swayger_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID;
  v_creator  UUID;
  v_status   TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT creator_id, status::text INTO v_creator, v_status
  FROM swaygers WHERE id = p_swayger_id;

  IF v_creator IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

  IF v_creator != v_user_id THEN
    RETURN json_build_object('error', 'Only the creator can cancel.');
  END IF;

  IF v_status IN ('settled', 'canceled', 'declined') THEN
    RETURN json_build_object('error', 'Cannot cancel a ' || v_status || ' Swayger.');
  END IF;

  UPDATE swaygers
  SET status       = 'canceled',
      cancelled_by = v_user_id,
      updated_at   = now()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;
