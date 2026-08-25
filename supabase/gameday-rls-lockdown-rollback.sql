-- Game Day direct table-access lockdown rollback
-- ---------------------------------------------------------------------------
-- Do not run this file as a generic rollback.
--
-- Before the forward migration, export the exact live policy/RLS/grant state
-- using the read-only audit SQL and replace the marked section below with that
-- captured state. The live database is authoritative; checked-in historical
-- migrations are not a substitute for the snapshot.
--
-- This file is deliberately a template until the live snapshot is attached.
-- It cannot restore unknown policy definitions safely.

BEGIN;

-- RESTORE-LIVE-SNAPSHOT-HERE
--
-- For every affected table, restore:
--   * the prior ALTER TABLE ... ENABLE/DISABLE ROW LEVEL SECURITY state
--   * the prior FORCE ROW LEVEL SECURITY state
--   * every prior CREATE POLICY definition
--   * every prior GRANT for anon, authenticated, PUBLIC, and service_role
--
-- Example only; do not execute without replacing it with the captured state:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gameday_rooms TO anon;
-- CREATE POLICY "gd_rooms_all" ON public.gameday_rooms
--   FOR ALL USING (true) WITH CHECK (true);

COMMIT;