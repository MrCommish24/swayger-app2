-- Fix: get_all_notification_profiles() now falls back to auth.users.email
-- when profiles.notification_email is not explicitly set.
--
-- Context: Supabase Auth stores every user's signup email in auth.users.email.
-- The profiles.notification_email column is a custom field users set in-app.
-- Users who never set it explicitly were being skipped by the blast system
-- even though they have a valid signup email.
--
-- Run this in Supabase SQL Editor. Safe to re-run (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION get_all_notification_profiles()
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
    COALESCE(NULLIF(p.notification_email, ''), u.email::text) AS notification_email,
    COALESCE(p.email_unsubscribed, false) AS email_unsubscribed
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE COALESCE(NULLIF(p.notification_email, ''), u.email) IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION get_all_notification_profiles() TO anon;

-- Also update get_mm_profile_data to include the resolved email for dry-run accuracy
CREATE OR REPLACE FUNCTION get_mm_profile_data(user_ids uuid[])
RETURNS TABLE(
  id                    uuid,
  username              text,
  display_name          text,
  notification_email    text,
  email_unsubscribed    boolean,
  paid_2x_round         text,
  referral_reward_round text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    p.id,
    p.username::text,
    p.display_name::text,
    COALESCE(NULLIF(p.notification_email, ''), u.email::text) AS notification_email,
    COALESCE(p.email_unsubscribed, false) AS email_unsubscribed,
    p.paid_2x_round::text,
    p.referral_reward_round::text
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = ANY(user_ids);
$$;

GRANT EXECUTE ON FUNCTION get_mm_profile_data(uuid[]) TO anon;
