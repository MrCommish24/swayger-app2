-- NFL Weekly Master Slate Admin Model
-- Apply in the Supabase SQL editor before using the admin endpoints.
--
-- This table stores reusable source content only. It is not a Game Day room
-- and must not receive participants, picks, leaderboard, or settlement rows.

BEGIN;

CREATE TABLE IF NOT EXISTS public.nfl_weekly_slate_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_year INTEGER NOT NULL CHECK (season_year > 0),
  week_number INTEGER NOT NULL CHECK (week_number > 0),
  slate_name TEXT NOT NULL,
  slate_label TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'published', 'archived')),
  early_matchups JSONB NOT NULL DEFAULT '[]'::jsonb,
  late_matchups JSONB NOT NULL DEFAULT '[]'::jsonb,
  sunday_night_teams JSONB NOT NULL DEFAULT '[]'::jsonb,
  qb_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  rb_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  receiver_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  early_qb_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  late_qb_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  early_rb_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  late_rb_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  early_receiver_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  late_receiver_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  team_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  game_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id UUID,
  created_by_email TEXT,
  approved_by_user_id UUID,
  approved_by_email TEXT,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(early_matchups) = 'array'),
  CHECK (jsonb_typeof(late_matchups) = 'array'),
  CHECK (jsonb_typeof(sunday_night_teams) = 'array'),
  CHECK (jsonb_typeof(qb_candidates) = 'array'),
  CHECK (jsonb_typeof(rb_candidates) = 'array'),
  CHECK (jsonb_typeof(receiver_candidates) = 'array'),
  CHECK (jsonb_typeof(early_qb_candidates) = 'array'),
  CHECK (jsonb_typeof(late_qb_candidates) = 'array'),
  CHECK (jsonb_typeof(early_rb_candidates) = 'array'),
  CHECK (jsonb_typeof(late_rb_candidates) = 'array'),
  CHECK (jsonb_typeof(early_receiver_candidates) = 'array'),
  CHECK (jsonb_typeof(late_receiver_candidates) = 'array'),
  CHECK (jsonb_typeof(team_candidates) = 'array'),
  CHECK (jsonb_typeof(game_candidates) = 'array')
);

-- Archived templates do not block a replacement for the same NFL week.
CREATE UNIQUE INDEX IF NOT EXISTS nfl_weekly_slate_templates_active_week_idx
  ON public.nfl_weekly_slate_templates (season_year, week_number)
  WHERE status <> 'archived';

CREATE INDEX IF NOT EXISTS nfl_weekly_slate_templates_status_idx
  ON public.nfl_weekly_slate_templates (status);

COMMENT ON TABLE public.nfl_weekly_slate_templates IS
  'Admin-curated NFL Sunday Slate source content; publishing into Game Day rooms is a later operation.';

-- Admin routes use the service-role backend after checking MM_ADMIN_TOKEN.
ALTER TABLE public.nfl_weekly_slate_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nfl_weekly_slate_templates FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nfl_weekly_slate_templates TO service_role;

COMMIT;