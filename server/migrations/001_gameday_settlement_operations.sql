-- ── Migration 001: gameday_settlement_operations ─────────────────────────────
-- Durable idempotency + audit record for every global settlement operation.
-- Additive — no existing table is modified.
--
-- Apply in the Supabase SQL editor:
--   https://app.supabase.com/project/vlxvoienyxzhyaiimccp/sql/new
--
-- Rollback:
--   DROP TABLE IF EXISTS public.gameday_settlement_operations;

CREATE TABLE IF NOT EXISTS public.gameday_settlement_operations (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Idempotency
  -- idempotency_key: client-supplied UUID; unique per logical operation attempt
  -- request_hash:    SHA-256 of (group_key|canonical_answer|sorted_prop_ids|count|operator)
  --                  detects same-key / different-payload reuse
  idempotency_key             TEXT        NOT NULL,
  request_hash                TEXT        NOT NULL,

  -- Operation identity
  operation_id                TEXT        NOT NULL,
  operation_type              TEXT        NOT NULL DEFAULT 'global_settle',

  -- Operator identity
  -- operator_user_id:           nullable; populated when admin users have Supabase auth
  -- operator_token_fingerprint: first 16 hex chars of SHA-256(admin_token); never raw token
  operator_user_id            TEXT,
  operator_token_fingerprint  TEXT        NOT NULL,

  -- Settlement context
  group_key                   TEXT        NOT NULL,
  event_key                   TEXT,
  phase                       TEXT,
  canonical_answer_normalized TEXT        NOT NULL,
  prop_count                  INT         NOT NULL  CHECK (prop_count > 0),
  room_count                  INT         NOT NULL  DEFAULT 0  CHECK (room_count >= 0),

  -- Status and result
  -- status values: in_progress | completed | failed | partial_success | abandoned
  status                      TEXT        NOT NULL  DEFAULT 'in_progress'
                                CHECK (status IN
                                  ('in_progress', 'completed', 'failed',
                                   'partial_success', 'abandoned')),
  response_status_code        INT,          -- HTTP status code for accurate idempotent replay
  result_json                 JSONB,        -- full response payload when status = 'completed'
  error_json                  JSONB,        -- error payload when status = 'failed' or 'abandoned'
  partial_results_json        JSONB,        -- per-prop outcomes when status = 'partial_success'

  -- Timestamps and lease
  -- lease_expires_at: if still 'in_progress' after this time, treat as abandoned on next request
  -- Lease duration: 10 minutes. A full 50-room settlement takes <10s; 10min is a safe margin.
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at                TIMESTAMPTZ,
  lease_expires_at            TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),

  CONSTRAINT gso_idempotency_key_unique  UNIQUE (idempotency_key),
  CONSTRAINT gso_operation_id_unique     UNIQUE (operation_id)
);

CREATE INDEX IF NOT EXISTS idx_gso_created_at ON public.gameday_settlement_operations (created_at);
CREATE INDEX IF NOT EXISTS idx_gso_status     ON public.gameday_settlement_operations (status);
CREATE INDEX IF NOT EXISTS idx_gso_operator   ON public.gameday_settlement_operations (operator_user_id, operator_token_fingerprint);
CREATE INDEX IF NOT EXISTS idx_gso_lease      ON public.gameday_settlement_operations (lease_expires_at)
  WHERE status = 'in_progress';  -- partial index: only in_progress rows need lease scanning

ALTER TABLE public.gameday_settlement_operations ENABLE ROW LEVEL SECURITY;
