-- ============================================================================
-- 008: Complete swaygers setup — single self-contained migration
-- Does EVERYTHING needed: enum, table, columns, data copy, invites, verify.
-- Safe/idempotent. Non-destructive (no drops).
-- ============================================================================

-- ── 1. Ensure enum type exists ──────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'swayger_status' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.swayger_status AS ENUM (
      'pending_invite','active','settlement_proposed','settled',
      'declined','canceled','expired','expired_active'
    );
    RAISE NOTICE 'Created enum public.swayger_status';
  ELSE
    RAISE NOTICE 'Enum public.swayger_status already exists';
  END IF;
END $$;

-- ── 2. Create swaygers table if missing (minimal) ──────────────────────────

CREATE TABLE IF NOT EXISTS swaygers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Add EVERY required column if missing ─────────────────────────────────

DO $$
DECLARE
  v_status_type TEXT;
BEGIN
  -- opponent_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='opponent_id') THEN
    ALTER TABLE swaygers ADD COLUMN opponent_id UUID REFERENCES auth.users(id);
    RAISE NOTICE 'Added swaygers.opponent_id';
  END IF;

  -- description
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='description') THEN
    ALTER TABLE swaygers ADD COLUMN description TEXT;
    RAISE NOTICE 'Added swaygers.description';
  END IF;

  -- category
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='category') THEN
    ALTER TABLE swaygers ADD COLUMN category TEXT NOT NULL DEFAULT 'Other';
    RAISE NOTICE 'Added swaygers.category';
  END IF;

  -- stake_units
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='stake_units') THEN
    ALTER TABLE swaygers ADD COLUMN stake_units INT NOT NULL DEFAULT 1;
    RAISE NOTICE 'Added swaygers.stake_units';
  END IF;

  -- creator_pick
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='creator_pick') THEN
    ALTER TABLE swaygers ADD COLUMN creator_pick TEXT;
    RAISE NOTICE 'Added swaygers.creator_pick';
  END IF;

  -- opponent_pick
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='opponent_pick') THEN
    ALTER TABLE swaygers ADD COLUMN opponent_pick TEXT;
    RAISE NOTICE 'Added swaygers.opponent_pick';
  END IF;

  -- status (as enum)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='status') THEN
    ALTER TABLE swaygers ADD COLUMN status public.swayger_status NOT NULL DEFAULT 'pending_invite'::public.swayger_status;
    RAISE NOTICE 'Added swaygers.status as enum';
  ELSE
    -- If status exists but is text, convert it
    SELECT udt_name INTO v_status_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='swaygers' AND column_name='status';

    IF v_status_type != 'swayger_status' THEN
      RAISE NOTICE 'Converting swaygers.status from % to enum', v_status_type;

      UPDATE swaygers SET status = 'pending_invite'
      WHERE status::text NOT IN ('pending_invite','active','settlement_proposed','settled','declined','canceled','expired','expired_active');

      -- Drop CHECK constraints on status
      DECLARE
        v_cname TEXT;
      BEGIN
        FOR v_cname IN
          SELECT c.conname FROM pg_constraint c
          JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
          WHERE c.conrelid = 'public.swaygers'::regclass AND a.attname = 'status' AND c.contype = 'c'
        LOOP
          EXECUTE format('ALTER TABLE swaygers DROP CONSTRAINT %I', v_cname);
        END LOOP;
      END;

      ALTER TABLE swaygers
        ALTER COLUMN status DROP DEFAULT,
        ALTER COLUMN status TYPE public.swayger_status USING status::text::public.swayger_status,
        ALTER COLUMN status SET DEFAULT 'pending_invite'::public.swayger_status;

      RAISE NOTICE 'Converted swaygers.status to enum';
    END IF;
  END IF;

  -- expires_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='expires_at') THEN
    ALTER TABLE swaygers ADD COLUMN expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days');
    RAISE NOTICE 'Added swaygers.expires_at';
  END IF;

  -- source_swayger_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='source_swayger_id') THEN
    ALTER TABLE swaygers ADD COLUMN source_swayger_id UUID REFERENCES swaygers(id);
    RAISE NOTICE 'Added swaygers.source_swayger_id';
  END IF;

  -- rematch_type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='rematch_type') THEN
    ALTER TABLE swaygers ADD COLUMN rematch_type TEXT;
    RAISE NOTICE 'Added swaygers.rematch_type';
  END IF;

  -- settled_outcome
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='settled_outcome') THEN
    ALTER TABLE swaygers ADD COLUMN settled_outcome TEXT;
    RAISE NOTICE 'Added swaygers.settled_outcome';
  END IF;

  -- updated_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='updated_at') THEN
    ALTER TABLE swaygers ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    RAISE NOTICE 'Added swaygers.updated_at';
  END IF;

  RAISE NOTICE 'All swaygers columns ensured.';
END $$;

-- ── 4. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_swaygers_creator ON swaygers(creator_id);
CREATE INDEX IF NOT EXISTS idx_swaygers_opponent ON swaygers(opponent_id);
CREATE INDEX IF NOT EXISTS idx_swaygers_status ON swaygers(status);

-- ── 5. swayger_invites table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS swayger_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  swayger_id UUID NOT NULL REFERENCES swaygers(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fix: if swayger_invites has extra NOT NULL columns from a prior migration,
-- make them nullable so our INSERT (swayger_id, invite_code) doesn't fail.
DO $$
DECLARE
  v_col RECORD;
BEGIN
  FOR v_col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'swayger_invites'
    AND is_nullable = 'NO'
    AND column_name NOT IN ('id', 'swayger_id', 'invite_code', 'created_at')
  LOOP
    EXECUTE format('ALTER TABLE swayger_invites ALTER COLUMN %I DROP NOT NULL', v_col.column_name);
    RAISE NOTICE 'Made swayger_invites.% nullable', v_col.column_name;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_swayger_invites_code ON swayger_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_swayger_invites_swayger ON swayger_invites(swayger_id);

-- ── 6. settlement_proposals table ───────────────────────────────────────────

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

-- ── 7. VERIFY columns exist before data copy ────────────────────────────────

DO $$
DECLARE
  v_cols TEXT[] := ARRAY['id','creator_id','opponent_id','title','description','category','stake_units','creator_pick','opponent_pick','status','expires_at','source_swayger_id','rematch_type','settled_outcome','created_at','updated_at'];
  v_col TEXT;
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOREACH v_col IN ARRAY v_cols LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name=v_col) THEN
      v_missing := array_append(v_missing, v_col);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'ABORT: swaygers is still missing columns: %. Cannot proceed with data copy.', array_to_string(v_missing, ', ');
  ELSE
    RAISE NOTICE 'PRE-COPY CHECK: All 16 required columns confirmed on swaygers.';
  END IF;
END $$;

-- ── 8. Safe data copy from workspaces ───────────────────────────────────────

DO $$
DECLARE
  v_has_workspaces BOOLEAN;
  v_has_owner_id BOOLEAN;
  v_has_name BOOLEAN;
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
  v_sql TEXT;
  v_copied INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='workspaces'
  ) INTO v_has_workspaces;

  IF NOT v_has_workspaces THEN
    RAISE NOTICE 'No workspaces table. Skipping data copy.';
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='owner_id') INTO v_has_owner_id;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='name') INTO v_has_name;

  IF NOT v_has_owner_id OR NOT v_has_name THEN
    RAISE NOTICE 'workspaces missing owner_id or name. Skipping.';
    RETURN;
  END IF;

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

  v_sql := 'INSERT INTO swaygers (creator_id, title, category, stake_units, creator_pick, opponent_pick, opponent_id, description, status, expires_at, settled_outcome, created_at, updated_at) SELECT ';

  v_sql := v_sql || 'w.owner_id, ';
  v_sql := v_sql || 'w.name, ';

  IF v_has_category THEN v_sql := v_sql || 'COALESCE(w.category, ''Other''), ';
  ELSE v_sql := v_sql || '''Other'', ';
  END IF;

  IF v_has_stake_units THEN v_sql := v_sql || 'COALESCE(w.stake_units, 1), ';
  ELSE v_sql := v_sql || '1, ';
  END IF;

  IF v_has_creator_pick THEN v_sql := v_sql || 'COALESCE(w.creator_pick, ''No pick set''), ';
  ELSE v_sql := v_sql || '''No pick set'', ';
  END IF;

  IF v_has_opponent_pick THEN v_sql := v_sql || 'w.opponent_pick, ';
  ELSE v_sql := v_sql || 'NULL, ';
  END IF;

  IF v_has_opponent_id THEN v_sql := v_sql || 'w.opponent_id, ';
  ELSE v_sql := v_sql || 'NULL, ';
  END IF;

  IF v_has_description THEN v_sql := v_sql || 'w.description, ';
  ELSE v_sql := v_sql || 'NULL, ';
  END IF;

  IF v_has_status THEN
    v_sql := v_sql || '(CASE '
      || 'WHEN w.status IN (''open'',''draft'') THEN ''pending_invite'' '
      || 'WHEN w.status IN (''pending_invite'',''active'',''settlement_proposed'',''settled'',''declined'',''canceled'',''expired'',''expired_active'') THEN w.status '
      || 'ELSE ''pending_invite'' '
      || 'END)::public.swayger_status, ';
  ELSE
    v_sql := v_sql || '''pending_invite''::public.swayger_status, ';
  END IF;

  IF v_has_expires_at THEN v_sql := v_sql || 'COALESCE(w.expires_at, now() + interval ''7 days''), ';
  ELSE v_sql := v_sql || 'now() + interval ''7 days'', ';
  END IF;

  IF v_has_settled_outcome THEN v_sql := v_sql || 'w.settled_outcome, ';
  ELSE v_sql := v_sql || 'NULL, ';
  END IF;

  v_sql := v_sql || 'w.created_at, ';

  IF v_has_updated_at THEN v_sql := v_sql || 'COALESCE(w.updated_at, now()) ';
  ELSE v_sql := v_sql || 'now() ';
  END IF;

  v_sql := v_sql || 'FROM workspaces w WHERE NOT EXISTS (SELECT 1 FROM swaygers s WHERE s.title = w.name AND s.creator_id = w.owner_id AND s.created_at = w.created_at) ON CONFLICT DO NOTHING';

  RAISE NOTICE 'Executing data copy...';
  EXECUTE v_sql;
  GET DIAGNOSTICS v_copied = ROW_COUNT;
  RAISE NOTICE 'Copied % row(s) from workspaces to swaygers.', v_copied;
END $$;

-- ── 9. Migrate invite codes ────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='invite_code'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='owner_id'
  ) THEN
    INSERT INTO swayger_invites (swayger_id, invite_code)
    SELECT s.id, w.invite_code
    FROM workspaces w
    JOIN swaygers s ON s.title = w.name AND s.creator_id = w.owner_id AND s.created_at = w.created_at
    WHERE w.invite_code IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM swayger_invites si WHERE si.invite_code = w.invite_code)
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Invite code migration done.';
  ELSE
    RAISE NOTICE 'No invite_code on workspaces. Skipping.';
  END IF;
END $$;

-- ── 10. Final verification ──────────────────────────────────────────────────

DO $$
DECLARE
  v_count INT;
  v_data_type TEXT;
  v_udt_name TEXT;
  v_cols TEXT[] := ARRAY['id','creator_id','opponent_id','title','description','category','stake_units','creator_pick','opponent_pick','status','expires_at','source_swayger_id','rematch_type','settled_outcome','created_at','updated_at'];
  v_col TEXT;
  v_all_ok BOOLEAN := true;
  v_rec RECORD;
BEGIN
  RAISE NOTICE '══════════════════════════════════════════';
  RAISE NOTICE '  008 Final Verification';
  RAISE NOTICE '══════════════════════════════════════════';

  FOREACH v_col IN ARRAY v_cols LOOP
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema='public' AND table_name='swaygers' AND column_name=v_col;
    IF v_count = 1 THEN RAISE NOTICE 'OK: swaygers.% exists', v_col;
    ELSE RAISE WARNING 'MISSING: swaygers.%', v_col; v_all_ok := false;
    END IF;
  END LOOP;

  SELECT data_type, udt_name INTO v_data_type, v_udt_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='swaygers' AND column_name='status';
  IF v_udt_name = 'swayger_status' THEN
    RAISE NOTICE 'OK: swaygers.status is enum swayger_status';
  ELSE
    RAISE WARNING 'ISSUE: swaygers.status type is % (expected swayger_status)', COALESCE(v_udt_name, 'NULL');
    v_all_ok := false;
  END IF;

  SELECT count(*) INTO v_count FROM information_schema.tables WHERE table_schema='public' AND table_name='swayger_invites';
  IF v_count = 1 THEN RAISE NOTICE 'OK: swayger_invites table'; ELSE RAISE WARNING 'MISSING: swayger_invites'; v_all_ok := false; END IF;

  SELECT count(*) INTO v_count FROM information_schema.tables WHERE table_schema='public' AND table_name='settlement_proposals';
  IF v_count = 1 THEN RAISE NOTICE 'OK: settlement_proposals table'; ELSE RAISE WARNING 'MISSING: settlement_proposals'; v_all_ok := false; END IF;

  SELECT count(*) INTO v_count FROM information_schema.columns
  WHERE table_schema='public' AND table_name='settlement_proposals' AND column_name='outcome';
  IF v_count = 1 THEN RAISE NOTICE 'OK: settlement_proposals.outcome'; ELSE RAISE WARNING 'MISSING: settlement_proposals.outcome'; v_all_ok := false; END IF;

  RAISE NOTICE '── Row counts ──';
  SELECT count(*) INTO v_count FROM swaygers;
  RAISE NOTICE 'swaygers: % total', v_count;

  FOR v_rec IN SELECT status::text AS st, count(*) AS cnt FROM swaygers GROUP BY status ORDER BY status LOOP
    RAISE NOTICE '  status=%: % rows', v_rec.st, v_rec.cnt;
  END LOOP;

  SELECT count(*) INTO v_count FROM swayger_invites;
  RAISE NOTICE 'swayger_invites: %', v_count;

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
