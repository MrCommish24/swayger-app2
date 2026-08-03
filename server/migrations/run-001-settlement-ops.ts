/**
 * Migration 001 — gameday_settlement_operations
 *
 * Applies via direct pg connection to Supabase's session-mode pooler.
 * Supabase accepts the service-role JWT as the PostgreSQL password on
 * postgres.[project-ref]@aws-0-*.pooler.supabase.com:5432.
 *
 * Usage:
 *   npx tsx server/migrations/run-001-settlement-ops.ts
 */

import * as dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const MIGRATION_SQL = `
-- ── gameday_settlement_operations ──────────────────────────────────────────
-- Durable idempotency + audit record for every global settlement operation.
-- Additive — no existing table is modified.

CREATE TABLE IF NOT EXISTS public.gameday_settlement_operations (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Idempotency
  idempotency_key             TEXT        NOT NULL,
  request_hash                TEXT        NOT NULL,

  -- Operation identity
  operation_id                TEXT        NOT NULL,
  operation_type              TEXT        NOT NULL DEFAULT 'global_settle',

  -- Operator identity (prefer user_id/email when available; token fingerprint as fallback)
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
  status                      TEXT        NOT NULL  DEFAULT 'in_progress'
                                CHECK (status IN
                                  ('in_progress','completed','failed',
                                   'partial_success','abandoned')),
  response_status_code        INT,
  result_json                 JSONB,
  error_json                  JSONB,
  partial_results_json        JSONB,

  -- Timestamps and lease
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
  WHERE status = 'in_progress';

ALTER TABLE public.gameday_settlement_operations ENABLE ROW LEVEL SECURITY;
`;

async function applyMigration() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl || !svcKey) {
    console.error("❌  EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }

  // Extract project ref from URL: https://vlxvoienyxzhyaiimccp.supabase.co
  const ref = supabaseUrl.replace("https://", "").split(".")[0];
  console.log(`▶  Project ref: ${ref}`);

  // ── Attempt 1: direct pg connection via Supabase session pooler ──────────
  // Supabase session-mode pooler: postgres.[ref]@aws-0-*.pooler.supabase.com:5432
  // Accepts the service-role JWT as the password for DDL via pg.
  const poolerHosts = [
    `aws-0-us-east-1.pooler.supabase.com`,
    `aws-0-us-west-1.pooler.supabase.com`,
    `aws-0-eu-west-1.pooler.supabase.com`,
    `aws-0-ap-southeast-1.pooler.supabase.com`,
  ];

  for (const host of poolerHosts) {
    const client = new pg.Client({
      host,
      port: 5432,
      user: `postgres.${ref}`,
      password: svcKey,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });

    try {
      await client.connect();
      console.log(`✓  Connected via pg to ${host}`);
      await client.query(MIGRATION_SQL);
      console.log("✓  Migration applied successfully.");
      await client.end();

      // Verify table exists via Supabase client
      const sb = createClient(supabaseUrl, svcKey);
      const { error } = await sb.from("gameday_settlement_operations").select("id").limit(1);
      if (!error) {
        console.log("✓  Table verified accessible via Supabase client.");
      } else {
        console.warn("⚠  Table created but Supabase client probe returned:", error.message);
      }
      return;
    } catch (err: any) {
      console.log(`   ✗  ${host}: ${err.message}`);
    } finally {
      try { await client.end(); } catch (_) { /* ignore */ }
    }
  }

  // ── Attempt 2: direct connection (non-pooler) ────────────────────────────
  const directHost = `db.${ref}.supabase.co`;
  const client2 = new pg.Client({
    host: directHost,
    port: 5432,
    user: "postgres",
    password: svcKey,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });

  try {
    await client2.connect();
    console.log(`✓  Connected via pg to ${directHost}`);
    await client2.query(MIGRATION_SQL);
    console.log("✓  Migration applied successfully (direct).");
    await client2.end();
    return;
  } catch (err: any) {
    console.log(`   ✗  ${directHost}: ${err.message}`);
    try { await client2.end(); } catch (_) { /* ignore */ }
  }

  // ── Fallback: print SQL for manual application ───────────────────────────
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("⚠  Could not connect directly to Supabase PostgreSQL.");
  console.log("   Apply the following SQL in the Supabase SQL Editor:");
  console.log("   https://app.supabase.com/project/" + ref + "/sql/new");
  console.log("══════════════════════════════════════════════════════════════════════");
  console.log(MIGRATION_SQL);
  process.exit(2);
}

applyMigration().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
