-- ============================================================================
-- 006: Fix swaygers columns + safe data copy from workspaces
-- Ensures ALL required v1 columns exist on swaygers before any data copy.
-- Safe to run multiple times (idempotent). Non-destructive (no drops).
-- Run AFTER 005 (or standalone if 005 partially ran).
-- ============================================================================

-- ── 1. Create swaygers table if it doesn't exist (minimal) ──────────────────

CREATE TABLE IF NOT EXISTS swaygers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Add ALL required v1 columns (safe, idempotent) ───────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='opponent_id') THEN
    ALTER TABLE swaygers ADD COLUMN opponent_id UUID REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='description') THEN
    ALTER TABLE swaygers ADD COLUMN description TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='category') THEN
    ALTER TABLE swaygers ADD COLUMN category TEXT NOT NULL DEFAULT 'Other';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='stake_units') THEN
    ALTER TABLE swaygers ADD COLUMN stake_units INT NOT NULL DEFAULT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='creator_pick') THEN
    ALTER TABLE swaygers ADD COLUMN creator_pick TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='opponent_pick') THEN
    ALTER TABLE swaygers ADD COLUMN opponent_pick TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='status') THEN
    ALTER TABLE swaygers ADD COLUMN status TEXT NOT NULL DEFAULT 'pending_invite';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='expires_at') THEN
    ALTER TABLE swaygers ADD COLUMN expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='source_swayger_id') THEN
    ALTER TABLE swaygers ADD COLUMN source_swayger_id UUID REFERENCES swaygers(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='rematch_type') THEN
    ALTER TABLE swaygers ADD COLUMN rematch_type TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='settled_outcome') THEN
    ALTER TABLE swaygers ADD COLUMN settled_outcome TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='updated_at') THEN
    ALTER TABLE swaygers ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;

  RAISE NOTICE 'All required columns ensured on swaygers table.';
END $$;

-- ── 3. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_swaygers_creator ON swaygers(creator_id);
CREATE INDEX IF NOT EXISTS idx_swaygers_opponent ON swaygers(opponent_id);
CREATE INDEX IF NOT EXISTS idx_swaygers_status ON swaygers(status);

-- ── 4. swayger_invites table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS swayger_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  swayger_id UUID NOT NULL REFERENCES swaygers(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swayger_invites_code ON swayger_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_swayger_invites_swayger ON swayger_invites(swayger_id);

-- ── 5. settlement_proposals table ───────────────────────────────────────────

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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlement_proposals' AND column_name='outcome') THEN
    ALTER TABLE settlement_proposals ADD COLUMN outcome TEXT NOT NULL DEFAULT 'draw' CHECK (outcome IN ('creator','opponent','draw','no_contest'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlement_proposals' AND column_name='creator_confirmed') THEN
    ALTER TABLE settlement_proposals ADD COLUMN creator_confirmed BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settlement_proposals' AND column_name='opponent_confirmed') THEN
    ALTER TABLE settlement_proposals ADD COLUMN opponent_confirmed BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_settlement_proposals_swayger_v1 ON settlement_proposals(swayger_id);

-- ── 6. Safe data copy from workspaces ───────────────────────────────────────
-- Dynamically builds the INSERT based on which columns actually exist
-- on the workspaces table. Falls back to defaults for missing columns.

DO $$
DECLARE
  v_has_workspaces BOOLEAN;
  v_has_category BOOLEAN;
  v_has_stake_units BOOLEAN;
  v_has_creator_pick BOOLEAN;
  v_has_opponent_pick BOOLEAN;
  v_has_opponent_id BOOLEAN;
  v_has_description BOOLEAN;
  v_has_expires_at BOOLEAN;
  v_has_settled_outcome BOOLEAN;
  v_has_updated_at BOOLEAN;
  v_has_status BOOLEAN;
  v_has_name BOOLEAN;
  v_has_owner_id BOOLEAN;
  v_sql TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workspaces'
  ) INTO v_has_workspaces;

  IF NOT v_has_workspaces THEN
    RAISE NOTICE 'No workspaces table found. Skipping data copy.';
    RETURN;
  END IF;

  -- Check for required base columns
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='owner_id') INTO v_has_owner_id;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='name') INTO v_has_name;

  IF NOT v_has_owner_id OR NOT v_has_name THEN
    RAISE NOTICE 'workspaces missing owner_id or name. Skipping data copy.';
    RETURN;
  END IF;

  -- Check each optional column
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='category') INTO v_has_category;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='stake_units') INTO v_has_stake_units;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='creator_pick') INTO v_has_creator_pick;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='opponent_pick') INTO v_has_opponent_pick;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='opponent_id') INTO v_has_opponent_id;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='description') INTO v_has_description;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='expires_at') INTO v_has_expires_at;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='settled_outcome') INTO v_has_settled_outcome;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='updated_at') INTO v_has_updated_at;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='status') INTO v_has_status;

  -- Build dynamic INSERT ... SELECT
  v_sql := 'INSERT INTO swaygers (creator_id, title, category, stake_units, creator_pick, opponent_pick, opponent_id, description, status, expires_at, settled_outcome, created_at, updated_at) SELECT ';

  -- creator_id <- owner_id
  v_sql := v_sql || 'w.owner_id, ';

  -- title <- name
  v_sql := v_sql || 'w.name, ';

  -- category
  IF v_has_category THEN
    v_sql := v_sql || 'COALESCE(w.category, ''Other''), ';
  ELSE
    v_sql := v_sql || '''Other'', ';
  END IF;

  -- stake_units
  IF v_has_stake_units THEN
    v_sql := v_sql || 'COALESCE(w.stake_units, 1), ';
  ELSE
    v_sql := v_sql || '1, ';
  END IF;

  -- creator_pick
  IF v_has_creator_pick THEN
    v_sql := v_sql || 'COALESCE(w.creator_pick, ''No pick set''), ';
  ELSE
    v_sql := v_sql || '''No pick set'', ';
  END IF;

  -- opponent_pick
  IF v_has_opponent_pick THEN
    v_sql := v_sql || 'w.opponent_pick, ';
  ELSE
    v_sql := v_sql || 'NULL, ';
  END IF;

  -- opponent_id
  IF v_has_opponent_id THEN
    v_sql := v_sql || 'w.opponent_id, ';
  ELSE
    v_sql := v_sql || 'NULL, ';
  END IF;

  -- description
  IF v_has_description THEN
    v_sql := v_sql || 'w.description, ';
  ELSE
    v_sql := v_sql || 'NULL, ';
  END IF;

  -- status
  IF v_has_status THEN
    v_sql := v_sql || 'COALESCE(w.status, ''pending_invite''), ';
  ELSE
    v_sql := v_sql || '''pending_invite'', ';
  END IF;

  -- expires_at
  IF v_has_expires_at THEN
    v_sql := v_sql || 'COALESCE(w.expires_at, now() + interval ''7 days''), ';
  ELSE
    v_sql := v_sql || 'now() + interval ''7 days'', ';
  END IF;

  -- settled_outcome
  IF v_has_settled_outcome THEN
    v_sql := v_sql || 'w.settled_outcome, ';
  ELSE
    v_sql := v_sql || 'NULL, ';
  END IF;

  -- created_at
  v_sql := v_sql || 'w.created_at, ';

  -- updated_at
  IF v_has_updated_at THEN
    v_sql := v_sql || 'COALESCE(w.updated_at, now()) ';
  ELSE
    v_sql := v_sql || 'now() ';
  END IF;

  -- FROM + dedup guard
  v_sql := v_sql || 'FROM workspaces w WHERE NOT EXISTS (SELECT 1 FROM swaygers s WHERE s.title = w.name AND s.creator_id = w.owner_id AND s.created_at = w.created_at) ON CONFLICT DO NOTHING';

  RAISE NOTICE 'Running data copy: %', v_sql;
  EXECUTE v_sql;
  RAISE NOTICE 'Data copy from workspaces completed.';
END $$;

-- ── 7. Migrate invite codes from workspaces (if they exist) ─────────────────

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
    AND NOT EXISTS (SELECT 1 FROM swayger_invites si WHERE si.invite_code = w.invite_code)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Invite code migration completed.';
  ELSE
    RAISE NOTICE 'workspaces has no invite_code column. Skipping invite migration.';
  END IF;
END $$;

-- ── 8. Verification ─────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count INT;
  v_cols TEXT[] := ARRAY[
    'id','creator_id','opponent_id','title','description','category',
    'stake_units','creator_pick','opponent_pick','status','expires_at',
    'source_swayger_id','rematch_type','settled_outcome','created_at','updated_at'
  ];
  v_col TEXT;
  v_all_ok BOOLEAN := true;
BEGIN
  RAISE NOTICE '══════════════════════════════════════════';
  RAISE NOTICE '  006 Schema Verification';
  RAISE NOTICE '══════════════════════════════════════════';

  FOREACH v_col IN ARRAY v_cols LOOP
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema='public' AND table_name='swaygers' AND column_name=v_col;
    IF v_count = 1 THEN
      RAISE NOTICE 'OK: swaygers.% exists', v_col;
    ELSE
      RAISE WARNING 'MISSING: swaygers.%', v_col;
      v_all_ok := false;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count FROM information_schema.tables
  WHERE table_schema='public' AND table_name='swayger_invites';
  IF v_count = 1 THEN RAISE NOTICE 'OK: swayger_invites table exists';
  ELSE RAISE WARNING 'MISSING: swayger_invites table'; v_all_ok := false;
  END IF;

  SELECT count(*) INTO v_count FROM information_schema.tables
  WHERE table_schema='public' AND table_name='settlement_proposals';
  IF v_count = 1 THEN RAISE NOTICE 'OK: settlement_proposals table exists';
  ELSE RAISE WARNING 'MISSING: settlement_proposals table'; v_all_ok := false;
  END IF;

  -- Check settlement_proposals.outcome column specifically
  SELECT count(*) INTO v_count FROM information_schema.columns
  WHERE table_schema='public' AND table_name='settlement_proposals' AND column_name='outcome';
  IF v_count = 1 THEN RAISE NOTICE 'OK: settlement_proposals.outcome exists';
  ELSE RAISE WARNING 'MISSING: settlement_proposals.outcome'; v_all_ok := false;
  END IF;

  SELECT count(*) INTO v_count FROM swaygers;
  RAISE NOTICE 'swaygers row count: %', v_count;

  SELECT count(*) INTO v_count FROM swayger_invites;
  RAISE NOTICE 'swayger_invites row count: %', v_count;

  IF v_all_ok THEN
    RAISE NOTICE '══════════════════════════════════════════';
    RAISE NOTICE '  ALL CHECKS PASSED';
    RAISE NOTICE '══════════════════════════════════════════';
  ELSE
    RAISE WARNING '══════════════════════════════════════════';
    RAISE WARNING '  SOME CHECKS FAILED — review above';
    RAISE WARNING '══════════════════════════════════════════';
  END IF;
END $$;
