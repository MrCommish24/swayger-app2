-- ── gameday-fantasy-idempotency.sql ───────────────────────────────────────────
-- Durable request idempotency for POST /participants (Add Member).
--
-- Problem: POST /participants with p_league_member_id=NULL creates a fresh
-- fantasy_league_members row on every call.  A network failure after the DB
-- transaction commits but before the HTTP response arrives causes the client
-- to retry, producing a second identical member.
--
-- Solution: wrap the member-creation RPC inside a DB-atomic idempotency check.
-- The idempotency record and the member rows are committed in a single
-- PL/pgSQL transaction — there is no failure window between them.
--
-- Uniqueness scope: (operator_user_id, idempotency_key)
-- The key is scoped to the commissioner identity so two different commissioners
-- using the same key string never collide.
-- league_id + season_id are included in request_hash, so cross-season key reuse
-- is detected and rejected with IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST.
--
-- Run via:   npx tsx server/migrations/run-002-fantasy-participant-ops.ts
-- Or paste into:  https://app.supabase.com/project/<ref>/sql/new
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fantasy_participant_operations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  league_id        UUID        NOT NULL REFERENCES public.fantasy_leagues(id)         ON DELETE CASCADE,
  league_season_id UUID        NOT NULL REFERENCES public.fantasy_league_seasons(id)  ON DELETE CASCADE,
  operator_user_id UUID        NOT NULL,

  -- Idempotency fields
  idempotency_key  TEXT        NOT NULL,
  request_hash     TEXT        NOT NULL,

  -- Result IDs — set atomically within the same transaction as member creation.
  -- NULL only while the transaction is still in flight (never visible externally
  -- due to transaction isolation); after commit, always set.
  league_member_id UUID        REFERENCES public.fantasy_league_members(id),
  season_member_id UUID        REFERENCES public.fantasy_season_members(id),
  fantasy_team_id  UUID        REFERENCES public.fantasy_teams(id),
  response_status  INT,
  result_json      JSONB,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fpo_operator_key_unique UNIQUE (operator_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_fpo_league_season
  ON public.fantasy_participant_operations (league_id, league_season_id);

CREATE INDEX IF NOT EXISTS idx_fpo_created_at
  ON public.fantasy_participant_operations (created_at);

ALTER TABLE public.fantasy_participant_operations ENABLE ROW LEVEL SECURITY;

-- ── RPC ───────────────────────────────────────────────────────────────────────
--
-- add_fantasy_season_participant_idempotent
--
-- Wraps add_fantasy_season_participant_v2 with durable idempotency.
-- When p_idempotency_key + p_operator_user_id are supplied:
--
--   1. INSERT the idempotency record (ON CONFLICT DO NOTHING).
--   2a. ROW_COUNT = 0 → replay:
--       • Hash mismatch  → RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'
--       • Hash match     → return cached result_json (same IDs, no new rows)
--   2b. ROW_COUNT = 1 → new operation:
--       • Call add_fantasy_season_participant_v2 (same transaction)
--       • UPDATE idempotency record with result IDs and result_json
--       • RETURN result
--
-- If p_idempotency_key is NULL the function degrades to a direct v2 call
-- (backward-compatible for tests and internal callers that manage their own
-- idempotency).
--
-- Atomicity guarantee:
-- The INSERT into fantasy_participant_operations and the v2 member-creation
-- INSERTs all run inside a single PL/pgSQL implicit transaction.  If anything
-- fails after the INSERT (e.g. v2 raises an exception), the entire transaction
-- rolls back including the idempotency record — so the next retry gets a fresh
-- INSERT slot and tries again.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION add_fantasy_season_participant_idempotent(
  p_league_id          UUID,
  p_league_season_id   UUID,
  p_display_name       TEXT,
  p_team_name          TEXT,
  p_draft_day_eligible BOOLEAN DEFAULT TRUE,
  p_room_id            UUID    DEFAULT NULL,
  p_idempotency_key    TEXT    DEFAULT NULL,
  p_operator_user_id   UUID    DEFAULT NULL,
  p_request_hash       TEXT    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row_count  INT     := 0;
  v_existing   RECORD;
  v_result     JSON;
  v_status     INT;
BEGIN
  -- ── Idempotency gate ───────────────────────────────────────────────────────
  IF p_idempotency_key IS NOT NULL AND p_operator_user_id IS NOT NULL THEN

    -- Attempt to claim the idempotency slot atomically.
    INSERT INTO fantasy_participant_operations
      (league_id, league_season_id, operator_user_id, idempotency_key, request_hash)
    VALUES
      (p_league_id, p_league_season_id, p_operator_user_id, p_idempotency_key,
       COALESCE(p_request_hash, ''))
    ON CONFLICT (operator_user_id, idempotency_key) DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      -- ── Replay path ─────────────────────────────────────────────────────────
      SELECT request_hash, result_json, response_status
        INTO v_existing
        FROM fantasy_participant_operations
       WHERE operator_user_id = p_operator_user_id
         AND idempotency_key  = p_idempotency_key;

      -- Reject key reuse with a different payload
      IF v_existing.request_hash IS DISTINCT FROM COALESCE(p_request_hash, '') THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'
          USING DETAIL = 'The idempotency key was previously used with a different request body. Generate a new key for a different add-member operation.';
      END IF;

      -- Return the exact original result (same IDs, no new rows created)
      RETURN v_existing.result_json;
    END IF;

  END IF;

  -- ── Member creation (same transaction as the idempotency INSERT above) ─────
  SELECT add_fantasy_season_participant_v2(
    p_league_id,
    p_league_season_id,
    p_display_name,
    p_team_name,
    NULL,                  -- p_league_member_id: always NULL here; key-based identity
    p_draft_day_eligible,
    p_room_id
  ) INTO v_result;

  -- ── Persist result IDs on the idempotency record ───────────────────────────
  IF p_idempotency_key IS NOT NULL AND p_operator_user_id IS NOT NULL THEN
    v_status := CASE WHEN (v_result->>'already_exists')::BOOLEAN THEN 200 ELSE 201 END;

    UPDATE fantasy_participant_operations
    SET
      league_member_id = (v_result->>'league_member_id')::UUID,
      season_member_id = (v_result->>'season_member_id')::UUID,
      fantasy_team_id  = (v_result->>'team_id')::UUID,
      response_status  = v_status,
      result_json      = v_result
    WHERE operator_user_id = p_operator_user_id
      AND idempotency_key  = p_idempotency_key;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION add_fantasy_season_participant_idempotent(
  UUID, UUID, TEXT, TEXT, BOOLEAN, UUID, TEXT, UUID, TEXT
) TO service_role;
