-- ============================================================
-- SWAYGER FANTASY FOUNDATION
-- File: supabase/gameday-fantasy-foundation.sql
--
-- INSTRUCTIONS: Run in Supabase SQL Editor.
-- Do NOT run this file multiple times — it is not fully idempotent.
-- Review the complete file before executing.
-- This is Phase 1 of the Swayger Fantasy schema foundation.
--
-- BEFORE APPLYING: Verify CHECK constraint names in your live DB:
--
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid IN (
--     'gameday_rooms'::regclass,
--     'gameday_prop_library'::regclass,
--     'gameday_pick_cards'::regclass
--   )
--   AND contype = 'c'
--   ORDER BY conrelid, conname;
--
-- Expected names (confirmed from migration source):
--   gameday_pick_cards_phase_check    — explicitly named (confirmed in source SQL)
--   gameday_rooms_sport_check         — auto-generated (inline CHECK, no explicit name in source)
--   gameday_prop_library_sport_check  — auto-generated (inline CHECK, no explicit name in source)
--
-- All DROP CONSTRAINT statements use IF EXISTS for safety.
-- If an auto-generated name differs in your DB, the DROP will silently skip it
-- and the ADD CONSTRAINT below will fail with a duplicate. Fix the name before re-running.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. NEW TABLE: fantasy_leagues
--
-- Persistent league identity. Survives seasons and commissioner changes.
-- created_by: permanent audit field (who created the league entity).
--   It confers no ongoing authority — commissioner role lives in
--   fantasy_season_members.role for each season.
-- ────────────────────────────────────────────────────────────
CREATE TABLE fantasy_leagues (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_name TEXT        NOT NULL,
  sport       TEXT        NOT NULL,
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fantasy_leagues_sport_check
    CHECK (sport IN ('football','basketball','baseball'))
);

-- ────────────────────────────────────────────────────────────
-- 2. NEW TABLE: fantasy_league_seasons
--
-- One row per season of a persistent league.
-- season_year: the calendar year in which the fantasy season begins.
--   2026 NFL regular season      → season_year = 2026
--   2026–27 fantasy NBA season   → season_year = 2026
-- Commissioner authority lives in fantasy_season_members.role, NOT here.
--   No commissioner_user_id column on this table.
-- external_provider / external_league_id: provider IDs are season-specific
--   (a league may use Sleeper in 2026, Yahoo in 2027). Stored here, not on
--   the persistent league.
-- ────────────────────────────────────────────────────────────
CREATE TABLE fantasy_league_seasons (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id                     UUID        NOT NULL REFERENCES fantasy_leagues(id) ON DELETE CASCADE,
  -- The calendar year in which this season begins (see note above).
  season_year                   INTEGER     NOT NULL,
  status                        TEXT        NOT NULL DEFAULT 'upcoming',
  default_reward_description    TEXT,
  default_reward_amount_display TEXT,
  external_provider             TEXT,       -- 'sleeper' | 'yahoo' | 'espn' | null (manual)
  external_league_id            TEXT,       -- provider's season-specific league ID
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, season_year),
  CONSTRAINT fantasy_league_seasons_status_check
    CHECK (status IN ('upcoming','active','completed','archived'))
);

-- ────────────────────────────────────────────────────────────
-- 3. NEW TABLE: fantasy_league_members
--
-- Persistent roster record. Exists for the lifetime of the league and
-- survives season gaps (a member who skips 2027 is still here).
-- No UNIQUE on (league_id, display_name): two members may share a human
--   name. UUID is authoritative identity; display_name is presentation data.
-- No external_member_id: provider-member mapping is season/provider-specific.
--   Deferred until the provider-import layer is built.
-- ────────────────────────────────────────────────────────────
CREATE TABLE fantasy_league_members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    UUID        NOT NULL REFERENCES fantasy_leagues(id) ON DELETE CASCADE,
  display_name TEXT        NOT NULL,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Intentionally no UNIQUE (league_id, display_name)
);

-- ────────────────────────────────────────────────────────────
-- 4. NEW TABLE: fantasy_season_members
--
-- Activates a persistent member for one season.
-- role = 'commissioner' is the SOLE source of commissioner authority for a season.
-- Initial setup: when a commissioner creates a season, the server automatically
--   inserts their fantasy_season_members row with role = 'commissioner'.
-- A member who skips a season has no row here for that season;
--   their fantasy_league_members row is unchanged and their identity claims persist.
-- ────────────────────────────────────────────────────────────
CREATE TABLE fantasy_season_members (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_season_id UUID        NOT NULL REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  league_member_id UUID        NOT NULL REFERENCES fantasy_league_members(id) ON DELETE CASCADE,
  role             TEXT        NOT NULL DEFAULT 'member',
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_season_id, league_member_id),
  CONSTRAINT fantasy_season_members_role_check
    CHECK (role IN ('commissioner','co_commissioner','member'))
);

-- ────────────────────────────────────────────────────────────
-- 5. NEW TABLE: fantasy_teams
--
-- Team entity scoped to one season.
-- Redraft leagues: teams are naturally recreated each year.
-- Dynasty leagues: commissioner re-enters the same team names each season.
--   A future self-referencing source_team_id column can link franchise
--   continuity across seasons when needed — deferred entirely.
-- No UNIQUE on team_name: display label, not DB identity.
-- external_team_id: provider team ID, null for manual/MVP leagues.
-- ────────────────────────────────────────────────────────────
CREATE TABLE fantasy_teams (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_season_id UUID        NOT NULL REFERENCES fantasy_league_seasons(id) ON DELETE CASCADE,
  team_name        TEXT        NOT NULL,
  external_team_id TEXT,       -- provider team ID; null for manual/MVP
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Intentionally no UNIQUE (league_season_id, team_name)
);

-- ────────────────────────────────────────────────────────────
-- 6. NEW TABLE: fantasy_team_managers
--
-- Junction: which season members manage which teams.
-- Supports unlimited managers per team (no fixed column limit).
-- To transfer management: set is_active = false on the old row and insert
--   a new row for the new manager. Historical pick records are unaffected.
-- ────────────────────────────────────────────────────────────
CREATE TABLE fantasy_team_managers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_team_id  UUID        NOT NULL REFERENCES fantasy_teams(id) ON DELETE CASCADE,
  season_member_id UUID        NOT NULL REFERENCES fantasy_season_members(id) ON DELETE CASCADE,
  role             TEXT        NOT NULL DEFAULT 'manager',
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fantasy_team_id, season_member_id),
  CONSTRAINT fantasy_team_managers_role_check
    CHECK (role IN ('manager','co_manager'))
);

-- ────────────────────────────────────────────────────────────
-- 7. NEW TABLE: fantasy_member_claims
--
-- Maps a device/account to a persistent league member.
-- Claims live on fantasy_league_members (not season-specific):
--   the same claim enables year-over-year auto-recognition across seasons.
-- Exactly one of user_id or guest_token must be populated (enforced by CHECK).
-- guest_token: durable per-device token stored in AsyncStorage (not a session UUID).
-- Cross-league copies do NOT auto-create claims. The member must open the
--   destination invitation and confirm their identity before a claim is created.
-- ────────────────────────────────────────────────────────────
CREATE TABLE fantasy_member_claims (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_member_id UUID        NOT NULL REFERENCES fantasy_league_members(id) ON DELETE CASCADE,
  user_id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_token      TEXT,       -- durable per-device token (AsyncStorage); NOT a session UUID
  claimed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  CONSTRAINT fantasy_member_claims_one_type CHECK (
    (user_id IS NOT NULL AND guest_token IS NULL) OR
    (user_id IS NULL     AND guest_token IS NOT NULL)
  ),
  UNIQUE (league_member_id, user_id),
  UNIQUE (league_member_id, guest_token)
);

-- ────────────────────────────────────────────────────────────
-- 8. EXTEND: gameday_rooms
--
-- league_season_id: NULL for all existing Game Day rooms.
--   Populated for Fantasy competitions only.
-- experience_type: 'game_day' for all existing rows (backfilled below).
-- competition_type: NULL for all existing rows.
-- reward columns: display-only metadata; no connection to scoring.
-- Matchup columns made nullable: Fantasy rooms have no sports matchup.
--   Existing rows that already have values keep them unchanged.
-- Sport CHECK widened to support Fantasy sports without another migration.
-- ────────────────────────────────────────────────────────────
ALTER TABLE gameday_rooms
  ADD COLUMN league_season_id      UUID REFERENCES fantasy_league_seasons(id) ON DELETE SET NULL,
  ADD COLUMN experience_type       TEXT NOT NULL DEFAULT 'game_day',
  ADD COLUMN competition_type      TEXT,
  ADD COLUMN reward_description    TEXT,
  ADD COLUMN reward_amount_display TEXT;

ALTER TABLE gameday_rooms
  ADD CONSTRAINT gameday_rooms_experience_type_check
    CHECK (experience_type IN ('game_day','fantasy'));

ALTER TABLE gameday_rooms
  ADD CONSTRAINT gameday_rooms_competition_type_check
    CHECK (competition_type IS NULL OR
           competition_type IN ('draft_day','weekly','playoffs','championship'));

-- Widen sport CHECK.
-- Source: gameday-phase2-migration.sql line 41 — inline CHECK, no explicit name.
-- Auto-generated Postgres name: gameday_rooms_sport_check
-- Run the verification query above if unsure of the name in your DB.
ALTER TABLE gameday_rooms DROP CONSTRAINT IF EXISTS gameday_rooms_sport_check;
ALTER TABLE gameday_rooms
  ADD CONSTRAINT gameday_rooms_sport_check
    CHECK (sport IS NULL OR sport IN ('nba','soccer','football','basketball','baseball'));

-- Make matchup-only columns nullable.
-- Existing rows that have values are unaffected — only nullability changes.
ALTER TABLE gameday_rooms
  ALTER COLUMN team_a_name DROP NOT NULL,
  ALTER COLUMN team_b_name DROP NOT NULL,
  ALTER COLUMN team_a_star DROP NOT NULL,
  ALTER COLUMN team_b_star DROP NOT NULL;

-- Backfill: all existing Game Day rooms receive the correct default.
-- The DEFAULT 'game_day' on the column handles new rows going forward.
UPDATE gameday_rooms SET experience_type = 'game_day' WHERE experience_type IS NULL;

-- ────────────────────────────────────────────────────────────
-- 9. EXTEND: gameday_props
--
-- scoring_scope: 'competition' (counts toward Draft Day/weekly winner) or
--   'season' (settles at end of season; does not affect competition winner).
-- point_value: NOT NULL DEFAULT 10.
--   All existing Game Day props implicitly worth 10 — this backfill makes it
--   explicit so SUM(point_value) works cleanly with no NULL special-casing.
-- ────────────────────────────────────────────────────────────
ALTER TABLE gameday_props
  ADD COLUMN scoring_scope TEXT    NOT NULL DEFAULT 'competition',
  ADD COLUMN point_value   INTEGER NOT NULL DEFAULT 10;

ALTER TABLE gameday_props
  ADD CONSTRAINT gameday_props_scoring_scope_check
    CHECK (scoring_scope IN ('competition','season'));

-- Backfill (DEFAULT handles new rows; these cover existing rows added before this migration)
UPDATE gameday_props SET scoring_scope = 'competition' WHERE scoring_scope IS NULL;
UPDATE gameday_props SET point_value   = 10            WHERE point_value   IS NULL;

-- ────────────────────────────────────────────────────────────
-- 10. EXTEND: gameday_pick_cards — widen phase CHECK
--
-- 'draft_day'  : V1 Draft Day default phase value.
-- 'pre_draft'  : future staged Draft Day (schema value reserved; UI not built).
-- 'in_draft'   : same.
-- 'post_draft' : same.
-- 'weekly'     : future weekly competition phase.
--
-- Constraint name CONFIRMED explicitly in source:
--   gameday-phase2-migration.sql lines 48-53 (original)
--   gameday-fifa-phase-migration.sql lines 5-10 (widened for soccer)
--   Both use: DROP CONSTRAINT IF EXISTS gameday_pick_cards_phase_check
-- ────────────────────────────────────────────────────────────
ALTER TABLE gameday_pick_cards DROP CONSTRAINT IF EXISTS gameday_pick_cards_phase_check;
ALTER TABLE gameday_pick_cards
  ADD CONSTRAINT gameday_pick_cards_phase_check
    CHECK (phase IN (
      'pregame','halftime','fourth','final_push','penalties',  -- existing Game Day values
      'draft_day',                                             -- V1 Draft Day default
      'pre_draft','in_draft','post_draft',                     -- future staged Draft Day
      'weekly'                                                 -- future weekly competitions
    ));

-- ────────────────────────────────────────────────────────────
-- 11. EXTEND: gameday_participants
--
-- season_member_id: stable FK to the season-specific membership record.
--   NULL for all existing Game Day participants; populated for Fantasy.
-- fantasy_team_id: stable FK to the season team this member represented.
--   Supports co-manager and ownership-change scenarios — the team entity is
--   stable; team_name is the immutable historical display.
--   NULL for all existing Game Day participants.
-- team_name: immutable snapshot of the team name at join time. Never updated
--   after the participant row is created.
-- ────────────────────────────────────────────────────────────
ALTER TABLE gameday_participants
  ADD COLUMN season_member_id UUID REFERENCES fantasy_season_members(id) ON DELETE SET NULL,
  ADD COLUMN fantasy_team_id  UUID REFERENCES fantasy_teams(id) ON DELETE SET NULL,
  ADD COLUMN team_name        TEXT;  -- immutable snapshot; set at join time, never updated

-- ────────────────────────────────────────────────────────────
-- 12. EXTEND: gameday_prop_library
--
-- experience_type / competition_type: taxonomy for template filtering.
-- scoring_scope: 'competition' or 'season'; copied into prop at room creation.
-- point_value: NOT NULL DEFAULT 10; copied into prop at room creation.
-- answer_target_type: 'season_member' (references fantasy_season_members.id),
--   'fantasy_team', 'player', 'yes_no', or 'static'. NULL for Game Day templates.
--   NOTE: value is 'season_member' (not 'league_member') — accurately describes
--   the referenced entity type.
-- Sport CHECK widened to match gameday_rooms.
-- ────────────────────────────────────────────────────────────
ALTER TABLE gameday_prop_library
  ADD COLUMN experience_type    TEXT,
  ADD COLUMN competition_type   TEXT,
  ADD COLUMN scoring_scope      TEXT    NOT NULL DEFAULT 'competition',
  ADD COLUMN point_value        INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN answer_target_type TEXT;

-- Widen sport CHECK.
-- Source: gameday-phase2-migration.sql line 10 — inline CHECK, no explicit name.
-- Auto-generated Postgres name: gameday_prop_library_sport_check
ALTER TABLE gameday_prop_library DROP CONSTRAINT IF EXISTS gameday_prop_library_sport_check;
ALTER TABLE gameday_prop_library
  ADD CONSTRAINT gameday_prop_library_sport_check
    CHECK (sport IN ('nba','soccer','football','basketball','baseball'));

ALTER TABLE gameday_prop_library
  ADD CONSTRAINT gameday_prop_library_experience_type_check
    CHECK (experience_type IS NULL OR experience_type IN ('game_day','fantasy'));

ALTER TABLE gameday_prop_library
  ADD CONSTRAINT gameday_prop_library_scoring_scope_check
    CHECK (scoring_scope IN ('competition','season'));

ALTER TABLE gameday_prop_library
  ADD CONSTRAINT gameday_prop_library_answer_target_type_check
    CHECK (answer_target_type IS NULL OR
           answer_target_type IN ('season_member','fantasy_team','player','yes_no','static'));

-- Backfill existing Game Day templates
UPDATE gameday_prop_library
  SET experience_type = 'game_day',
      scoring_scope   = 'competition',
      point_value     = 10
WHERE experience_type IS NULL;

COMMIT;

-- ============================================================
-- ROLLBACK SCRIPT
-- Run manually only if the migration must be reversed.
-- Copy and paste into the Supabase SQL Editor; do NOT run here.
-- ============================================================
--
-- BEGIN;
--
-- DROP TABLE IF EXISTS fantasy_team_managers;
-- DROP TABLE IF EXISTS fantasy_member_claims;
-- DROP TABLE IF EXISTS fantasy_teams;
-- DROP TABLE IF EXISTS fantasy_season_members;
-- DROP TABLE IF EXISTS fantasy_league_members;
-- DROP TABLE IF EXISTS fantasy_league_seasons;
-- DROP TABLE IF EXISTS fantasy_leagues;
--
-- ALTER TABLE gameday_rooms
--   DROP COLUMN IF EXISTS league_season_id,
--   DROP COLUMN IF EXISTS experience_type,
--   DROP COLUMN IF EXISTS competition_type,
--   DROP COLUMN IF EXISTS reward_description,
--   DROP COLUMN IF EXISTS reward_amount_display;
-- ALTER TABLE gameday_rooms
--   ALTER COLUMN team_a_name SET NOT NULL,
--   ALTER COLUMN team_b_name SET NOT NULL,
--   ALTER COLUMN team_a_star SET NOT NULL,
--   ALTER COLUMN team_b_star SET NOT NULL;
-- ALTER TABLE gameday_rooms
--   DROP CONSTRAINT IF EXISTS gameday_rooms_experience_type_check,
--   DROP CONSTRAINT IF EXISTS gameday_rooms_competition_type_check,
--   DROP CONSTRAINT IF EXISTS gameday_rooms_sport_check;
-- ALTER TABLE gameday_rooms
--   ADD CONSTRAINT gameday_rooms_sport_check
--     CHECK (sport IS NULL OR sport IN ('nba','soccer'));
--
-- ALTER TABLE gameday_props
--   DROP COLUMN IF EXISTS scoring_scope,
--   DROP COLUMN IF EXISTS point_value;
--
-- ALTER TABLE gameday_pick_cards
--   DROP CONSTRAINT IF EXISTS gameday_pick_cards_phase_check;
-- ALTER TABLE gameday_pick_cards
--   ADD CONSTRAINT gameday_pick_cards_phase_check
--     CHECK (phase IN ('pregame','halftime','fourth','final_push','penalties'));
--
-- ALTER TABLE gameday_participants
--   DROP COLUMN IF EXISTS season_member_id,
--   DROP COLUMN IF EXISTS fantasy_team_id,
--   DROP COLUMN IF EXISTS team_name;
--
-- ALTER TABLE gameday_prop_library
--   DROP COLUMN IF EXISTS experience_type,
--   DROP COLUMN IF EXISTS competition_type,
--   DROP COLUMN IF EXISTS scoring_scope,
--   DROP COLUMN IF EXISTS point_value,
--   DROP COLUMN IF EXISTS answer_target_type;
-- ALTER TABLE gameday_prop_library
--   DROP CONSTRAINT IF EXISTS gameday_prop_library_experience_type_check,
--   DROP CONSTRAINT IF EXISTS gameday_prop_library_scoring_scope_check,
--   DROP CONSTRAINT IF EXISTS gameday_prop_library_answer_target_type_check,
--   DROP CONSTRAINT IF EXISTS gameday_prop_library_sport_check;
-- ALTER TABLE gameday_prop_library
--   ADD CONSTRAINT gameday_prop_library_sport_check
--     CHECK (sport IN ('nba','soccer'));
--
-- COMMIT;
