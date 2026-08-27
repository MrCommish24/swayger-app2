-- Discord NFL Sunday Slate subscriptions — configuration only.
-- Apply after the existing Game Day Discord migrations.
--
-- This table is intentionally not exposed to anon/authenticated roles.
-- The Game Day backend uses the service-role client after validating the
-- shared Discord bot credential and the guild boundary.

BEGIN;

CREATE TABLE IF NOT EXISTS public.discord_gameday_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_guild_id TEXT NOT NULL,
  discord_guild_name TEXT,
  game_day_channel_id TEXT NOT NULL,
  game_day_channel_name TEXT NOT NULL,
  receipt_channel_id TEXT,
  receipt_channel_name TEXT,
  reward_text TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'disabled')),
  configured_by_discord_user_id TEXT,
  configured_by_discord_user_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT discord_gameday_subscriptions_guild_unique
    UNIQUE (discord_guild_id)
);

CREATE INDEX IF NOT EXISTS discord_gameday_subscriptions_status_idx
  ON public.discord_gameday_subscriptions (status);

COMMENT ON TABLE public.discord_gameday_subscriptions IS
  'Bot-managed Discord NFL Sunday Slate configuration; it does not publish rooms or settle picks.';

-- Defense in depth: direct browser clients cannot read or write subscription
-- configuration. service_role is used only by the authenticated backend route.
ALTER TABLE public.discord_gameday_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.discord_gameday_subscriptions FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.discord_gameday_subscriptions TO service_role;

COMMIT;