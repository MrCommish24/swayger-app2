-- Profiles table (if not already created)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
  DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
  DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
END $$;

CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scoring_type TEXT NOT NULL DEFAULT 'points',
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Workspace members table
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(workspace_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_invite_code ON workspaces(invite_code);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

-- RLS policies for workspaces
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view workspaces they belong to" ON workspaces;
  DROP POLICY IF EXISTS "Authenticated users can create workspaces" ON workspaces;
  DROP POLICY IF EXISTS "Owners can update their workspaces" ON workspaces;
  DROP POLICY IF EXISTS "Anyone authenticated can look up workspace by invite code" ON workspaces;
END $$;

CREATE POLICY "Users can view workspaces they belong to"
  ON workspaces FOR SELECT
  USING (
    id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can update their workspaces"
  ON workspaces FOR UPDATE
  USING (owner_id = auth.uid());

-- RLS policies for workspace_members
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view members of their workspaces" ON workspace_members;
  DROP POLICY IF EXISTS "Authenticated users can join workspaces" ON workspace_members;
  DROP POLICY IF EXISTS "Owners can manage workspace members" ON workspace_members;
END $$;

CREATE POLICY "Users can view members of their workspaces"
  ON workspace_members FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can manage workspace members"
  ON workspace_members FOR DELETE
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Atomic workspace creation (inserts workspace + owner membership in one transaction)
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

-- Safe join by invite code (validates code, prevents role escalation)
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
