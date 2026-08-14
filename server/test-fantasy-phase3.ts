/**
 * server/test-fantasy-phase3.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 3 QA — Member Claim + Member Fantasy League View
 *
 * Run after applying supabase/gameday-fantasy-phase3-claim.sql.
 *
 * Usage:
 *   npx tsx server/test-fantasy-phase3.ts
 *
 * Covers:
 *   §1   Test user bootstrap (commissioner + member)
 *   §2   Join-info — public endpoint
 *   §3   Claim validation (wrong league, wrong season, fake member ID)
 *   §4   Authenticated member claim (Mike)
 *   §5   Hub viewer — member sees their own identity
 *   §6   Home tab — member's GET /leagues includes the league
 *   §7   Claim idempotency (same user, same seat)
 *   §8   Conflict protection (different user cannot steal a seat)
 *   §9   Commissioner seat protection (no third-party can claim it)
 *   §10  Commissioner hub viewer (role-aware)
 *   §11  Guest token claim
 *   §12  Join-info reflects claim status after claiming
 *   §13  DB integrity — fantasy_member_claims rows correct
 *   §14  Phase 2 regression — setup + participant flow still green
 */

import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.TEST_API_URL ?? "http://localhost:5000";
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  "";
const RUN_ID = Math.random().toString(36).slice(2, 10).toUpperCase();

// ── Output helpers ─────────────────────────────────────────────────────────────

const PASS = "\x1b[32m  ✅ \x1b[0m";
const FAIL = "\x1b[31m  ❌ \x1b[0m";
const INFO = "\x1b[36m  ℹ  \x1b[0m";

let passed = 0;
let failed = 0;
const failures: { section: string; test: string; error: string; severity: string; repro?: string }[] = [];
let currentSection = "";

function section(title: string) {
  currentSection = title;
  console.log(`\n${"─".repeat(60)}\n  §  ${title}\n${"─".repeat(60)}`);
}
function pass(msg: string) { passed++; console.log(PASS + msg); }
function fail(msg: string, detail?: string, severity = "HIGH", repro?: string) {
  failed++;
  console.log(FAIL + msg);
  if (detail) console.log(`     ↳ ${detail}`);
  failures.push({ section: currentSection, test: msg, error: detail ?? "", severity, repro });
}
function note(msg: string) { console.log(INFO + msg); }

// ── API helper ────────────────────────────────────────────────────────────────

async function api(
  path: string,
  opts: { method?: string; token?: string; guestToken?: string; body?: object; extraHeaders?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  if (opts.guestToken) headers["X-Fantasy-Guest-Token"] = opts.guestToken;
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

// ── Supabase service client ───────────────────────────────────────────────────

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function dbQuery(table: string, filters: Record<string, any>) {
  let q = service.from(table).select("*");
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { data } = await q;
  return data ?? [];
}

// ── Test user helpers ─────────────────────────────────────────────────────────

async function createTestUser(email: string) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: "test-password-p3-123",
    email_confirm: true,
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  return data.user!;
}

async function signIn(email: string): Promise<string> {
  const { data, error } = await service.auth.signInWithPassword({
    email,
    password: "test-password-p3-123",
  });
  if (error) throw new Error(`signIn failed: ${error.message}`);
  return data.session!.access_token;
}

async function deleteTestUser(userId: string) {
  await service.auth.admin.deleteUser(userId);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

let createdLeagueId: string | null = null;

async function cleanup(commUserId: string, memberUserId: string | null) {
  console.log("\n─── Cleanup " + "─".repeat(47));
  if (createdLeagueId) {
    // Delete in FK order
    const seasons = await dbQuery("fantasy_league_seasons", { league_id: createdLeagueId });
    for (const s of seasons) {
      const seasonMembers = await dbQuery("fantasy_season_members", { league_season_id: s.id });
      for (const sm of seasonMembers) {
        await service.from("fantasy_team_managers").delete().eq("season_member_id", sm.id);
      }
      await service.from("fantasy_teams").delete().eq("league_season_id", s.id);
      await service.from("fantasy_season_members").delete().eq("league_season_id", s.id);
    }
    const leagueMembers = await dbQuery("fantasy_league_members", { league_id: createdLeagueId });
    for (const lm of leagueMembers) {
      await service.from("fantasy_member_claims").delete().eq("league_member_id", lm.id);
    }
    await service.from("fantasy_league_members").delete().eq("league_id", createdLeagueId);
    await service.from("fantasy_league_seasons").delete().eq("league_id", createdLeagueId);
    await service.from("fantasy_leagues").delete().eq("id", createdLeagueId);
    note(`Deleted test league: ${createdLeagueId.slice(0, 8)}…`);
  }
  await deleteTestUser(commUserId);
  note(`Deleted commissioner user: ${commUserId.slice(0, 8)}…`);
  if (memberUserId) {
    await deleteTestUser(memberUserId);
    note(`Deleted member user: ${memberUserId.slice(0, 8)}…`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║   SWAYGER FANTASY PHASE 3 — MEMBER CLAIM QA             ║
║   Run ID: ${RUN_ID.padEnd(46)}║
╚══════════════════════════════════════════════════════════╝`);

  // ── §1. Bootstrap ──────────────────────────────────────────────────────────
  section("1. Test User Bootstrap");

  let commUser: any, memberUser: any;
  let commToken: string, memberToken: string;

  try {
    commUser   = await createTestUser(`qa-p3-comm-${RUN_ID}@swayger-test.invalid`);
    memberUser = await createTestUser(`qa-p3-mike-${RUN_ID}@swayger-test.invalid`);
    commToken  = await signIn(`qa-p3-comm-${RUN_ID}@swayger-test.invalid`);
    memberToken = await signIn(`qa-p3-mike-${RUN_ID}@swayger-test.invalid`);
    pass("Commissioner + member test users created and signed in");
  } catch (e: any) {
    fail("User bootstrap failed — cannot continue", e.message, "CRITICAL");
    console.log("\n🔴  OVERALL RESULT: FAIL (bootstrap)");
    process.exit(1);
  }

  // ── §2. Setup league via commissioner ──────────────────────────────────────
  section("2. Commissioner Creates League");

  let league_id: string, league_member_id: string, season_id: string, season_member_id: string;
  let mike_league_member_id: string;
  let setup_team_id: string;

  {
    const r = await api("/api/fantasy/leagues/setup", {
      method: "POST",
      token: commToken,
      body: {
        league_name:   `P3 QA League ${RUN_ID}`,
        sport:         "football",
        display_name:  "Darius",
        team_name:     "The Monstars",
        season_year:   2026,
        reward_description:    "Dinner for the group",
        reward_amount_display: "$25",
      },
    });
    if (r.status === 201 && r.body.league_id) {
      pass("POST /leagues/setup → 201");
      createdLeagueId = r.body.league_id;
      league_id        = r.body.league_id;
      league_member_id = r.body.league_member_id;
      season_id        = r.body.season_id;
      season_member_id = r.body.season_member_id;
      setup_team_id    = r.body.team_id;
    } else {
      fail("Commissioner setup failed — cannot continue", `${r.status}: ${JSON.stringify(r.body)}`, "CRITICAL");
      await cleanup(commUser.id, memberUser.id);
      process.exit(1);
    }
  }

  // Add Mike as a participant (commissioner action)
  {
    const r = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`,
      {
        method: "POST",
        token: commToken,
        body: { display_name: "Mike", team_name: "Sunday Scaries" },
        extraHeaders: { "Idempotency-Key": `ph3-mike-${RUN_ID}` },
      }
    );
    if (r.status === 201 && r.body.league_member_id) {
      pass("Commissioner adds Mike as participant → 201");
      mike_league_member_id = r.body.league_member_id;
      note(`Mike's league_member_id: ${mike_league_member_id.slice(0, 8)}…`);
    } else {
      fail("Add participant (Mike) failed — cannot continue", `${r.status}: ${JSON.stringify(r.body)}`, "CRITICAL");
      await cleanup(commUser.id, memberUser.id);
      process.exit(1);
    }
  }

  // ── §3. Join-info — public endpoint ───────────────────────────────────────
  section("3. Join-Info — Public Endpoint");

  let joinInfoSeats: any[] = [];
  {
    // No auth — public
    const r = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}/join-info`);
    if (r.status === 200 && r.body.league && r.body.seats) {
      pass("GET /join-info → 200 (no auth)");
      joinInfoSeats = r.body.seats;
      note(`League: ${r.body.league.league_name}`);
      note(`Seats: ${joinInfoSeats.length}`);
      joinInfoSeats.length === 2
        ? pass("join-info returns 2 seats (Darius + Mike)")
        : fail("join-info seat count", `Expected 2, got ${joinInfoSeats.length}`);

      // Commissioner's seat should be claimed (has claim from setup)
      const dariusSeat = joinInfoSeats.find((s: any) => s.display_name === "Darius");
      const mikeSeat   = joinInfoSeats.find((s: any) => s.display_name === "Mike");

      dariusSeat?.is_claimed === true
        ? pass("Commissioner seat (Darius) shows is_claimed=true")
        : fail("Commissioner seat is_claimed", `Expected true, got ${dariusSeat?.is_claimed}`);
      mikeSeat?.is_claimed === false
        ? pass("Mike's seat shows is_claimed=false (unclaimed)")
        : fail("Mike seat is_claimed", `Expected false, got ${mikeSeat?.is_claimed}`);
      r.body.my_seat === null
        ? pass("my_seat=null for anonymous caller")
        : fail("my_seat for anon", `Expected null, got ${JSON.stringify(r.body.my_seat)}`);
      r.body.season?.default_reward_description === "Dinner for the group"
        ? pass("join-info returns reward_description")
        : fail("join-info reward", `Got ${r.body.season?.default_reward_description}`);
    } else {
      fail("GET /join-info failed", `${r.status}: ${JSON.stringify(r.body)}`);
    }
  }

  // Join-info with commissioner auth — my_seat should be populated
  {
    const r = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}/join-info`, {
      token: commToken,
    });
    if (r.status === 200) {
      r.body.my_seat?.display_name === "Darius"
        ? pass("join-info with commissioner auth: my_seat=Darius")
        : fail("join-info my_seat for commissioner", `Got ${JSON.stringify(r.body.my_seat)}`);
      const dSeat = r.body.seats?.find((s: any) => s.display_name === "Darius");
      dSeat?.is_mine === true
        ? pass("join-info Darius seat has is_mine=true for commissioner")
        : fail("join-info is_mine for commissioner", `Got ${dSeat?.is_mine}`);
    } else {
      fail("join-info with commissioner auth", `${r.status}`);
    }
  }

  // Join-info for non-existent league/season
  {
    const r = await api(`/api/fantasy/leagues/${league_id}/seasons/00000000-0000-0000-0000-000000000000/join-info`);
    r.status === 404
      ? pass("join-info with fake season_id → 404")
      : fail("join-info fake season", `Expected 404, got ${r.status}`);
  }

  // ── §4. Claim validation ───────────────────────────────────────────────────
  section("4. Claim Validation");

  // Missing league_member_id
  {
    const r = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}/claim`, {
      method: "POST",
      token: memberToken,
      body: {},
    });
    r.status === 400
      ? pass("Missing league_member_id → 400")
      : fail("Missing league_member_id validation", `Expected 400, got ${r.status}`);
  }

  // No auth and no guest token → 401
  {
    const r = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}/claim`, {
      method: "POST",
      body: { league_member_id: mike_league_member_id },
    });
    r.status === 401
      ? pass("No auth + no guest token → 401")
      : fail("No-auth claim", `Expected 401, got ${r.status}`);
  }

  // Fake member ID → 403
  {
    const r = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}/claim`, {
      method: "POST",
      token: memberToken,
      body: { league_member_id: "00000000-0000-0000-0000-000000000000" },
    });
    r.status === 403
      ? pass("Fake league_member_id → 403 (member_not_found)")
      : fail("Fake member_id validation", `Expected 403, got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // Cross-league: claim Mike from wrong league_id
  {
    const r = await api(
      `/api/fantasy/leagues/00000000-0000-0000-0000-000000000000/seasons/${season_id}/claim`,
      {
        method: "POST",
        token: memberToken,
        body: { league_member_id: mike_league_member_id },
      }
    );
    r.status === 403
      ? pass("Cross-league claim (wrong league_id) → 403")
      : fail("Cross-league claim", `Expected 403, got ${r.status}`);
  }

  // ── §5. Authenticated member claim ─────────────────────────────────────────
  section("5. Authenticated Member Claim (Mike)");

  let claimResult: any;
  {
    const r = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/claim`,
      {
        method: "POST",
        token: memberToken,
        body: { league_member_id: mike_league_member_id },
      }
    );
    if (r.status === 201 && r.body.claim_id) {
      pass("POST /claim by Mike → 201 new claim");
      claimResult = r.body;
      note(`claim_id:         ${r.body.claim_id}`);
      note(`display_name:     ${r.body.display_name}`);
      note(`team_name:        ${r.body.team_name}`);
      note(`role:             ${r.body.role}`);
      note(`already_existed:  ${r.body.already_existed}`);

      r.body.display_name === "Mike"
        ? pass("Claim response: display_name=Mike")
        : fail("Claim display_name", `Expected Mike, got ${r.body.display_name}`);
      r.body.team_name === "Sunday Scaries"
        ? pass("Claim response: team_name=Sunday Scaries")
        : fail("Claim team_name", `Expected Sunday Scaries, got ${r.body.team_name}`);
      r.body.role === "member"
        ? pass("Claim response: role=member")
        : fail("Claim role", `Expected member, got ${r.body.role}`);
      r.body.already_existed === false
        ? pass("Claim response: already_existed=false (new claim)")
        : fail("Claim already_existed", `Expected false, got ${r.body.already_existed}`);
    } else {
      fail("Mike's claim failed", `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`, "CRITICAL",
        "Apply supabase/gameday-fantasy-phase3-claim.sql to Supabase first.");
    }
  }

  // ── §6. Hub viewer — Mike sees his own identity ────────────────────────────
  section("6. Hub Viewer — Member Role-Awareness");

  {
    const r = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, {
      token: memberToken,
    });
    if (r.status === 200 && r.body.viewer) {
      pass("GET /seasons/:id → 200 with viewer for Mike");
      const v = r.body.viewer;
      v.display_name === "Mike"
        ? pass("Hub viewer: display_name=Mike")
        : fail("Hub viewer display_name", `Expected Mike, got ${v.display_name}`);
      v.team_name === "Sunday Scaries"
        ? pass("Hub viewer: team_name=Sunday Scaries")
        : fail("Hub viewer team_name", `Expected Sunday Scaries, got ${v.team_name}`);
      v.role === "member"
        ? pass("Hub viewer: role=member")
        : fail("Hub viewer role", `Expected member, got ${v.role}`);
      v.league_member_id === mike_league_member_id
        ? pass("Hub viewer: league_member_id matches Mike's member ID")
        : fail("Hub viewer league_member_id", `Expected ${mike_league_member_id.slice(0,8)}, got ${v.league_member_id?.slice(0,8)}`);
    } else {
      fail("Hub viewer for Mike", `Expected 200 with viewer, got ${r.status}: ${JSON.stringify(r.body)}`);
    }
  }

  // Hub viewer for commissioner
  {
    const r = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, {
      token: commToken,
    });
    if (r.status === 200 && r.body.viewer) {
      pass("GET /seasons/:id → 200 with viewer for commissioner");
      const v = r.body.viewer;
      v.display_name === "Darius"
        ? pass("Hub viewer: display_name=Darius (commissioner)")
        : fail("Commissioner hub viewer display_name", `Expected Darius, got ${v.display_name}`);
      v.role === "commissioner"
        ? pass("Hub viewer: role=commissioner")
        : fail("Commissioner hub viewer role", `Expected commissioner, got ${v.role}`);
      v.team_name === "The Monstars"
        ? pass("Hub viewer: team_name=The Monstars (commissioner)")
        : fail("Commissioner hub viewer team_name", `Expected The Monstars, got ${v.team_name}`);
    } else {
      fail("Hub viewer for commissioner", `${r.status}: ${JSON.stringify(r.body)}`);
    }
  }

  // Hub viewer for unauthenticated (should 401)
  {
    const r = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`);
    r.status === 401
      ? pass("GET /seasons/:id without auth → 401")
      : fail("Hub no-auth guard", `Expected 401, got ${r.status}`);
  }

  // ── §7. Home tab — member's GET /leagues includes the league ──────────────
  section("7. Home Tab — GET /leagues for Member");

  {
    const r = await api("/api/fantasy/leagues", { token: memberToken });
    if (r.status === 200) {
      const leagues = r.body.leagues ?? [];
      const found = leagues.find((l: any) => l.id === league_id);
      found
        ? pass(`GET /leagues for Mike includes P3 QA League ${RUN_ID}`)
        : fail("Mike's league missing from GET /leagues", `Got ${leagues.length} leagues: ${leagues.map((l: any) => l.league_name).join(", ")}`);
      found?.league_name?.includes("P3 QA League")
        ? pass("League name correct in GET /leagues for member")
        : fail("League name mismatch for member", `Got ${found?.league_name}`);
    } else {
      fail("GET /leagues for Mike", `Expected 200, got ${r.status}`);
    }
  }

  // Commissioner's GET /leagues still includes it too
  {
    const r = await api("/api/fantasy/leagues", { token: commToken });
    if (r.status === 200) {
      const found = (r.body.leagues ?? []).find((l: any) => l.id === league_id);
      found
        ? pass("GET /leagues for commissioner still includes the league")
        : fail("Commissioner league missing after member claim", "Should not be affected by member claim");
    } else {
      fail("GET /leagues for commissioner", `${r.status}`);
    }
  }

  // ── §8. Claim idempotency ──────────────────────────────────────────────────
  section("8. Claim Idempotency — Same Identity, Same Seat");

  {
    const r = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/claim`,
      {
        method: "POST",
        token: memberToken,
        body: { league_member_id: mike_league_member_id },
      }
    );
    if (r.status === 200 && r.body.already_existed === true) {
      pass("Re-claim by same user → 200 already_existed=true (idempotent)");
      r.body.claim_id === claimResult?.claim_id
        ? pass("Idempotent claim returns same claim_id")
        : fail("Idempotent claim_id mismatch", `Expected ${claimResult?.claim_id?.slice(0,8)}, got ${r.body.claim_id?.slice(0,8)}`);
    } else {
      fail("Claim idempotency", `Expected 200 already_existed=true, got ${r.status}: ${JSON.stringify(r.body)}`);
    }
  }

  // ── §9. Conflict protection ────────────────────────────────────────────────
  section("9. Conflict Protection — Seat Already Claimed");

  // Create a third user to try to steal Mike's seat
  let intruderUser: any, intruderToken: string;
  try {
    intruderUser  = await createTestUser(`qa-p3-intruder-${RUN_ID}@swayger-test.invalid`);
    intruderToken = await signIn(`qa-p3-intruder-${RUN_ID}@swayger-test.invalid`);
    pass("Intruder test user created");
  } catch (e: any) {
    fail("Intruder user setup", e.message);
    intruderUser = null; intruderToken = "";
  }

  if (intruderToken) {
    // Try to claim Mike's already-claimed seat
    const r = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/claim`,
      {
        method: "POST",
        token: intruderToken,
        body: { league_member_id: mike_league_member_id },
      }
    );
    r.status === 409
      ? pass("Different user claiming Mike's seat → 409 seat_already_claimed")
      : fail("Seat conflict protection", `Expected 409, got ${r.status}: ${JSON.stringify(r.body)}`);

    // Try to claim commissioner's seat (also taken)
    const r2 = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/claim`,
      {
        method: "POST",
        token: intruderToken,
        body: { league_member_id: league_member_id },
      }
    );
    r2.status === 409
      ? pass("Different user claiming commissioner seat → 409 (commissioner already claimed)")
      : fail("Commissioner seat conflict protection", `Expected 409, got ${r2.status}: ${JSON.stringify(r2.body)}`);
  }

  // Clean up intruder user
  if (intruderUser) {
    await deleteTestUser(intruderUser.id);
    note(`Deleted intruder user`);
  }

  // ── §10. Join-info after claiming ─────────────────────────────────────────
  section("10. Join-Info After Claiming — Seat Status Updated");

  {
    const r = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}/join-info`);
    if (r.status === 200) {
      const seats = r.body.seats ?? [];
      const mikeSeat = seats.find((s: any) => s.display_name === "Mike");
      mikeSeat?.is_claimed === true
        ? pass("Mike's seat now shows is_claimed=true in join-info after claiming")
        : fail("Mike seat is_claimed after claim", `Expected true, got ${mikeSeat?.is_claimed}`);
      const dariusSeat = seats.find((s: any) => s.display_name === "Darius");
      dariusSeat?.is_claimed === true
        ? pass("Commissioner seat still shows is_claimed=true")
        : fail("Commissioner seat is_claimed", `Expected true, got ${dariusSeat?.is_claimed}`);
    } else {
      fail("join-info after claim", `Expected 200, got ${r.status}`);
    }
  }

  // Mike's join-info with auth: my_seat populated, is_mine=true
  {
    const r = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}/join-info`, {
      token: memberToken,
    });
    if (r.status === 200) {
      r.body.my_seat?.display_name === "Mike"
        ? pass("join-info with Mike's auth: my_seat=Mike")
        : fail("join-info my_seat for Mike", `Got ${JSON.stringify(r.body.my_seat?.display_name)}`);
      const mikeSeat = (r.body.seats ?? []).find((s: any) => s.display_name === "Mike");
      mikeSeat?.is_mine === true
        ? pass("Mike's seat shows is_mine=true for Mike's auth")
        : fail("is_mine for Mike", `Expected true, got ${mikeSeat?.is_mine}`);
    } else {
      fail("join-info with Mike auth after claim", `${r.status}`);
    }
  }

  // ── §11. Guest token claim ─────────────────────────────────────────────────
  section("11. Guest Token Claim");

  // Add a third participant (Chris) for the guest to claim
  let chris_league_member_id: string = "";
  {
    const r = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`,
      {
        method: "POST",
        token: commToken,
        body: { display_name: "Chris", team_name: "Fourth & Long" },
        extraHeaders: { "Idempotency-Key": `ph3-chris-${RUN_ID}` },
      }
    );
    if (r.status === 201) {
      chris_league_member_id = r.body.league_member_id;
      pass("Commissioner adds Chris as participant for guest claim test");
    } else {
      fail("Add Chris participant", `${r.status}: ${JSON.stringify(r.body)}`);
    }
  }

  const GUEST_TOKEN = `fgt_test_${RUN_ID.toLowerCase()}abcdef1234567890`;

  if (chris_league_member_id) {
    // Guest claims Chris's seat
    const r = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/claim`,
      {
        method: "POST",
        guestToken: GUEST_TOKEN,
        body: { league_member_id: chris_league_member_id },
      }
    );
    if (r.status === 201 && r.body.claim_id) {
      pass("Guest token claim → 201 (Chris's seat)");
      r.body.display_name === "Chris"
        ? pass("Guest claim response: display_name=Chris")
        : fail("Guest claim display_name", `Expected Chris, got ${r.body.display_name}`);
      r.body.team_name === "Fourth & Long"
        ? pass("Guest claim response: team_name=Fourth & Long")
        : fail("Guest claim team_name", `Expected Fourth & Long, got ${r.body.team_name}`);
      r.body.already_existed === false
        ? pass("Guest claim: already_existed=false")
        : fail("Guest claim already_existed", `Expected false, got ${r.body.already_existed}`);
    } else {
      fail("Guest token claim", `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    }

    // Guest idempotency — same token, same seat
    const r2 = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/claim`,
      {
        method: "POST",
        guestToken: GUEST_TOKEN,
        body: { league_member_id: chris_league_member_id },
      }
    );
    r2.status === 200 && r2.body.already_existed === true
      ? pass("Guest re-claim → 200 already_existed=true (idempotent)")
      : fail("Guest idempotency", `Expected 200 already_existed=true, got ${r2.status}: ${JSON.stringify(r2.body)}`);

    // Hub with guest token
    const r3 = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, {
      guestToken: GUEST_TOKEN,
    });
    if (r3.status === 200 && r3.body.viewer) {
      r3.body.viewer.display_name === "Chris"
        ? pass("Hub viewer with guest token: display_name=Chris")
        : fail("Hub guest viewer", `Expected Chris, got ${r3.body.viewer?.display_name}`);
    } else {
      fail("Hub with guest token", `Expected 200 with viewer, got ${r3.status}: ${JSON.stringify(r3.body)}`);
    }
  }

  // ── §12. DB integrity — claims ─────────────────────────────────────────────
  section("12. DB Integrity — fantasy_member_claims");

  {
    // Get all league members for this league
    const leagueMembers = await dbQuery("fantasy_league_members", { league_id, is_active: true });
    const lmIds = leagueMembers.map((lm: any) => lm.id);

    const { data: allClaims } = await service
      .from("fantasy_member_claims")
      .select("*")
      .in("league_member_id", lmIds)
      .eq("is_active", true);

    const claims = allClaims ?? [];
    note(`Active claims for this league: ${claims.length}`);

    // Should be 3: Darius (commissioner), Mike (user_id), Chris (guest_token)
    const expectedCount = chris_league_member_id ? 3 : 2;
    claims.length === expectedCount
      ? pass(`fantasy_member_claims: ${expectedCount} active claims (one per claimed seat)`)
      : fail("Active claim count", `Expected ${expectedCount}, got ${claims.length}`);

    // Commissioner: user_id claim
    const dariusClaim = claims.find((c: any) => c.league_member_id === league_member_id);
    dariusClaim?.user_id === commUser.id
      ? pass("Commissioner claim has user_id = commUser.id")
      : fail("Commissioner claim user_id", `Expected ${commUser.id?.slice(0,8)}, got ${dariusClaim?.user_id?.slice(0,8)}`);
    dariusClaim?.guest_token === null
      ? pass("Commissioner claim: guest_token=null")
      : fail("Commissioner claim guest_token", `Expected null, got ${dariusClaim?.guest_token}`);

    // Mike: user_id claim
    const mikeClaim = claims.find((c: any) => c.league_member_id === mike_league_member_id);
    mikeClaim?.user_id === memberUser.id
      ? pass("Mike's claim has user_id = memberUser.id")
      : fail("Mike claim user_id", `Expected ${memberUser.id?.slice(0,8)}, got ${mikeClaim?.user_id?.slice(0,8)}`);

    // Chris: guest_token claim
    if (chris_league_member_id) {
      const chrisClaim = claims.find((c: any) => c.league_member_id === chris_league_member_id);
      chrisClaim?.guest_token === GUEST_TOKEN
        ? pass("Chris's claim has correct guest_token")
        : fail("Chris guest_token claim", `Expected ${GUEST_TOKEN.slice(0,12)}…, got ${chrisClaim?.guest_token?.slice(0,12)}`);
      chrisClaim?.user_id === null
        ? pass("Chris's claim: user_id=null (guest-only)")
        : fail("Chris claim user_id", `Expected null, got ${chrisClaim?.user_id}`);
    }

    // No seat has more than one active claim (partial unique index enforced)
    const countsByMember: Record<string, number> = {};
    for (const c of claims) {
      countsByMember[c.league_member_id] = (countsByMember[c.league_member_id] ?? 0) + 1;
    }
    const hasDupes = Object.values(countsByMember).some((n) => n > 1);
    hasDupes
      ? fail("Active claim uniqueness violated — multiple active claims for one seat", JSON.stringify(countsByMember), "CRITICAL")
      : pass("Active claim uniqueness: each seat has at most 1 active claim");
  }

  // ── §13. Phase 2 regression ────────────────────────────────────────────────
  section("13. Phase 2 Regression — Commissioner Flow Still Green");

  {
    // Commissioner can still view season detail
    const r = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, {
      token: commToken,
    });
    r.status === 200 && r.body.participants?.length >= 2
      ? pass(`GET /seasons/:id → 200 with ${r.body.participants.length} participants (Phase 2 data intact)`)
      : fail("Phase 2 regression: GET /seasons/:id", `${r.status}: ${JSON.stringify(r.body)}`);
  }

  {
    // Commissioner can still add participants
    const r = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`,
      {
        method: "POST",
        token: commToken,
        body: { display_name: "Regression Test", team_name: "Test Team" },
        extraHeaders: { "Idempotency-Key": `ph3-reg-${RUN_ID}` },
      }
    );
    r.status === 201
      ? pass("POST /participants still works for commissioner (Phase 2 regression)")
      : fail("Phase 2 regression: POST /participants", `${r.status}: ${JSON.stringify(r.body)}`);
  }

  {
    // Non-commissioner cannot add participants (Phase 2 gate preserved)
    const r = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`,
      {
        method: "POST",
        token: memberToken,
        body: { display_name: "Interloper", team_name: "Team X" },
      }
    );
    r.status === 403
      ? pass("Non-commissioner cannot add participants → 403 (Phase 2 gate preserved)")
      : fail("Phase 2 regression: non-commissioner gate", `Expected 403, got ${r.status}`);
  }

  // ── Cleanup + results ──────────────────────────────────────────────────────
  await cleanup(commUser.id, memberUser.id);

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
      console.log(`  [${f.severity}] §${f.section}\n    Test:  ${f.test}\n    Error: ${f.error}${f.repro ? `\n    Repro: ${f.repro}` : ""}\n`);
    }
  }

  const overall = failed === 0 ? "\x1b[32m🟢  OVERALL RESULT: PASS\x1b[0m" : "\x1b[31m🔴  OVERALL RESULT: FAIL\x1b[0m";
  console.log(`\n  ${overall}`);
  if (failed === 0) console.log("\n  All Phase 3 member-claim scenarios verified successfully.\n  MEMBER CLAIM PHASE READY FOR MANUAL QA\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
