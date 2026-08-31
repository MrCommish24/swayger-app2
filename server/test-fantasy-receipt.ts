/**
 * Focused Global Draft Day Receipt regression suite.
 *
 * Uses an already-finalized Fantasy fixture and never mutates league data.
 *
 * Run:
 *   TEST_API_BASE=http://localhost:5000 \
 *   TEST_COMMISSIONER_TOKEN=... TEST_MEMBER_TOKEN_DARIUS=... \
 *   TEST_GUEST_TOKEN_MIKE=... TEST_LEAGUE_ID=... TEST_SEASON_ID=... \
 *   npx tsx server/test-fantasy-receipt.ts
 */

import * as http from "http";

const API = process.env.TEST_API_BASE ?? "http://localhost:5000";
const TIMEOUT_MS = 15_000;
const COMMISSIONER_TOKEN = process.env.TEST_COMMISSIONER_TOKEN ?? "";
const MEMBER_TOKEN = process.env.TEST_MEMBER_TOKEN_DARIUS ?? "";
const GUEST_TOKEN = process.env.TEST_GUEST_TOKEN_MIKE ?? "";
const LEAGUE_ID = process.env.TEST_LEAGUE_ID ?? "";
const SEASON_ID = process.env.TEST_SEASON_ID ?? "";

type Headers = Record<string, string>;

function request(path: string, headers: Headers = {}): Promise<{ status: number; data: any; raw: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(API + path);
    const req = http.request({
      method: "GET",
      hostname: url.hostname,
      port: url.port || 5000,
      path: url.pathname + url.search,
      headers,
      timeout: TIMEOUT_MS,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        try {
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw), raw });
        } catch {
          resolve({ status: res.statusCode ?? 0, data: {}, raw });
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    req.end();
  });
}

let pass = 0;
let fail = 0;

function assert(condition: boolean, message: string, detail?: unknown) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    pass++;
  } else {
    console.error(`  ✗ ${message}`, detail === undefined ? "" : detail);
    fail++;
  }
}

function bearer(token: string): Headers {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function sharedPayload(data: any) {
  return {
    finalized: data.finalized,
    league_name: data.league_name,
    season_year: data.season_year,
    winners: data.winners,
    leaderboard: data.leaderboard,
    competition_props: data.competition_props,
    total_competition_props: data.total_competition_props,
  };
}

async function main() {
  console.log("\n▸ Global Draft Day Receipt");
  const path = `/api/fantasy/leagues/${LEAGUE_ID}/seasons/${SEASON_ID}/draft-day/receipt`;

  assert(Boolean(LEAGUE_ID && SEASON_ID && COMMISSIONER_TOKEN), "Receipt fixture env vars are set");
  if (!LEAGUE_ID || !SEASON_ID || !COMMISSIONER_TOKEN) {
    console.error("Set TEST_COMMISSIONER_TOKEN, TEST_LEAGUE_ID, and TEST_SEASON_ID.");
    process.exitCode = 1;
    return;
  }

  const unauthenticated = await request(path);
  assert(unauthenticated.status === 401, "Unauthenticated receipt access → 401", unauthenticated);

  const commissioner = await request(path, bearer(COMMISSIONER_TOKEN));
  assert(commissioner.status === 200, "Commissioner can read receipt", commissioner.status);
  assert(commissioner.data.finalized === true, "Receipt is finalized", commissioner.data);
  assert(Array.isArray(commissioner.data.leaderboard), "Receipt leaderboard is an array");
  assert(Array.isArray(commissioner.data.winners), "Receipt winners is an array");
  assert(Array.isArray(commissioner.data.competition_props), "Receipt competition props is an array");
  assert(
    (commissioner.data.competition_props ?? []).every((prop: any) =>
      prop.scoring_scope === "competition" &&
      Array.isArray(prop.correct_answer_ids) &&
      Array.isArray(prop.correct_answer_labels)
    ),
    "Receipt includes only settled competition props with normalized answer arrays",
    commissioner.data.competition_props,
  );
  assert(
    !(commissioner.raw.includes("my_competition_picks") ||
      commissioner.raw.includes("my_pick") ||
      commissioner.raw.includes("is_correct") ||
      commissioner.raw.includes("guest_token") ||
      commissioner.raw.includes("viewer")),
    "Receipt payload has no viewer-specific pick, correctness, claim, or guest fields",
    commissioner.raw,
  );

  const multiCorrect = (commissioner.data.competition_props ?? [])
    .find((prop: any) => prop.correct_answer_ids.length > 1);
  if (multiCorrect) {
    assert(
      multiCorrect.correct_answer_ids.length === multiCorrect.correct_answer_labels.length,
      "Multi-correct receipt answers preserve one label per answer ID",
      multiCorrect,
    );
  } else {
    console.log("  · No multi-correct prop in this fixture; Phase 6G coverage remains in its focused suite");
  }

  if (MEMBER_TOKEN) {
    const member = await request(path, bearer(MEMBER_TOKEN));
    assert(member.status === 200, "Regular authenticated member can read receipt", member.status);
    assert(
      JSON.stringify(sharedPayload(member.data)) === JSON.stringify(sharedPayload(commissioner.data)),
      "Authenticated member receives the same viewer-independent receipt",
    );
  } else {
    console.log("  · TEST_MEMBER_TOKEN_DARIUS not set; regular-member branch skipped");
  }

  if (GUEST_TOKEN) {
    const guest = await request(path, { "x-fantasy-guest-token": GUEST_TOKEN });
    assert(guest.status === 200, "Valid guest member can read receipt", guest.status);
    assert(
      JSON.stringify(sharedPayload(guest.data)) === JSON.stringify(sharedPayload(commissioner.data)),
      "Guest member receives the same viewer-independent receipt",
    );
  } else {
    console.log("  · TEST_GUEST_TOKEN_MIKE not set; guest branch skipped");
  }

  console.log(`\nReceipt result: ${pass} passed, ${fail} failed`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error("Receipt suite failed to run:", error);
  process.exitCode = 1;
});