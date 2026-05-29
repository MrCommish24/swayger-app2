-- gameday_email_sends
-- Stores one row per Game Day blast email sent via sendGameDayBlastEmail().
-- Enables per-campaign send auditing and future Resend event correlation.

create table if not exists gameday_email_sends (
  id               uuid primary key default gen_random_uuid(),
  campaign_name    text not null,
  recipient_email  text not null,
  user_id          uuid references auth.users(id) on delete set null,
  resend_message_id text,
  room_id          uuid references gameday_rooms(id) on delete set null,
  room_code        text,
  room_link        text,
  is_test          boolean not null default false,
  sent_at          timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- Index for querying by campaign
create index if not exists gameday_email_sends_campaign_idx
  on gameday_email_sends (campaign_name, sent_at desc);

-- Index for looking up by room
create index if not exists gameday_email_sends_room_idx
  on gameday_email_sends (room_id, sent_at desc);

-- Index for looking up by Resend ID (for future webhook correlation)
create index if not exists gameday_email_sends_resend_id_idx
  on gameday_email_sends (resend_message_id)
  where resend_message_id is not null;

-- RLS: service role only (no public access needed)
alter table gameday_email_sends enable row level security;

-- No select/insert policies for anon or authenticated — admin/service role only.
-- Service role bypasses RLS automatically.
