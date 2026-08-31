/**
 * Migration 003 — Draft Day team-name answer labels
 *
 * Applies the live-safe label backfill and updates the Draft Day member
 * snapshot/append functions. Existing answer IDs and picks are preserved.
 *
 * Usage:
 *   npx tsx server/migrations/run-003-fantasy-team-labels.ts
 *
 * If direct PostgreSQL access is unavailable, apply
 * supabase/gameday-fantasy-team-labels.sql in the Supabase SQL Editor.
 */

import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import pg from "pg";

const MIGRATION_SQL = fs.readFileSync(
  path.join(__dirname, "../../supabase/gameday-fantasy-team-labels.sql"),
  "utf8",
);

async function applyMigration() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl || !serviceKey) {
    console.error("EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }

  const ref = supabaseUrl.replace("https://", "").split(".")[0];
  const poolerHosts = [
    "aws-0-us-east-1.pooler.supabase.com",
    "aws-0-us-west-1.pooler.supabase.com",
    "aws-0-eu-west-1.pooler.supabase.com",
    "aws-0-ap-southeast-1.pooler.supabase.com",
  ];

  for (const host of poolerHosts) {
    const client = new pg.Client({
      host,
      port: 5432,
      user: `postgres.${ref}`,
      password: serviceKey,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });

    try {
      await client.connect();
      console.log(`Connected via pg to ${host}`);
      await client.query(MIGRATION_SQL);
      console.log("Draft Day team-label migration applied.");
      await client.end();
      return;
    } catch (error: any) {
      console.log(`${host}: ${error?.message ?? error}`);
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors after a failed connection attempt.
      }
    }
  }

  const directHost = `db.${ref}.supabase.co`;
  const client = new pg.Client({
    host: directHost,
    port: 5432,
    user: "postgres",
    password: serviceKey,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });

  try {
    await client.connect();
    console.log(`Connected via pg to ${directHost}`);
    await client.query(MIGRATION_SQL);
    console.log("Draft Day team-label migration applied.");
    await client.end();
    return;
  } catch (error: any) {
    console.error(`${directHost}: ${error?.message ?? error}`);
    try {
      await client.end();
    } catch {
      // Ignore cleanup errors.
    }
  }

  console.error(
    "Direct PostgreSQL access was unavailable. Apply " +
      "supabase/gameday-fantasy-team-labels.sql in the Supabase SQL Editor.",
  );
  process.exit(2);
}

applyMigration().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});