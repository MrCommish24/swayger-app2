-- ============================================================================
-- Swayger Gameplay v1: Verify + Fix SQL
-- Run this in the Supabase SQL Editor to ensure all gameplay tables,
-- columns, policies, and RPCs exist. Safe to run multiple times (idempotent).
-- ============================================================================

-- ── 0. Ensure is_workspace_member helper exists (required by RLS policies) ──

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

-- ── 1. Ensure workspaces has status and stake_text columns ──────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'status'
  ) THEN
    ALTER TABLE workspaces ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
    RAISE NOTICE 'ADDED: workspaces.status column';
  ELSE
    RAISE NOTICE 'OK: workspaces.status column exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'stake_text'
  ) THEN
    ALTER TABLE workspaces ADD COLUMN stake_text TEXT;
    RAISE NOTICE 'ADDED: workspaces.stake_text column';
  ELSE
    RAISE NOTICE 'OK: workspaces.stake_text column exists';
  END IF;
END $$;

-- ── 2. Create swayger_legs table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS swayger_legs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  swayger_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_type TEXT NOT NULL DEFAULT 'custom',
  selection TEXT NOT NULL,
  odds TEXT,
  line TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_swayger_legs_swayger ON swayger_legs(swayger_id);
ALTER TABLE swayger_legs ENABLE ROW LEVEL SECURITY;

-- ── 3. Create swayger_responses table ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS swayger_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  swayger_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(swayger_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_swayger_responses_swayger ON swayger_responses(swayger_id);
ALTER TABLE swayger_responses ENABLE ROW LEVEL SECURITY;

-- ── 4. RLS policies for swayger_legs ────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "Participants can view legs" ON swayger_legs;
  DROP POLICY IF EXISTS "Creator can insert legs when open" ON swayger_legs;
  DROP POLICY IF EXISTS "Creator can update legs when open" ON swayger_legs;
  DROP POLICY IF EXISTS "Creator can delete legs when open" ON swayger_legs;
END $$;

CREATE POLICY "Participants can view legs"
  ON swayger_legs FOR SELECT
  USING (is_workspace_member(swayger_id));

CREATE POLICY "Creator can insert legs when open"
  ON swayger_legs FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND swayger_id IN (
      SELECT id FROM workspaces
      WHERE owner_id = auth.uid()
      AND status IN ('open', 'draft')
    )
  );

CREATE POLICY "Creator can update legs when open"
  ON swayger_legs FOR UPDATE
  USING (
    auth.uid() = created_by
    AND swayger_id IN (
      SELECT id FROM workspaces
      WHERE owner_id = auth.uid()
      AND status IN ('open', 'draft')
    )
  );

CREATE POLICY "Creator can delete legs when open"
  ON swayger_legs FOR DELETE
  USING (
    auth.uid() = created_by
    AND swayger_id IN (
      SELECT id FROM workspaces
      WHERE owner_id = auth.uid()
      AND status IN ('open', 'draft')
    )
  );

-- ── 5. RLS policies for swayger_responses ───────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "Participants can view responses" ON swayger_responses;
  DROP POLICY IF EXISTS "Participants can insert own response" ON swayger_responses;
END $$;

CREATE POLICY "Participants can view responses"
  ON swayger_responses FOR SELECT
  USING (is_workspace_member(swayger_id));

CREATE POLICY "Participants can insert own response"
  ON swayger_responses FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND is_workspace_member(swayger_id)
  );

-- ── 6. RPC: accept_swayger ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION accept_swayger(p_swayger_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_owner_id UUID;
  v_existing TEXT;
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
    RETURN json_build_object('error', 'Creator cannot accept their own Swayger.');
  END IF;

  IF v_status != 'open' THEN
    RETURN json_build_object('error', 'This Swayger is no longer open.');
  END IF;

  IF NOT is_workspace_member(p_swayger_id) THEN
    RETURN json_build_object('error', 'You must join this Swayger first.');
  END IF;

  SELECT response INTO v_existing
  FROM swayger_responses
  WHERE swayger_id = p_swayger_id AND user_id = v_user_id;

  IF v_existing = 'accepted' THEN
    RETURN json_build_object('error', 'You already accepted this Swayger.');
  END IF;

  INSERT INTO swayger_responses (swayger_id, user_id, response)
  VALUES (p_swayger_id, v_user_id, 'accepted')
  ON CONFLICT (swayger_id, user_id) DO UPDATE SET response = 'accepted', created_at = now();

  UPDATE workspaces SET status = 'accepted' WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ── 7. RPC: decline_swayger ────────────────────────────────────────────────

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
    RETURN json_build_object('error', 'Creator cannot decline their own Swayger.');
  END IF;

  IF v_status != 'open' THEN
    RETURN json_build_object('error', 'This Swayger is no longer open.');
  END IF;

  IF NOT is_workspace_member(p_swayger_id) THEN
    RETURN json_build_object('error', 'You must join this Swayger first.');
  END IF;

  INSERT INTO swayger_responses (swayger_id, user_id, response)
  VALUES (p_swayger_id, v_user_id, 'declined')
  ON CONFLICT (swayger_id, user_id) DO UPDATE SET response = 'declined', created_at = now();

  RETURN json_build_object('error', NULL);
END;
$$;

-- ── 8. RPC: cancel_swayger ─────────────────────────────────────────────────

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
    RETURN json_build_object('error', 'Only the creator can cancel this Swayger.');
  END IF;

  IF v_status = 'canceled' THEN
    RETURN json_build_object('error', 'Already canceled.');
  END IF;

  UPDATE workspaces SET status = 'canceled' WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ── 9. Verification query (run to confirm everything is in place) ───────────

DO $$
DECLARE
  v_count INT;
BEGIN
  -- Check tables
  SELECT count(*) INTO v_count FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'swayger_legs';
  IF v_count = 1 THEN RAISE NOTICE 'OK: swayger_legs table exists';
  ELSE RAISE WARNING 'MISSING: swayger_legs table';
  END IF;

  SELECT count(*) INTO v_count FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'swayger_responses';
  IF v_count = 1 THEN RAISE NOTICE 'OK: swayger_responses table exists';
  ELSE RAISE WARNING 'MISSING: swayger_responses table';
  END IF;

  -- Check columns on workspaces
  SELECT count(*) INTO v_count FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'status';
  IF v_count = 1 THEN RAISE NOTICE 'OK: workspaces.status column exists';
  ELSE RAISE WARNING 'MISSING: workspaces.status column';
  END IF;

  SELECT count(*) INTO v_count FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'stake_text';
  IF v_count = 1 THEN RAISE NOTICE 'OK: workspaces.stake_text column exists';
  ELSE RAISE WARNING 'MISSING: workspaces.stake_text column';
  END IF;

  -- Check RLS enabled
  SELECT count(*) INTO v_count FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'swayger_legs' AND rowsecurity = true;
  IF v_count = 1 THEN RAISE NOTICE 'OK: swayger_legs RLS enabled';
  ELSE RAISE WARNING 'MISSING: swayger_legs RLS not enabled';
  END IF;

  SELECT count(*) INTO v_count FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'swayger_responses' AND rowsecurity = true;
  IF v_count = 1 THEN RAISE NOTICE 'OK: swayger_responses RLS enabled';
  ELSE RAISE WARNING 'MISSING: swayger_responses RLS not enabled';
  END IF;

  -- Check RPC functions
  SELECT count(*) INTO v_count FROM pg_proc
  WHERE proname = 'accept_swayger' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: accept_swayger function exists';
  ELSE RAISE WARNING 'MISSING: accept_swayger function';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc
  WHERE proname = 'decline_swayger' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: decline_swayger function exists';
  ELSE RAISE WARNING 'MISSING: decline_swayger function';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc
  WHERE proname = 'cancel_swayger' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: cancel_swayger function exists';
  ELSE RAISE WARNING 'MISSING: cancel_swayger function';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc
  WHERE proname = 'is_workspace_member' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: is_workspace_member function exists';
  ELSE RAISE WARNING 'MISSING: is_workspace_member function';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc
  WHERE proname = 'create_workspace' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: create_workspace function exists';
  ELSE RAISE WARNING 'MISSING: create_workspace function';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc
  WHERE proname = 'join_workspace_by_code' AND pronamespace = 'public'::regnamespace;
  IF v_count >= 1 THEN RAISE NOTICE 'OK: join_workspace_by_code function exists';
  ELSE RAISE WARNING 'MISSING: join_workspace_by_code function';
  END IF;

  -- Check RLS policies on swayger_legs
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'swayger_legs';
  RAISE NOTICE 'swayger_legs has % RLS policies (expected 4)', v_count;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'swayger_responses';
  RAISE NOTICE 'swayger_responses has % RLS policies (expected 2)', v_count;

  RAISE NOTICE '──────────────────────────────────────────';
  RAISE NOTICE 'Schema verification complete.';
END $$;
