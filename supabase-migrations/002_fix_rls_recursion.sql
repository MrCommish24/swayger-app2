-- Fix: RLS recursion on workspace_members
-- The SELECT policy on workspace_members references workspace_members itself,
-- causing infinite recursion. Solution: use a SECURITY DEFINER helper function
-- that bypasses RLS to check membership.

-- Step 1: Create helper function (bypasses RLS)
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

-- Step 2: Drop all existing policies on workspace_members
DROP POLICY IF EXISTS "Users can view members of their workspaces" ON workspace_members;
DROP POLICY IF EXISTS "Authenticated users can join workspaces" ON workspace_members;
DROP POLICY IF EXISTS "Owners can manage workspace members" ON workspace_members;

-- Step 3: Recreate policies using the helper function (no recursion)

-- SELECT: users can see members of workspaces they belong to
CREATE POLICY "Users can view members of their workspaces"
  ON workspace_members FOR SELECT
  USING (is_workspace_member(workspace_id));

-- INSERT: only via RPC (create_workspace, join_workspace_by_code)
-- No direct INSERT policy needed since RPCs are SECURITY DEFINER.
-- But if needed for flexibility, allow inserting yourself as viewer:
CREATE POLICY "Users can join as viewer"
  ON workspace_members FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND role = 'viewer'
  );

-- DELETE: workspace owners can remove members
CREATE POLICY "Owners can remove members"
  ON workspace_members FOR DELETE
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Step 4: Also fix workspaces SELECT to use the helper function
DROP POLICY IF EXISTS "Users can view workspaces they belong to" ON workspaces;

CREATE POLICY "Users can view workspaces they belong to"
  ON workspaces FOR SELECT
  USING (is_workspace_member(id));

-- Step 5: Ensure the create_workspace and join_workspace_by_code RPCs exist
-- (These are SECURITY DEFINER so they bypass RLS entirely)

CREATE OR REPLACE FUNCTION create_workspace(
  p_name TEXT,
  p_scoring_type TEXT,
  p_invite_code TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO workspaces (owner_id, name, scoring_type, invite_code)
  VALUES (v_user_id, p_name, p_scoring_type, p_invite_code)
  RETURNING id INTO v_workspace_id;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'owner');

  RETURN v_workspace_id;
END;
$$;

CREATE OR REPLACE FUNCTION join_workspace_by_code(p_invite_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_user_id UUID;
  v_existing UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_workspace_id
  FROM workspaces
  WHERE invite_code = UPPER(TRIM(p_invite_code));

  IF v_workspace_id IS NULL THEN
    RETURN json_build_object('error', 'Invalid invite code.', 'workspace_id', NULL, 'already_member', false);
  END IF;

  SELECT id INTO v_existing
  FROM workspace_members
  WHERE workspace_id = v_workspace_id AND user_id = v_user_id;

  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('error', NULL, 'workspace_id', v_workspace_id, 'already_member', true);
  END IF;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'viewer');

  RETURN json_build_object('error', NULL, 'workspace_id', v_workspace_id, 'already_member', false);
END;
$$;
