-- ============================================================
-- Swayger Referral System — Run once in Supabase SQL Editor
-- Dashboard → SQL Editor → New query → paste all → Run
-- ============================================================

-- 1. Add referral columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code       varchar(10)  UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by         uuid         REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_reward_round varchar(30);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_reward_claimed boolean NOT NULL DEFAULT false;

-- 2. Backfill referral_code for all existing profiles
-- Uses 8-char uppercase alphanumeric, no ambiguous chars (0/O/1/I)
UPDATE profiles
SET referral_code = upper(
  translate(
    substring(md5(random()::text || id::text), 1, 10),
    'abcdefghijklmnopqrstuvwxyz01',
    'ABCDEFGHJKLMNPQRSTUVWXYZ23'
  )
)
WHERE referral_code IS NULL;

-- 3. Ensure uniqueness index
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_idx ON profiles(referral_code);

-- ============================================================
-- 4. RPC: record_mm_referral(new_user_id, referral_code_in)
--    Called after a new user signs up via a referral link.
--    Writes referred_by to the new user's profile.
--    Guards: no self-referral, no double-recording.
-- ============================================================
CREATE OR REPLACE FUNCTION record_mm_referral(
  new_user_id uuid,
  referral_code_in text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referrer profiles%ROWTYPE;
  already_referred boolean;
BEGIN
  SELECT * INTO referrer FROM profiles WHERE referral_code = upper(trim(referral_code_in));
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Invalid referral code');
  END IF;

  IF referrer.id = new_user_id THEN
    RETURN json_build_object('ok', false, 'error', 'Self-referral not allowed');
  END IF;

  SELECT (referred_by IS NOT NULL) INTO already_referred FROM profiles WHERE id = new_user_id;
  IF already_referred THEN
    RETURN json_build_object('ok', false, 'error', 'Already referred');
  END IF;

  UPDATE profiles SET referred_by = referrer.id WHERE id = new_user_id;

  RETURN json_build_object(
    'ok', true,
    'referrer_id', referrer.id,
    'referrer_username', referrer.username
  );
END;
$$;

-- ============================================================
-- 5. RPC: unlock_referral_reward(referred_user_id, reward_round)
--    Called after a referred user submits their first pick.
--    Sets referral_reward_round on the referrer (one-time only).
-- ============================================================
CREATE OR REPLACE FUNCTION unlock_referral_reward(
  referred_user_id uuid,
  reward_round text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referrer_id uuid;
  rows_updated integer;
BEGIN
  SELECT referred_by INTO referrer_id FROM profiles WHERE id = referred_user_id;

  IF referrer_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'User has no referrer');
  END IF;

  UPDATE profiles
  SET referral_reward_round = reward_round,
      referral_reward_claimed = true
  WHERE id = referrer_id AND referral_reward_claimed = false;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  RETURN json_build_object('ok', true, 'reward_granted', rows_updated > 0);
END;
$$;

-- ============================================================
-- Useful analytics queries
-- ============================================================

-- Total referrals recorded
-- SELECT COUNT(*) FROM profiles WHERE referred_by IS NOT NULL;

-- Referrers who earned a reward
-- SELECT p.username, p.referral_reward_round FROM profiles p WHERE p.referral_reward_claimed = true;

-- Referred users who have made picks (reward unlock candidates)
-- SELECT p.id, p.username, p.referred_by, COUNT(s.id) as pick_count
-- FROM profiles p
-- JOIN mm_special_picks s ON s.user_id = p.id
-- WHERE p.referred_by IS NOT NULL
-- GROUP BY p.id, p.username, p.referred_by;
