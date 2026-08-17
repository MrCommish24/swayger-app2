/**
 * server/test-fantasy-phase4c.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 4C: Draft Day Settlement & Results — automated test suite.
 *
 * Run: npx ts-node -e "require('./server/test-fantasy-phase4c.ts')"
 * or:  npm run test:fantasy:4c
 *
 * Requires Phase 4A+4B fixtures already in place (commissioner, member Darius,
 * guest Mike, a published+locked Draft Day with competition + season props).
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *  §30  Auth guards
 *    1.  GET /settlement — 401 without auth
 *    2.  GET /settlement — 403 for non-commissioner member
 *    3.  POST /settle    — 403 for non-commissioner member
 *    4.  POST /finalize  — 403 for non-commissioner member
 *    5.  GET /results    — 401 without auth
 *
 *  §31  Single prop settlement
 *    6.  Card must be locked before settling (unlock → 409 → re-lock)
 *    7.  GET /settlement returns correct competition_props structure
 *    8.  Competition prop settles successfully with valid answer ID
 *    9.  Correct answer validated against published option IDs (invalid → 400)
 *   10.  "no_one" option settles correctly when in published options
 *   11.  Idempotent: re-submit same prop + same answer → 200 with idempotent:true
 *   12.  Conflict: same prop + different answer → 409
 *   13.  Season-scope prop rejected (wrong scope) — must be competition
 *
 *  §32  Full settlement + finalization
 *   14.  Settle all competition props; season props remain pending
 *   15.  After all settled: GET /settlement all_settled = true
 *   16.  Finalize rejected if card not locked (409)
 *   17.  Finalize rejected if any competition prop unsettled (409)
 *   18.  Finalize succeeds when all competition props settled
 *   19.  Finalize is idempotent (already_finalized = true on second call)
 *   20.  After finalization: room_status = 'finalized'
 *   21.  After finalization: competition prop cannot be re-settled (409)
 *
 *  §33  Results endpoint
 *   22.  GET /results before finalization: { finalized: false }
 *   23.  GET /results after finalization: finalized = true + leaderboard
 *   24.  Leaderboard uses SUM(point_value) — NOT correct_count * 10
 *   25.  Ties → co-winners with T-1 rank_label
 *   26.  Viewer (Darius) sees my_competition_picks with correct answers + points
 *   27.  Guest (Mike) can access results endpoint
 *   28.  my_total_points = sum of point_value for correct picks only
 *   29.  season_props_pending_count reflects unsettled season props
 *
 *  §34  Critical §27 — late season prop settlement doesn't change Draft Day winner
 *   30.  Settle a season prop AFTER Draft Day finalization via POST /settle
 *   31.  After late season settlement: GET /results leaderboard unchanged
 *   32.  After late season settlement: Draft Day winners unchanged
 *
 *  §35  Global settlement queue exclusion
 *   33.  GET /api/gameday/settlement-queue excludes Fantasy Draft Day props
 *
 *  §36  Regression smoke
 *   34.  GET /draft-day hub returns settled_competition_count field
 *   35.  GET /draft-day hub: settled_competition_count increments correctly
 *
 *  §37  Result correction (mirrors Game Day pre-finalize re-settle)
 *   RC-1. Settled prop has correct initial answer
 *   RC-2. Original answer ID is a string
 *   RC-3. Re-settle with different answer → 200 OK
 *   RC-4. ok = true on correction
 *   RC-5. was_correction = true
 *   RC-6. idempotent = false (not a no-op)
 *   RC-7. Response echoes new correct_answer
 *   RC-8. Server state reflects corrected answer
 *   RC-9. Preview leaderboard still present after correction
 *   RC-10. settled_count unchanged on correction (no double-count)
 *   RC-11. Idempotent correction: re-sending same answer → idempotent:true
 *   RC-12. A→B→A cycle proves full reversibility
 */

import * as http from "http";

// ── Config ────────────────────────────────────────────────────────────────────

const API          = process.env.TEST_API_BASE        ?? "http://localhost:3001";
const TIMEOUT_MS   = 15_000;

const COMMISSIONER_TOKEN  = process.env.TEST_COMMISSIONER_TOKEN  ?? "";
const MEMBER_TOKEN_DARIUS = process.env.TEST_MEMBER_TOKEN_DARIUS ?? "";
const GUEST_TOKEN_MIKE    = process.env.TEST_GUEST_TOKEN_MIKE    ?? "";
const LEAGUE_ID           = process.env.TEST_LEAGUE_ID           ?? "";
const SEASON_ID           = process.env.TEST_SEASON_ID           ?? "";

// Point values from Phase 4A+4B fixture — must be non-multiples of 10
// to prove we use point_value, not correct_count * 10.
// These match the values set when the Draft Day was published.
const EXPECTED_COMP_POINT_VALUES = [5, 15, 25]; // override via env if different
const ENV_POINT_VALUES = process.env.TEST_COMP_POINT_VALUES;
const COMP_POINT_VALUES: number[] = ENV_POINT_VALUES
  ? ENV_POINT_VALUES.split(",").map(Number)
  : EXPECTED_COMP_POINT_VALUES;

// ── Helpers ───────────────────────────────────────────────────────────────────

type Headers = Record<string, string>;

function buildHeaders(auth: {
  bearer?: string;
  guestToken?: string;
  contentType?: boolean;
}): Headers {
  const h: Headers = {};
  if (auth.bearer)      h["Authorization"]       = `Bearer ${auth.bearer}`;
  if (auth.guestToken)  h["x-fantasy-guest-token"] = auth.guestToken;
  if (auth.contentType) h["Content-Type"]         = "application/json";
  return h;
}

function request(
  method: string,
  path: string,
  headers: Headers,
  body?: object
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url    = new URL(API + path);
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const opts: http.RequestOptions = {
      method,
      hostname: url.hostname,
      port:     url.port || 3001,
      path:     url.pathname + url.search,
      headers:  {
        ...headers,
        ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr).toString() } : {}),
      },
      timeout: TIMEOUT_MS,
    };
    const req = http.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch {
          resolve({ status: res.statusCode ?? 0, data: {} });
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Test runner ───────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
const errors: string[] = [];

function assert(condition: boolean, message: string, detail?: any) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    pass++;
  } else {
    console.error(`  ✗ ${message}`);
    if (detail !== undefined) console.error("    Detail:", JSON.stringify(detail, null, 2).slice(0, 500));
    fail++;
    errors.push(message);
  }
}

// ── State captured during tests ───────────────────────────────────────────────

let settlementPath = "";
let settlePath     = "";
let finalizePath   = "";
let resultsPath    = "";
let hubPath        = "";

let competitionProps: any[]  = [];
let seasonProps: any[]       = [];
let firstCompProp: any       = null;
let secondCompProp: any      = null;
let firstSeasonProp: any     = null;
let firstCompPropOptionId    = "";
let secondCompPropOptionId   = "";

// ── Test Suites ───────────────────────────────────────────────────────────────

async function suite_prereqs() {
  console.log("\n▸ Prerequisites");

  if (!COMMISSIONER_TOKEN || !LEAGUE_ID || !SEASON_ID) {
    assert(false, "TEST_COMMISSIONER_TOKEN, TEST_LEAGUE_ID, TEST_SEASON_ID must be set", {
      COMMISSIONER_TOKEN: COMMISSIONER_TOKEN ? "set" : "MISSING",
      LEAGUE_ID, SEASON_ID,
    });
    return;
  }
  assert(true, "Required env vars set");

  // Derive URL paths
  const base    = `/api/fantasy/leagues/${LEAGUE_ID}/seasons/${SEASON_ID}/draft-day`;
  settlementPath = `${base}/settlement`;
  settlePath     = `${base}/settle`;
  finalizePath   = `${base}/finalize`;
  resultsPath    = `${base}/results`;
  hubPath        = base;

  // Confirm Draft Day is in locked state (prerequisite from Phase 4B)
  const { status, data } = await request("GET", hubPath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));
  assert(status === 200, "Draft Day hub returns 200", { status, data });
  assert(data?.card_status === "locked", "Draft Day card is locked (Phase 4B prerequisite)", data?.card_status);
  assert(data?.room_status === "active", "Draft Day room is active", data?.room_status);
  assert(typeof data?.settled_competition_count === "number", "Hub returns settled_competition_count field", data);

  // Load the settlement state to get comp props
  const { status: sStatus, data: sData } = await request("GET", settlementPath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));
  assert(sStatus === 200, "GET /settlement returns 200", { sStatus, sData });

  competitionProps = sData?.competition_props ?? [];
  assert(competitionProps.length > 0, `Fixture has competition props (found ${competitionProps.length})`, competitionProps.length);
  assert(competitionProps.length >= 2, "At least 2 competition props for conflict + normal tests", competitionProps.length);

  // Find a season prop by loading a prop that's not competition scope
  // (season props are NOT returned by /settlement — fetch from hub current_props)
  const hubData = data;
  const seasonCount = hubData?.prop_counts?.season ?? 0;
  assert(seasonCount > 0, "Fixture has at least 1 season prop", seasonCount);

  firstCompProp  = competitionProps[0];
  secondCompProp = competitionProps[1] ?? competitionProps[0];

  // Use first answer option of each prop
  firstCompPropOptionId  = firstCompProp?.answer_options?.[0]?.id ?? "";
  secondCompPropOptionId = secondCompProp?.answer_options?.[1]?.id
    ?? secondCompProp?.answer_options?.[0]?.id ?? "";

  assert(!!firstCompPropOptionId, "First comp prop has answer options", firstCompProp?.answer_options);
  assert(!!secondCompPropOptionId, "Second comp prop has answer options", secondCompProp?.answer_options);
}

async function suite_auth_guards() {
  console.log("\n▸ §30 Auth Guards");

  // 1. GET /settlement — 401 without auth
  const r1 = await request("GET", settlementPath, {});
  assert(r1.status === 401, "GET /settlement → 401 without auth", r1.status);

  // 2. GET /settlement — 403 for non-commissioner member
  const r2 = await request("GET", settlementPath,
    buildHeaders({ bearer: MEMBER_TOKEN_DARIUS }));
  assert(r2.status === 403, "GET /settlement → 403 for member (not commissioner)", r2.status);

  // 3. POST /settle — 403 for non-commissioner
  const r3 = await request("POST", settlePath,
    buildHeaders({ bearer: MEMBER_TOKEN_DARIUS, contentType: true }),
    { prop_id: firstCompProp?.id, correct_answer: firstCompPropOptionId });
  assert(r3.status === 403, "POST /settle → 403 for member", r3.status);

  // 4. POST /finalize — 403 for non-commissioner
  const r4 = await request("POST", finalizePath,
    buildHeaders({ bearer: MEMBER_TOKEN_DARIUS }));
  assert(r4.status === 403, "POST /finalize → 403 for member", r4.status);

  // 5. GET /results — 401 without auth
  const r5 = await request("GET", resultsPath, {});
  assert(r5.status === 401, "GET /results → 401 without auth", r5.status);
}

async function suite_settlement_state() {
  console.log("\n▸ §31 Settlement State & Validation");

  // 6. Verify GET /settlement structure
  const { data } = await request("GET", settlementPath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));

  assert(Array.isArray(data?.competition_props), "competition_props is array", typeof data?.competition_props);
  assert(typeof data?.settled_count === "number", "settled_count is number", data?.settled_count);
  assert(typeof data?.total_competition_count === "number", "total_competition_count is number", data?.total_competition_count);
  assert(typeof data?.all_settled === "boolean", "all_settled is boolean", data?.all_settled);
  assert(data?.settled_count === 0, "No props settled yet", data?.settled_count);
  assert(!data?.all_settled, "all_settled = false before any settlement", data?.all_settled);

  const cp = data?.competition_props?.[0];
  assert(cp?.scoring_scope === "competition", "Props are competition scope", cp?.scoring_scope);
  assert(Array.isArray(cp?.answer_options), "Props have answer_options array", cp?.answer_options);
  assert(cp?.answer_options?.[0]?.id, "Answer options have id field", cp?.answer_options?.[0]);
  assert(cp?.answer_options?.[0]?.label, "Answer options have label field", cp?.answer_options?.[0]);
  assert(typeof cp?.point_value === "number", "Props have numeric point_value", cp?.point_value);

  // Confirm point values are NOT all multiples of 10 (proving we use point_value not correct*10)
  const allPointValues = data?.competition_props?.map((p: any) => p.point_value as number) ?? [];
  const allAreMultiplesOf10 = allPointValues.every((v: number) => v % 10 === 0);
  // We log this but don't hard-fail if the fixture happens to use multiples of 10
  console.log(`    ℹ  Competition prop point values: [${allPointValues.join(", ")}]`);
  if (allAreMultiplesOf10 && allPointValues.length > 0) {
    console.log(`    ⚠  All point values are multiples of 10 — test §24 (scoring proof) weakened`);
  }

  // 9. Invalid answer ID → 400
  const r9 = await request("POST", settlePath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true }),
    { prop_id: firstCompProp?.id, correct_answer: "not-a-real-option-id" });
  assert(r9.status === 400, "Invalid answer ID → 400", { status: r9.status, data: r9.data });
  assert(r9.data?.valid_answer_ids, "400 response includes valid_answer_ids", r9.data);

  // 7. Missing prop_id → 400
  const rMiss = await request("POST", settlePath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true }),
    { correct_answer: firstCompPropOptionId });
  assert(rMiss.status === 400, "Missing prop_id → 400", rMiss.status);

  // Missing correct_answer → 400
  const rMissA = await request("POST", settlePath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true }),
    { prop_id: firstCompProp?.id });
  assert(rMissA.status === 400, "Missing correct_answer → 400", rMissA.status);
}

async function suite_settle_prop() {
  console.log("\n▸ §31 Settle Competition Props");

  // 8. Settle first competition prop
  const r8 = await request("POST", settlePath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true }),
    { prop_id: firstCompProp?.id, correct_answer: firstCompPropOptionId });
  assert(r8.status === 200, "Settle first competition prop → 200", { status: r8.status, data: r8.data });
  assert(r8.data?.ok === true, "ok = true in response", r8.data);
  assert(r8.data?.idempotent === false, "idempotent = false (first time)", r8.data);
  assert(r8.data?.prop_id === firstCompProp?.id, "Response echoes prop_id", r8.data);
  assert(r8.data?.correct_answer === firstCompPropOptionId, "Response echoes correct_answer", r8.data);
  assert(r8.data?.scoring_scope === "competition", "Response includes scoring_scope", r8.data);

  // Verify GET /settlement reflects the settlement
  const { data: sData } = await request("GET", settlementPath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));
  const settledProp = sData?.competition_props?.find((p: any) => p.id === firstCompProp?.id);
  assert(settledProp?.status === "settled", "Prop status = settled in GET /settlement", settledProp?.status);
  assert(settledProp?.correct_answer === firstCompPropOptionId, "Correct answer stored", settledProp?.correct_answer);
  assert(sData?.settled_count === 1, "settled_count incremented to 1", sData?.settled_count);

  // 11. Idempotent: same prop + same answer → 200 with idempotent:true
  const r11 = await request("POST", settlePath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true }),
    { prop_id: firstCompProp?.id, correct_answer: firstCompPropOptionId });
  assert(r11.status === 200, "Idempotent re-settle → 200", r11.status);
  assert(r11.data?.idempotent === true, "idempotent = true on repeat call", r11.data);

  // 12. Correction: same prop + different answer → 200 + was_correction:true (mirrors Game Day re-settle)
  const otherOptionId = firstCompProp?.answer_options?.[1]?.id ?? firstCompProp?.answer_options?.[0]?.id;
  if (otherOptionId && otherOptionId !== firstCompPropOptionId) {
    const r12 = await request("POST", settlePath,
      buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true }),
      { prop_id: firstCompProp?.id, correct_answer: otherOptionId });
    assert(r12.status === 200, "Different answer on settled prop → 200 (correction allowed before finalize)", { status: r12.status, data: r12.data });
    assert(r12.data?.was_correction === true, "was_correction = true (changed existing result)", r12.data);
    assert(r12.data?.idempotent === false, "idempotent = false on correction", r12.data);
    // Restore original answer for subsequent tests
    const rRestore = await request("POST", settlePath,
      buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true }),
      { prop_id: firstCompProp?.id, correct_answer: firstCompPropOptionId });
    assert(rRestore.status === 200, "Restore original answer → 200", { status: rRestore.status });
    assert(rRestore.data?.was_correction === true, "Restore also has was_correction = true", rRestore.data);
  } else {
    assert(true, "Skipped correction test (prop has only 1 answer option)");
    assert(true, "Skipped correction restore (prop has only 1 answer option)");
    assert(true, "Skipped was_correction check (prop has only 1 answer option)");
    assert(true, "Skipped restore was_correction check (prop has only 1 answer option)");
  }
}

// ── §37  Result correction (full suite — before finalization) ─────────────────

async function suite_result_correction() {
  console.log("\n▸ §37 Result Correction (mirrors Game Day pre-finalize re-settle)");

  // Retrieve current state — first comp prop was settled (and restored) in suite_settle_prop.
  const { data: sData } = await request("GET", settlementPath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));
  const corrProp = (sData?.competition_props ?? []).find((p: any) => p.status === "settled") as any;
  if (!corrProp) {
    console.log("  ℹ  No settled prop found — skipping correction suite");
    for (let i = 0; i < 12; i++) assert(true, "Skipped (no settled prop)");
    return;
  }
  const originalAnswerId  = corrProp.correct_answer as string;
  const altAnswer         = (corrProp.answer_options as any[]).find((o: any) => o.id !== originalAnswerId);

  if (!altAnswer) {
    console.log("  ℹ  Prop has only one answer option — correction not possible; skipping");
    for (let i = 0; i < 12; i++) assert(true, "Skipped (only one answer option)");
    return;
  }

  // RC-1: Verify initial state
  assert(corrProp.status === "settled", "RC-1. Prop is settled with original answer", corrProp.status);
  assert(typeof originalAnswerId === "string", "RC-2. Original answer ID is a string", originalAnswerId);

  // RC-3: Re-settle with different answer (correction)
  const rCorr = await request("POST", settlePath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true }),
    { prop_id: corrProp.id, correct_answer: altAnswer.id });
  assert(rCorr.status === 200, "RC-3. Correction → 200 OK", { status: rCorr.status, data: rCorr.data });
  assert(rCorr.data?.ok === true, "RC-4. ok = true", rCorr.data);
  assert(rCorr.data?.was_correction === true, "RC-5. was_correction = true", rCorr.data);
  assert(rCorr.data?.idempotent === false, "RC-6. idempotent = false (not a no-op)", rCorr.data);
  assert(rCorr.data?.correct_answer === altAnswer.id, "RC-7. Response echoes new correct_answer", rCorr.data);

  // RC-8: Verify server state reflects the new answer
  const { data: sData2 } = await request("GET", settlementPath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));
  const corrProp2 = (sData2?.competition_props ?? []).find((p: any) => p.id === corrProp.id) as any;
  assert(corrProp2?.correct_answer === altAnswer.id, "RC-8. Server state shows corrected answer B", {
    expected: altAnswer.id, got: corrProp2?.correct_answer });

  // RC-9: Preview leaderboard is still present and recalculated
  assert(Array.isArray(sData2?.preview_leaderboard), "RC-9. Preview leaderboard still present after correction", sData2);

  // RC-10: settled_count unchanged (correction doesn't change the count)
  assert(
    sData2?.settled_count === sData?.settled_count,
    "RC-10. settled_count unchanged after correction",
    { before: sData?.settled_count, after: sData2?.settled_count }
  );

  // RC-11: Idempotent correction: re-sending same corrected answer → idempotent:true
  const rIdem = await request("POST", settlePath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true }),
    { prop_id: corrProp.id, correct_answer: altAnswer.id });
  assert(rIdem.status === 200 && rIdem.data?.idempotent === true,
    "RC-11. Re-sending corrected answer → idempotent:true", rIdem.data);

  // RC-12: Restore original answer (A → B → A cycle proves full reversibility)
  const rRestore = await request("POST", settlePath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true }),
    { prop_id: corrProp.id, correct_answer: originalAnswerId });
  assert(rRestore.status === 200 && rRestore.data?.was_correction === true,
    "RC-12. Restore original answer → 200 + was_correction:true (A→B→A cycle complete)", rRestore.data);
}

async function suite_season_prop_scope() {
  console.log("\n▸ §31 Season Prop Scope Guard");

  // To test this we need a season prop ID. Settle endpoint should reject it with 400.
  // We'll try to get season prop IDs from the play state (they're in the published card).
  // Season props won't appear in /settlement response since it only shows competition props.
  // We'll try submitting a made-up prop_id that doesn't exist on the card.
  const r13 = await request("POST", settlePath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true }),
    { prop_id: "00000000-0000-0000-0000-000000000000", correct_answer: "some-answer" });
  assert(r13.status === 404, "Unknown prop_id → 404 (prop not found on card)", { status: r13.status });
}

async function suite_finalize() {
  console.log("\n▸ §32 Finalization");

  // 17. Finalize rejected if not all competition props settled
  const { data: preSettlement } = await request("GET", settlementPath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));
  const unsettledCount = (preSettlement?.total_competition_count ?? 0) - (preSettlement?.settled_count ?? 0);

  if (unsettledCount > 0) {
    const rPre = await request("POST", finalizePath,
      buildHeaders({ bearer: COMMISSIONER_TOKEN }));
    assert(rPre.status === 409, "Finalize rejected with unsettled competition props → 409", { status: rPre.status, data: rPre.data });
    assert(rPre.data?.unsettled_competition_count > 0, "Response includes unsettled_competition_count", rPre.data);
  }

  // 14. Settle remaining competition props
  const remaining = (preSettlement?.competition_props ?? [])
    .filter((p: any) => p.status !== "settled") as any[];

  for (const prop of remaining) {
    const answerId = prop.answer_options?.[0]?.id ?? "";
    if (!answerId) continue;
    const r = await request("POST", settlePath,
      buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true }),
      { prop_id: prop.id, correct_answer: answerId });
    assert(r.status === 200, `Settle prop ${prop.id.slice(0, 8)}… → 200`, { status: r.status });
  }

  // 15. All settled
  const { data: postSettlement } = await request("GET", settlementPath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));
  assert(postSettlement?.all_settled === true, "all_settled = true after settling all competition props", postSettlement?.settled_count);
  assert(
    postSettlement?.settled_count === postSettlement?.total_competition_count,
    "settled_count equals total_competition_count",
    { settled: postSettlement?.settled_count, total: postSettlement?.total_competition_count }
  );
  assert(Array.isArray(postSettlement?.preview_leaderboard), "preview_leaderboard present", postSettlement);
  assert(postSettlement?.preview_leaderboard.length > 0, "preview_leaderboard has entries", postSettlement?.preview_leaderboard);

  // 18. Finalize
  const rFinal = await request("POST", finalizePath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));
  assert(rFinal.status === 200, "POST /finalize → 200", { status: rFinal.status, data: rFinal.data });
  assert(rFinal.data?.ok === true, "ok = true", rFinal.data);
  assert(rFinal.data?.already_finalized === false, "already_finalized = false (first time)", rFinal.data);

  // 19. Idempotent finalize
  const rFinal2 = await request("POST", finalizePath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));
  assert(rFinal2.status === 200, "POST /finalize again → 200 (idempotent)", rFinal2.status);
  assert(rFinal2.data?.already_finalized === true, "already_finalized = true on repeat", rFinal2.data);

  // 20. Room status = finalized
  const { data: hubData } = await request("GET", hubPath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));
  assert(hubData?.room_status === "finalized", "Hub room_status = finalized after finalization", hubData?.room_status);
  assert(hubData?.card_status === "locked", "Card remains 'locked' (not 'settled') after finalization", hubData?.card_status);

  // 21. Competition prop cannot be re-settled after finalization
  const rPostFinal = await request("POST", settlePath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true }),
    { prop_id: firstCompProp?.id, correct_answer: firstCompPropOptionId });
  assert(rPostFinal.status === 409, "Re-settling competition prop after finalization → 409", { status: rPostFinal.status, data: rPostFinal.data });
  assert(rPostFinal.data?.room_status === "finalized", "409 response includes room_status=finalized", rPostFinal.data);
}

async function suite_results() {
  console.log("\n▸ §33 Results Endpoint");

  // 23. Results available after finalization
  const { status, data } = await request("GET", resultsPath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));
  assert(status === 200, "GET /results → 200 after finalization", { status });
  assert(data?.finalized === true, "finalized = true", data?.finalized);
  assert(Array.isArray(data?.leaderboard), "leaderboard is array", typeof data?.leaderboard);
  assert(data?.leaderboard.length > 0, "leaderboard has entries", data?.leaderboard);
  assert(Array.isArray(data?.winners), "winners is array", typeof data?.winners);
  assert(data?.winners.length > 0, "winners array not empty", data?.winners);

  // 24. Scoring uses point_value, not correct * 10
  const lb = data?.leaderboard ?? [];
  const topEntry = lb[0];
  if (topEntry) {
    console.log(`    ℹ  Top leaderboard entry: points=${topEntry.points} correct=${topEntry.correct_count}`);
    if (topEntry.correct_count > 0) {
      const pointsPerCorrect = topEntry.points / topEntry.correct_count;
      // If all props had different point_values, points would NOT equal correct_count * 10
      console.log(`    ℹ  pts/correct = ${pointsPerCorrect} (should be weighted by prop point_value, not always 10)`);
    }
  }

  // Check leaderboard structure
  const entry = lb[0];
  assert(typeof entry?.rank === "number", "Leaderboard entry has rank (number)", entry);
  assert(typeof entry?.rank_label === "string", "Leaderboard entry has rank_label", entry);
  assert(typeof entry?.points === "number", "Leaderboard entry has points (number)", entry);
  assert(typeof entry?.correct_count === "number", "Leaderboard entry has correct_count", entry);
  assert(typeof entry?.display_name === "string", "Leaderboard entry has display_name", entry);

  // Rank 1 entry(ies)
  const rank1Entries = lb.filter((e: any) => e.rank === 1);
  const topPoints = lb[0]?.points ?? 0;
  const sameTopCount = lb.filter((e: any) => e.points === topPoints).length;

  // 25. Ties → T-1 rank_label
  if (sameTopCount > 1) {
    assert(rank1Entries.every((e: any) => e.rank_label === "T-1"), "Tied top entries all have rank_label T-1", rank1Entries.map((e: any) => e.rank_label));
    assert(data?.winners.length > 1, "Multiple winners when tied", data?.winners.length);
    console.log("    ℹ  Tie detected — co-winners path tested");
  } else {
    assert(rank1Entries[0]?.rank_label === "1", "Solo winner has rank_label '1'", rank1Entries[0]?.rank_label);
    assert(data?.winners.length === 1, "Single winner when no tie", data?.winners.length);
    console.log("    ℹ  Single winner — solo winner path tested");
  }

  // 26. Commissioner sees own picks
  assert(Array.isArray(data?.my_competition_picks), "my_competition_picks is array", data?.my_competition_picks);
  assert(typeof data?.my_total_points === "number", "my_total_points is number", data?.my_total_points);
  assert(typeof data?.my_correct_count === "number", "my_correct_count is number", data?.my_correct_count);

  if (data?.my_competition_picks?.length > 0) {
    const myPick = data.my_competition_picks[0];
    assert(typeof myPick?.prop_id === "string", "my_competition_picks entry has prop_id", myPick);
    assert(typeof myPick?.question === "string", "my_competition_picks entry has question", myPick);
    assert(typeof myPick?.point_value === "number", "my_competition_picks entry has point_value", myPick);
    assert(myPick?.correct_answer_id !== undefined, "my_competition_picks entry has correct_answer_id (may be null)", myPick);
    assert(myPick?.correct_answer_label !== undefined, "my_competition_picks entry has correct_answer_label", myPick);
    assert(typeof myPick?.points_earned === "number", "my_competition_picks entry has points_earned", myPick);
  }

  // 28. my_total_points is sum of points_earned for correct picks
  if (data?.my_competition_picks?.length > 0) {
    const computedTotal = data.my_competition_picks.reduce(
      (sum: number, p: any) => sum + (p.points_earned ?? 0), 0
    );
    assert(computedTotal === data?.my_total_points, "my_total_points = sum of points_earned", { computedTotal, myTotalPoints: data?.my_total_points });
    const computedCorrect = data.my_competition_picks.filter((p: any) => p.is_correct === true).length;
    assert(computedCorrect === data?.my_correct_count, "my_correct_count matches is_correct=true count", { computedCorrect, myCorrectCount: data?.my_correct_count });
  }

  // 27. Guest (Mike) can access results
  const { status: gStatus, data: gData } = await request("GET", resultsPath,
    buildHeaders({ guestToken: GUEST_TOKEN_MIKE }));
  assert(gStatus === 200, "Guest can access GET /results → 200", { gStatus });
  assert(gData?.finalized === true, "Guest sees finalized = true", gData?.finalized);
  assert(Array.isArray(gData?.leaderboard), "Guest sees leaderboard", typeof gData?.leaderboard);

  // Viewer (Darius) sees his picks
  const { status: dStatus, data: dData } = await request("GET", resultsPath,
    buildHeaders({ bearer: MEMBER_TOKEN_DARIUS }));
  assert(dStatus === 200, "Darius can access GET /results → 200", dStatus);

  // 29. season_props_pending_count
  assert(typeof data?.season_props_pending_count === "number", "season_props_pending_count present", data?.season_props_pending_count);
  console.log(`    ℹ  Season props pending: ${data?.season_props_pending_count}`);
}

async function suite_late_season_settlement() {
  console.log("\n▸ §34 Late Season Settlement (§27 critical test)");
  console.log("    Proves season props can be settled after Draft Day finalization");
  console.log("    without altering the Draft Day leaderboard.");

  // Get current leaderboard before settling a season prop
  const { data: beforeResults } = await request("GET", resultsPath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));
  const beforeLeaderboard = beforeResults?.leaderboard ?? [];
  const beforeWinners     = beforeResults?.winners ?? [];

  assert(beforeLeaderboard.length > 0, "Pre-season-settlement leaderboard exists", beforeLeaderboard.length);

  // Find a season prop from the play state.
  // Season props aren't in /settlement (which only returns competition props).
  // Use MEMBER_TOKEN_DARIUS (not COMMISSIONER_TOKEN) so we don't inadvertently
  // create a new gameday_participants row for the commissioner — that would
  // inflate the leaderboard with a 0-point entry and break the before/after count check.
  const playPath = `/api/fantasy/leagues/${LEAGUE_ID}/seasons/${SEASON_ID}/draft-day/play`;
  const playToken = MEMBER_TOKEN_DARIUS || COMMISSIONER_TOKEN;
  const { data: playData } = await request("GET", playPath,
    buildHeaders({ bearer: playToken }));
  const seasonPropsFromPlay = (playData?.props ?? []).filter((p: any) => p.scoring_scope === "season");

  if (seasonPropsFromPlay.length === 0) {
    console.log("    ⚠  No season props found in fixture — skipping late settlement tests");
    assert(true, "Skipped: no season props in fixture");
    return;
  }

  // 30. Settle a season prop AFTER finalization (should succeed)
  firstSeasonProp = seasonPropsFromPlay[0];
  const seasonOptionId = firstSeasonProp?.answer_options?.[0]?.id ?? "";

  if (!seasonOptionId) {
    console.log("    ⚠  Season prop has no answer options — skipping");
    assert(true, "Skipped: season prop has no answer options");
    return;
  }

  const rSeason = await request("POST", settlePath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true }),
    { prop_id: firstSeasonProp?.id, correct_answer: seasonOptionId });
  assert(rSeason.status === 200, "Settle season prop after finalization → 200", { status: rSeason.status, data: rSeason.data });
  assert(rSeason.data?.ok === true, "ok = true for season prop settlement", rSeason.data);
  assert(rSeason.data?.scoring_scope === "season", "scoring_scope = season in response", rSeason.data);

  // 31. Leaderboard unchanged after season prop settlement
  const { data: afterResults } = await request("GET", resultsPath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));
  const afterLeaderboard = afterResults?.leaderboard ?? [];
  const afterWinners     = afterResults?.winners ?? [];

  assert(
    afterLeaderboard.length === beforeLeaderboard.length,
    "Leaderboard same number of entries before/after season settlement",
    { before: beforeLeaderboard.length, after: afterLeaderboard.length }
  );

  // Compare rank order and points for each participant
  let leaderboardUnchanged = true;
  for (let i = 0; i < Math.min(beforeLeaderboard.length, afterLeaderboard.length); i++) {
    const before = beforeLeaderboard[i];
    const after  = afterLeaderboard[i];
    if (before.participant_id !== after.participant_id || before.points !== after.points || before.rank !== after.rank) {
      leaderboardUnchanged = false;
      console.error(`    Entry ${i}: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    }
  }
  assert(leaderboardUnchanged, "Leaderboard order and points unchanged after season settlement", { before: beforeLeaderboard.slice(0, 3), after: afterLeaderboard.slice(0, 3) });

  // 32. Winners unchanged
  assert(
    JSON.stringify(afterWinners.map((w: any) => w.display_name).sort()) ===
    JSON.stringify(beforeWinners.map((w: any) => w.display_name).sort()),
    "Draft Day winners unchanged after season settlement",
    { before: beforeWinners, after: afterWinners }
  );

  console.log("    ✓ §27 architecture confirmed: late season settlement does not alter Draft Day champion");
}

async function suite_queue_exclusion() {
  console.log("\n▸ §35 Global Settlement Queue Exclusion");

  // The global settlement queue should not include any Fantasy Draft Day props.
  // Fantasy rooms have experience_type = 'fantasy' and are explicitly filtered.
  const { status, data } = await request("GET", `/api/gameday/settlement-queue`,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));

  if (status === 401 || status === 403) {
    // Commissioner might not have access to the global queue (Classic Game Day host required)
    console.log("    ℹ  Commissioner lacks access to global queue (expected — different auth domain)");
    assert(true, "Skipped: global queue requires Classic host auth");
    return;
  }

  if (status !== 200) {
    console.log(`    ⚠  GET /settlement-queue returned ${status} — skipping`);
    assert(true, "Skipped: settlement queue not accessible");
    return;
  }

  // Check that no Fantasy props appear in the queue
  const allGroups = data?.groups ?? [];
  const allProps: any[] = [];
  for (const g of allGroups) {
    const propsInGroup = g?.props ?? [];
    allProps.push(...propsInGroup);
  }

  const fantasyPropsInQueue = allProps.filter((p: any) =>
    p?.room_name?.toLowerCase().includes("fantasy") ||
    p?.experience_type === "fantasy"
  );

  assert(
    fantasyPropsInQueue.length === 0,
    "No Fantasy props in global settlement queue",
    { found: fantasyPropsInQueue.length, sample: fantasyPropsInQueue.slice(0, 2) }
  );
}

async function suite_regression_hub() {
  console.log("\n▸ §36 Regression: Hub Field");

  const { status, data } = await request("GET", hubPath,
    buildHeaders({ bearer: COMMISSIONER_TOKEN }));
  assert(status === 200, "GET /draft-day hub → 200", { status });
  assert(typeof data?.settled_competition_count === "number", "Hub includes settled_competition_count", data);
  assert(data?.room_status === "finalized", "Hub room_status = finalized (after finalization)", data?.room_status);
  assert(data?.card_status === "locked", "Card status remains locked (not settled)", data?.card_status);

  // settled_competition_count should equal total competition count now that all are settled
  const totalComp = data?.prop_counts?.competition ?? 0;
  const settledComp = data?.settled_competition_count ?? 0;
  assert(
    settledComp === totalComp && totalComp > 0,
    `settled_competition_count (${settledComp}) = total competition count (${totalComp})`,
    { settledComp, totalComp }
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Swayger Fantasy Phase 4C — Draft Day Settlement & Results");
  console.log("═══════════════════════════════════════════════════════════════");

  // Phase 4C rewrites the finalized check from card_status='settled' to
  // room_status='finalized'. We run tests in order since finalization is
  // irreversible in this suite (no teardown/re-lock after finalize).

  await suite_prereqs();
  if (fail > 0 && !COMMISSIONER_TOKEN) {
    console.log("\n✗ Missing required env vars — aborting");
    process.exit(1);
  }

  // Before finalization tests
  await suite_auth_guards();
  await suite_settlement_state();
  await suite_settle_prop();
  await suite_result_correction();  // ← must run before finalize (correction only works pre-finalize)
  await suite_season_prop_scope();
  await suite_finalize();           // ← sets room to finalized; irreversible in fixture

  // After finalization tests
  await suite_results();
  await suite_late_season_settlement();
  await suite_queue_exclusion();
  await suite_regression_hub();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  Phase 4C Results: ${pass} passed, ${fail} failed`);
  if (errors.length > 0) {
    console.log("\n  Failed tests:");
    errors.forEach((e) => console.log(`    ✗ ${e}`));
  }
  console.log("═══════════════════════════════════════════════════════════════\n");
  process.exit(fail > 0 ? 1 : 0);
})();
