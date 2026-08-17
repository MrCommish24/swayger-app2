-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 5.2.3 — Recovery Token Security Correction
-- File: supabase/gameday-fantasy-phase5-2-3-recovery-security-fix.sql
--
-- Apply manually in Supabase SQL Editor AFTER the primary migration.
-- STOP — do not auto-apply.
-- https://app.supabase.com/project/vlxvoienyxzhyaiimccp/sql/new
--
-- WHY THIS CORRECTION IS NEEDED:
--
-- The primary migration applied a permissive FOR ALL USING (true) RLS policy
-- because all other Fantasy tables use that pattern. But other Fantasy tables
-- are only reachable through the service-role server; no client bypasses them.
--
-- Post-migration verification confirmed:
--   • anon can SELECT recovery token rows (HTTP 200 — returns empty array)
--   • anon DELETE succeeds (HTTP 204) — can delete any row by ID
--   • INSERT only blocked by FK violation, not privilege
--   • anon can directly call all three SECURITY DEFINER RPCs:
--       - redeem_member_recovery_token: blocked only by "token_not_found",
--         not by privilege — passing a valid pending token_hash + any UUID
--         as p_redeeming_user_id would succeed (identity spoofing)
--       - create_member_recovery_token: same — blocked only by business logic
--
-- DESIRED SECURITY ARCHITECTURE:
--   • fantasy_member_recovery_tokens is accessible ONLY via:
--       1. service_role server routes (which verify JWT / commissioner auth first)
--       2. SECURITY DEFINER RPCs (which bypass RLS as function owner)
--   • anon and authenticated roles must NOT directly:
--       SELECT / INSERT / UPDATE / DELETE any row
--       EXECUTE any of the three recovery RPCs
--
-- WHAT THIS CORRECTION DOES:
--   1. DROPs the permissive FOR ALL USING (true) policy
--      → No policy + RLS enabled = deny-all for non-bypassing roles (defense in depth)
--   2. REVOKEs ALL table privileges from anon and authenticated
--      → Cannot be re-opened by policy alone
--   3. REVOKEs EXECUTE from PUBLIC on all three recovery RPCs
--      → Removes the default PUBLIC grant added at function creation time
--
-- WHAT IS NOT CHANGED:
--   • service_role retains full table access (BYPASSRLS + superuser privileges)
--   • SECURITY DEFINER RPCs run as the function owner (postgres), which has
--     BYPASSRLS — they can still read/write the table internally
--   • No other Fantasy tables are touched
--   • No existing data is changed
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop the permissive RLS policy
--
-- With RLS still ENABLED but no policy, PostgreSQL denies all access to
-- non-BYPASSRLS roles (anon, authenticated). service_role has BYPASSRLS
-- so it is unaffected. SECURITY DEFINER functions run as postgres (BYPASSRLS)
-- so they are also unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "fantasy_member_recovery_tokens_all"
  ON public.fantasy_member_recovery_tokens;

-- RLS remains ENABLED — no DISABLE ROW LEVEL SECURITY here.


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Revoke direct table privileges from anon and authenticated
--
-- In Supabase, the public schema grants USAGE to anon/authenticated, and new
-- tables inherit SELECT/INSERT/UPDATE/DELETE by default. These explicit REVOKEs
-- remove those inherited grants for this specific table.
--
-- service_role is not affected (it bypasses all privilege checks).
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE public.fantasy_member_recovery_tokens FROM anon;
REVOKE ALL ON TABLE public.fantasy_member_recovery_tokens FROM authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Revoke EXECUTE on all three recovery RPCs from PUBLIC
--
-- By default PostgreSQL grants EXECUTE to PUBLIC when a function is created.
-- REVOKE from PUBLIC removes it from anon and authenticated (both are members
-- of PUBLIC). service_role and postgres retain EXECUTE regardless.
--
-- This prevents clients from calling these RPCs directly via PostgREST, which
-- would allow:
--   • Spoofing p_redeeming_user_id on redeem_member_recovery_token
--   • Spoofing p_created_by_user_id on create_member_recovery_token
--   • Calling revoke_member_recovery_token without commissioner verification
--
-- The server calls these RPCs using the service_role key after verifying
-- commissioner authority / JWT identity in the route handler — that path
-- is unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE
  ON FUNCTION public.create_member_recovery_token(
    UUID,        -- p_league_id
    UUID,        -- p_season_id
    UUID,        -- p_league_member_id
    UUID,        -- p_created_by_user_id
    TEXT,        -- p_token_hash
    TIMESTAMPTZ  -- p_expires_at
  )
  FROM PUBLIC;

REVOKE EXECUTE
  ON FUNCTION public.redeem_member_recovery_token(
    TEXT,        -- p_token_hash
    UUID         -- p_redeeming_user_id
  )
  FROM PUBLIC;

REVOKE EXECUTE
  ON FUNCTION public.revoke_member_recovery_token(
    UUID         -- p_league_member_id
  )
  FROM PUBLIC;


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES
--
-- Run these immediately after applying to confirm the correction took effect.
-- ─────────────────────────────────────────────────────────────────────────────

-- A. Table privileges for anon and authenticated (should show no rows / no grants):
SELECT grantee, privilege_type, is_grantable
FROM   information_schema.role_table_grants
WHERE  table_schema = 'public'
  AND  table_name   = 'fantasy_member_recovery_tokens'
  AND  grantee IN ('anon', 'authenticated');
-- Expected: 0 rows

-- B. RPC execute grants (should show no rows for anon/authenticated/PUBLIC):
SELECT grantee, routine_name, privilege_type
FROM   information_schema.role_routine_grants
WHERE  routine_schema = 'public'
  AND  routine_name IN (
         'create_member_recovery_token',
         'redeem_member_recovery_token',
         'revoke_member_recovery_token'
       )
  AND  grantee NOT IN ('postgres', 'supabase_admin', 'service_role');
-- Expected: 0 rows (or only rows for roles you explicitly granted)

-- C. RLS policy list (should be empty — deny-all):
SELECT policyname, cmd, roles
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename  = 'fantasy_member_recovery_tokens';
-- Expected: 0 rows

-- D. Confirm RLS is still enabled:
SELECT relname, relrowsecurity
FROM   pg_class
WHERE  relname = 'fantasy_member_recovery_tokens'
  AND  relnamespace = 'public'::regnamespace;
-- Expected: relrowsecurity = true
