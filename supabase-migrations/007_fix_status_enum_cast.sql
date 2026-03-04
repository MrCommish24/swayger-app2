-- ============================================================================
-- 007: Fix status enum cast + re-run safe data copy from workspaces
-- Ensures swayger_status enum exists, swaygers.status uses it,
-- and the workspaces->swaygers copy casts status strings correctly.
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

-- ── 2. Convert swaygers.status from text to enum if needed ──────────────────

DO $$
DECLARE
  v_data_type TEXT;
BEGIN
  SELECT data_type INTO v_data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'swaygers' AND column_name = 'status';

  IF v_data_type IS NULL THEN
    RAISE NOTICE 'swaygers.status column not found — will be added below';
  ELSIF v_data_type = 'USER-DEFINED' THEN
    RAISE NOTICE 'swaygers.status is already enum type, no conversion needed';
  ELSE
    RAISE NOTICE 'swaygers.status is %, converting to swayger_status enum', v_data_type;

    -- First normalize any legacy values to valid enum values
    UPDATE swaygers SET status = 'pending_invite'
    WHERE status NOT IN ('pending_invite','active','settlement_proposed','settled','declined','canceled','expired','expired_active');

    UPDATE swaygers SET status = 'pending_invite' WHERE status IS NULL;

    -- Drop any CHECK constraint on status
    DECLARE
      v_constraint_name TEXT;
    BEGIN
      FOR v_constraint_name IN
        SELECT c.conname FROM pg_constraint c
        JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
        WHERE c.conrelid = 'public.swaygers'::regclass
        AND a.attname = 'status'
        AND c.contype = 'c'
      LOOP
        EXECUTE format('ALTER TABLE swaygers DROP CONSTRAINT %I', v_constraint_name);
        RAISE NOTICE 'Dropped CHECK constraint % on swaygers.status', v_constraint_name;
      END LOOP;
    END;

    -- Alter column type
    ALTER TABLE swaygers
      ALTER COLUMN status DROP DEFAULT,
      ALTER COLUMN status TYPE public.swayger_status USING status::public.swayger_status,
      ALTER COLUMN status SET DEFAULT 'pending_invite'::public.swayger_status;

    RAISE NOTICE 'Converted swaygers.status to enum type';
  END IF;
END $$;

-- ── 3. Ensure swaygers.status column exists as enum ─────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='swaygers' AND column_name='status') THEN
    ALTER TABLE swaygers ADD COLUMN status public.swayger_status NOT NULL DEFAULT 'pending_invite'::public.swayger_status;
    RAISE NOTICE 'Added swaygers.status column as enum';
  END IF;
END $$;

-- ── 4. Safe data copy from workspaces (with enum cast) ──────────────────────

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
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workspaces'
  ) INTO v_has_workspaces;

  IF NOT v_has_workspaces THEN
    RAISE NOTICE 'No workspaces table found. Skipping data copy.';
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='owner_id') INTO v_has_owner_id;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='name') INTO v_has_name;

  IF NOT v_has_owner_id OR NOT v_has_name THEN
    RAISE NOTICE 'workspaces missing owner_id or name. Skipping data copy.';
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

  IF v_has_category THEN
    v_sql := v_sql || 'COALESCE(w.category, ''Other''), ';
  ELSE
    v_sql := v_sql || '''Other'', ';
  END IF;

  IF v_has_stake_units THEN
    v_sql := v_sql || 'COALESCE(w.stake_units, 1), ';
  ELSE
    v_sql := v_sql || '1, ';
  END IF;

  IF v_has_creator_pick THEN
    v_sql := v_sql || 'COALESCE(w.creator_pick, ''No pick set''), ';
  ELSE
    v_sql := v_sql || '''No pick set'', ';
  END IF;

  IF v_has_opponent_pick THEN
    v_sql := v_sql || 'w.opponent_pick, ';
  ELSE
    v_sql := v_sql || 'NULL, ';
  END IF;

  IF v_has_opponent_id THEN
    v_sql := v_sql || 'w.opponent_id, ';
  ELSE
    v_sql := v_sql || 'NULL, ';
  END IF;

  IF v_has_description THEN
    v_sql := v_sql || 'w.description, ';
  ELSE
    v_sql := v_sql || 'NULL, ';
  END IF;

  -- Status with CASE mapping + enum cast
  IF v_has_status THEN
    v_sql := v_sql || '(CASE '
      || 'WHEN w.status IN (''open'',''draft'') THEN ''pending_invite'' '
      || 'WHEN w.status IN (''pending_invite'',''active'',''settlement_proposed'',''settled'',''declined'',''canceled'',''expired'',''expired_active'') THEN w.status '
      || 'ELSE ''pending_invite'' '
      || 'END)::public.swayger_status, ';
  ELSE
    v_sql := v_sql || '''pending_invite''::public.swayger_status, ';
  END IF;

  IF v_has_expires_at THEN
    v_sql := v_sql || 'COALESCE(w.expires_at, now() + interval ''7 days''), ';
  ELSE
    v_sql := v_sql || 'now() + interval ''7 days'', ';
  END IF;

  IF v_has_settled_outcome THEN
    v_sql := v_sql || 'w.settled_outcome, ';
  ELSE
    v_sql := v_sql || 'NULL, ';
  END IF;

  v_sql := v_sql || 'w.created_at, ';

  IF v_has_updated_at THEN
    v_sql := v_sql || 'COALESCE(w.updated_at, now()) ';
  ELSE
    v_sql := v_sql || 'now() ';
  END IF;

  v_sql := v_sql || 'FROM workspaces w WHERE NOT EXISTS (SELECT 1 FROM swaygers s WHERE s.title = w.name AND s.creator_id = w.owner_id AND s.created_at = w.created_at) ON CONFLICT DO NOTHING';

  RAISE NOTICE 'Running data copy with enum cast...';
  RAISE NOTICE 'SQL: %', v_sql;
  EXECUTE v_sql;
  GET DIAGNOSTICS v_copied = ROW_COUNT;
  RAISE NOTICE 'Copied % rows from workspaces to swaygers.', v_copied;
END $$;

-- ── 5. Migrate invite codes (same as 006) ───────────────────────────────────

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
    RAISE NOTICE 'No invite_code on workspaces. Skipping invite migration.';
  END IF;
END $$;

-- ── 6. Verification ─────────────────────────────────────────────────────────

DO $$
DECLARE
  v_data_type TEXT;
  v_udt_name TEXT;
  v_count INT;
  v_status_val RECORD;
BEGIN
  RAISE NOTICE '══════════════════════════════════════════';
  RAISE NOTICE '  007 Verification';
  RAISE NOTICE '══════════════════════════════════════════';

  -- Check swaygers.status data type
  SELECT data_type, udt_name INTO v_data_type, v_udt_name
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'swaygers' AND column_name = 'status';

  IF v_data_type IS NOT NULL THEN
    RAISE NOTICE 'swaygers.status data_type=% udt_name=%', v_data_type, v_udt_name;
    IF v_udt_name = 'swayger_status' THEN
      RAISE NOTICE 'OK: swaygers.status is enum swayger_status';
    ELSE
      RAISE WARNING 'ISSUE: swaygers.status is not swayger_status enum (got %)', v_udt_name;
    END IF;
  ELSE
    RAISE WARNING 'MISSING: swaygers.status column not found';
  END IF;

  -- Row counts by status
  RAISE NOTICE '── Rows by status ──';
  FOR v_status_val IN
    SELECT status::text AS st, count(*) AS cnt FROM swaygers GROUP BY status ORDER BY status
  LOOP
    RAISE NOTICE '  %: % rows', v_status_val.st, v_status_val.cnt;
  END LOOP;

  SELECT count(*) INTO v_count FROM swaygers;
  RAISE NOTICE 'Total swaygers: %', v_count;

  SELECT count(*) INTO v_count FROM swayger_invites;
  RAISE NOTICE 'Total swayger_invites: %', v_count;

  RAISE NOTICE '══════════════════════════════════════════';
  RAISE NOTICE '  007 Verification complete';
  RAISE NOTICE '══════════════════════════════════════════';
END $$;
