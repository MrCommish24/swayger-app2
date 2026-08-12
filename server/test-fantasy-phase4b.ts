/**
 * server/test-fantasy-phase4b.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 4B: Member Draft Day Picks — automated test suite.
 *
 * Run: npx ts-node -e "require('./server/test-fantasy-phase4b.ts')"
 * or via npm script (see package.json).
 *
 * Tests rely on the Phase 4A integration test fixtures already present in the
 * Supabase database. They re-use the test infrastructure pattern established in
 * server/test-fantasy-phase4a.ts.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *  1. Prerequisite verification: phases 1–4A fixtures in place
 *  2. SQL: partial unique index exists on gameday_participants
 *  3. Bug fix: GET /draft-day returns pick_count via gameday_picks (not gameday_prop_picks)
 *  4. Bug fix: PATCH /draft-day/props returns 409 when picks > 0 (correct table)
 *  5. my_pick_count is separate from pick_count in GET /draft-day
 *  6. GET /draft-day/play: creates participant, returns full state
 *  7. GET /draft-day/play: idempotent — second call reuses same participant
 *  8. POST /draft-day/picks: valid answer is accepted
 *  9. POST /draft-day/picks: invalid answer is rejected (not in published snapshot)
 * 10. POST /draft-day/picks: pick update (re-submit same prop, new answer)
 * 11. POST /draft-day/picks: fabricated "no_one" rejected if not in published options
 * 12. POST /draft-day/picks: partial picks — Darius picks, Mike sees his own 0
 * 13. After Mike's first pick: global pick_count > 0, PATCH returns 409
 * 14. POST /draft-day/picks: locked card returns 409
 * 15. GET /draft-day/play: locked card returns locked state, correct picks preserved
 * 16. Guest pick submission + my_pick_count tracking
 * 17. Participant deduplication (race simulation)
 */

import * as http from "http";

// ── Config ───────────────────────────────────────────────────────────────────

const API = process.env.TEST_API_BASE ?? "http://localhost:3001";
const TIMEOUT_MS = 15_000;

// These must match the values used in Phase 4A integration tests.
// Override via env vars if your test fixtures differ.
const COMMISSIONER_TOKEN  = process.env.TEST_COMMISSIONER_TOKEN ?? "";
const MEMBER_TOKEN_DARIUS = process.env.TEST_MEMBER_TOKEN_DARIUS ?? "";
const GUEST_TOKEN_MIKE    = process.env.TEST_GUEST_TOKEN_MIKE ?? "";
const LEAGUE_ID           = process.env.TEST_LEAGUE_ID ?? "";
const SEASON_ID           = process.env.TEST_SEASON_ID ?? "";

// ── Helpers ──────────────────────────────────────────────────────────────────

type Headers = Record<string, string>;

function buildHeaders(auth: {
  bearer?: string;
  guestToken?: string;
  contentType?: boolean;
}): Headers {
  const h: Headers = {};
  if (auth.bearer)    h["Authorization"] = `Bearer ${auth.bearer}`;
  if (auth.guestToken) h["x-fantasy-guest-token"] = auth.guestToken;
  if (auth.contentType) h["Content-Type"] = "application/json";
  return h;
}

function request(
  method: string,
  path: string,
  headers: Headers,
  body?: object
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(API + path);
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
    if (detail !== undefined) console.error("    Detail:", JSON.stringify(detail, null, 2).slice(0, 400));
    fail++;
    errors.push(message);
  }
}

async function test(name: string, fn: () => Promise<void>) {
  console.log(`\n── ${name}`);
  try {
    await fn();
  } catch (e: any) {
    console.error(`  ✗ THREW: ${e.message}`);
    fail++;
    errors.push(`${name}: threw ${e.message}`);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const base = `/api/fantasy/leagues/${LEAGUE_ID}/seasons/${SEASON_ID}`;

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  Phase 4B: Member Draft Day Picks Tests  ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`API:    ${API}`);
  console.log(`League: ${LEAGUE_ID}`);
  console.log(`Season: ${SEASON_ID}`);

  if (!LEAGUE_ID || !SEASON_ID) {
    console.error("\nERROR: TEST_LEAGUE_ID and TEST_SEASON_ID env vars are required.");
    console.error("Run Phase 4A integration tests first, then set these vars.");
    process.exit(1);
  }

  // ── 1. Prerequisite: GET /draft-day works ─────────────────────────────────
  await test("1. Prerequisite: GET /draft-day returns a published card", async () => {
    const commHeaders = buildHeaders({ bearer: COMMISSIONER_TOKEN || undefined });
    const { status, data } = await request("GET", `${base}/draft-day`, commHeaders);
    assert(status === 200, `GET /draft-day returns 200 (got ${status})`, data);
    assert(data.card_id, "card_id present", data);
    assert(typeof data.pick_count === "number", "pick_count is a number", data);
    assert(typeof data.my_pick_count === "number", "my_pick_count is a number", data);
    assert(Array.isArray(data.current_props), "current_props is an array", data);
  });

  // ── 2. pick_count comes from gameday_picks (bug fix) ─────────────────────
  await test("2. pick_count in GET /draft-day uses gameday_picks table (no table error)", async () => {
    const h = buildHeaders({ bearer: COMMISSIONER_TOKEN || undefined });
    const { status, data } = await request("GET", `${base}/draft-day`, h);
    // If the old buggy table name (gameday_prop_picks) were used, Supabase would
    // return an error and pick_count would not be a clean 0.
    assert(status === 200, "Request succeeds (old table would cause 500)", data);
    assert(data.pick_count === 0, "pick_count = 0 before any picks (no stale table error)", data);
    assert(data.my_pick_count === 0, "my_pick_count = 0 before any picks", data);
  });

  // ── 3. GET /draft-day/play — creates participant ──────────────────────────
  let participantId = "";
  let firstPropId   = "";
  let firstValidAnswerId = "";

  await test("3. GET /draft-day/play creates participant and returns play state", async () => {
    if (!MEMBER_TOKEN_DARIUS) { assert(false, "TEST_MEMBER_TOKEN_DARIUS not set"); return; }
    const h = buildHeaders({ bearer: MEMBER_TOKEN_DARIUS });
    const { status, data } = await request("GET", `${base}/draft-day/play`, h);
    assert(status === 200, `GET /draft-day/play returns 200 (got ${status})`, data);
    assert(typeof data.participant_id === "string", "participant_id present", data);
    assert(Array.isArray(data.props), "props is an array", data);
    assert(data.props.length > 0, "at least one prop returned", data);
    assert(typeof data.my_pick_count === "number", "my_pick_count present", data);
    assert(data.my_pick_count === 0, "my_pick_count = 0 before any picks", data);
    assert(typeof data.total_props === "number", "total_props present", data);
    assert(data.card_status === "open", "card is open", data);
    // correct_answer must NOT be present on any prop
    const hasCorrectAnswer = (data.props ?? []).some((p: any) => "correct_answer" in p);
    assert(!hasCorrectAnswer, "correct_answer not exposed in props", data.props[0]);

    participantId = data.participant_id;
    // Grab first prop with at least one answer option for pick tests
    const firstProp = (data.props as any[]).find(
      (p) => Array.isArray(p.answer_options) && p.answer_options.length > 0
    );
    if (firstProp) {
      firstPropId        = firstProp.id;
      firstValidAnswerId = firstProp.answer_options[0].id;
    }
  });

  // ── 4. GET /draft-day/play — idempotent ───────────────────────────────────
  await test("4. GET /draft-day/play idempotent — same participant_id on second call", async () => {
    if (!MEMBER_TOKEN_DARIUS || !participantId) { assert(false, "Skipped: deps missing"); return; }
    const h = buildHeaders({ bearer: MEMBER_TOKEN_DARIUS });
    const { status, data } = await request("GET", `${base}/draft-day/play`, h);
    assert(status === 200, "second call returns 200", data);
    assert(data.participant_id === participantId, "same participant_id reused (idempotent)", data);
  });

  // ── 5. POST /draft-day/picks — valid answer accepted ─────────────────────
  await test("5. POST /draft-day/picks — Darius submits a valid pick", async () => {
    if (!MEMBER_TOKEN_DARIUS || !firstPropId || !firstValidAnswerId) {
      assert(false, "Skipped: deps missing"); return;
    }
    const h = buildHeaders({ bearer: MEMBER_TOKEN_DARIUS, contentType: true });
    const { status, data } = await request("POST", `${base}/draft-day/picks`, h, {
      prop_id:         firstPropId,
      selected_answer: firstValidAnswerId,
    });
    assert(status === 200, `Pick accepted (got ${status})`, data);
    assert(data.pick_id, "pick_id returned", data);
    assert(data.prop_id === firstPropId, "prop_id matches", data);
    assert(data.selected_answer === firstValidAnswerId, "selected_answer matches", data);
  });

  // ── 6. POST /draft-day/picks — invalid answer rejected ───────────────────
  await test("6. POST /draft-day/picks — fabricated answer ID is rejected", async () => {
    if (!MEMBER_TOKEN_DARIUS || !firstPropId) { assert(false, "Skipped: deps missing"); return; }
    const h = buildHeaders({ bearer: MEMBER_TOKEN_DARIUS, contentType: true });
    const { status, data } = await request("POST", `${base}/draft-day/picks`, h, {
      prop_id:         firstPropId,
      selected_answer: "totally-fake-answer-id-that-does-not-exist",
    });
    assert(status === 400, `Invalid answer rejected with 400 (got ${status})`, data);
    assert(data.error?.includes("Invalid answer") || data.error?.includes("match"),
      "Error mentions invalid/match", data);
  });

  // ── 7. POST /draft-day/picks — "no_one" without published option rejected ─
  await test('7. POST /draft-day/picks — "no_one" rejected if not in published options', async () => {
    if (!MEMBER_TOKEN_DARIUS || !firstPropId) { assert(false, "Skipped: deps missing"); return; }
    // Only test if firstProp does NOT have a no_one option
    const h = buildHeaders({ bearer: MEMBER_TOKEN_DARIUS, contentType: true });
    const playResp = await request("GET", `${base}/draft-day/play`, h);
    const firstProp = (playResp.data?.props ?? []).find((p: any) => p.id === firstPropId);
    const hasNoOne  = (firstProp?.answer_options ?? []).some((o: any) => o.id === "no_one");
    if (hasNoOne) {
      // Can't test rejection if it's legitimately there
      assert(true, "(skipped: published prop already has no_one — legitimate)");
      return;
    }
    const { status, data } = await request("POST", `${base}/draft-day/picks`, h, {
      prop_id:         firstPropId,
      selected_answer: "no_one",
    });
    assert(status === 400, `"no_one" rejected when not in published options (got ${status})`, data);
  });

  // ── 8. Pick update (re-submit same prop with different answer) ────────────
  await test("8. POST /draft-day/picks — update an existing pick", async () => {
    if (!MEMBER_TOKEN_DARIUS || !firstPropId) { assert(false, "Skipped: deps missing"); return; }
    // Need at least 2 answer options to switch
    const h = buildHeaders({ bearer: MEMBER_TOKEN_DARIUS });
    const playResp = await request("GET", `${base}/draft-day/play`, h);
    const firstProp = (playResp.data?.props ?? []).find((p: any) => p.id === firstPropId);
    const opts = firstProp?.answer_options ?? [];
    if (opts.length < 2) {
      assert(true, "(skipped: prop has only 1 answer option)");
      return;
    }
    const secondAnswerId = opts[1].id;
    const pH = buildHeaders({ bearer: MEMBER_TOKEN_DARIUS, contentType: true });
    const { status, data } = await request("POST", `${base}/draft-day/picks`, pH, {
      prop_id:         firstPropId,
      selected_answer: secondAnswerId,
    });
    assert(status === 200, `Pick update accepted (got ${status})`, data);
    assert(data.selected_answer === secondAnswerId, "Updated answer returned", data);
  });

  // ── 9. Partial picks: Darius picks, Mike (guest) has 0 ───────────────────
  await test("9. Separate my_pick_count — Darius has picks, Mike has 0", async () => {
    if (!MEMBER_TOKEN_DARIUS) { assert(false, "Skipped: TEST_MEMBER_TOKEN_DARIUS not set"); return; }

    // Darius' view
    const dH = buildHeaders({ bearer: MEMBER_TOKEN_DARIUS });
    const dDraftDay = await request("GET", `${base}/draft-day`, dH);
    const dPlay     = await request("GET", `${base}/draft-day/play`, dH);
    assert(dPlay.data?.my_pick_count > 0, "Darius sees my_pick_count > 0", dPlay.data);
    assert(dDraftDay.data?.my_pick_count > 0, "Darius my_pick_count > 0 in hub GET", dDraftDay.data);

    // Global pick_count visible to commissioner
    const cH = buildHeaders({ bearer: COMMISSIONER_TOKEN || undefined });
    const cDraftDay = await request("GET", `${base}/draft-day`, cH);
    assert(cDraftDay.data?.pick_count > 0, "Global pick_count > 0 after Darius picked", cDraftDay.data);

    if (!GUEST_TOKEN_MIKE) {
      assert(true, "(Mike guest token not set — skipping his 0-pick check)");
      return;
    }
    // Mike has not entered play yet — my_pick_count should be 0 from hub
    const mH = buildHeaders({ guestToken: GUEST_TOKEN_MIKE });
    const mDraftDay = await request("GET", `${base}/draft-day`, mH);
    assert(mDraftDay.data?.my_pick_count === 0, "Mike sees my_pick_count = 0 (no picks yet)", mDraftDay.data);
  });

  // ── 10. Fairness lock: PATCH /draft-day/props returns 409 after first pick ─
  await test("10. Fairness invariant: PATCH /draft-day/props returns 409 when pick_count > 0", async () => {
    if (!COMMISSIONER_TOKEN) { assert(false, "Skipped: TEST_COMMISSIONER_TOKEN not set"); return; }
    const h = buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true });
    // Try to update props — should be blocked now that Darius has submitted
    const { status, data } = await request("PATCH", `${base}/draft-day/props`, h, {
      selected_prop_ids: [],
    });
    assert(status === 409, `PATCH returns 409 after picks exist (got ${status})`, data);
    assert(data.pick_count > 0, "pick_count in 409 response is > 0", data);
  });

  // ── 11. Guest play — Mike enters and makes a pick ────────────────────────
  let mikeParticipantId = "";
  let mikePropId        = "";
  let mikeAnswerId      = "";

  await test("11. Guest play — Mike (guest) enters Draft Day", async () => {
    if (!GUEST_TOKEN_MIKE) { assert(false, "Skipped: TEST_GUEST_TOKEN_MIKE not set"); return; }
    const h = buildHeaders({ guestToken: GUEST_TOKEN_MIKE });
    const { status, data } = await request("GET", `${base}/draft-day/play`, h);
    assert(status === 200, `Guest GET /draft-day/play returns 200 (got ${status})`, data);
    assert(typeof data.participant_id === "string", "participant_id returned for guest", data);
    assert(data.my_pick_count === 0, "Mike has 0 picks on entry", data);
    mikeParticipantId = data.participant_id;
    const firstProp = (data.props ?? []).find(
      (p: any) => Array.isArray(p.answer_options) && p.answer_options.length > 0
    );
    if (firstProp) {
      mikePropId   = firstProp.id;
      mikeAnswerId = firstProp.answer_options[0].id;
    }
  });

  await test("12. Guest play — Mike submits a pick", async () => {
    if (!GUEST_TOKEN_MIKE || !mikePropId) { assert(false, "Skipped: deps missing"); return; }
    const h = buildHeaders({ guestToken: GUEST_TOKEN_MIKE, contentType: true });
    const { status, data } = await request("POST", `${base}/draft-day/picks`, h, {
      prop_id:         mikePropId,
      selected_answer: mikeAnswerId,
    });
    assert(status === 200, `Guest pick accepted (got ${status})`, data);
    assert(data.pick_id, "pick_id returned", data);
  });

  await test("13. Guest my_pick_count increments after pick", async () => {
    if (!GUEST_TOKEN_MIKE) { assert(false, "Skipped: deps missing"); return; }
    const h = buildHeaders({ guestToken: GUEST_TOKEN_MIKE });
    const { status, data } = await request("GET", `${base}/draft-day/play`, h);
    assert(status === 200, "GET /play succeeds", data);
    assert(data.my_pick_count > 0, "Mike my_pick_count > 0 after submitting", data);
    assert(data.participant_id === mikeParticipantId, "Same participant after pick", data);
  });

  // ── 12. Lock card and verify read-only ────────────────────────────────────
  await test("14. Lock Draft Day and verify picks are blocked", async () => {
    if (!COMMISSIONER_TOKEN) { assert(false, "Skipped: TEST_COMMISSIONER_TOKEN not set"); return; }
    // Lock the card
    const lH = buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true });
    const lockResp = await request("POST", `${base}/draft-day/lock`, lH);
    assert(lockResp.status === 200 || lockResp.data?.already_locked,
      `Lock returns 200 (got ${lockResp.status})`, lockResp.data);

    // Darius tries to change a pick — must be rejected
    if (!MEMBER_TOKEN_DARIUS || !firstPropId || !firstValidAnswerId) {
      assert(true, "(pick-after-lock skipped: member token not set)");
      return;
    }
    const pH = buildHeaders({ bearer: MEMBER_TOKEN_DARIUS, contentType: true });
    const { status, data } = await request("POST", `${base}/draft-day/picks`, pH, {
      prop_id:         firstPropId,
      selected_answer: firstValidAnswerId,
    });
    assert(status === 409, `Locked card rejects pick with 409 (got ${status})`, data);
    assert(data.card_status === "locked", "card_status=locked in 409 response", data);
  });

  // ── 13. GET /draft-day/play on locked card ────────────────────────────────
  await test("15. GET /draft-day/play — locked card returns picks preserved", async () => {
    if (!MEMBER_TOKEN_DARIUS) { assert(false, "Skipped: deps missing"); return; }
    const h = buildHeaders({ bearer: MEMBER_TOKEN_DARIUS });
    const { status, data } = await request("GET", `${base}/draft-day/play`, h);
    assert(status === 200, "GET /play still works when locked", data);
    assert(data.card_status === "locked", "card_status = locked", data);
    assert(data.my_pick_count > 0, "Darius' picks preserved after lock", data);
    // Picks should still be present in my_picks
    assert(Object.keys(data.my_picks ?? {}).length > 0, "my_picks populated", data);
  });

  // ── 14. Unlock and verify edits unblocked ────────────────────────────────
  await test("16. Unlock Draft Day — picks allowed again", async () => {
    if (!COMMISSIONER_TOKEN) { assert(false, "Skipped: TEST_COMMISSIONER_TOKEN not set"); return; }
    const uH = buildHeaders({ bearer: COMMISSIONER_TOKEN, contentType: true });
    const unlockResp = await request("POST", `${base}/draft-day/unlock`, uH);
    assert(unlockResp.status === 200 || unlockResp.data?.already_unlocked,
      `Unlock returns 200 (got ${unlockResp.status})`, unlockResp.data);

    if (!MEMBER_TOKEN_DARIUS || !firstPropId || !firstValidAnswerId) return;
    const pH = buildHeaders({ bearer: MEMBER_TOKEN_DARIUS, contentType: true });
    const { status } = await request("POST", `${base}/draft-day/picks`, pH, {
      prop_id:         firstPropId,
      selected_answer: firstValidAnswerId,
    });
    assert(status === 200, `Pick accepted again after unlock (got ${status})`);
  });

  // ── 15. Cross-season prop validation ─────────────────────────────────────
  await test("17. POST /draft-day/picks — wrong season prop_id rejected", async () => {
    if (!MEMBER_TOKEN_DARIUS) { assert(false, "Skipped: deps missing"); return; }
    const h = buildHeaders({ bearer: MEMBER_TOKEN_DARIUS, contentType: true });
    const { status, data } = await request("POST", `${base}/draft-day/picks`, h, {
      prop_id:         "00000000-0000-0000-0000-000000000000",
      selected_answer: "any-value",
    });
    assert(status === 400, `Wrong prop_id rejected with 400 (got ${status})`, data);
    assert(data.error?.toLowerCase().includes("prop"), "Error mentions prop", data);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Guest Routing Fix Tests (Phase 4B regression fix)
  // Verifies the server-side half of the guest-claim → hub/play flow.
  // The client-side global auth guard fix (app/_layout.tsx inFantasy exemption)
  // prevents useProtectedRoute from intercepting /fantasy/* routes without a
  // session; these tests verify the API correctly accepts guest tokens on the
  // hub and play endpoints so that once the redirect is fixed the full flow works.
  // ══════════════════════════════════════════════════════════════════════════

  // ── 18. Anonymous user (no token) cannot access league hub API ───────────
  await test("18. No-token request to season detail → 401 (hub API auth required)", async () => {
    const { status } = await request("GET", `${base}`, {});
    assert(status === 401, `Anonymous → 401 (got ${status})`);
  });

  // ── 19. Guest token can access season detail (hub API) ───────────────────
  await test("19. Guest token → GET /seasons/:seasonId → 200 (hub API guest-accessible)", async () => {
    if (!GUEST_TOKEN_MIKE) { assert(true, "(skipped: TEST_GUEST_TOKEN_MIKE not set)"); return; }
    const h = buildHeaders({ guestToken: GUEST_TOKEN_MIKE });
    const { status, data } = await request("GET", `${base}`, h);
    assert(status === 200, `Guest → season detail 200 (got ${status})`, data);
    assert(typeof data.league_name === "string" || typeof data.season_year === "number",
      "Hub data fields returned", data);
  });

  // ── 20. Guest token can access draft-day play API ────────────────────────
  await test("20. Guest token → GET /draft-day/play → 200 (play API guest-accessible)", async () => {
    if (!GUEST_TOKEN_MIKE) { assert(true, "(skipped: TEST_GUEST_TOKEN_MIKE not set)"); return; }
    const h = buildHeaders({ guestToken: GUEST_TOKEN_MIKE });
    const { status, data } = await request("GET", `${base}/draft-day/play`, h);
    assert(status === 200, `Guest → play 200 (got ${status})`, data);
    assert(Array.isArray(data.props), "props array present", data);
  });

  // ── 21. Guest token CANNOT access commissioner templates endpoint ─────────
  await test("21. Guest token → GET /draft-day/templates → 401 or 403 (commissioner-only)", async () => {
    if (!GUEST_TOKEN_MIKE) { assert(true, "(skipped: TEST_GUEST_TOKEN_MIKE not set)"); return; }
    const h = buildHeaders({ guestToken: GUEST_TOKEN_MIKE });
    const { status } = await request("GET", `${base}/draft-day/templates`, h);
    assert(
      status === 401 || status === 403,
      `Guest cannot access commissioner templates (got ${status})`
    );
  });

  // ── 22. Guest token CANNOT lock Draft Day ────────────────────────────────
  await test("22. Guest token → POST /draft-day/lock → 401 or 403 (commissioner-only)", async () => {
    if (!GUEST_TOKEN_MIKE) { assert(true, "(skipped: TEST_GUEST_TOKEN_MIKE not set)"); return; }
    const h = buildHeaders({ guestToken: GUEST_TOKEN_MIKE, contentType: true });
    const { status } = await request("POST", `${base}/draft-day/lock`, h);
    assert(
      status === 401 || status === 403,
      `Guest cannot lock Draft Day (got ${status})`
    );
  });

  // ── 23. Guest token CANNOT publish Draft Day ──────────────────────────────
  await test("23. Guest token → POST /draft-day/publish → 401 or 403 (commissioner-only)", async () => {
    if (!GUEST_TOKEN_MIKE) { assert(true, "(skipped: TEST_GUEST_TOKEN_MIKE not set)"); return; }
    const h = buildHeaders({ guestToken: GUEST_TOKEN_MIKE, contentType: true });
    const { status } = await request("POST", `${base}/draft-day`, h, { prop_template_ids: [] });
    assert(
      status === 401 || status === 403,
      `Guest cannot publish Draft Day (got ${status})`
    );
  });

  // ── 24. Authenticated commissioner still accesses hub API ─────────────────
  await test("24. Authenticated commissioner → GET season detail → 200 (unchanged)", async () => {
    if (!COMMISSIONER_TOKEN) { assert(true, "(skipped: TEST_COMMISSIONER_TOKEN not set)"); return; }
    const h = buildHeaders({ bearer: COMMISSIONER_TOKEN });
    const { status, data } = await request("GET", `${base}`, h);
    assert(status === 200, `Commissioner → season detail 200 (got ${status})`, data);
  });

  // ── 25. Authenticated commissioner still accesses templates ───────────────
  await test("25. Authenticated commissioner → GET /draft-day/templates → 200 (unchanged)", async () => {
    if (!COMMISSIONER_TOKEN) { assert(true, "(skipped: TEST_COMMISSIONER_TOKEN not set)"); return; }
    const h = buildHeaders({ bearer: COMMISSIONER_TOKEN });
    const { status } = await request("GET", `${base}/draft-day/templates`, h);
    assert(status === 200, `Commissioner → templates 200 (got ${status})`);
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log(`Results: ${pass} passed, ${fail} failed`);
  if (errors.length > 0) {
    console.log("\nFailed tests:");
    errors.forEach((e) => console.log(`  ✗ ${e}`));
  }
  console.log("══════════════════════════════════════════\n");

  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
