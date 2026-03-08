-- ============================================================================
-- 011: Fix all RPCs to cast status strings to swayger_status enum
-- ============================================================================

-- ── propose_settlement ──────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS propose_settlement(UUID, TEXT);

CREATE OR REPLACE FUNCTION propose_settlement(p_swayger_id UUID, p_outcome TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_creator_id UUID;
  v_opponent_id UUID;
  v_proposal_id UUID;
  v_is_creator BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_outcome NOT IN ('creator', 'opponent', 'draw', 'no_contest') THEN
    RETURN json_build_object('error', 'Invalid outcome.');
  END IF;

  SELECT status::text, creator_id, opponent_id INTO v_status, v_creator_id, v_opponent_id
  FROM swaygers WHERE id = p_swayger_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

  IF v_status NOT IN ('active', 'settlement_proposed') THEN
    RETURN json_build_object('error', 'Can only propose settlement on active Swaygers.');
  END IF;

  IF v_user_id != v_creator_id AND v_user_id != v_opponent_id THEN
    RETURN json_build_object('error', 'Only participants can propose settlement.');
  END IF;

  v_is_creator := (v_user_id = v_creator_id);

  INSERT INTO settlement_proposals (swayger_id, proposed_by, outcome, creator_confirmed, opponent_confirmed)
  VALUES (p_swayger_id, v_user_id, p_outcome, v_is_creator, NOT v_is_creator)
  RETURNING id INTO v_proposal_id;

  UPDATE swaygers
  SET status = 'settlement_proposed'::swayger_status, updated_at = now()
  WHERE id = p_swayger_id AND status = 'active'::swayger_status;

  RETURN json_build_object('error', NULL, 'proposal_id', v_proposal_id);
END;
$$;

-- ── confirm_settlement ──────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS confirm_settlement(UUID, UUID);

CREATE OR REPLACE FUNCTION confirm_settlement(p_swayger_id UUID, p_proposal_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_creator_id UUID;
  v_opponent_id UUID;
  v_status TEXT;
  v_outcome TEXT;
  v_creator_confirmed BOOLEAN;
  v_opponent_confirmed BOOLEAN;
  v_is_creator BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT status::text, creator_id, opponent_id INTO v_status, v_creator_id, v_opponent_id
  FROM swaygers WHERE id = p_swayger_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

  IF v_status NOT IN ('active', 'settlement_proposed') THEN
    RETURN json_build_object('error', 'Cannot confirm settlement on this Swayger.');
  END IF;

  IF v_user_id != v_creator_id AND v_user_id != v_opponent_id THEN
    RETURN json_build_object('error', 'Only participants can confirm settlement.');
  END IF;

  SELECT outcome, creator_confirmed, opponent_confirmed
  INTO v_outcome, v_creator_confirmed, v_opponent_confirmed
  FROM settlement_proposals
  WHERE id = p_proposal_id AND swayger_id = p_swayger_id;

  IF v_outcome IS NULL THEN
    RETURN json_build_object('error', 'Proposal not found.');
  END IF;

  v_is_creator := (v_user_id = v_creator_id);

  IF v_is_creator THEN
    UPDATE settlement_proposals
    SET creator_confirmed = true, updated_at = now()
    WHERE id = p_proposal_id;
    v_creator_confirmed := true;
  ELSE
    UPDATE settlement_proposals
    SET opponent_confirmed = true, updated_at = now()
    WHERE id = p_proposal_id;
    v_opponent_confirmed := true;
  END IF;

  IF v_creator_confirmed AND v_opponent_confirmed THEN
    UPDATE swaygers
    SET status = 'settled'::swayger_status, settled_outcome = v_outcome, updated_at = now()
    WHERE id = p_swayger_id;
  END IF;

  RETURN json_build_object('error', NULL, 'settled', v_creator_confirmed AND v_opponent_confirmed);
END;
$$;

-- ── accept_swayger ──────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS accept_swayger(UUID, TEXT);

CREATE OR REPLACE FUNCTION accept_swayger(p_swayger_id UUID, p_opponent_pick TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_opponent_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT status::text, opponent_id INTO v_status, v_opponent_id
  FROM swaygers WHERE id = p_swayger_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

  IF v_status != 'pending_invite' THEN
    RETURN json_build_object('error', 'This Swayger is not pending.');
  END IF;

  IF v_opponent_id != v_user_id THEN
    RETURN json_build_object('error', 'You are not the opponent for this Swayger.');
  END IF;

  UPDATE swaygers
  SET opponent_pick = TRIM(p_opponent_pick),
      status = 'active'::swayger_status,
      updated_at = now()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ── decline_swayger ─────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS decline_swayger(UUID);

CREATE OR REPLACE FUNCTION decline_swayger(p_swayger_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_opponent_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT status::text, opponent_id INTO v_status, v_opponent_id
  FROM swaygers WHERE id = p_swayger_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

  IF v_status != 'pending_invite' THEN
    RETURN json_build_object('error', 'Cannot decline — not pending.');
  END IF;

  IF v_opponent_id != v_user_id THEN
    RETURN json_build_object('error', 'Only the opponent can decline.');
  END IF;

  UPDATE swaygers
  SET status = 'declined'::swayger_status, updated_at = now()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ── cancel_swayger ──────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS cancel_swayger(UUID);

CREATE OR REPLACE FUNCTION cancel_swayger(p_swayger_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_creator_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT status::text, creator_id INTO v_status, v_creator_id
  FROM swaygers WHERE id = p_swayger_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

  IF v_creator_id != v_user_id THEN
    RETURN json_build_object('error', 'Only the creator can cancel.');
  END IF;

  IF v_status IN ('settled', 'canceled', 'declined') THEN
    RETURN json_build_object('error', 'Cannot cancel — already ' || v_status || '.');
  END IF;

  UPDATE swaygers
  SET status = 'canceled'::swayger_status, updated_at = now()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ── create_swayger ──────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS create_swayger(TEXT, TEXT, TEXT, INT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_swayger(
  p_title TEXT,
  p_description TEXT,
  p_category TEXT,
  p_stake_units INT,
  p_creator_pick TEXT,
  p_invite_code TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_swayger_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO swaygers (creator_id, title, description, category, stake_units, creator_pick, status, expires_at)
  VALUES (
    v_user_id,
    TRIM(p_title),
    NULLIF(TRIM(COALESCE(p_description,'')), ''),
    COALESCE(p_category, 'Other'),
    GREATEST(p_stake_units, 1),
    TRIM(p_creator_pick),
    'pending_invite'::swayger_status,
    now() + interval '7 days'
  )
  RETURNING id INTO v_swayger_id;

  INSERT INTO swayger_invites (swayger_id, invite_code)
  VALUES (v_swayger_id, UPPER(TRIM(p_invite_code)));

  RETURN v_swayger_id;
END;
$$;

-- ── join_swayger_by_code ────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS join_swayger_by_code(TEXT);

CREATE OR REPLACE FUNCTION join_swayger_by_code(p_invite_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_swayger_id UUID;
  v_user_id UUID;
  v_creator_id UUID;
  v_opponent_id UUID;
  v_status TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT si.swayger_id INTO v_swayger_id
  FROM swayger_invites si
  WHERE si.invite_code = UPPER(TRIM(p_invite_code));

  IF v_swayger_id IS NULL THEN
    RETURN json_build_object('error', 'Invalid invite code.', 'swayger_id', NULL);
  END IF;

  SELECT creator_id, opponent_id, status::text INTO v_creator_id, v_opponent_id, v_status
  FROM swaygers WHERE id = v_swayger_id;

  IF v_creator_id = v_user_id THEN
    RETURN json_build_object('error', NULL, 'swayger_id', v_swayger_id, 'is_creator', true);
  END IF;

  IF v_opponent_id IS NOT NULL AND v_opponent_id != v_user_id THEN
    RETURN json_build_object('error', 'This Swayger already has an opponent.', 'swayger_id', NULL);
  END IF;

  IF v_opponent_id = v_user_id THEN
    RETURN json_build_object('error', NULL, 'swayger_id', v_swayger_id, 'already_joined', true);
  END IF;

  IF v_status != 'pending_invite' THEN
    RETURN json_build_object('error', 'This Swayger is no longer available.', 'swayger_id', NULL);
  END IF;

  UPDATE swaygers SET opponent_id = v_user_id, updated_at = now()
  WHERE id = v_swayger_id;

  RETURN json_build_object('error', NULL, 'swayger_id', v_swayger_id);
END;
$$;

-- ── Verify ──────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count INT;
  v_rpcs TEXT[] := ARRAY['create_swayger','join_swayger_by_code','accept_swayger','decline_swayger','cancel_swayger','propose_settlement','confirm_settlement'];
  v_rpc TEXT;
BEGIN
  RAISE NOTICE '── 011 RPC Verification ──';
  FOREACH v_rpc IN ARRAY v_rpcs LOOP
    SELECT count(*) INTO v_count FROM pg_proc WHERE proname = v_rpc AND pronamespace = 'public'::regnamespace;
    IF v_count >= 1 THEN RAISE NOTICE 'OK: % exists', v_rpc;
    ELSE RAISE WARNING 'MISSING: %', v_rpc;
    END IF;
  END LOOP;
  RAISE NOTICE 'Done.';
END $$;
