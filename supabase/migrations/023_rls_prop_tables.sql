-- Migration: Enable RLS on prop_nights and prop_user_picks
-- These tables were publicly accessible via the anon key.
-- The server now uses the service role key (bypasses RLS),
-- so these policies only affect direct anon/user-scoped access.

-- ─── prop_nights ─────────────────────────────────────────────
-- Public read: anyone (authenticated or not) can see prop nights
-- and their props. No user data is stored here.
-- Writes: blocked for all non-service-role callers.

ALTER TABLE public.prop_nights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prop_nights: public read"
  ON public.prop_nights
  FOR SELECT
  USING (true);

-- ─── prop_user_picks ─────────────────────────────────────────
-- Users can only read their own picks.
-- The leaderboard aggregates are served by the Express API
-- (which uses the service role key), so no cross-user SELECT
-- policy is needed here.
-- Writes: blocked for all non-service-role callers.

ALTER TABLE public.prop_user_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prop_user_picks: users read own picks"
  ON public.prop_user_picks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
