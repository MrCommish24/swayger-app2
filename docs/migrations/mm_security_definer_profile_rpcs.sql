-- PURPOSE: The server uses the Supabase anon key (no user JWT) for admin/scoring
-- operations. The profiles table's SELECT RLS blocks the anon key, causing:
--   (a) Leaderboard usernames all showing as "?"
--   (b) paid_2x_round / referral_reward_round not readable → 2X boost never applied in scoring
--
-- FIX: Two SECURITY DEFINER RPCs that run as the postgres superuser (bypasses RLS).
--
-- Run in the Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. get_mm_profile_data(user_ids)
--    Used by the leaderboard admin to resolve usernames for a set of user IDs.
CREATE OR REPLACE FUNCTION get_mm_profile_data(user_ids uuid[])
RETURNS TABLE(
  id               uuid,
  username         text,
  display_name     text,
  paid_2x_round    text,
  referral_reward_round text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    username::text,
    display_name::text,
    paid_2x_round::text,
    referral_reward_round::text
  FROM profiles
  WHERE id = ANY(user_ids);
$$;

-- 2. get_mm_boost_users()
--    Used by the scoring engine to find all users who have a 2X boost active
--    (either from a referral reward or a paid upgrade).
CREATE OR REPLACE FUNCTION get_mm_boost_users()
RETURNS TABLE(
  id                    uuid,
  paid_2x_round         text,
  referral_reward_round text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    paid_2x_round::text,
    referral_reward_round::text
  FROM profiles
  WHERE paid_2x_round IS NOT NULL
     OR referral_reward_round IS NOT NULL;
$$;

-- Grant execution to the anon role so the server can call them without a user JWT.
GRANT EXECUTE ON FUNCTION get_mm_profile_data(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION get_mm_boost_users()         TO anon;
