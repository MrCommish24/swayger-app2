/**
 * Apply the persisted commercial-offer workflow migration to development
 * Supabase using the existing server-only configuration.
 *
 * Usage:
 *   npx tsx server/migrations/run-commercial-offers.ts
 */

import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "node:fs";
import * as path from "node:path";
import pg from "pg";

const migrationPath = path.join(__dirname, "../../supabase/gameday-commercial-offers.sql");
const migrationSql = fs.readFileSync(migrationPath, "utf8");

async function applyMigration() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceKey) {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }

  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  const hosts = [
    "aws-0-us-east-1.pooler.supabase.com",
    "aws-0-us-west-1.pooler.supabase.com",
    "aws-0-eu-west-1.pooler.supabase.com",
    "aws-0-ap-southeast-1.pooler.supabase.com",
  ];

  for (const host of hosts) {
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
      await client.query(migrationSql);
      await client.end();
      console.log(`Commercial-offer migration applied via ${host}.`);
      return;
    } catch (error) {
      console.log(`${host}: ${error instanceof Error ? error.message : "connection failed"}`);
      try { await client.end(); } catch { /* cleanup after failed connection */ }
    }
  }

  const direct = new pg.Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    user: "postgres",
    password: serviceKey,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  try {
    await direct.connect();
    await direct.query(migrationSql);
    await direct.end();
    console.log("Commercial-offer migration applied via direct Supabase database host.");
    return;
  } catch (error) {
    try { await direct.end(); } catch { /* cleanup after failed connection */ }
    throw new Error(
      `Direct Supabase PostgreSQL access failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

applyMigration().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});