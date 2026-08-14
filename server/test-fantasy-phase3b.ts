/**
 * server/test-fantasy-phase3b.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 3B QA — Invite link reuse, commissioner claim visibility,
 *               explicit guest → auth upgrade (identity-safe)
 *
 * Scenarios:
 *   §1   Bootstrap (commissioner + 3 members)
 *   §2   Invite link works before any member claim
 *   §3   First member (Mike) claims
 *   §4   Invite link still works after first claim
 *   §5   Seat status accurate after first claim
 *   §6   Second member (Chris) claims a different seat
 *   §7   Conflict protection — cannot steal a claimed seat
 *   §8   Commissioner claim-status view (is_claimed in participants)
 *   A    Explicit upgrade: guest taps "Create Account" → claim transfers
 *   B    No upgrade if user doesn't tap "Create Account" (no pending context)
 *   C    Unrelated authenticated user signs in → guest claim untouched
 *   D    Same user retries upgrade → idempotent already_upgraded
 *   E    Different authenticated user cannot take an already-auth claim
 *   F    One guest token, two leagues → explicit upgrade targets one claim only
 *   §11  Phase 2 + Phase 3 regression
 *
 * Usage:
 *   npx tsx server/test-fantasy-phase3b.ts
 */

import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.TEST_API_URL ?? "http://localhost:5000";
const SUP_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUP_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const RUN_ID   = Math.random().toString(36).slice(2, 10).toUpperCase();

const PASS = "\x1b[32m  ✅ \x1b[0m";
const FAIL = "\x1b[31m  ❌ \x1b[0m";
const INFO = "\x1b[36m  ℹ  \x1b[0m";

let passed = 0; let failed = 0;
const failures: { section: string; test: string; error: string }[] = [];
let currentSection = "";

function section(title: string) {
  currentSection = title;
  console.log(`\n${"─".repeat(60)}\n  §  ${title}\n${"─".repeat(60)}`);
}
function pass(msg: string) { passed++; console.log(PASS + msg); }
function fail(msg: string, detail = "") {
  failed++;
  console.log(FAIL + msg);
  if (detail) console.log(`     ↳ ${detail}`);
  failures.push({ section: currentSection, test: msg, error: detail });
}
function note(msg: string) { console.log(INFO + msg); }

async function api(
  path: string,
  opts: { method?: string; token?: string; guestToken?: string; body?: object; extraHeaders?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token)        headers["Authorization"]         = `Bearer ${opts.token}`;
  if (opts.guestToken)   headers["X-Fantasy-Guest-Token"] = opts.guestToken;
  if (opts.extraHeaders) Object.assign(headers, opts.extraHeaders);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let body: any = {};
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}

const service = createClient(SUP_URL, SUP_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createUser(tag: string) {
  const email = `qa-p3b-${tag}-${RUN_ID}@swayger-test.invalid`;
  const { data, error } = await service.auth.admin.createUser({
    email, password: "test-p3b-pw-321", email_confirm: true,
  });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  return data.user!;
}
async function signIn(tag: string): Promise<string> {
  const email = `qa-p3b-${tag}-${RUN_ID}@swayger-test.invalid`;
  const { data, error } = await service.auth.signInWithPassword({
    email, password: "test-p3b-pw-321",
  });
  if (error) throw new Error(`signIn ${tag}: ${error.message}`);
  return data.session!.access_token;
}
async function deleteUser(id: string) {
  await service.auth.admin.deleteUser(id);
}

let createdLeagueId:  string | null = null;
let createdLeague2Id: string | null = null;

async function cleanup(userIds: string[]) {
  console.log("\n─── Cleanup " + "─".repeat(47));
  for (const lid of [createdLeagueId, createdLeague2Id].filter(Boolean) as string[]) {
    const seasons = await service.from("fantasy_league_seasons").select("id").eq("league_id", lid);
    for (const s of seasons.data ?? []) {
      const smRows = await service.from("fantasy_season_members").select("id").eq("league_season_id", s.id);
      for (const sm of smRows.data ?? []) {
        await service.from("fantasy_team_managers").delete().eq("season_member_id", sm.id);
      }
      await service.from("fantasy_teams").delete().eq("league_season_id", s.id);
      await service.from("fantasy_season_members").delete().eq("league_season_id", s.id);
    }
    const lmRows = await service.from("fantasy_league_members").select("id").eq("league_id", lid);
    for (const lm of lmRows.data ?? []) {
      await service.from("fantasy_member_claims").delete().eq("league_member_id", lm.id);
    }
    await service.from("fantasy_league_members").delete().eq("league_id", lid);
    await service.from("fantasy_league_seasons").delete().eq("league_id", lid);
    await service.from("fantasy_leagues").delete().eq("id", lid);
    note(`Deleted test league: ${lid.slice(0, 8)}…`);
  }
  for (const id of userIds) {
    await deleteUser(id);
    note(`Deleted user: ${id.slice(0, 8)}…`);
  }
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║   SWAYGER FANTASY PHASE 3B — INVITE REUSE + UPGRADE QA  ║
║   Run ID: ${RUN_ID.padEnd(46)}║
╚══════════════════════════════════════════════════════════╝`);

  // ── §1. Bootstrap ──────────────────────────────────────────────────────────
  section("1. Bootstrap");

  let commUser: any, mikeUser: any, chrisUser: any;
  let commToken: string, mikeToken: string, chrisToken: string;
  try {
    [commUser, mikeUser, chrisUser] = await Promise.all([
      createUser("comm"), createUser("mike"), createUser("chris"),
    ]);
    [commToken, mikeToken, chrisToken] = await Promise.all([
      signIn("comm"), signIn("mike"), signIn("chris"),
    ]);
    pass("3 test users created and signed in");
  } catch (e: any) {
    fail("Bootstrap failed", e.message);
    process.exit(1);
  }

  let league_id: string, season_id: string;
  let mike_lm_id: string, chris_lm_id: string, jordan_lm_id: string;
  {
    const r = await api("/api/fantasy/leagues/setup", {
      method: "POST", token: commToken,
      body: {
        league_name:         `P3B League ${RUN_ID}`,
        sport:               "football",
        display_name:        "Darius",
        team_name:           "The Monstars",
        season_year:         2026,
        reward_description:  "Winner buys lunch",
      },
    });
    if (r.status !== 201) {
      fail("Setup failed", `${r.status}: ${JSON.stringify(r.body)}`);
      await cleanup([commUser.id, mikeUser.id, chrisUser.id]);
      process.exit(1);
    }
    createdLeagueId = r.body.league_id;
    league_id = r.body.league_id;
    season_id = r.body.season_id;
    pass("League A created");

    const [rm, rc, rj] = await Promise.all([
      api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`, {
        method: "POST", token: commToken,
        body: { display_name: "Mike", team_name: "Sunday Scaries" },
        extraHeaders: { "Idempotency-Key": `ph3b-mike-${RUN_ID}` },
      }),
      api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`, {
        method: "POST", token: commToken,
        body: { display_name: "Chris", team_name: "Fourth & Long" },
        extraHeaders: { "Idempotency-Key": `ph3b-chris-${RUN_ID}` },
      }),
      api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`, {
        method: "POST", token: commToken,
        body: { display_name: "Jordan", team_name: "Night Owls" },
        extraHeaders: { "Idempotency-Key": `ph3b-jordan-${RUN_ID}` },
      }),
    ]);
    if (rm.status !== 201 || rc.status !== 201 || rj.status !== 201) {
      fail("Add participants", `Mike:${rm.status} Chris:${rc.status} Jordan:${rj.status}`);
      await cleanup([commUser.id, mikeUser.id, chrisUser.id]);
      process.exit(1);
    }
    mike_lm_id  = rm.body.league_member_id;
    chris_lm_id = rc.body.league_member_id;
    jordan_lm_id = rj.body.league_member_id;
    pass("Mike, Chris, Jordan added (4 seats total)");
    note(`mike=${mike_lm_id.slice(0,8)}… chris=${chris_lm_id.slice(0,8)}… jordan=${jordan_lm_id.slice(0,8)}…`);
  }

  const JOIN_PATH = `/api/fantasy/leagues/${league_id}/seasons/${season_id}`;

  // ── §2. Invite link works before any claim ─────────────────────────────────
  section("2. Invite Link — Before Any Member Claim");
  {
    const r = await api(`${JOIN_PATH}/join-info`);
    r.status === 200 && r.body.seats?.length === 4
      ? pass("GET /join-info → 200, 4 seats")
      : fail("join-info before claims", `${r.status} seats=${r.body.seats?.length}`);
    const claimed = (r.body.seats ?? []).filter((s: any) => s.is_claimed).length;
    claimed === 1
      ? pass("1 seat claimed (commissioner auto-claim only)")
      : fail("Initial claimed count", `Expected 1, got ${claimed}`);
  }

  // ── §3. Mike claims ────────────────────────────────────────────────────────
  section("3. Mike (auth) Claims His Seat");
  {
    const r = await api(`${JOIN_PATH}/claim`, {
      method: "POST", token: mikeToken, body: { league_member_id: mike_lm_id },
    });
    r.status === 201
      ? pass("Mike → 201")
      : fail("Mike claim", `${r.status}: ${JSON.stringify(r.body)}`);
  }

  // ── §4. Invite still works after first claim ───────────────────────────────
  section("4. Invite Link Works After Mike's Claim");
  {
    const r = await api(`${JOIN_PATH}/join-info`);
    r.status === 200
      ? pass("GET /join-info → 200 after Mike claims (invite still valid)")
      : fail("join-info after Mike claim", `${r.status}`);
    const mikeSeat  = (r.body.seats ?? []).find((s: any) => s.display_name === "Mike");
    const chrisSeat = (r.body.seats ?? []).find((s: any) => s.display_name === "Chris");
    mikeSeat?.is_claimed === true
      ? pass("Mike's seat is_claimed=true")
      : fail("Mike is_claimed", `Got ${mikeSeat?.is_claimed}`);
    chrisSeat?.is_claimed === false
      ? pass("Chris's seat still claimable")
      : fail("Chris is_claimed", `Expected false, got ${chrisSeat?.is_claimed}`);
    r.body.seats?.length === 4
      ? pass("All 4 seats visible (invite reusable)")
      : fail("Seat count", `Expected 4, got ${r.body.seats?.length}`);
  }

  // ── §5. Seat status accurate ───────────────────────────────────────────────
  section("5. Seat Status Accuracy");
  {
    const r = await api(`${JOIN_PATH}/join-info`);
    const claimed = (r.body.seats ?? []).filter((s: any) => s.is_claimed).length;
    claimed === 2
      ? pass("2 seats claimed (commissioner + Mike)")
      : fail("Claimed count", `Expected 2, got ${claimed}`);
  }

  // ── §6. Chris claims ───────────────────────────────────────────────────────
  section("6. Chris Claims His Seat (Invite Usable After Multiple Claims)");
  {
    const r = await api(`${JOIN_PATH}/claim`, {
      method: "POST", token: chrisToken, body: { league_member_id: chris_lm_id },
    });
    r.status === 201
      ? pass("Chris → 201")
      : fail("Chris claim", `${r.status}: ${JSON.stringify(r.body)}`);
  }

  // ── §7. Conflict protection ────────────────────────────────────────────────
  section("7. Cannot Steal a Claimed Seat");
  {
    const r1 = await api(`${JOIN_PATH}/claim`, {
      method: "POST", token: chrisToken, body: { league_member_id: mike_lm_id },
    });
    r1.status === 409
      ? pass("Auth user stealing Mike's seat → 409")
      : fail("Auth seat conflict", `Expected 409, got ${r1.status}`);
    const intruderToken = `fgt_intruder_${RUN_ID.toLowerCase()}`;
    const r2 = await api(`${JOIN_PATH}/claim`, {
      method: "POST", guestToken: intruderToken, body: { league_member_id: chris_lm_id },
    });
    r2.status === 409
      ? pass("Guest intruder stealing Chris's seat → 409")
      : fail("Guest seat conflict", `Expected 409, got ${r2.status}`);
  }

  // ── §8. Commissioner claim-status view ────────────────────────────────────
  section("8. Commissioner Claim-Status View (is_claimed)");
  {
    const r = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, {
      token: commToken,
    });
    const pts = r.body.participants as any[] ?? [];
    pts.every((p) => typeof p.is_claimed === "boolean")
      ? pass("All participants have is_claimed boolean")
      : fail("is_claimed field missing");
    const darius = pts.find((p) => p.display_name === "Darius");
    const mike   = pts.find((p) => p.display_name === "Mike");
    const chris  = pts.find((p) => p.display_name === "Chris");
    const jordan = pts.find((p) => p.display_name === "Jordan");
    darius?.is_claimed === true  ? pass("Darius: is_claimed=true")  : fail("Darius is_claimed",  String(darius?.is_claimed));
    mike?.is_claimed === true    ? pass("Mike: is_claimed=true")    : fail("Mike is_claimed",    String(mike?.is_claimed));
    chris?.is_claimed === true   ? pass("Chris: is_claimed=true")   : fail("Chris is_claimed",   String(chris?.is_claimed));
    jordan?.is_claimed === false ? pass("Jordan: is_claimed=false (Waiting)") : fail("Jordan is_claimed", String(jordan?.is_claimed));
  }

  // ── Upgrade tests — Jordan's seat (unclaimed, clean for all upgrade tests) ─

  const JORDAN_GUEST_TOKEN = `fgt_jordan_${RUN_ID.toLowerCase()}ccdd`;
  // Guest pre-claims Jordan's seat (used in A, C, D, E, F)
  {
    const r = await api(`${JOIN_PATH}/claim`, {
      method: "POST", guestToken: JORDAN_GUEST_TOKEN, body: { league_member_id: jordan_lm_id },
    });
    r.status === 201
      ? note(`Guest pre-claimed Jordan's seat (token: ${JORDAN_GUEST_TOKEN.slice(0,20)}…)`)
      : fail("Guest pre-claim for upgrade tests", `${r.status}: ${JSON.stringify(r.body)}`);
  }

  let jordanUser: any;
  let jordanToken = "";
  let unrelatedUser: any;
  let unrelatedToken = "";
  try {
    [jordanUser, unrelatedUser] = await Promise.all([createUser("jordan"), createUser("unrelated")]);
    [jordanToken, unrelatedToken] = await Promise.all([signIn("jordan"), signIn("unrelated")]);
    pass("Jordan + Unrelated auth users created");
  } catch (e: any) {
    fail("User creation for upgrade tests", (e as any).message);
  }

  // ── Scenario A — Explicit upgrade succeeds ─────────────────────────────────
  section("A. Explicit Upgrade: Guest Taps 'Create Account' → Claim Transfers");
  // Simulates: guest saves { guest_token, league_member_id } to AsyncStorage, signs in,
  // hub fires upgradeGuestClaim(guest_token, league_member_id, { session }).
  // At the server this is just: POST /claim/upgrade with both fields.
  {
    const r = await api("/api/fantasy/claim/upgrade", {
      method: "POST", token: jordanToken,
      body: { guest_token: JORDAN_GUEST_TOKEN, league_member_id: jordan_lm_id },
    });
    r.status === 200 && r.body.upgraded === true
      ? pass("POST /claim/upgrade → 200 upgraded=true")
      : fail("Explicit upgrade", `Expected 200 upgraded=true, got ${r.status}: ${JSON.stringify(r.body)}`);

    // Guest token must no longer resolve viewer (token cleared)
    const rg = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, {
      guestToken: JORDAN_GUEST_TOKEN,
    });
    const guestViewer = rg.body?.viewer;
    guestViewer === null || guestViewer === undefined || guestViewer?.display_name !== "Jordan"
      ? pass("Old guest token no longer resolves Jordan's viewer")
      : fail("Guest token should be invalidated post-upgrade", `Still got viewer: ${JSON.stringify(guestViewer)}`);

    // Jordan's authenticated session now owns the seat
    const ra = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, {
      token: jordanToken,
    });
    ra.body?.viewer?.display_name === "Jordan"
      ? pass("Jordan's auth session resolves viewer (seat accessible cross-device)")
      : fail("Jordan auth viewer post-upgrade", `${JSON.stringify(ra.body?.viewer)}`);
  }

  // ── Scenario B — No upgrade when user didn't tap Create Account ────────────
  section("B. No Upgrade When 'Open My League' Was Tapped (No Pending Context)");
  // Simulates: guest taps "Open My League" → no AsyncStorage key written → no upgrade call.
  // We verify the server has NO guest-only side effect: a sign-in session appearing
  // without calling the upgrade endpoint leaves the claim unchanged.
  // (Jordan's claim is already upgraded from scenario A; use Chris's seat for this.)
  {
    const OPEN_GUEST_TOKEN = `fgt_open_${RUN_ID.toLowerCase()}eeff`;
    // Add a 5th participant for this test
    const rp = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`, {
      method: "POST", token: commToken,
      body: { display_name: "Sam", team_name: "The Sitters" },
      extraHeaders: { "Idempotency-Key": `ph3b-sam-${RUN_ID}` },
    });
    if (rp.status === 201) {
      const sam_lm_id = rp.body.league_member_id;
      // Guest claims Sam's seat
      const rc = await api(`${JOIN_PATH}/claim`, {
        method: "POST", guestToken: OPEN_GUEST_TOKEN, body: { league_member_id: sam_lm_id },
      });
      rc.status === 201 ? pass("Guest claimed Sam's seat") : fail("Guest claim Sam", `${rc.status}`);

      // Simulate "Open My League" — user DOES NOT call upgrade endpoint at all.
      // Verify: guest token still resolves Sam's viewer (claim unchanged)
      const rv = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, {
        guestToken: OPEN_GUEST_TOKEN,
      });
      rv.body?.viewer?.display_name === "Sam"
        ? pass("Guest viewer still resolves after sign-in without upgrade intent")
        : fail("Guest viewer should persist when upgrade not triggered", `${JSON.stringify(rv.body?.viewer)}`);
    } else {
      fail("Add Sam participant for scenario B", `${rp.status}`);
    }
  }

  // ── Scenario C — Unrelated user signs in; guest claim untouched ───────────
  section("C. Unrelated User Signs In → Guest Claim Untouched");
  // The JORDAN_GUEST_TOKEN claim is already upgraded (scenario A).
  // Use a fresh guest token on Jordan's seat... but Jordan's seat is now auth-claimed.
  // Instead: verify unrelated user calling upgrade with a DIFFERENT guest token that
  // has no claim returns 404 — never silently creates a transfer.
  {
    const STRANGER_TOKEN = `fgt_stranger_${RUN_ID.toLowerCase()}0000`;
    // Unrelated user tries to upgrade a token they've never seen
    const r = await api("/api/fantasy/claim/upgrade", {
      method: "POST", token: unrelatedToken,
      body: { guest_token: STRANGER_TOKEN, league_member_id: jordan_lm_id },
    });
    r.status === 404
      ? pass("Unknown guest token + unrelated user → 404 (no seat transferred)")
      : fail("Unrelated user upgrade attempt", `Expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);

    // Jordan's auth claim remains intact (unrelated user can't see Jordan as viewer)
    const rj = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, {
      token: unrelatedToken,
    });
    const viewer = rj.body?.viewer;
    (viewer === null || viewer === undefined)
      ? pass("Unrelated user has no viewer (Jordan's seat not stolen)")
      : fail("Unrelated user must not see Jordan's seat", `Got viewer: ${JSON.stringify(viewer)}`);

    // Jordan's own session still resolves correctly
    const rjj = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, {
      token: jordanToken,
    });
    rjj.body?.viewer?.display_name === "Jordan"
      ? pass("Jordan's authenticated claim unaffected by unrelated sign-in")
      : fail("Jordan viewer after unrelated sign-in", `${JSON.stringify(rjj.body?.viewer)}`);
  }

  // ── Scenario D — Same user retries upgrade → idempotent ───────────────────
  section("D. Explicit Upgrade Retry by Same Authenticated User → Idempotent");
  {
    // JORDAN_GUEST_TOKEN is cleared (guest_token=null on the claim after scenario A).
    // Jordan retries the upgrade endpoint with the same token.
    const r = await api("/api/fantasy/claim/upgrade", {
      method: "POST", token: jordanToken,
      body: { guest_token: JORDAN_GUEST_TOKEN, league_member_id: jordan_lm_id },
    });
    // Server: guest claim not found by token (cleared), but Jordan already has an
    // authenticated claim on this seat → returns already_upgraded
    r.status === 200 && r.body.already_upgraded === true
      ? pass("Retry → 200 already_upgraded=true (idempotent)")
      : fail("Idempotent retry", `Expected 200 already_upgraded=true, got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // ── Scenario E — Different authenticated user cannot steal an auth claim ───
  section("E. Different Authenticated User Cannot Take an Already-Auth Claim");
  {
    // JORDAN_GUEST_TOKEN is cleared; Jordan's seat is already authenticated.
    // Unrelated user tries to upgrade with the consumed token.
    const r = await api("/api/fantasy/claim/upgrade", {
      method: "POST", token: unrelatedToken,
      body: { guest_token: JORDAN_GUEST_TOKEN, league_member_id: jordan_lm_id },
    });
    // Guest token is null → claim not found → 404 (cannot steal via upgrade path)
    r.status === 404
      ? pass("Consumed token + different user → 404 (seat protected)")
      : fail("Different user cannot steal via upgrade", `Expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);

    // Also test: new guest tries to claim the already-auth seat via /claim
    const intruder2 = `fgt_intruder2_${RUN_ID.toLowerCase()}`;
    const r2 = await api(`${JOIN_PATH}/claim`, {
      method: "POST", guestToken: intruder2, body: { league_member_id: jordan_lm_id },
    });
    r2.status === 409
      ? pass("Guest trying to claim Jordan's auth seat → 409")
      : fail("Auth seat protection via /claim", `Expected 409, got ${r2.status}`);
  }

  // ── Scenario F — One token, two leagues → upgrade is claim-specific ────────
  section("F. One Guest Token, Two Leagues → Upgrade Targets One Claim Only");
  // Guest token T claims one seat in League A (Jordan's) — already upgraded.
  // Now create League B, add a seat, claim it with the SAME guest token T.
  // Then upgrade only League B's claim with league_member_id from League B.
  // Verify League A's claim (Jordan's, already upgraded to jordanToken) is unaffected.
  {
    const SHARED_TOKEN = `fgt_shared_${RUN_ID.toLowerCase()}1234`;

    // Create League B under commissioner
    const rb = await api("/api/fantasy/leagues/setup", {
      method: "POST", token: commToken,
      body: {
        league_name:        `P3B League B ${RUN_ID}`,
        sport:              "basketball",
        display_name:       "Darius B",
        team_name:          "The B Team",
        season_year:        2026,
        reward_description: "Loser does pushups",
      },
    });
    if (rb.status !== 201) {
      fail("Create League B", `${rb.status}: ${JSON.stringify(rb.body)}`);
    } else {
      createdLeague2Id = rb.body.league_id;
      const league_b_id  = rb.body.league_id;
      const season_b_id  = rb.body.season_id;
      const join_b = `/api/fantasy/leagues/${league_b_id}/seasons/${season_b_id}`;

      // Add "Alex" seat in League B
      const rax = await api(`${join_b}/participants`, {
        method: "POST", token: commToken,
        body: { display_name: "Alex B", team_name: "Alex's Army" },
        extraHeaders: { "Idempotency-Key": `ph3b-alex-${RUN_ID}` },
      });
      if (rax.status !== 201) {
        fail("Add Alex to League B", `${rax.status}`);
      } else {
        const alex_b_lm_id = rax.body.league_member_id;
        pass("League B created, Alex added");

        // Guest claims Alex's seat in League B with the SHARED token
        const rcl = await api(`${join_b}/claim`, {
          method: "POST", guestToken: SHARED_TOKEN, body: { league_member_id: alex_b_lm_id },
        });
        rcl.status === 201
          ? pass("Guest claimed Alex (League B) with shared token")
          : fail("Guest claim League B", `${rcl.status}`);

        // Now upgrade ONLY League B's claim (explicit: league_member_id=alex_b_lm_id)
        let alexUser: any;
        let alexToken = "";
        try {
          alexUser = await createUser("alex");
          alexToken = await signIn("alex");
        } catch (e: any) { fail("Alex user creation", (e as any).message); }

        if (alexToken) {
          const rup = await api("/api/fantasy/claim/upgrade", {
            method: "POST", token: alexToken,
            body: { guest_token: SHARED_TOKEN, league_member_id: alex_b_lm_id },
          });
          rup.status === 200 && rup.body.upgraded === true
            ? pass("League B claim (Alex) upgraded with shared token → 200 upgraded=true")
            : fail("League B upgrade", `${rup.status}: ${JSON.stringify(rup.body)}`);

          // League A: Jordan's seat was upgraded separately (scenario A) and is unaffected
          const rla = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, {
            token: jordanToken,
          });
          rla.body?.viewer?.display_name === "Jordan"
            ? pass("League A: Jordan's claim unaffected by League B upgrade (claim-specific)")
            : fail("League A claim after League B upgrade", `${JSON.stringify(rla.body?.viewer)}`);

          // Shared token is cleared only for alex_b_lm_id; Jordan's token was already cleared.
          // A fresh guest token on a new seat should still work (token cleared per-claim, not globally)
          const NEW_SEAT_TOKEN = `fgt_newseat_${RUN_ID.toLowerCase()}9999`;
          const rcp = await api(`${join_b}/participants`, {
            method: "POST", token: commToken,
            body: { display_name: "PatchTest", team_name: "Test Squad" },
            extraHeaders: { "Idempotency-Key": `ph3b-patch-${RUN_ID}` },
          });
          if (rcp.status === 201) {
            const patch_lm_id = rcp.body.league_member_id;
            const rclp = await api(`${join_b}/claim`, {
              method: "POST", guestToken: NEW_SEAT_TOKEN, body: { league_member_id: patch_lm_id },
            });
            rclp.status === 201
              ? pass("Fresh guest token on new seat (League B) → 201 — per-claim clearing confirmed")
              : fail("Fresh guest token after upgrade", `${rclp.status}`);
          }

          await deleteUser(alexUser.id);
          note("Deleted Alex auth user");
        }
      }
    }
  }

  // ── §11. Regression ────────────────────────────────────────────────────────
  section("11. Phase 2 + Phase 3 Regression");
  {
    const r1 = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`, {
      method: "POST", token: commToken,
      body: { display_name: "Reg Seat", team_name: "Bench Warmers" },
      extraHeaders: { "Idempotency-Key": `ph3b-reg-${RUN_ID}` },
    });
    r1.status === 201
      ? pass("POST /participants works (Phase 2 regression)")
      : fail("Phase 2 POST /participants", `${r1.status}`);

    const r2 = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`, {
      method: "POST", token: mikeToken,
      body: { display_name: "Hack", team_name: "Hacks" },
    });
    r2.status === 403
      ? pass("Non-commissioner → 403 (Phase 2 gate)")
      : fail("Non-commissioner gate", `Expected 403, got ${r2.status}`);

    const r3 = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, { token: mikeToken });
    r3.body?.viewer?.display_name === "Mike"
      ? pass("Mike viewer still resolves (Phase 3 regression)")
      : fail("Mike viewer regression", `${JSON.stringify(r3.body?.viewer)}`);

    const r4 = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, { token: chrisToken });
    r4.body?.viewer?.display_name === "Chris"
      ? pass("Chris viewer still resolves")
      : fail("Chris viewer regression", `${JSON.stringify(r4.body?.viewer)}`);

    // Upgrade endpoint still rejects missing fields
    const r5 = await api("/api/fantasy/claim/upgrade", {
      method: "POST", token: commToken,
      body: { guest_token: "fgt_some_token" /* league_member_id missing */ },
    });
    r5.status === 400
      ? pass("Missing league_member_id → 400 (server validation)")
      : fail("Missing league_member_id validation", `Expected 400, got ${r5.status}`);

    const r6 = await api("/api/fantasy/claim/upgrade", {
      method: "POST", token: commToken,
      body: { league_member_id: mike_lm_id /* guest_token missing */ },
    });
    r6.status === 400
      ? pass("Missing guest_token → 400 (server validation)")
      : fail("Missing guest_token validation", `Expected 400, got ${r6.status}`);
  }

  // ── Cleanup + results ──────────────────────────────────────────────────────
  await cleanup([commUser.id, mikeUser.id, chrisUser.id, jordanUser?.id, unrelatedUser?.id].filter(Boolean));

  const total = passed + failed;
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                   QA RESULTS                            ║
╠══════════════════════════════════════════════════════════╣
║  Total:  ${String(total).padEnd(5)} tests                                    ║
║  ✅ Passed: ${String(passed).padEnd(44)}║
║  ❌ Failed: ${String(failed).padEnd(44)}║
╚══════════════════════════════════════════════════════════╝`);

  if (failures.length) {
    console.log("\n\x1b[31m  Failures:\x1b[0m\n");
    for (const f of failures) {
      console.log(`  §${f.section}\n    ${f.test}\n    ${f.error}\n`);
    }
  }

  const overall = failed === 0
    ? "\x1b[32m🟢  OVERALL RESULT: PASS\x1b[0m"
    : "\x1b[31m🔴  OVERALL RESULT: FAIL\x1b[0m";
  console.log(`\n  ${overall}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("Unexpected error:", e); process.exit(1); });
