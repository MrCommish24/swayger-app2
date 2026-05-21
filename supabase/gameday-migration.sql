-- Game Day Swayger — database migration
-- Run this in the Supabase SQL Editor

-- ── Rooms ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gameday_rooms (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  room_name       TEXT        NOT NULL,
  team_a_name     TEXT        NOT NULL,
  team_b_name     TEXT        NOT NULL,
  team_a_star     TEXT        NOT NULL,
  team_b_star     TEXT        NOT NULL,
  game_date       DATE,
  host_user_id    UUID        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('draft','active','finalized')),
  is_private      BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Pick cards ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gameday_pick_cards (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id       UUID        NOT NULL REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  phase         TEXT        NOT NULL CHECK (phase IN ('pregame','halftime','fourth')),
  status        TEXT        NOT NULL DEFAULT 'closed'
                            CHECK (status IN ('closed','open','locked','settled')),
  lock_label    TEXT,
  display_order INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Props ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gameday_props (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id        UUID        NOT NULL REFERENCES gameday_pick_cards(id) ON DELETE CASCADE,
  question       TEXT        NOT NULL,
  answer_options JSONB       NOT NULL DEFAULT '[]',
  correct_answer TEXT,
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','settled')),
  display_order  INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Participants ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gameday_participants (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id             UUID        NOT NULL REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  user_id             UUID,                -- null for guests
  guest_session_id    TEXT        UNIQUE,  -- unique token for guest identity
  display_name        TEXT        NOT NULL,
  is_guest            BOOLEAN     NOT NULL DEFAULT false,
  claimed_by_user_id  UUID,               -- reserved for future guest claiming
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, display_name),
  UNIQUE (room_id, user_id)
);

-- ── Picks ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gameday_picks (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  prop_id         UUID        NOT NULL REFERENCES gameday_props(id) ON DELETE CASCADE,
  participant_id  UUID        NOT NULL REFERENCES gameday_participants(id) ON DELETE CASCADE,
  selected_answer TEXT        NOT NULL,
  is_correct      BOOLEAN,              -- null until prop is settled
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (prop_id, participant_id)
);

-- ── Final standings (reserved for post-core-loop) ─────────────────────────────

CREATE TABLE IF NOT EXISTS gameday_final_standings (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id               UUID        NOT NULL UNIQUE REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  host_note             TEXT,
  winner_participant_id UUID        REFERENCES gameday_participants(id),
  is_published          BOOLEAN     NOT NULL DEFAULT false,
  published_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Events (analytics) ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gameday_events (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id        UUID        REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id UUID        REFERENCES gameday_participants(id) ON DELETE SET NULL,
  user_id        UUID,
  event_type     TEXT        NOT NULL,
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS (permissive for MVP — security enforced in API layer) ─────────────────

ALTER TABLE gameday_rooms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE gameday_pick_cards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gameday_props             ENABLE ROW LEVEL SECURITY;
ALTER TABLE gameday_participants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gameday_picks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE gameday_final_standings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE gameday_events            ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gd_rooms_all"           ON gameday_rooms           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "gd_cards_all"           ON gameday_pick_cards      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "gd_props_all"           ON gameday_props           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "gd_participants_all"    ON gameday_participants     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "gd_picks_all"           ON gameday_picks           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "gd_standings_all"       ON gameday_final_standings  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "gd_events_all"          ON gameday_events           FOR ALL USING (true) WITH CHECK (true);
