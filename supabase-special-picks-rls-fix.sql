-- Fix: scoring and admin queries can't read mm_special_picks because RLS restricts
-- reads to auth.uid() = user_id. Create a SECURITY DEFINER function so the backend
-- (anon key, no JWT) can read all picks for scoring and debug purposes.

CREATE OR REPLACE FUNCTION get_all_mm_special_picks()
RETURNS TABLE (
  user_id     uuid,
  round_id    text,
  pick_type   text,
  matchup_id  text,
  picked_team text,
  points_multiplier numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    user_id,
    round_id,
    pick_type,
    matchup_id,
    picked_team,
    points_multiplier
  FROM mm_special_picks
  ORDER BY created_at DESC;
$$;

-- Grant execute to anon and authenticated so the backend can call it
GRANT EXECUTE ON FUNCTION get_all_mm_special_picks() TO anon, authenticated;
