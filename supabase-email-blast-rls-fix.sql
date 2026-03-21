-- ============================================================
-- EMAIL BLAST RLS FIX — Run this in Supabase SQL Editor
-- ============================================================
-- Problem: the server uses the anon key, so RLS on `profiles`
--          blocks it from reading other users' notification_email.
--          Additionally, users who signed up before the backfill
--          may have notification_email = NULL despite having a
--          valid auth.users email.
-- Fix: SECURITY DEFINER RPC that joins auth.users and uses
--      COALESCE(notification_email, auth email) so ALL users
--      with a valid email are included in blasts.
-- ============================================================

CREATE OR REPLACE FUNCTION get_all_notification_profiles()
RETURNS TABLE (
  id                 UUID,
  username           TEXT,
  display_name       TEXT,
  notification_email TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.username,
    p.display_name,
    COALESCE(p.notification_email, u.email) AS notification_email
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE COALESCE(p.notification_email, u.email) IS NOT NULL
    AND COALESCE(p.notification_email, u.email) <> '';
$$;

GRANT EXECUTE ON FUNCTION get_all_notification_profiles() TO anon, authenticated;
