-- ================================================================
-- SWAYGER POINTS MIGRATION
-- Run the entire file in the Supabase SQL Editor (Project → SQL Editor)
-- ================================================================

-- 1. Add stake_note column to swaygers (optional social flavor text)
ALTER TABLE swaygers ADD COLUMN IF NOT EXISTS stake_note TEXT;

-- 2. Add points_active flag — TRUE for swaygers created after this migration
--    (used to grandfather existing swaygers; only new ones participate in escrow)
ALTER TABLE swaygers ADD COLUMN IF NOT EXISTS points_active BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Create user_balances table
CREATE TABLE IF NOT EXISTS user_balances (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  swayger_points INTEGER NOT NULL DEFAULT 1000,
  bankruptcy_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Enable RLS on user_balances
ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view balances" ON user_balances;
CREATE POLICY "Anyone can view balances" ON user_balances
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Users manage own balance" ON user_balances;
CREATE POLICY "Users manage own balance" ON user_balances
  FOR ALL USING (auth.uid() = user_id);

-- 5. Seed initial balances for every existing user in profiles
--    Formula: GREATEST(1000, 1000 + net points from settled swaygers)
--    Everyone gets at least 1000 SP; winners keep whatever they earned on top.
INSERT INTO user_balances (user_id, swayger_points)
SELECT
  p.id,
  GREATEST(1000, 1000 + COALESCE((
    SELECT SUM(
      CASE
        WHEN s.settled_outcome = 'creator' AND s.creator_id = p.id THEN  s.stake_units
        WHEN s.settled_outcome = 'opponent' AND s.opponent_id = p.id THEN  s.stake_units
        WHEN s.settled_outcome = 'creator' AND s.opponent_id = p.id THEN -s.stake_units
        WHEN s.settled_outcome = 'opponent' AND s.creator_id = p.id THEN -s.stake_units
        ELSE 0
      END
    )
    FROM swaygers s
    WHERE s.status = 'settled'
      AND s.settled_outcome IN ('creator', 'opponent')
      AND (s.creator_id = p.id OR s.opponent_id = p.id)
      AND s.opponent_id IS NOT NULL
  ), 0)) AS swayger_points
FROM profiles p
ON CONFLICT (user_id) DO UPDATE
  SET swayger_points = GREATEST(1000, EXCLUDED.swayger_points),
      updated_at = NOW();

-- ================================================================
-- 6. create_swayger — validates balance, escrows creator's stake
-- ================================================================
CREATE OR REPLACE FUNCTION create_swayger(
  p_title       TEXT,
  p_description TEXT,
  p_category    TEXT,
  p_stake_units INTEGER,
  p_creator_pick TEXT,
  p_invite_code  TEXT,
  p_stake_note   TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id    UUID;
  v_swayger_id UUID;
  v_balance    INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_stake_units < 5 THEN
    RAISE EXCEPTION 'Minimum stake is 5 Swayger Points.';
  END IF;

  -- Auto-create balance record for new users
  INSERT INTO user_balances (user_id, swayger_points)
  VALUES (v_user_id, 1000)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT swayger_points INTO v_balance
  FROM user_balances WHERE user_id = v_user_id;

  IF v_balance < p_stake_units THEN
    RAISE EXCEPTION 'Not enough Swayger Points. You have % but need %.', v_balance, p_stake_units;
  END IF;

  -- Escrow creator's stake
  UPDATE user_balances
  SET swayger_points = swayger_points - p_stake_units,
      updated_at = NOW()
  WHERE user_id = v_user_id;

  -- Create swayger
  INSERT INTO swaygers (
    creator_id, title, description, category,
    stake_units, creator_pick, stake_note, points_active
  )
  VALUES (
    v_user_id, p_title, p_description, p_category,
    p_stake_units, p_creator_pick, p_stake_note, TRUE
  )
  RETURNING id INTO v_swayger_id;

  -- Create invite record
  INSERT INTO swayger_invites (swayger_id, invite_code)
  VALUES (v_swayger_id, p_invite_code);

  RETURN v_swayger_id::TEXT;
END;
$$;

-- ================================================================
-- 7. accept_swayger — validates balance, escrows opponent's stake
-- ================================================================
CREATE OR REPLACE FUNCTION accept_swayger(
  p_swayger_id   UUID,
  p_opponent_pick TEXT
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_swayger swaygers%ROWTYPE;
  v_balance INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  SELECT * INTO v_swayger FROM swaygers WHERE id = p_swayger_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Swayger not found');
  END IF;
  IF v_swayger.status != 'pending_invite' THEN
    RETURN json_build_object('error', 'Swayger is not pending acceptance');
  END IF;
  IF v_swayger.creator_id = v_user_id THEN
    RETURN json_build_object('error', 'Cannot accept your own swayger');
  END IF;
  IF v_swayger.opponent_id IS NOT NULL AND v_swayger.opponent_id != v_user_id THEN
    RETURN json_build_object('error', 'This swayger is for a different opponent');
  END IF;

  -- Only check/escrow balance if this swayger uses the points system
  IF v_swayger.points_active THEN
    INSERT INTO user_balances (user_id, swayger_points)
    VALUES (v_user_id, 1000)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT swayger_points INTO v_balance
    FROM user_balances WHERE user_id = v_user_id;

    IF v_balance < v_swayger.stake_units THEN
      RETURN json_build_object(
        'error',
        format('Not enough Swayger Points. You have %s but need %s.', v_balance, v_swayger.stake_units)
      );
    END IF;

    UPDATE user_balances
    SET swayger_points = swayger_points - v_swayger.stake_units,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  UPDATE swaygers
  SET status      = 'active',
      opponent_id  = v_user_id,
      opponent_pick = p_opponent_pick,
      accepted_at  = NOW(),
      updated_at   = NOW()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ================================================================
-- 8. propose_settlement — creates proposal, auto-confirms proposer side
-- ================================================================
CREATE OR REPLACE FUNCTION propose_settlement(
  p_swayger_id UUID,
  p_outcome    TEXT
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id    UUID;
  v_swayger    swaygers%ROWTYPE;
  v_proposal_id UUID;
  v_is_creator BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated', 'proposal_id', NULL);
  END IF;

  SELECT * INTO v_swayger FROM swaygers WHERE id = p_swayger_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Swayger not found', 'proposal_id', NULL);
  END IF;

  IF v_swayger.status NOT IN ('active', 'settlement_proposed') THEN
    RETURN json_build_object('error', 'Swayger cannot be settled in its current state', 'proposal_id', NULL);
  END IF;

  IF v_swayger.creator_id != v_user_id AND v_swayger.opponent_id != v_user_id THEN
    RETURN json_build_object('error', 'Not a participant', 'proposal_id', NULL);
  END IF;

  v_is_creator := (v_swayger.creator_id = v_user_id);

  INSERT INTO settlement_proposals (swayger_id, proposed_by, outcome, creator_confirmed, opponent_confirmed)
  VALUES (
    p_swayger_id, v_user_id, p_outcome,
    v_is_creator,       -- proposer's side is auto-confirmed
    NOT v_is_creator
  )
  RETURNING id INTO v_proposal_id;

  UPDATE swaygers
  SET status = 'settlement_proposed', updated_at = NOW()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL, 'proposal_id', v_proposal_id::TEXT);
END;
$$;

-- ================================================================
-- 9. confirm_settlement — other party confirms; settles + transfers points when both confirmed
-- ================================================================
CREATE OR REPLACE FUNCTION confirm_settlement(
  p_swayger_id  UUID,
  p_proposal_id UUID
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id   UUID;
  v_swayger   swaygers%ROWTYPE;
  v_proposal  settlement_proposals%ROWTYPE;
  v_is_creator BOOLEAN;
  v_creator_c  BOOLEAN;
  v_opponent_c BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  SELECT * INTO v_swayger  FROM swaygers             WHERE id = p_swayger_id;
  SELECT * INTO v_proposal FROM settlement_proposals WHERE id = p_proposal_id AND swayger_id = p_swayger_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Proposal not found', 'settled', false);
  END IF;

  v_is_creator := (v_swayger.creator_id = v_user_id);
  IF NOT v_is_creator AND v_swayger.opponent_id != v_user_id THEN
    RETURN json_build_object('error', 'Not a participant', 'settled', false);
  END IF;

  -- Mark caller's confirmation
  IF v_is_creator THEN
    UPDATE settlement_proposals SET creator_confirmed = TRUE, updated_at = NOW() WHERE id = p_proposal_id;
    v_creator_c  := TRUE;
    v_opponent_c := v_proposal.opponent_confirmed;
  ELSE
    UPDATE settlement_proposals SET opponent_confirmed = TRUE, updated_at = NOW() WHERE id = p_proposal_id;
    v_creator_c  := v_proposal.creator_confirmed;
    v_opponent_c := TRUE;
  END IF;

  -- Both confirmed → settle
  IF v_creator_c AND v_opponent_c THEN
    -- Transfer points only for points-active swaygers
    IF v_swayger.points_active THEN
      IF v_proposal.outcome = 'creator' THEN
        UPDATE user_balances
        SET swayger_points = swayger_points + (v_swayger.stake_units * 2), updated_at = NOW()
        WHERE user_id = v_swayger.creator_id;
      ELSIF v_proposal.outcome = 'opponent' THEN
        UPDATE user_balances
        SET swayger_points = swayger_points + (v_swayger.stake_units * 2), updated_at = NOW()
        WHERE user_id = v_swayger.opponent_id;
      ELSE
        -- draw or no_contest: return both stakes
        UPDATE user_balances
        SET swayger_points = swayger_points + v_swayger.stake_units, updated_at = NOW()
        WHERE user_id IN (v_swayger.creator_id, v_swayger.opponent_id);
      END IF;
    END IF;

    UPDATE swaygers
    SET status          = 'settled',
        settled_outcome = v_proposal.outcome,
        settled_at      = NOW(),
        updated_at      = NOW()
    WHERE id = p_swayger_id;

    RETURN json_build_object('error', NULL, 'settled', true, 'outcome', v_proposal.outcome);
  END IF;

  RETURN json_build_object('error', NULL, 'settled', false);
END;
$$;

-- ================================================================
-- 10. cancel_swayger — refunds escrowed stakes if points_active
-- ================================================================
CREATE OR REPLACE FUNCTION cancel_swayger(
  p_swayger_id UUID
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_swayger swaygers%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  SELECT * INTO v_swayger FROM swaygers WHERE id = p_swayger_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Swayger not found');
  END IF;
  IF v_swayger.creator_id != v_user_id AND v_swayger.opponent_id != v_user_id THEN
    RETURN json_build_object('error', 'Not a participant');
  END IF;
  IF v_swayger.status NOT IN ('pending_invite', 'active', 'settlement_proposed') THEN
    RETURN json_build_object('error', 'Cannot cancel a ' || v_swayger.status || ' swayger');
  END IF;

  IF v_swayger.points_active THEN
    IF v_swayger.status = 'pending_invite' THEN
      -- Only creator was escrowed
      UPDATE user_balances
      SET swayger_points = swayger_points + v_swayger.stake_units, updated_at = NOW()
      WHERE user_id = v_swayger.creator_id;
    ELSE
      -- Both were escrowed (active or settlement_proposed)
      UPDATE user_balances
      SET swayger_points = swayger_points + v_swayger.stake_units, updated_at = NOW()
      WHERE user_id IN (v_swayger.creator_id, v_swayger.opponent_id);
    END IF;
  END IF;

  UPDATE swaygers
  SET status       = 'canceled',
      cancelled_by = v_user_id,
      updated_at   = NOW()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ================================================================
-- 11. decline_swayger — refunds creator's escrow if points_active
-- ================================================================
CREATE OR REPLACE FUNCTION decline_swayger(
  p_swayger_id UUID
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_swayger swaygers%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  SELECT * INTO v_swayger FROM swaygers WHERE id = p_swayger_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Swayger not found');
  END IF;
  IF v_swayger.opponent_id IS NOT NULL AND v_swayger.opponent_id != v_user_id THEN
    RETURN json_build_object('error', 'Not the intended opponent');
  END IF;
  IF v_swayger.status != 'pending_invite' THEN
    RETURN json_build_object('error', 'Swayger is not pending');
  END IF;

  IF v_swayger.points_active THEN
    UPDATE user_balances
    SET swayger_points = swayger_points + v_swayger.stake_units, updated_at = NOW()
    WHERE user_id = v_swayger.creator_id;
  END IF;

  UPDATE swaygers
  SET status = 'declined', updated_at = NOW()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ================================================================
-- 12. withdraw_settlement_proposal — no points change needed (stakes stay escrowed)
-- ================================================================
CREATE OR REPLACE FUNCTION withdraw_settlement_proposal(
  p_swayger_id  UUID,
  p_proposal_id UUID
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_proposal settlement_proposals%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  SELECT * INTO v_proposal FROM settlement_proposals WHERE id = p_proposal_id AND swayger_id = p_swayger_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Proposal not found');
  END IF;
  IF v_proposal.proposed_by != v_user_id THEN
    RETURN json_build_object('error', 'Only the proposer can withdraw');
  END IF;

  DELETE FROM settlement_proposals WHERE id = p_proposal_id;

  IF NOT EXISTS (SELECT 1 FROM settlement_proposals WHERE swayger_id = p_swayger_id) THEN
    UPDATE swaygers SET status = 'active', updated_at = NOW() WHERE id = p_swayger_id;
  END IF;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ================================================================
-- 13. claim_bankruptcy — one-time 250 SP refill when balance hits 0
-- ================================================================
CREATE OR REPLACE FUNCTION claim_bankruptcy()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id        UUID;
  v_balance        INTEGER;
  v_bankruptcy_used BOOLEAN;
BEGIN
  v_user_id := auth.uid();

  SELECT swayger_points, bankruptcy_used
  INTO v_balance, v_bankruptcy_used
  FROM user_balances WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Balance record not found');
  END IF;
  IF v_bankruptcy_used THEN
    RETURN json_build_object('error', 'You have already used your one-time refill.');
  END IF;
  IF v_balance > 0 THEN
    RETURN json_build_object('error', 'You still have points! Refill is only available when your balance hits 0.');
  END IF;

  UPDATE user_balances
  SET swayger_points = 250, bankruptcy_used = TRUE, updated_at = NOW()
  WHERE user_id = v_user_id;

  RETURN json_build_object('error', NULL, 'new_balance', 250);
END;
$$;

-- ================================================================
-- 14. expire_old_proposals — called by backend cron
--     Refunds stakes for settlement_proposed swaygers > 7 days old
-- ================================================================
CREATE OR REPLACE FUNCTION expire_old_proposals()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count   INTEGER := 0;
  v_swayger swaygers%ROWTYPE;
BEGIN
  FOR v_swayger IN
    SELECT * FROM swaygers
    WHERE status = 'settlement_proposed'
      AND updated_at < NOW() - INTERVAL '7 days'
  LOOP
    IF v_swayger.points_active THEN
      UPDATE user_balances
      SET swayger_points = swayger_points + v_swayger.stake_units, updated_at = NOW()
      WHERE user_id IN (v_swayger.creator_id, v_swayger.opponent_id);
    END IF;

    UPDATE swaygers SET status = 'expired', updated_at = NOW() WHERE id = v_swayger.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ================================================================
-- 15. join_swayger_by_code — no change to logic, just recreate for completeness
-- ================================================================
CREATE OR REPLACE FUNCTION join_swayger_by_code(p_invite_code TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_invite  swayger_invites%ROWTYPE;
  v_swayger swaygers%ROWTYPE;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_invite
  FROM swayger_invites WHERE invite_code = p_invite_code;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid invite code', 'swayger_id', NULL);
  END IF;

  SELECT * INTO v_swayger FROM swaygers WHERE id = v_invite.swayger_id;

  IF NOT FOUND OR v_swayger.status != 'pending_invite' THEN
    RETURN json_build_object('error', 'This invite is no longer valid', 'swayger_id', NULL);
  END IF;

  IF v_swayger.creator_id = v_user_id THEN
    RETURN json_build_object('error', 'Cannot join your own swayger', 'swayger_id', NULL);
  END IF;

  IF v_swayger.opponent_id IS NOT NULL AND v_swayger.opponent_id != v_user_id THEN
    RETURN json_build_object('error', 'This swayger is for a different opponent', 'swayger_id', NULL);
  END IF;

  RETURN json_build_object('error', NULL, 'swayger_id', v_swayger.id::TEXT);
END;
$$;

-- ================================================================
-- Grant execute on expiry function to anon (for server cron job)
-- ================================================================
GRANT EXECUTE ON FUNCTION expire_old_proposals() TO anon;
GRANT EXECUTE ON FUNCTION expire_old_proposals() TO authenticated;

-- ================================================================
-- Fix-up: ensure every existing row has at least 1000 SP
-- (handles users who were seeded before the floor was applied,
--  e.g. someone who hit 0 and used emergency refill)
-- ================================================================
UPDATE user_balances
SET swayger_points = 1000,
    updated_at     = NOW()
WHERE swayger_points < 1000;

-- Also make sure every profile that somehow has NO row yet gets one
INSERT INTO user_balances (user_id, swayger_points)
SELECT p.id, 1000
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM user_balances ub WHERE ub.user_id = p.id
);

-- ================================================================
-- Reload PostgREST schema cache
-- ================================================================
NOTIFY pgrst, 'reload schema';
