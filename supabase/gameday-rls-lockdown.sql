-- Game Day direct table-access lockdown
-- ---------------------------------------------------------------------------
-- PRECONDITION:
--   1. Run the read-only policy/grant inventory from the audit note in the
--      Supabase SQL Editor.
--   2. Save the exact live policy, RLS-state, and table-grant results as the
--      rollback artifact before applying this file.
--
-- This file is intentionally not executed by application startup.
-- Express routes use the service-role client and remain the public participant
-- interface. The browser must not query these tables directly.
--
-- The settlement-operations table is optional in the current deployment. If
-- it is absent, this migration reports a notice and continues because there is
-- no table to expose.
--
-- Apply only after the committed pre-change regression suite passes.

BEGIN;

DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT *
    FROM (
      VALUES
        ('public.gameday_rooms'::text, 'gd_rooms_all'::text),
        ('public.gameday_pick_cards'::text, 'gd_cards_all'::text),
        ('public.gameday_props'::text, 'gd_props_all'::text),
        ('public.gameday_participants'::text, 'gd_participants_all'::text),
        ('public.gameday_picks'::text, 'gd_picks_all'::text),
        ('public.gameday_final_standings'::text, 'gd_standings_all'::text),
        ('public.gameday_events'::text, 'gd_events_all'::text),
        ('public.gameday_prop_library'::text, 'gd_prop_library_all'::text),
        ('public.gameday_next_room_interest'::text, NULL::text),
        ('public.gameday_email_sends'::text, NULL::text),
        ('public.gameday_settlement_operations'::text, NULL::text)
    ) AS listed(table_name, policy_name)
  LOOP
    IF to_regclass(target.table_name) IS NULL THEN
      RAISE NOTICE 'Game Day table % is absent; skipping it', target.table_name;
      CONTINUE;
    END IF;

    -- No browser role needs direct table access. service_role has its own
    -- privileges and bypasses RLS; PUBLIC is revoked defensively as well.
    EXECUTE format(
      'REVOKE ALL ON TABLE %s FROM anon, authenticated, PUBLIC',
      target.table_name
    );
    EXECUTE format(
      'GRANT ALL PRIVILEGES ON TABLE %s TO service_role',
      target.table_name
    );

    -- Keep RLS enabled even on tables that have no browser policies. With no
    -- policies and no browser grants, anon/authenticated cannot access rows.
    EXECUTE format(
      'ALTER TABLE %s ENABLE ROW LEVEL SECURITY',
      target.table_name
    );

    IF target.policy_name IS NOT NULL THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %s',
        target.policy_name,
        target.table_name
      );
    END IF;
  END LOOP;
END
$$;

COMMIT;