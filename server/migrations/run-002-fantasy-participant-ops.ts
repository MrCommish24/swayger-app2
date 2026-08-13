/**
 * Migration 002 — fantasy_participant_operations
 *
 * Adds durable DB-backed idempotency for POST /participants (Add Member).
 * Creates the fantasy_participant_operations table and the
 * add_fantasy_season_participant_idempotent RPC.
 *
 * Follows the same pattern as run-001-settlement-ops.ts.
 * Safe to re-run: all DDL uses CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE.
 *
 * Usage:
 *   npx tsx server/migrations/run-002-fantasy-participant-ops.ts
 *
 * Or apply manually in the Supabase SQL Editor:
 *   https://app.supabase.com/project/<ref>/sql/new
 *   Paste the contents of supabase/gameday-fantasy-idempotency.sql
 */

import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const MIGRATION_SQL = fs.readFileSync(
  path.join(__dirname, "../../supabase/gameday-fantasy-idempotency.sql"),
  "utf8"
);

async function applyMigration() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const svcKey     = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl || !svcKey) {
    console.error("❌  EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }

  const ref = supabaseUrl.replace("https://", "").split(".")[0];
  console.log(`▶  Project ref: ${ref}`);
  console.log(`▶  Migration:   002 — fantasy_participant_operations\n`);

  // ── Attempt 1: Supabase session-mode pooler ──────────────────────────────────
  const poolerHosts = [
    `aws-0-us-east-1.pooler.supabase.com`,
    `aws-0-us-west-1.pooler.supabase.com`,
    `aws-0-eu-west-1.pooler.supabase.com`,
    `aws-0-ap-southeast-1.pooler.supabase.com`,
  ];

  for (const host of poolerHosts) {
    const client = new pg.Client({
      host,
      port:     5432,
      user:     `postgres.${ref}`,
      password: svcKey,
      database: "postgres",
      ssl:      { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });

    try {
      await client.connect();
      console.log(`✓  Connected via pg to ${host}`);
      await client.query(MIGRATION_SQL);
      console.log("✓  Migration SQL applied.");
      await client.end();

      // Verify via Supabase client
      const sb = createClient(supabaseUrl, svcKey);
      const { error: tableErr } = await sb
        .from("fantasy_participant_operations")
        .select("id")
        .limit(1);
      if (!tableErr) {
        console.log("✓  Table fantasy_participant_operations accessible via Supabase client.");
      } else {
        console.warn("⚠  Table created but Supabase client probe returned:", tableErr.message);
      }

      // Verify RPC exists
      const { error: rpcErr } = await sb.rpc("add_fantasy_season_participant_idempotent", {
        p_league_id:          "00000000-0000-0000-0000-000000000000",
        p_league_season_id:   "00000000-0000-0000-0000-000000000000",
        p_display_name:       "probe",
        p_team_name:          "probe",
      });
      if (rpcErr?.message?.includes("Season not found") || rpcErr?.message?.includes("not found")) {
        console.log("✓  RPC add_fantasy_season_participant_idempotent callable (expected validation error).");
      } else if (rpcErr) {
        console.warn("⚠  RPC probe returned unexpected error:", rpcErr.message);
      } else {
        console.log("✓  RPC callable.");
      }

      console.log("\n✅  Migration 002 complete.");
      return;
    } catch (err: any) {
      console.log(`   ✗  ${host}: ${err.message}`);
    } finally {
      try { await client.end(); } catch (_) { /* ignore */ }
    }
  }

  // ── Attempt 2: direct non-pooler connection ──────────────────────────────────
  const directHost = `db.${ref}.supabase.co`;
  const client2 = new pg.Client({
    host:     directHost,
    port:     5432,
    user:     "postgres",
    password: svcKey,
    database: "postgres",
    ssl:      { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });

  try {
    await client2.connect();
    console.log(`✓  Connected via pg to ${directHost}`);
    await client2.query(MIGRATION_SQL);
    console.log("✓  Migration SQL applied (direct).\n✅  Migration 002 complete.");
    await client2.end();
    return;
  } catch (err: any) {
    console.log(`   ✗  ${directHost}: ${err.message}`);
    try { await client2.end(); } catch (_) { /* ignore */ }
  }

  // ── Fallback: print SQL for manual application ───────────────────────────────
  const editorUrl = `https://app.supabase.com/project/${ref}/sql/new`;
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("⚠  Could not connect directly to Supabase PostgreSQL.");
  console.log("   Apply the migration manually in the Supabase SQL Editor:");
  console.log(`   ${editorUrl}`);
  console.log("   File: supabase/gameday-fantasy-idempotency.sql");
  console.log("══════════════════════════════════════════════════════════════════════\n");
  console.log(MIGRATION_SQL);
  process.exit(2);
}

applyMigration().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
