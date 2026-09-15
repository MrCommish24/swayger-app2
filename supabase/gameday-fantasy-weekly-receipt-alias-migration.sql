-- Stable opaque aliases for finalized Fantasy Weekly receipts.
-- Weekly receipt identity is season + week, so this remains separate from the
-- existing one-row-per-season Draft Day alias table.
-- This migration is intentionally not a backfill: aliases will be created
-- lazily by the authorized Weekly receipt share flow.

create table if not exists public.fantasy_weekly_receipt_aliases (
  league_season_id uuid not null
    references public.fantasy_league_seasons(id) on delete cascade,
  week_number integer not null
    check (week_number > 0),
  short_code text not null unique
    check (short_code ~ '^[a-z2-7]{16}$'),
  created_at timestamptz not null default now(),
  primary key (league_season_id, week_number)
);

alter table public.fantasy_weekly_receipt_aliases enable row level security;

revoke all on table public.fantasy_weekly_receipt_aliases from anon, authenticated;
grant select, insert on table public.fantasy_weekly_receipt_aliases to service_role;