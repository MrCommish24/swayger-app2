-- 027_gameday_next_room_interest.sql
-- Captures intent from users who want to be notified about the next Game Day room.
-- Populated server-side via service role only. No RLS needed.

create table if not exists gameday_next_room_interest (
  id               uuid primary key default gen_random_uuid(),
  room_id          uuid references gameday_rooms(id) on delete set null,
  room_code        text,
  participant_id   uuid,
  user_id          uuid,
  email            text,
  participant_type text,
  room_source      text,
  entry_source     text,
  final_rank       int,
  final_sp         int,
  is_winner        boolean,
  created_at       timestamptz not null default now()
);

create index if not exists gameday_next_room_interest_room_id_idx
  on gameday_next_room_interest (room_id);

create index if not exists gameday_next_room_interest_email_idx
  on gameday_next_room_interest (email)
  where email is not null;
