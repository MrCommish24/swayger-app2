-- ============================================================================
-- Swayger v1 Refactor: 1v1 social wager contract model
-- Removes legs/lines/odds/parlay. Adds settlement engine + rematches.
-- Safe to run multiple times (idempotent).
-- Run AFTER 001 + 002 migrations.
-- ============================================================================

-- ── 0. Ensure is_workspace_member helper exists ─────────────────────────────

CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
    AND user_id = auth.uid()
  );
$$;

-- ── 1. Drop old gameplay v1 tables (legs/responses) ─────────────────────────

DROP TABLE IF EXISTS swayger_legs CASCADE;
DROP TABLE IF EXISTS swayger_responses CASCADE;

-- ── 2. Drop old RPCs that reference dropped tables ──────────────────────────

DROP FUNCTION IF EXISTS accept_swayger(UUID);
DROP FUNCTION IF EXISTS decline_swayger(UUID);
DROP FUNCTION IF EXISTS cancel_swayger(UUID);

-- ── 3. Add new columns to workspaces ────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='status') THEN
    ALTER TABLE workspaces ADD COLUMN status TEXT NOT NULL DEFAULT 'pending_invite';
  ELSE
    ALTER TABLE workspaces ALTER COLUMN status SET DEFAULT 'pending_invite';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='description') THEN
    ALTER TABLE workspaces ADD COLUMN description TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='category') THEN
    ALTER TABLE workspaces ADD COLUMN category TEXT NOT NULL DEFAULT 'Other';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='stake_units') THEN
    ALTER TABLE workspaces ADD COLUMN stake_units INT NOT NULL DEFAULT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='creator_pick') THEN
    ALTER TABLE workspaces ADD COLUMN creator_pick TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='opponent_pick') THEN
    ALTER TABLE workspaces ADD COLUMN opponent_pick TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='opponent_id') THEN
    ALTER TABLE workspaces ADD COLUMN opponent_id UUID REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='expires_at') THEN
    ALTER TABLE workspaces ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='source_swayger_id') THEN
    ALTER TABLE workspaces ADD COLUMN source_swayger_id UUID REFERENCES workspaces(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='rematch_type') THEN
    ALTER TABLE workspaces ADD COLUMN rematch_type TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='updated_at') THEN
    ALTER TABLE workspaces ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='settled_outcome') THEN
    ALTER TABLE workspaces ADD COLUMN settled_outcome TEXT;
  END IF;

  -- Drop old columns that are no longer needed
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='stake_text') THEN
    ALTER TABLE workspaces DROP COLUMN stake_text;
  END IF;
END $$;

-- Update any existing 'open' status rows to 'pending_invite'
UPDATE workspaces SET status = 'pending_invite' WHERE status IN ('open', 'draft');

-- ── 4. Settlement proposals table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settlement_proposals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  swayger_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  proposed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('creator', 'opponent', 'draw', 'no_contest')),
  creator_confirmed BOOLEAN NOT NULL DEFAULT false,
  opponent_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_proposals_swayger ON settlement_proposals(swayger_id);

ALTER TABLE settlement_proposals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Participants can view proposals" ON settlement_proposals;
  DROP POLICY IF EXISTS "Participants can insert proposals" ON settlement_proposals;
  DROP POLICY IF EXISTS "Participants can update proposals" ON settlement_proposals;
END $$;

CREATE POLICY "Participants can view proposals"
  ON settlement_proposals FOR SELECT
  USING (is_workspace_member(swayger_id));

CREATE POLICY "Participants can insert proposals"
  ON settlement_proposals FOR INSERT
  WITH CHECK (
    auth.uid() = proposed_by
    AND is_workspace_member(swayger_id)
  );

CREATE POLICY "Participants can update proposals"
  ON settlement_proposals FOR UPDATE
  USING (is_workspace_member(swayger_id));

-- ── 5. RPC: Accept a swayger (opponent sets pick, status -> active) ─────────

CREATE OR REPLACE FUNCTION accept_swayger(p_swayger_id UUID, p_opponent_pick TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_owner_id UUID;
  v_opponent_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT status, owner_id, opponent_id INTO v_status, v_owner_id, v_opponent_id
  FROM workspaces WHERE id = p_swayger_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

  IF v_owner_id = v_user_id THEN
    RETURN json_build_object('error', 'You cannot accept your own Swayger.');
  END IF;

  IF v_status != 'pending_invite' THEN
    RETURN json_build_object('error', 'This Swayger is no longer available to accept.');
  END IF;

  IF v_opponent_id IS NOT NULL AND v_opponent_id != v_user_id THEN
    RETURN json_build_object('error', 'This Swayger already has an opponent.');
  END IF;

  IF NOT is_workspace_member(p_swayger_id) THEN
    RETURN json_build_object('error', 'You must join this Swayger first.');
  END IF;

  IF p_opponent_pick IS NULL OR trim(p_opponent_pick) = '' THEN
    RETURN json_build_object('error', 'You must enter your pick.');
  END IF;

  UPDATE workspaces
  SET opponent_id = v_user_id,
      opponent_pick = trim(p_opponent_pick),
      status = 'active',
      updated_at = now()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ── 6. RPC: Decline a swayger ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION decline_swayger(p_swayger_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_owner_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT status, owner_id INTO v_status, v_owner_id
  FROM workspaces WHERE id = p_swayger_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

  IF v_owner_id = v_user_id THEN
    RETURN json_build_object('error', 'You cannot decline your own Swayger.');
  END IF;

  IF v_status != 'pending_invite' THEN
    RETURN json_build_object('error', 'This Swayger is no longer available.');
  END IF;

  UPDATE workspaces
  SET status = 'declined',
      updated_at = now()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ── 7. RPC: Cancel a swayger (creator only) ─────────────────────────────────

CREATE OR REPLACE FUNCTION cancel_swayger(p_swayger_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_owner_id UUID;
  v_status TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT owner_id, status INTO v_owner_id, v_status
  FROM workspaces WHERE id = p_swayger_id;

  IF v_owner_id IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

  IF v_owner_id != v_user_id THEN
    RETURN json_build_object('error', 'Only the creator can cancel.');
  END IF;

  IF v_status IN ('settled', 'canceled') THEN
    RETURN json_build_object('error', 'Cannot cancel a ' || v_status || ' Swayger.');
  END IF;

  UPDATE workspaces
  SET status = 'canceled',
      updated_at = now()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ── 8. RPC: Propose settlement ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION propose_settlement(p_swayger_id UUID, p_outcome TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_owner_id UUID;
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

  SELECT status, owner_id, opponent_id INTO v_status, v_owner_id, v_opponent_id
  FROM workspaces WHERE id = p_swayger_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

  IF v_status NOT IN ('active', 'settlement_proposed') THEN
    RETURN json_build_object('error', 'Can only propose settlement on active Swaygers.');
  END IF;

  IF v_user_id != v_owner_id AND v_user_id != v_opponent_id THEN
    RETURN json_build_object('error', 'Only participants can propose settlement.');
  END IF;

  v_is_creator := (v_user_id = v_owner_id);

  INSERT INTO settlement_proposals (swayger_id, proposed_by, outcome, creator_confirmed, opponent_confirmed)
  VALUES (
    p_swayger_id,
    v_user_id,
    p_outcome,
    v_is_creator,
    NOT v_is_creator
  )
  RETURNING id INTO v_proposal_id;

  UPDATE workspaces
  SET status = 'settlement_proposed',
      updated_at = now()
  WHERE id = p_swayger_id AND status = 'active';

  RETURN json_build_object('error', NULL, 'proposal_id', v_proposal_id);
END;
$$;

-- ── 9. RPC: Confirm settlement (other party confirms same proposal) ─────────

CREATE OR REPLACE FUNCTION confirm_settlement(p_swayger_id UUID, p_proposal_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_owner_id UUID;
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

  SELECT owner_id, opponent_id, status INTO v_owner_id, v_opponent_id, v_status
  FROM workspaces WHERE id = p_swayger_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

  IF v_status NOT IN ('active', 'settlement_proposed') THEN
    RETURN json_build_object('error', 'Cannot confirm settlement on this Swayger.');
  END IF;

  IF v_user_id != v_owner_id AND v_user_id != v_opponent_id THEN
    RETURN json_build_object('error', 'Only participants can confirm settlement.');
  END IF;

  SELECT outcome, creator_confirmed, opponent_confirmed
  INTO v_outcome, v_creator_confirmed, v_opponent_confirmed
  FROM settlement_proposals
  WHERE id = p_proposal_id AND swayger_id = p_swayger_id;

  IF v_outcome IS NULL THEN
    RETURN json_build_object('error', 'Proposal not found.');
  END IF;

  v_is_creator := (v_user_id = v_owner_id);

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
    UPDATE workspaces
    SET status = 'settled',
        settled_outcome = v_outcome,
        updated_at = now()
    WHERE id = p_swayger_id;
  END IF;

  RETURN json_build_object('error', NULL, 'settled', v_creator_confirmed AND v_opponent_confirmed);
END;
$$;

-- ── 10. Verification ────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count INT;
  v_cols TEXT[] := ARRAY['status','description','category','stake_units','creator_pick','opponent_pick','opponent_id','expires_at','source_swayger_id','rematch_type','updated_at','settled_outcome'];
  v_col TEXT;
BEGIN
  RAISE NOTICE '── Swayger v1 Schema Verification ──';

  FOREACH v_col IN ARRAY v_cols LOOP
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema='public' AND table_name='workspaces' AND column_name=v_col;
    IF v_count = 1 THEN RAISE NOTICE 'OK: workspaces.% exists', v_col;
    ELSE RAISE WARNING 'MISSING: workspaces.%', v_col;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count FROM information_schema.tables
  WHERE table_schema='public' AND table_name='settlement_proposals';
  IF v_count = 1 THEN RAISE NOTICE 'OK: settlement_proposals table exists';
  ELSE RAISE WARNING 'MISSING: settlement_proposals table';
  END IF;

  SELECT count(*) INTO v_count FROM information_schema.tables
  WHERE table_schema='public' AND table_name='swayger_legs';
  IF v_count = 0 THEN RAISE NOTICE 'OK: swayger_legs dropped';
  ELSE RAISE WARNING 'STALE: swayger_legs still exists';
  END IF;

  SELECT count(*) INTO v_count FROM information_schema.tables
  WHERE table_schema='public' AND table_name='swayger_responses';
  IF v_count = 0 THEN RAISE NOTICE 'OK: swayger_responses dropped';
  ELSE RAISE WARNING 'STALE: swayger_responses still exists';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc
  WHERE proname = 'accept_swayger' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: accept_swayger RPC exists';
  ELSE RAISE WARNING 'MISSING: accept_swayger RPC';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc
  WHERE proname = 'propose_settlement' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: propose_settlement RPC exists';
  ELSE RAISE WARNING 'MISSING: propose_settlement RPC';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc
  WHERE proname = 'confirm_settlement' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: confirm_settlement RPC exists';
  ELSE RAISE WARNING 'MISSING: confirm_settlement RPC';
  END IF;

  RAISE NOTICE '── Verification complete ──';
END $$;
