-- Manual grant: dgrand2 paid $5 for the Elite 8 2X boost on 2026-03-28 but
-- the server-side redirect handler used the anon key (no JWT) so Supabase RLS
-- silently blocked the profiles UPDATE.
--
-- Run this in the Supabase SQL Editor to grant the boost and then re-score.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Grant the boost
UPDATE profiles
SET paid_2x_round = 'elite-8'
WHERE username = 'dgrand2'
  AND paid_2x_round IS NULL;

-- 2. Verify
SELECT id, username, paid_2x_round, referral_reward_round
FROM profiles
WHERE username = 'dgrand2';

-- ─────────────────────────────────────────────────────────────────────────────
-- After running the above, trigger a re-score via the admin API:
--   POST /admin/mm/api/score
--   Header: x-admin-token: MySwayger24!!
-- Or call it from the leaderboard admin screen.
-- ─────────────────────────────────────────────────────────────────────────────
