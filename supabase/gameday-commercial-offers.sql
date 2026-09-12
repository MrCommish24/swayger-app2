-- Swayger Commercial Offers
-- Additive, admin-controlled affiliate offer workflow.
-- Apply this migration to the development Supabase project before using the
-- commercial assignment write actions. Production schema changes are applied
-- through the normal publish migration flow.

BEGIN;

CREATE TABLE IF NOT EXISTS public.swayger_commercial_offers (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                  TEXT NOT NULL,
  source_resource_type      TEXT NOT NULL CHECK (source_resource_type IN ('deal', 'ad')),
  source_external_id        TEXT,
  program_id                TEXT,
  program_name              TEXT,
  brand_id                  TEXT,
  brand_name                TEXT,
  title                     TEXT NOT NULL,
  description               TEXT,
  availability              TEXT,
  tracking_url              TEXT,
  landing_page_url          TEXT,
  creative_url              TEXT,
  creative_type             TEXT,
  creative_width            INTEGER,
  creative_height           INTEGER,
  promo_code                TEXT,
  discount_type             TEXT,
  discount_amount           NUMERIC,
  discount_currency         TEXT,
  discount_percent          NUMERIC,
  minimum_purchase_amount   NUMERIC,
  maximum_savings_amount    NUMERIC,
  start_at                  TIMESTAMPTZ,
  end_at                    TIMESTAMPTZ,
  source_updated_at         TIMESTAMPTZ,
  disclosure                TEXT NOT NULL DEFAULT 'Affiliate disclosure: Swayger may earn a commission if you use this link.',
  status                    TEXT NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'archived')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.swayger_commercial_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id       UUID NOT NULL REFERENCES public.swayger_commercial_offers(id) ON DELETE CASCADE,
  target_type    TEXT NOT NULL CHECK (target_type IN ('fantasy_weekly', 'game_day')),
  target_id      UUID NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'unpublished')),
  published_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (offer_id, target_type, target_id)
);

-- Concurrent publish attempts cannot create two active offers for one
-- participant-facing placement.
CREATE UNIQUE INDEX IF NOT EXISTS swayger_commercial_one_published_per_target
  ON public.swayger_commercial_assignments (target_type, target_id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS swayger_commercial_offers_status_idx
  ON public.swayger_commercial_offers (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS swayger_commercial_assignments_target_idx
  ON public.swayger_commercial_assignments (target_type, target_id, status);

ALTER TABLE public.swayger_commercial_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swayger_commercial_assignments ENABLE ROW LEVEL SECURITY;

COMMIT;