-- Swayger Fantasy Weekly — persisted My Lock
-- ---------------------------------------------------------------------------
-- Additive persistence only. My Lock is a participant-selected confidence
-- marker and has no scoring, settlement, standings, results, or receipt effect.
--
-- Apply this migration before implementing the dependent V1B API and UI.
-- Disabling Swayger Run leaves these rows dormant; no cleanup or backfill is
-- required.

BEGIN;

CREATE TABLE IF NOT EXISTS fantasy_weekly_my_locks (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id         UUID        NOT NULL
                              REFERENCES gameday_rooms(id) ON DELETE CASCADE,
  participant_id  UUID        NOT NULL
                              REFERENCES gameday_participants(id) ON DELETE CASCADE,
  prop_id         UUID        NOT NULL
                              REFERENCES gameday_props(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fantasy_weekly_my_locks_room_participant_unique
    UNIQUE (room_id, participant_id)
);

COMMENT ON TABLE fantasy_weekly_my_locks IS
  'One optional confidence-only My Lock per participant in a Fantasy Weekly room; never used for scoring or settlement.';

COMMENT ON COLUMN fantasy_weekly_my_locks.prop_id IS
  'The selected Swayger Moment. The displayed answer resolves from the participant current confirmed gameday_picks row.';

-- Match the Game Day direct-access lockdown: authorization and cross-table
-- validation are enforced by the Express service-role API, not the browser.
ALTER TABLE fantasy_weekly_my_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fantasy_weekly_my_locks FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE fantasy_weekly_my_locks TO service_role;

COMMIT;