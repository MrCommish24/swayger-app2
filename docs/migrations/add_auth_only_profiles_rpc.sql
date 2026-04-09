-- add_auth_only_profiles_rpc.sql
-- Adds get_auth_only_profiles() — returns ONLY users who have NO explicit
-- notification_email set, but DO have an auth signup email.
-- Used by catch-up blasts to reach users missed by the first send
-- (which only reached users with notification_email explicitly set).
--
-- Run AFTER fix_notification_email_fallback.sql.
-- Safe to re-run (DROP IF EXISTS + CREATE OR REPLACE).

DROP FUNCTION IF EXISTS get_auth_only_profiles();
CREATE OR REPLACE FUNCTION get_auth_only_profiles()
RETURNS TABLE (
  id                  uuid,
  username            text,
  display_name        text,
  notification_email  text,
  email_unsubscribed  boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    p.id,
    p.username::text,
    p.display_name::text,
    u.email::text AS notification_email,
    COALESCE(p.email_unsubscribed, false) AS email_unsubscribed
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE (p.notification_email IS NULL OR p.notification_email = '')
    AND u.email IS NOT NULL
    AND u.email != ''
    AND COALESCE(p.email_unsubscribed, false) = false;
$$;

GRANT EXECUTE ON FUNCTION get_auth_only_profiles() TO anon;
