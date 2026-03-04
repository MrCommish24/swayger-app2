-- ============================================================================
-- 009: Fix swayger_invites table — standalone
-- Run this BEFORE re-running 008 if 008 keeps failing on swayger_invites.
-- ============================================================================

-- Step 1: Drop the old table completely
DROP TABLE IF EXISTS swayger_invites CASCADE;

-- Step 2: Recreate with correct minimal schema
CREATE TABLE swayger_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  swayger_id UUID NOT NULL REFERENCES swaygers(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_swayger_invites_code ON swayger_invites(invite_code);
CREATE INDEX idx_swayger_invites_swayger ON swayger_invites(swayger_id);

ALTER TABLE swayger_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can look up invites"
  ON swayger_invites FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Creator can insert invites"
  ON swayger_invites FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM swaygers WHERE id = swayger_id AND creator_id = auth.uid())
  );

-- Step 3: Re-migrate invite codes from workspaces
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'invite_code'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'owner_id'
  ) THEN
    INSERT INTO swayger_invites (swayger_id, invite_code)
    SELECT s.id, w.invite_code
    FROM workspaces w
    JOIN swaygers s ON s.title = w.name AND s.creator_id = w.owner_id AND s.created_at = w.created_at
    WHERE w.invite_code IS NOT NULL
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Invite codes migrated.';
  ELSE
    RAISE NOTICE 'No invite_code on workspaces. Skipping.';
  END IF;
END $$;

-- Step 4: Verify
DO $$
DECLARE
  v_count INT;
  v_col_count INT;
BEGIN
  SELECT count(*) INTO v_col_count FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'swayger_invites';
  RAISE NOTICE 'swayger_invites has % columns (expected 4)', v_col_count;

  SELECT count(*) INTO v_count FROM swayger_invites;
  RAISE NOTICE 'swayger_invites has % rows', v_count;

  IF v_col_count = 4 THEN
    RAISE NOTICE 'OK: swayger_invites schema is correct';
  ELSE
    RAISE WARNING 'ISSUE: expected 4 columns, got %', v_col_count;
  END IF;
END $$;
