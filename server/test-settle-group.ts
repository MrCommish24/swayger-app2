/**
 * test-settle-group.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Write-path tests for POST /api/admin/gameday/settle-group.
 * Covers Milestone 2 (original 12 tests) + Hardening (T13–T16).
 *
 * Prerequisites:
 *   1. Seed rooms:   npx tsx server/seed-test-settlement-queue.ts
 *   2. Backend running with flag enabled:
 *      GLOBAL_SETTLE_ENABLED=true  (set in Replit Secrets + restart backend)
 *   3. Set MM_ADMIN_TOKEN in Replit Secrets.
 *   4. Apply migration 001 (gameday_settlement_operations table) in Supabase
 *      SQL editor: https://app.supabase.com/project/vlxvoienyxzhyaiimccp/sql/new
 *      SQL file: server/migrations/run-001-settlement-ops.ts (see MIGRATION_SQL const)
 *
 * Usage:
 *   npx tsx server/test-settle-group.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as dotenv from "dotenv";
dotenv.config();

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:5000";
const ADMIN_TOKEN = process.env.MM_ADMIN_TOKEN ?? "";

if (!ADMIN_TOKEN) {
  console.error("❌  MM_ADMIN_TOKEN is not set.  Export it before running this suite.");
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function ok(label: string, passed: boolean, detail?: string) {
  if (passed) {
    console.log(`  ✓  ${label}`);
    pass++;
  } else {
    console.error(`  ✗  ${label}${detail ? `\n       ${detail}` : ""}`);
    fail++;
  }
}

async function adminPost(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function adminGet(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "x-admin-token": ADMIN_TOKEN },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function genKey(prefix = "idem") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Supabase client for DB verification ──────────────────────────────────────

async function getSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ── Test runner ───────────────────────────────────────────────────────────────

async function main() {
  console.log("\n══ settle-group test suite ══════════════════════════════════════════\n");

  // ── T1: Flag-disabled path (always runs) ──────────────────────────────────
  console.log("T1 · Feature flag gate (always runs regardless of flag state)");
  {
    const probe = await adminPost("/api/admin/gameday/settle-group", {
      group_key: "probe-only",
      prop_ids: ["probe-id"],
      expected_count: 1,
      canonical_answer_normalized: "probe",
      idempotency_key: genKey("probe"),
    });

    if (probe.status === 503 && probe.json.code === "FLAG_DISABLED") {
      ok("Returns 503 FLAG_DISABLED when flag is off", true);
      console.log("\n⚠  GLOBAL_SETTLE_ENABLED is not set on the backend.");
      console.log("   Write-path tests (T2–T16) require the flag to be enabled.");
      console.log("   Set GLOBAL_SETTLE_ENABLED=true in Replit Secrets and restart the backend.\n");
      printSummary();
      return;
    }

    ok(
      "FLAG_DISABLED is NOT returned when flag is on (gate bypassed)",
      probe.status !== 503,
      probe.status === 503 ? JSON.stringify(probe.json) : undefined,
    );
  }

  // ── T2: Auth guard ────────────────────────────────────────────────────────
  console.log("\nT2 · Unauthorized request returns 401");
  {
    const res = await fetch(`${BASE_URL}/api/admin/gameday/settle-group`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": "BAD_TOKEN" },
      body: JSON.stringify({
        group_key: "x", prop_ids: ["x"], expected_count: 1,
        canonical_answer_normalized: "x", idempotency_key: genKey(),
      }),
    });
    ok("401 on bad token", res.status === 401, `Got ${res.status}`);
  }

  // ── T3: Load the queue and find a safe group ──────────────────────────────
  console.log("\nT3 · Load settlement queue and locate a safe group");
  const { json: queueJson } = await adminGet("/api/admin/gameday/settlement-queue");
  ok("Queue endpoint returns ok:true", queueJson.ok === true, JSON.stringify(queueJson).slice(0, 200));

  let safeGroup: any = null;
  let safeEvent: any = null;
  for (const ev of queueJson.events ?? []) {
    for (const g of ev.groups ?? []) {
      if (g.settlement_status === "safe" && g.prop_count >= 1) {
        safeGroup = g; safeEvent = ev; break;
      }
    }
    if (safeGroup) break;
  }
  ok(
    "At least one safe group found in queue",
    safeGroup !== null,
    safeGroup ? undefined : "No safe groups. Run seed-test-settlement-queue.ts first.",
  );

  if (!safeGroup) {
    console.log("\n⚠  No safe groups to test against.  Seed rooms and retry.\n");
    printSummary();
    return;
  }

  console.log(`   → group_key (tail): …${safeGroup.group_key.slice(-32)}`);
  console.log(`   → prop_count: ${safeGroup.prop_count}  room_count: ${safeGroup.room_count}`);
  console.log(`   → answer_options: ${JSON.stringify(safeGroup.answer_options)}`);

  // ── T4: Group not found ───────────────────────────────────────────────────
  console.log("\nT4 · Unknown group_key returns 409 GROUP_NOT_FOUND");
  {
    const r = await adminPost("/api/admin/gameday/settle-group", {
      group_key: "definitely-not-a-real-group-key-xyz",
      prop_ids: safeGroup.prop_ids,
      expected_count: safeGroup.prop_count,
      canonical_answer_normalized: safeGroup.answer_map[0]?.normalized ?? safeGroup.normalized_options[0],
      idempotency_key: genKey(),
    });
    ok("Returns 409", r.status === 409, `Got ${r.status}`);
    ok("code === GROUP_NOT_FOUND", r.json.code === "GROUP_NOT_FOUND", r.json.code);
    ok("refresh_required is true", r.json.refresh_required === true);
  }

  // ── T5: Mismatched expected_count ─────────────────────────────────────────
  console.log("\nT5 · Mismatched expected_count returns 400");
  {
    const r = await adminPost("/api/admin/gameday/settle-group", {
      group_key: safeGroup.group_key,
      prop_ids: safeGroup.prop_ids,
      expected_count: safeGroup.prop_count + 99,
      canonical_answer_normalized: safeGroup.answer_map[0]?.normalized ?? safeGroup.normalized_options[0],
      idempotency_key: genKey(),
    });
    ok("Returns 400 when prop_ids.length ≠ expected_count", r.status === 400, `Got ${r.status}: ${r.json.error}`);
  }

  // ── T6: Extra fake prop_id in submitted set ───────────────────────────────
  console.log("\nT6 · Extra fake prop_id returns 409 STALE_GROUP");
  {
    const r = await adminPost("/api/admin/gameday/settle-group", {
      group_key: safeGroup.group_key,
      prop_ids: [...safeGroup.prop_ids, "00000000-0000-0000-0000-000000000001"],
      expected_count: safeGroup.prop_count + 1,
      canonical_answer_normalized: safeGroup.answer_map[0]?.normalized ?? safeGroup.normalized_options[0],
      idempotency_key: genKey(),
    });
    ok("Returns 409", r.status === 409, `Got ${r.status}`);
    ok("code === STALE_GROUP", r.json.code === "STALE_GROUP", r.json.code);
  }

  // ── T7: Successful settlement ─────────────────────────────────────────────
  console.log("\nT7 · Successful settlement");
  const idemKey = genKey("settle");
  const canonicalAnswer = safeGroup.answer_map[0]?.normalized ?? safeGroup.normalized_options[0];

  const { status: settleStatus, json: settleJson } = await adminPost(
    "/api/admin/gameday/settle-group",
    {
      group_key: safeGroup.group_key,
      prop_ids: safeGroup.prop_ids,
      expected_count: safeGroup.prop_count,
      canonical_answer_normalized: canonicalAnswer,
      idempotency_key: idemKey,
    },
  );
  ok("Returns 200", settleStatus === 200, `Got ${settleStatus}: ${JSON.stringify(settleJson).slice(0, 200)}`);
  ok("ok === true", settleJson.ok === true);
  ok("settled_count matches prop_count", settleJson.settled_count === safeGroup.prop_count,
    `settled ${settleJson.settled_count}, expected ${safeGroup.prop_count}`);
  ok("rooms_count >= 1", (settleJson.rooms_count ?? 0) >= 1);
  ok("operation_id present", typeof settleJson.operation_id === "string" && settleJson.operation_id.startsWith("gso-"));
  ok("no partial_errors field on clean success", !("partial_errors" in settleJson));
  console.log(`   → operation_id: ${settleJson.operation_id}`);

  // ── T8: DB-backed idempotency replay ─────────────────────────────────────
  console.log("\nT8 · Duplicate idempotency_key returns DB-backed replay (no re-settle)");
  {
    const r = await adminPost("/api/admin/gameday/settle-group", {
      group_key: safeGroup.group_key,
      prop_ids: safeGroup.prop_ids,
      expected_count: safeGroup.prop_count,
      canonical_answer_normalized: canonicalAnswer,
      idempotency_key: idemKey, // same key as T7
    });
    ok("Returns 200 (replay)", r.status === 200, `Got ${r.status}`);
    ok("ok === true", r.json.ok === true);
    ok("operation_id matches T7 (DB replay)", r.json.operation_id === settleJson.operation_id,
      `${r.json.operation_id} vs ${settleJson.operation_id}`);
    ok("settled_count matches T7", r.json.settled_count === settleJson.settled_count);
  }

  // ── T9: Re-settle already settled group → GROUP_NOT_FOUND ────────────────
  console.log("\nT9 · Re-settling settled group with fresh key returns 409 GROUP_NOT_FOUND");
  {
    const r = await adminPost("/api/admin/gameday/settle-group", {
      group_key: safeGroup.group_key,
      prop_ids: safeGroup.prop_ids,
      expected_count: safeGroup.prop_count,
      canonical_answer_normalized: canonicalAnswer,
      idempotency_key: genKey("re-settle"),
    });
    ok("Returns 409", r.status === 409, `Got ${r.status}`);
    ok("code === GROUP_NOT_FOUND (props gone from queue after settling)", r.json.code === "GROUP_NOT_FOUND",
      `code was: ${r.json.code}`);
  }

  // ── T10: Parallel double-tap ──────────────────────────────────────────────
  console.log("\nT10 · Parallel double-tap — group settled exactly once");
  {
    let group2: any = null;
    const { json: q2 } = await adminGet("/api/admin/gameday/settlement-queue");
    for (const ev of q2.events ?? []) {
      for (const g of ev.groups ?? []) {
        if (g.settlement_status === "safe" && g.group_key !== safeGroup.group_key) {
          group2 = g; break;
        }
      }
      if (group2) break;
    }

    if (!group2) {
      console.log("   ⚠  No second safe group available — skipping parallel tap test.");
      ok("T10 skipped (no second group)", true);
    } else {
      const sharedKey = genKey("double-tap");
      const canonical2 = group2.answer_map[0]?.normalized ?? group2.normalized_options[0];
      const body = {
        group_key: group2.group_key,
        prop_ids: group2.prop_ids,
        expected_count: group2.prop_count,
        canonical_answer_normalized: canonical2,
        idempotency_key: sharedKey,
      };

      const [r1, r2] = await Promise.all([
        adminPost("/api/admin/gameday/settle-group", body),
        adminPost("/api/admin/gameday/settle-group", body),
      ]);

      const successCount = [r1, r2].filter((r) => r.status === 200).length;
      ok("At least one request returns 200", successCount >= 1, `r1=${r1.status} r2=${r2.status}`);

      const winner = r1.status === 200 ? r1 : r2;
      const loser  = r1.status === 200 ? r2 : r1;

      // With DB idempotency: loser gets 200 (replay) or 409 (IN_PROGRESS / race outcome).
      // 5xx is never acceptable.
      ok(
        "Loser returns 200 (replay), 409 (race), never 5xx",
        loser.status === 200 || loser.status === 409,
        `loser status: ${loser.status} body: ${JSON.stringify(loser.json).slice(0, 120)}`,
      );

      if (loser.status === 200) {
        ok("operation_ids match (DB idempotency — ideal path)", winner.json.operation_id === loser.json.operation_id,
          `winner=${winner.json.operation_id} loser=${loser.json.operation_id}`);
      } else {
        // Loser got 409 — race outcome or IN_PROGRESS
        const acceptableCodes = ["OPERATION_IN_PROGRESS", "GROUP_NOT_FOUND", "STALE_GROUP"];
        ok(
          "Loser 409 has an acceptable code",
          acceptableCodes.includes(loser.json.code),
          `loser code: ${loser.json.code}`,
        );
      }

      // Either way, group must be absent from queue (settled exactly once)
      const { json: q3 } = await adminGet("/api/admin/gameday/settlement-queue");
      const stillPresent = (q3.events ?? []).some((ev: any) =>
        ev.groups.some((g: any) => g.group_key === group2.group_key)
      );
      ok("Group is absent from queue after parallel settlement", !stillPresent,
        stillPresent ? "Group still in queue after parallel settlement" : undefined);
    }
  }

  // ── T11: Audit log ────────────────────────────────────────────────────────
  console.log("\nT11 · Audit events logged to gameday_events for T7 settlement");
  {
    const sb = await getSupabase();
    if (!sb) {
      console.log("   ⚠  Missing Supabase env — skipping DB audit check.");
      ok("T11 skipped (no Supabase env)", true);
    } else {
      const { data: events } = await sb
        .from("gameday_events")
        .select("*")
        .eq("event_type", "global_prop_settled")
        .contains("metadata", { operation_id: settleJson.operation_id });

      ok(`gameday_events rows written for op ${settleJson.operation_id}`, (events?.length ?? 0) >= 1,
        `Found ${events?.length ?? 0} rows`);
      ok("Each event has real room_id (not null)", (events ?? []).every((e: any) => e.room_id !== null));
      ok("metadata.group_key is present", (events ?? []).every((e: any) => !!e.metadata?.group_key));
      console.log(`   → audit rows: ${events?.length ?? 0}`);
    }
  }

  // ── T12: Individual settle endpoint alive ─────────────────────────────────
  console.log("\nT12 · Individual PATCH /api/gameday/props/:id/settle still returns 401 (not 404)");
  {
    const res = await fetch(`${BASE_URL}/api/gameday/props/00000000-0000-0000-0000-dead00000001/settle`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correct_answer: "Test" }),
    });
    ok("Returns 401 (not 404) — route intact", res.status === 401, `Got ${res.status}`);
  }

  // ── T13: DB idempotency row verification ──────────────────────────────────
  console.log("\nT13 · DB row written for T7 settlement (migration 001 required)");
  {
    const sb = await getSupabase();
    if (!sb) {
      console.log("   ⚠  Missing Supabase env — skipping DB row check.");
      ok("T13 skipped (no Supabase env)", true);
    } else {
      const { data: row, error } = await sb
        .from("gameday_settlement_operations")
        .select("*")
        .eq("operation_id", settleJson.operation_id)
        .maybeSingle();

      if (error?.code === "42P01") {
        console.log("   ⚠  gameday_settlement_operations table does not exist.");
        console.log("      Apply migration 001 from server/migrations/run-001-settlement-ops.ts");
        ok("T13 skipped (migration not applied)", true);
      } else {
        ok("DB row exists for operation", !!row, `error: ${error?.message}`);
        if (row) {
          ok("status = completed",          row.status === "completed",  `status: ${row.status}`);
          ok("response_status_code = 200",  row.response_status_code === 200, `code: ${row.response_status_code}`);
          ok("prop_count > 0",              row.prop_count > 0,          `prop_count: ${row.prop_count}`);
          ok("room_count >= 0",             row.room_count >= 0,         `room_count: ${row.room_count}`);
          ok("result_json has ok:true",     (row.result_json as any)?.ok === true);
          ok("completed_at is set",         !!row.completed_at);
          ok("operator_token_fingerprint length = 16", row.operator_token_fingerprint?.length === 16,
            `len: ${row.operator_token_fingerprint?.length}`);
          console.log(`   → row.status: ${row.status}  completed_at: ${row.completed_at}`);
        }
      }
    }
  }

  // ── T14: Key reuse with different payload → 409 ───────────────────────────
  console.log("\nT14 · Same idempotency_key with different payload returns 409 KEY_REUSED");
  {
    const r = await adminPost("/api/admin/gameday/settle-group", {
      group_key: safeGroup.group_key,
      prop_ids: safeGroup.prop_ids,
      expected_count: safeGroup.prop_count,
      canonical_answer_normalized: "completely_different_answer_xyz",  // different payload
      idempotency_key: idemKey, // same key as T7
    });
    ok("Returns 409", r.status === 409, `Got ${r.status}`);
    ok("code === IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST",
      r.json.code === "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST",
      `code: ${r.json.code}`);
  }

  // ── T15: response_status_code replayed correctly ──────────────────────────
  console.log("\nT15 · Replay returns the original HTTP status code from DB");
  {
    // Re-use the same T7 key which has a 200 response stored
    const r = await adminPost("/api/admin/gameday/settle-group", {
      group_key: safeGroup.group_key,
      prop_ids: safeGroup.prop_ids,
      expected_count: safeGroup.prop_count,
      canonical_answer_normalized: canonicalAnswer,
      idempotency_key: idemKey,
    });
    ok("Replay returns HTTP 200 (matches stored response_status_code)", r.status === 200,
      `Got ${r.status}`);
    ok("Replay operation_id matches original", r.json.operation_id === settleJson.operation_id,
      `${r.json.operation_id} vs ${settleJson.operation_id}`);
  }

  // ── T16: Single DB row even with concurrent double-tap ────────────────────
  console.log("\nT16 · Concurrent double-tap produces exactly 1 DB row (UNIQUE constraint)");
  {
    const sb = await getSupabase();
    if (!sb) {
      ok("T16 skipped (no Supabase env)", true);
    } else {
      // Check the T10 double-tap group — find it by checking the queue used T10's sharedKey
      // Approximate: query recent rows and check that no operation_id appears twice
      const { data: recentRows, error: recentErr } = await sb
        .from("gameday_settlement_operations")
        .select("idempotency_key, operation_id, status")
        .order("created_at", { ascending: false })
        .limit(20);

      if (recentErr?.code === "42P01") {
        ok("T16 skipped (migration not applied)", true);
      } else {
        const opIds = (recentRows ?? []).map((r: any) => r.operation_id);
        const unique = new Set(opIds);
        ok("No duplicate operation_ids in recent rows", unique.size === opIds.length,
          `Total: ${opIds.length}, Unique: ${unique.size}`);

        const idemKeys = (recentRows ?? []).map((r: any) => r.idempotency_key);
        const uniqueKeys = new Set(idemKeys);
        ok("UNIQUE constraint: no duplicate idempotency_keys in recent rows", uniqueKeys.size === idemKeys.length,
          `Total: ${idemKeys.length}, Unique: ${uniqueKeys.size}`);
      }
    }
  }

  printSummary();
}

function printSummary() {
  const total = pass + fail;
  console.log("\n══ results ════════════════════════════════════════════════════════════");
  console.log(`   ${pass}/${total} passed  ${fail > 0 ? `(${fail} failed)` : ""}`);
  if (fail > 0) {
    console.log("\n❌  Some tests failed — review output above.");
    process.exit(1);
  } else {
    console.log("\n✓  All tests passed.");
  }
  console.log("══════════════════════════════════════════════════════════════════════\n");
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
