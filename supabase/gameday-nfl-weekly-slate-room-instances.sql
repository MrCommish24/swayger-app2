-- NFL Weekly Master Slate -> Discord Game Day room instances.
-- Apply after:
--   gameday-migration.sql
--   gameday-discord-migration.sql
--   gameday-nfl-sunday-slate-v1-migration.sql
--   gameday-nfl-weekly-master-slate.sql
--   gameday-discord-nfl-slate-subscriptions-migration.sql
--
-- This table stores post-ready delivery data only. It does not post to
-- Discord, capture Discord message IDs, settle picks, or create receipts.

BEGIN;

CREATE TABLE IF NOT EXISTS public.nfl_weekly_slate_room_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_slate_id UUID NOT NULL
    REFERENCES public.nfl_weekly_slate_templates(id) ON DELETE RESTRICT,
  gameday_room_id UUID NOT NULL
    REFERENCES public.gameday_rooms(id) ON DELETE CASCADE,
  room_code TEXT,
  room_url TEXT NOT NULL,
  discord_guild_id TEXT NOT NULL,
  discord_channel_id TEXT NOT NULL,
  discord_channel_name TEXT,
  receipt_channel_id TEXT,
  receipt_channel_name TEXT,
  reward_text TEXT NOT NULL DEFAULT 'Bragging rights and receipts.',
  status TEXT NOT NULL DEFAULT 'post_ready'
    CHECK (status IN ('created', 'post_ready', 'posted', 'failed', 'archived')),
  post_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  discord_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  CONSTRAINT nfl_weekly_slate_room_instances_slate_guild_unique
    UNIQUE (master_slate_id, discord_guild_id),
  CONSTRAINT nfl_weekly_slate_room_instances_payload_object_check
    CHECK (jsonb_typeof(post_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS nfl_weekly_slate_room_instances_slate_idx
  ON public.nfl_weekly_slate_room_instances (master_slate_id);
CREATE INDEX IF NOT EXISTS nfl_weekly_slate_room_instances_guild_idx
  ON public.nfl_weekly_slate_room_instances (discord_guild_id);
CREATE INDEX IF NOT EXISTS nfl_weekly_slate_room_instances_status_idx
  ON public.nfl_weekly_slate_room_instances (status);

COMMENT ON TABLE public.nfl_weekly_slate_room_instances IS
  'Private Game Day room instances and Discord post-ready payloads for published NFL weekly slates; delivery is handled separately.';

ALTER TABLE public.nfl_weekly_slate_room_instances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nfl_weekly_slate_room_instances FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nfl_weekly_slate_room_instances TO service_role;

COMMIT;

-- Supabase normally detects DDL automatically; notify PostgREST explicitly so
-- the new table is available to the live focused suite immediately.
NOTIFY pgrst, 'reload schema';