-- Stable opaque aliases for finalized Fantasy Draft Day receipts.
-- The live schema was verified separately before application code was enabled.
-- This migration is intentionally not a backfill: aliases are created lazily
-- by the commissioner/co-commissioner share flow.

create table if not exists public.fantasy_draft_day_receipt_aliases (
  league_season_id uuid primary key
    references public.fantasy_league_seasons(id) on delete cascade,
  short_code text not null unique
    check (short_code ~ '^[a-z2-7]{16}$'),
  created_at timestamptz not null default now()
);

alter table public.fantasy_draft_day_receipt_aliases enable row level security;

revoke all on table public.fantasy_draft_day_receipt_aliases from anon, authenticated;
grant select, insert on table public.fantasy_draft_day_receipt_aliases to service_role;