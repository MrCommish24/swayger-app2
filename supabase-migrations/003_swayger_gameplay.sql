-- Add status and stake_text columns to workspaces
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS stake_text TEXT;

-- Swayger legs (the actual wager picks)
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

-- Swayger responses (accept/decline tracking)
CREATE TABLE IF NOT EXISTS swayger_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  swayger_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(swayger_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_swayger_responses_swayger ON swayger_responses(swayger_id);

-- RLS for swayger_legs
ALTER TABLE swayger_legs ENABLE ROW LEVEL SECURITY;

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

-- RLS for swayger_responses
ALTER TABLE swayger_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view responses"
  ON swayger_responses FOR SELECT
  USING (is_workspace_member(swayger_id));

CREATE POLICY "Participants can insert own response"
  ON swayger_responses FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND is_workspace_member(swayger_id)
  );

-- RPC: Accept a swayger (sets status to accepted, records response)
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

-- RPC: Decline a swayger (records decline, keeps swayger open for others)
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

-- RPC: Cancel a swayger (creator only)
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
