-- ============================================================================
-- 023: Expiry deadlines — invite timeout + settlement deadline
-- Adds:
--   • invite_expired + settlement_expired enum values
--   • settlement_deadline (set when proposal is made, expires 14 days later)
--   • invite_reminder_sent / settlement_reminder_sent (prevents duplicate emails)
--   • Updates create_swayger → 14-day invite window (up from 7)
--   • Updates propose_settlement → stamps settlement_deadline
--   • Replaces expire_old_proposals → handles both invite + settlement expiry
-- Safe / idempotent.
-- ============================================================================

-- ── 1. Extend swayger_status enum ───────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'swayger_status' AND e.enumlabel = 'invite_expired'
  ) THEN
    ALTER TYPE public.swayger_status ADD VALUE 'invite_expired';
    RAISE NOTICE 'Added invite_expired to swayger_status enum';
  ELSE
    RAISE NOTICE 'invite_expired already in enum';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'swayger_status' AND e.enumlabel = 'settlement_expired'
  ) THEN
    ALTER TYPE public.swayger_status ADD VALUE 'settlement_expired';
    RAISE NOTICE 'Added settlement_expired to swayger_status enum';
  ELSE
    RAISE NOTICE 'settlement_expired already in enum';
  END IF;
END $$;

-- ── 2. Add new columns to swaygers ──────────────────────────────────────────

DO $$
BEGIN
  -- settlement_deadline: set when proposal is made, expires 14 days later
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='swaygers' AND column_name='settlement_deadline'
  ) THEN
    ALTER TABLE swaygers ADD COLUMN settlement_deadline TIMESTAMPTZ;
    RAISE NOTICE 'Added swaygers.settlement_deadline';
  END IF;

  -- invite_reminder_sent: prevents duplicate 2-day-before invite reminder
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='swaygers' AND column_name='invite_reminder_sent'
  ) THEN
    ALTER TABLE swaygers ADD COLUMN invite_reminder_sent BOOLEAN NOT NULL DEFAULT false;
    RAISE NOTICE 'Added swaygers.invite_reminder_sent';
  END IF;

  -- settlement_reminder_sent: prevents duplicate 2-day-before settlement reminder
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='swaygers' AND column_name='settlement_reminder_sent'
  ) THEN
    ALTER TABLE swaygers ADD COLUMN settlement_reminder_sent BOOLEAN NOT NULL DEFAULT false;
    RAISE NOTICE 'Added swaygers.settlement_reminder_sent';
  END IF;
END $$;

-- ── 3. Update create_swayger → 14-day invite window ─────────────────────────

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

  -- Create swayger with 14-day invite window
  INSERT INTO swaygers (
    creator_id, title, description, category,
    stake_units, creator_pick, stake_note, points_active,
    expires_at
  )
  VALUES (
    v_user_id, p_title, p_description, p_category,
    p_stake_units, p_creator_pick, p_stake_note, TRUE,
    NOW() + INTERVAL '14 days'
  )
  RETURNING id INTO v_swayger_id;

  -- Create invite record
  INSERT INTO swayger_invites (swayger_id, invite_code)
  VALUES (v_swayger_id, p_invite_code);

  RETURN v_swayger_id::TEXT;
END;
$$;

-- ── 4. Update propose_settlement → stamp settlement_deadline ────────────────
-- Extends the 011 version: also sets settlement_deadline + resets reminder flag.

DROP FUNCTION IF EXISTS propose_settlement(UUID, TEXT);

CREATE OR REPLACE FUNCTION propose_settlement(p_swayger_id UUID, p_outcome TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID;
  v_status      TEXT;
  v_creator_id  UUID;
  v_opponent_id UUID;
  v_proposal_id UUID;
  v_is_creator  BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_outcome NOT IN ('creator', 'opponent', 'draw', 'no_contest') THEN
    RETURN json_build_object('error', 'Invalid outcome.');
  END IF;

  SELECT status::text, creator_id, opponent_id
  INTO v_status, v_creator_id, v_opponent_id
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

  -- Mark settlement_proposed; stamp deadline (14 days); reset reminder flag
  UPDATE swaygers
  SET status             = 'settlement_proposed'::swayger_status,
      settlement_deadline = NOW() + INTERVAL '14 days',
      settlement_reminder_sent = false,
      updated_at          = NOW()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL, 'proposal_id', v_proposal_id);
END;
$$;

-- ── 5. Replace expire_old_proposals — handles both invite + settlement expiry

CREATE OR REPLACE FUNCTION expire_old_proposals()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count   INTEGER := 0;
  v_swayger swaygers%ROWTYPE;
BEGIN
  -- ── A. Expire settlement proposals past their deadline (settlement_expired) ─
  FOR v_swayger IN
    SELECT * FROM swaygers
    WHERE status = 'settlement_proposed'
      AND settlement_deadline IS NOT NULL
      AND settlement_deadline < NOW()
  LOOP
    -- Refund SP to both parties
    IF v_swayger.points_active THEN
      UPDATE user_balances
      SET swayger_points = swayger_points + v_swayger.stake_units, updated_at = NOW()
      WHERE user_id IN (v_swayger.creator_id, v_swayger.opponent_id);
    END IF;

    UPDATE swaygers
    SET status = 'settlement_expired'::public.swayger_status,
        updated_at = NOW()
    WHERE id = v_swayger.id;

    v_count := v_count + 1;
  END LOOP;

  -- ── B. Fallback: expire settlement_proposed with no deadline set (old rows) ─
  -- Uses the legacy 7-day updated_at check for rows created before this migration.
  FOR v_swayger IN
    SELECT * FROM swaygers
    WHERE status = 'settlement_proposed'
      AND settlement_deadline IS NULL
      AND updated_at < NOW() - INTERVAL '7 days'
  LOOP
    IF v_swayger.points_active THEN
      UPDATE user_balances
      SET swayger_points = swayger_points + v_swayger.stake_units, updated_at = NOW()
      WHERE user_id IN (v_swayger.creator_id, v_swayger.opponent_id);
    END IF;

    UPDATE swaygers
    SET status = 'settlement_expired'::public.swayger_status,
        updated_at = NOW()
    WHERE id = v_swayger.id;

    v_count := v_count + 1;
  END LOOP;

  -- ── C. Expire pending invites past their expires_at (invite_expired) ────────
  FOR v_swayger IN
    SELECT * FROM swaygers
    WHERE status = 'pending_invite'
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
  LOOP
    -- Refund escrowed SP to creator
    IF v_swayger.points_active THEN
      UPDATE user_balances
      SET swayger_points = swayger_points + v_swayger.stake_units, updated_at = NOW()
      WHERE user_id = v_swayger.creator_id;
    END IF;

    UPDATE swaygers
    SET status = 'invite_expired'::public.swayger_status,
        updated_at = NOW()
    WHERE id = v_swayger.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION expire_old_proposals() TO anon;
GRANT EXECUTE ON FUNCTION expire_old_proposals() TO authenticated;

-- ── 6. Verification ──────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count INT;
BEGIN
  RAISE NOTICE '── 023 Verification ──';

  SELECT count(*) INTO v_count FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'swayger_status' AND e.enumlabel = 'invite_expired';
  IF v_count = 1 THEN RAISE NOTICE 'OK: invite_expired in enum';
  ELSE RAISE WARNING 'MISSING: invite_expired'; END IF;

  SELECT count(*) INTO v_count FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'swayger_status' AND e.enumlabel = 'settlement_expired';
  IF v_count = 1 THEN RAISE NOTICE 'OK: settlement_expired in enum';
  ELSE RAISE WARNING 'MISSING: settlement_expired'; END IF;

  SELECT count(*) INTO v_count FROM information_schema.columns
  WHERE table_schema='public' AND table_name='swaygers' AND column_name='settlement_deadline';
  IF v_count = 1 THEN RAISE NOTICE 'OK: swaygers.settlement_deadline';
  ELSE RAISE WARNING 'MISSING: swaygers.settlement_deadline'; END IF;

  SELECT count(*) INTO v_count FROM information_schema.columns
  WHERE table_schema='public' AND table_name='swaygers' AND column_name='invite_reminder_sent';
  IF v_count = 1 THEN RAISE NOTICE 'OK: swaygers.invite_reminder_sent';
  ELSE RAISE WARNING 'MISSING: swaygers.invite_reminder_sent'; END IF;

  SELECT count(*) INTO v_count FROM information_schema.columns
  WHERE table_schema='public' AND table_name='swaygers' AND column_name='settlement_reminder_sent';
  IF v_count = 1 THEN RAISE NOTICE 'OK: swaygers.settlement_reminder_sent';
  ELSE RAISE WARNING 'MISSING: swaygers.settlement_reminder_sent'; END IF;

  RAISE NOTICE '── 023 Done ──';
END $$;
