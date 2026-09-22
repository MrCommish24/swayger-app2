-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;-- Swayger Fantasy Weekly — immutable pick-share aliases
-- ---------------------------------------------------------------------------
-- Additive persistence for V1C short links and crawler previews.
--
-- A row records the minimum stable identity of one voluntarily shared call.
-- It deliberately does not store answer labels, team names, generated share
-- text, contact information, guest tokens, or authentication material.
--
-- Repeated sharing of the same exact call/context reuses one alias. Changing
-- the confirmed answer or switching between an ordinary share and a My Lock
-- share creates a different immutable alias. Existing rows are never updated.
--
-- Apply this migration before implementing the dependent V1C API, resolver,
-- preview metadata, or client short-link packaging.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_pick_share_aliases (
  short_code       TEXT        PRIMARY KEY
                              CHECK (short_code ~ '^[a-z2-7]{16}$'),
  league_season_id UUID        NOT NULL
                              REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  room_id          UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id   UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id          UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  selected_answer  TEXT        NOT NULL
                              CHECK (
                                char_length(btrim(selected_answer)) BETWEEN 1 AND 200
                                AND selected_answer = btrim(selected_answer)
                              ),
  share_kind       TEXT        NOT NULL
                              CHECK (share_kind IN ('pick', 'my_lock')),
  week_number      INTEGER     NOT NULL
                              CHECK (week_number > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_pick_share_aliases_snapshot_unique
    UNIQUE (
      room_id,
      participant_id,
      prop_id,
      selected_answer,
      share_kind
    )
);

COMMENT ON TABLE fantasy_weekly_pick_share_aliases IS
  'Immutable, service-role-only aliases for individual Fantasy Weekly picks intentionally shared by a participant.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.selected_answer IS
  'Stable confirmed answer identifier captured at share time; display text is resolved from the referenced published prop.';

COMMENT ON COLUMN fantasy_weekly_pick_share_aliases.share_kind IS
  'Immutable share-time framing: ordinary pick or My Lock.';

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_pick_share_aliases_season_week
  ON fantasy_weekly_pick_share_aliases (league_season_id, week_number);

ALTER TABLE fantasy_weekly_pick_share_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_pick_share_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE fantasy_weekly_pick_share_aliases TO service_role;

COMMIT;