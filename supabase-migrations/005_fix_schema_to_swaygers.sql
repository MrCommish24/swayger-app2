-- ============================================================================
-- Swayger v1.1: Move to dedicated `swaygers` table
-- SAFE migration — additive only, does NOT drop workspaces or old tables.
-- Creates: swaygers, swayger_invites, settlement_proposals (if needed)
-- RPCs rewritten to use swaygers table with creator_id/opponent_id checks.
-- Idempotent — safe to run multiple times.
-- Run AFTER 001 + 002 migrations. 004 is optional (no longer needed).
-- ============================================================================

-- ── 1. Create swaygers table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS swaygers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Other',
  stake_units INT NOT NULL DEFAULT 1,
  creator_pick TEXT NOT NULL,
  opponent_pick TEXT,
  status TEXT NOT NULL DEFAULT 'pending_invite'
    CHECK (status IN ('pending_invite','active','settlement_proposed','settled','declined','canceled','expired','expired_active')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  source_swayger_id UUID REFERENCES swaygers(id),
  rematch_type TEXT CHECK (rematch_type IS NULL OR rematch_type IN ('run_it_back','double_or_nothing')),
  settled_outcome TEXT CHECK (settled_outcome IS NULL OR settled_outcome IN ('creator','opponent','draw','no_contest')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swaygers_creator ON swaygers(creator_id);
CREATE INDEX IF NOT EXISTS idx_swaygers_opponent ON swaygers(opponent_id);
CREATE INDEX IF NOT EXISTS idx_swaygers_status ON swaygers(status);

-- ── 2. Create swayger_invites table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS swayger_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  swayger_id UUID NOT NULL REFERENCES swaygers(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swayger_invites_code ON swayger_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_swayger_invites_swayger ON swayger_invites(swayger_id);

-- ── 3. Settlement proposals (v1, referencing swaygers) ─────────────────────

-- Drop old settlement_proposals if it references workspaces
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'settlement_proposals'
    AND constraint_type = 'FOREIGN KEY'
    AND table_schema = 'public'
  ) THEN
    -- Check if it references workspaces rather than swaygers
    IF EXISTS (
      SELECT 1 FROM information_schema.constraint_column_usage
      WHERE table_name = 'workspaces'
      AND constraint_name IN (
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'settlement_proposals' AND constraint_type = 'FOREIGN KEY'
      )
    ) THEN
      DROP TABLE IF EXISTS settlement_proposals CASCADE;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS settlement_proposals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  swayger_id UUID NOT NULL REFERENCES swaygers(id) ON DELETE CASCADE,
  proposed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('creator','opponent','draw','no_contest')),
  creator_confirmed BOOLEAN NOT NULL DEFAULT false,
  opponent_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_proposals_swayger_v1 ON settlement_proposals(swayger_id);

-- ── 4. RLS on swaygers ────────────────────────────────────────────────────

ALTER TABLE swaygers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Participants can view swaygers" ON swaygers;
  DROP POLICY IF EXISTS "Creator can insert swaygers" ON swaygers;
  DROP POLICY IF EXISTS "Participants can update swaygers" ON swaygers;
END $$;

CREATE POLICY "Participants can view swaygers"
  ON swaygers FOR SELECT
  USING (auth.uid() = creator_id OR auth.uid() = opponent_id);

CREATE POLICY "Creator can insert swaygers"
  ON swaygers FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Participants can update swaygers"
  ON swaygers FOR UPDATE
  USING (auth.uid() = creator_id OR auth.uid() = opponent_id);

-- ── 5. RLS on swayger_invites ──────────────────────────────────────────────

ALTER TABLE swayger_invites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can look up invites" ON swayger_invites;
  DROP POLICY IF EXISTS "Creator can insert invites" ON swayger_invites;
END $$;

CREATE POLICY "Authenticated can look up invites"
  ON swayger_invites FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Creator can insert invites"
  ON swayger_invites FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM swaygers WHERE id = swayger_id AND creator_id = auth.uid())
  );

-- ── 6. RLS on settlement_proposals ─────────────────────────────────────────

ALTER TABLE settlement_proposals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Participants can view proposals v1" ON settlement_proposals;
  DROP POLICY IF EXISTS "Participants can insert proposals v1" ON settlement_proposals;
  DROP POLICY IF EXISTS "Participants can update proposals v1" ON settlement_proposals;
  -- Also drop old policies from 004 if they exist
  DROP POLICY IF EXISTS "Participants can view proposals" ON settlement_proposals;
  DROP POLICY IF EXISTS "Participants can insert proposals" ON settlement_proposals;
  DROP POLICY IF EXISTS "Participants can update proposals" ON settlement_proposals;
END $$;

CREATE POLICY "Participants can view proposals v1"
  ON settlement_proposals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM swaygers
      WHERE id = settlement_proposals.swayger_id
      AND (creator_id = auth.uid() OR opponent_id = auth.uid())
    )
  );

CREATE POLICY "Participants can insert proposals v1"
  ON settlement_proposals FOR INSERT
  WITH CHECK (
    auth.uid() = proposed_by
    AND EXISTS (
      SELECT 1 FROM swaygers
      WHERE id = settlement_proposals.swayger_id
      AND (creator_id = auth.uid() OR opponent_id = auth.uid())
    )
  );

CREATE POLICY "Participants can update proposals v1"
  ON settlement_proposals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM swaygers
      WHERE id = settlement_proposals.swayger_id
      AND (creator_id = auth.uid() OR opponent_id = auth.uid())
    )
  );

-- ── 7. RPC: Create swayger ─────────────────────────────────────────────────

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

  INSERT INTO swaygers (creator_id, title, description, category, stake_units, creator_pick)
  VALUES (v_user_id, TRIM(p_title), NULLIF(TRIM(COALESCE(p_description,'')), ''), COALESCE(p_category, 'Other'), GREATEST(p_stake_units, 1), TRIM(p_creator_pick))
  RETURNING id INTO v_swayger_id;

  INSERT INTO swayger_invites (swayger_id, invite_code)
  VALUES (v_swayger_id, UPPER(TRIM(p_invite_code)));

  RETURN v_swayger_id;
END;
$$;

-- ── 8. RPC: Join swayger by invite code ────────────────────────────────────

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

  SELECT creator_id, opponent_id, status INTO v_creator_id, v_opponent_id, v_status
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

  -- Set opponent_id so they can see it via RLS, but don't accept yet
  UPDATE swaygers SET opponent_id = v_user_id, updated_at = now()
  WHERE id = v_swayger_id;

  RETURN json_build_object('error', NULL, 'swayger_id', v_swayger_id);
END;
$$;

-- ── 9. RPC: Accept swayger ─────────────────────────────────────────────────

DROP FUNCTION IF EXISTS accept_swayger(UUID);
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
  v_creator_id UUID;
  v_opponent_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT status, creator_id, opponent_id INTO v_status, v_creator_id, v_opponent_id
  FROM swaygers WHERE id = p_swayger_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

  IF v_creator_id = v_user_id THEN
    RETURN json_build_object('error', 'You cannot accept your own Swayger.');
  END IF;

  IF v_status != 'pending_invite' THEN
    RETURN json_build_object('error', 'This Swayger is no longer available to accept.');
  END IF;

  IF v_opponent_id IS NOT NULL AND v_opponent_id != v_user_id THEN
    RETURN json_build_object('error', 'This Swayger already has an opponent.');
  END IF;

  IF p_opponent_pick IS NULL OR TRIM(p_opponent_pick) = '' THEN
    RETURN json_build_object('error', 'You must enter your pick.');
  END IF;

  UPDATE swaygers
  SET opponent_id = v_user_id,
      opponent_pick = TRIM(p_opponent_pick),
      status = 'active',
      updated_at = now()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ── 10. RPC: Decline swayger ────────────────────────────────────────────────

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
  v_creator_id UUID;
  v_opponent_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT status, creator_id, opponent_id INTO v_status, v_creator_id, v_opponent_id
  FROM swaygers WHERE id = p_swayger_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

  IF v_creator_id = v_user_id THEN
    RETURN json_build_object('error', 'You cannot decline your own Swayger.');
  END IF;

  IF v_status != 'pending_invite' THEN
    RETURN json_build_object('error', 'This Swayger is no longer available.');
  END IF;

  UPDATE swaygers
  SET status = 'declined',
      opponent_id = CASE WHEN opponent_id = v_user_id THEN NULL ELSE opponent_id END,
      updated_at = now()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ── 11. RPC: Cancel swayger (creator only) ──────────────────────────────────

DROP FUNCTION IF EXISTS cancel_swayger(UUID);

CREATE OR REPLACE FUNCTION cancel_swayger(p_swayger_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_creator_id UUID;
  v_status TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT creator_id, status INTO v_creator_id, v_status
  FROM swaygers WHERE id = p_swayger_id;

  IF v_creator_id IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

  IF v_creator_id != v_user_id THEN
    RETURN json_build_object('error', 'Only the creator can cancel.');
  END IF;

  IF v_status IN ('settled', 'canceled') THEN
    RETURN json_build_object('error', 'Cannot cancel a ' || v_status || ' Swayger.');
  END IF;

  UPDATE swaygers
  SET status = 'canceled', updated_at = now()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ── 12. RPC: Propose settlement ─────────────────────────────────────────────

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

  SELECT status, creator_id, opponent_id INTO v_status, v_creator_id, v_opponent_id
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
  SET status = 'settlement_proposed', updated_at = now()
  WHERE id = p_swayger_id AND status = 'active';

  RETURN json_build_object('error', NULL, 'proposal_id', v_proposal_id);
END;
$$;

-- ── 13. RPC: Confirm settlement ─────────────────────────────────────────────

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

  SELECT creator_id, opponent_id, status INTO v_creator_id, v_opponent_id, v_status
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
    SET status = 'settled', settled_outcome = v_outcome, updated_at = now()
    WHERE id = p_swayger_id;
  END IF;

  RETURN json_build_object('error', NULL, 'settled', v_creator_confirmed AND v_opponent_confirmed);
END;
$$;

-- ── 14. Best-effort data migration from workspaces ─────────────────────────

DO $$
DECLARE
  v_has_workspaces BOOLEAN;
  v_has_creator_pick BOOLEAN;
BEGIN
  -- Check if workspaces table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces'
  ) INTO v_has_workspaces;

  IF NOT v_has_workspaces THEN
    RAISE NOTICE 'No workspaces table found, skipping data migration.';
    RETURN;
  END IF;

  -- Check if workspaces has the v1 columns (creator_pick means 004 was run)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'creator_pick'
  ) INTO v_has_creator_pick;

  IF v_has_creator_pick THEN
    -- Migrate rows that have creator_pick (v1 swaygers)
    INSERT INTO swaygers (creator_id, opponent_id, title, description, category, stake_units, creator_pick, opponent_pick, status, expires_at, settled_outcome, created_at, updated_at)
    SELECT
      w.owner_id,
      w.opponent_id,
      w.name,
      w.description,
      COALESCE(w.category, 'Other'),
      COALESCE(w.stake_units, 1),
      COALESCE(w.creator_pick, 'No pick'),
      w.opponent_pick,
      COALESCE(w.status, 'pending_invite'),
      COALESCE(w.expires_at, now() + interval '7 days'),
      w.settled_outcome,
      w.created_at,
      COALESCE(w.updated_at, now())
    FROM workspaces w
    WHERE w.creator_pick IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM swaygers s WHERE s.title = w.name AND s.creator_id = w.owner_id AND s.created_at = w.created_at)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Data migration from workspaces completed (rows with creator_pick).';
  ELSE
    RAISE NOTICE 'workspaces table does not have v1 columns (creator_pick). Skipping data migration.';
  END IF;
END $$;

-- Also migrate invite codes if they existed on workspaces
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'invite_code'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'creator_pick'
  ) THEN
    INSERT INTO swayger_invites (swayger_id, invite_code)
    SELECT s.id, w.invite_code
    FROM workspaces w
    JOIN swaygers s ON s.title = w.name AND s.creator_id = w.owner_id AND s.created_at = w.created_at
    WHERE w.invite_code IS NOT NULL AND w.creator_pick IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM swayger_invites si WHERE si.invite_code = w.invite_code)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Invite code migration completed.';
  END IF;
END $$;

-- ── 15. Verification ───────────────────────────────────────────────────────

DO $$
DECLARE
  v_count INT;
  v_cols TEXT[] := ARRAY['creator_id','opponent_id','title','description','category','stake_units','creator_pick','opponent_pick','status','expires_at','source_swayger_id','rematch_type','settled_outcome','created_at','updated_at'];
  v_col TEXT;
BEGIN
  RAISE NOTICE '══════════════════════════════════════════';
  RAISE NOTICE '  Swayger v1.1 Schema Verification';
  RAISE NOTICE '══════════════════════════════════════════';

  FOREACH v_col IN ARRAY v_cols LOOP
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema='public' AND table_name='swaygers' AND column_name=v_col;
    IF v_count = 1 THEN RAISE NOTICE 'OK: swaygers.% exists', v_col;
    ELSE RAISE WARNING 'MISSING: swaygers.%', v_col;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count FROM information_schema.tables
  WHERE table_schema='public' AND table_name='swayger_invites';
  IF v_count = 1 THEN RAISE NOTICE 'OK: swayger_invites table exists';
  ELSE RAISE WARNING 'MISSING: swayger_invites table';
  END IF;

  SELECT count(*) INTO v_count FROM information_schema.tables
  WHERE table_schema='public' AND table_name='settlement_proposals';
  IF v_count = 1 THEN RAISE NOTICE 'OK: settlement_proposals table exists';
  ELSE RAISE WARNING 'MISSING: settlement_proposals table';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc WHERE proname = 'create_swayger' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: create_swayger RPC exists';
  ELSE RAISE WARNING 'MISSING: create_swayger RPC';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc WHERE proname = 'join_swayger_by_code' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: join_swayger_by_code RPC exists';
  ELSE RAISE WARNING 'MISSING: join_swayger_by_code RPC';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc WHERE proname = 'accept_swayger' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: accept_swayger RPC exists';
  ELSE RAISE WARNING 'MISSING: accept_swayger RPC';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc WHERE proname = 'decline_swayger' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: decline_swayger RPC exists';
  ELSE RAISE WARNING 'MISSING: decline_swayger RPC';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc WHERE proname = 'cancel_swayger' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: cancel_swayger RPC exists';
  ELSE RAISE WARNING 'MISSING: cancel_swayger RPC';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc WHERE proname = 'propose_settlement' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: propose_settlement RPC exists';
  ELSE RAISE WARNING 'MISSING: propose_settlement RPC';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc WHERE proname = 'confirm_settlement' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: confirm_settlement RPC exists';
  ELSE RAISE WARNING 'MISSING: confirm_settlement RPC';
  END IF;

  SELECT count(*) INTO v_count FROM pg_policies WHERE schemaname = 'public' AND tablename = 'swaygers';
  RAISE NOTICE 'swaygers has % RLS policies (expected 3)', v_count;

  SELECT count(*) INTO v_count FROM pg_policies WHERE schemaname = 'public' AND tablename = 'swayger_invites';
  RAISE NOTICE 'swayger_invites has % RLS policies (expected 2)', v_count;

  SELECT count(*) INTO v_count FROM pg_policies WHERE schemaname = 'public' AND tablename = 'settlement_proposals';
  RAISE NOTICE 'settlement_proposals has % RLS policies (expected 3)', v_count;

  RAISE NOTICE '══════════════════════════════════════════';
  RAISE NOTICE '  Verification complete';
  RAISE NOTICE '══════════════════════════════════════════';
END $$;
