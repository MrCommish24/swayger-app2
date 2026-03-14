-- Allow either participant to withdraw a pending settlement proposal,
-- returning the swayger to "active" so both sides can propose again.

CREATE OR REPLACE FUNCTION withdraw_settlement_proposal(
  p_swayger_id UUID,
  p_proposal_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_swayger swaygers%ROWTYPE;
  v_deleted INT;
BEGIN
  -- Fetch the swayger
  SELECT * INTO v_swayger FROM swaygers WHERE id = p_swayger_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Swayger not found');
  END IF;

  -- Only participants may withdraw
  IF auth.uid() != v_swayger.creator_id AND auth.uid() != v_swayger.opponent_id THEN
    RETURN json_build_object('error', 'Not authorized');
  END IF;

  -- Delete the specific proposal
  WITH deleted AS (
    DELETE FROM settlement_proposals
    WHERE id = p_proposal_id
      AND swayger_id = p_swayger_id
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  IF v_deleted = 0 THEN
    RETURN json_build_object('error', 'Proposal not found or already resolved');
  END IF;

  -- If no other pending proposals remain, reset swayger status to active
  IF NOT EXISTS (
    SELECT 1 FROM settlement_proposals
    WHERE swayger_id = p_swayger_id
  ) THEN
    UPDATE swaygers
    SET status = 'active'::swayger_status,
        updated_at = NOW()
    WHERE id = p_swayger_id;
  END IF;

  RETURN json_build_object('error', null, 'success', true);
END;
$$;

-- Verify
DO $$
BEGIN
  ASSERT (
    SELECT COUNT(*) FROM pg_proc WHERE proname = 'withdraw_settlement_proposal'
  ) > 0, 'withdraw_settlement_proposal function not found';
  RAISE NOTICE 'withdraw_settlement_proposal RPC: OK';
END $$;
