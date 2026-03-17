-- ============================================================
-- EMAIL BLAST RLS FIX — Run this in Supabase SQL Editor
-- ============================================================
-- Problem: the server uses the anon key, so RLS on `profiles`
--          blocks it from reading other users' notification_email.
-- Fix: SECURITY DEFINER RPC that returns id + email for all
--      profiles that have notification_email set.
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
    id,
    username,
    display_name,
    notification_email
  FROM profiles
  WHERE notification_email IS NOT NULL
    AND notification_email <> '';
$$;

GRANT EXECUTE ON FUNCTION get_all_notification_profiles() TO anon, authenticated;
