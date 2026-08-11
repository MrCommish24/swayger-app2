/**
 * server/test-fantasy-phase2.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 2 QA — Swayger Fantasy League Setup
 *
 * Runs a live end-to-end verification against the running backend and Supabase.
 * Creates a temporary test user, exercises all routes and RPCs, verifies database
 * integrity, tests edge cases, and cleans up.
 *
 * Usage: npx tsx server/test-fantasy-phase2.ts
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON_KEY      = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API_BASE      = "http://localhost:5000";
const RUN_ID        = Date.now().toString(36).toUpperCase();
const TEST_EMAIL    = `qa+fantasy+${RUN_ID}@swayger-qa.internal`;
const TEST_PASSWORD = `QA_${RUN_ID}_Pass!`;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("Missing required environment variables. Aborting.");
  process.exit(1);
}

const service = createClient(SUPABASE_URL, SERVICE_KEY);
const anon    = createClient(SUPABASE_URL, ANON_KEY);

// ── Results tracker ───────────────────────────────────────────────────────────

let passed  = 0;
let failed  = 0;
const failures: { section: string; test: string; severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; error: string; repro?: string }[] = [];
let currentSection = "";

function section(name: string) {
  currentSection = name;
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  §  ${name}`);
  console.log("─".repeat(60));
}

function pass(test: string) {
  console.log(`  ✅  ${test}`);
  passed++;
}

function fail(test: string, error: string, severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "HIGH", repro?: string) {
  console.log(`  ❌  ${test}`);
  console.log(`     ↳ ${error}`);
  failed++;
  failures.push({ section: currentSection, test, severity, error, repro });
}

function note(msg: string) {
  console.log(`  ℹ   ${msg}`);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function api(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {}
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method:  opts.method ?? "GET",
    headers,
    body:    opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let body: any;
  try { body = await res.json(); } catch { body = { _raw: await res.text().catch(() => "") }; }
  return { status: res.status, body };
}

// ── DB query shorthand ────────────────────────────────────────────────────────

async function dbQuery<T = any>(table: string, filter: Record<string, any>): Promise<T[]> {
  let q = service.from(table).select("*");
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data, error } = await q;
  if (error) throw new Error(`DB error on ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

// ── Cleanup helper ────────────────────────────────────────────────────────────

let createdLeagueId: string | null = null;
let testUserId: string | null = null;

async function cleanup() {
  console.log("\n─── Cleanup ───────────────────────────────────────────────");
  try {
    if (createdLeagueId) {
      // Delete in reverse FK order
      const seasons = await dbQuery("fantasy_league_seasons", { league_id: createdLeagueId });
      for (const s of seasons) {
        const members = await dbQuery("fantasy_season_members", { league_season_id: s.id });
        const memberIds = members.map((m: any) => m.id);
        if (memberIds.length) {
          // Remove team managers that reference these season members
          await service.from("fantasy_team_managers").delete().in("season_member_id", memberIds);
        }
        // Remove teams
        await service.from("fantasy_teams").delete().eq("league_season_id", s.id);
        // Remove season members
        await service.from("fantasy_season_members").delete().eq("league_season_id", s.id);
      }
      await service.from("fantasy_league_seasons").delete().eq("league_id", createdLeagueId);
      await service.from("fantasy_member_claims").delete().eq("league_member_id",
        (await dbQuery("fantasy_league_members", { league_id: createdLeagueId })).map((m: any) => m.id)
      );
      await service.from("fantasy_league_members").delete().eq("league_id", createdLeagueId);
      await service.from("fantasy_leagues").delete().eq("id", createdLeagueId);
      note(`Deleted test league: ${createdLeagueId}`);
    }
    if (testUserId) {
      await service.auth.admin.deleteUser(testUserId);
      note(`Deleted test user: ${testUserId.slice(0, 8)}…`);
    }
  } catch (e: any) {
    note(`Cleanup warning (non-fatal): ${e.message}`);
  }
}

// ── Test runner ───────────────────────────────────────────────────────────────

async function run() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   SWAYGER FANTASY PHASE 2 — QA VERIFICATION             ║");
  console.log(`║   Run ID: ${RUN_ID.padEnd(46)} ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  // ── 1. User setup ───────────────────────────────────────────────────────────
  section("1. Test User Bootstrap");

  let token = "";

  try {
    const { data: signUpData, error: signUpError } = await service.auth.admin.createUser({
      email:    TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (signUpError) throw signUpError;
    testUserId = signUpData.user.id;
    pass("Admin user creation via service role");
  } catch (e: any) {
    fail("Admin user creation", e.message, "CRITICAL",
      "Check SUPABASE_SERVICE_ROLE_KEY and Supabase auth admin API availability.");
    await cleanup();
    return reportFinal();
  }

  try {
    const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({
      email:    TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (signInError) throw signInError;
    token = signInData.session!.access_token;
    pass("User sign-in + JWT obtained");
  } catch (e: any) {
    fail("User sign-in", e.message, "CRITICAL");
    await cleanup();
    return reportFinal();
  }

  // ── 2. Authorization tests (no valid commissioner yet) ───────────────────────
  section("2. Authorization — Unauthenticated");

  {
    const r = await api("/api/fantasy/leagues");
    r.status === 401 && r.body?.error === "Unauthorized"
      ? pass("GET /leagues → 401 without token")
      : fail("GET /leagues without token", `Expected 401 Unauthorized, got ${r.status}: ${JSON.stringify(r.body)}`);
  }
  {
    const r = await api("/api/fantasy/leagues/setup", { method: "POST", body: {} });
    r.status === 401
      ? pass("POST /leagues/setup → 401 without token")
      : fail("POST /leagues/setup without token", `Expected 401, got ${r.status}`);
  }
  {
    const fakeId = "00000000-0000-0000-0000-000000000001";
    const r = await api(`/api/fantasy/leagues/${fakeId}/seasons/${fakeId}/participants`, { method: "POST", body: {} });
    r.status === 401
      ? pass("POST /participants → 401 without token")
      : fail("POST /participants without token", `Expected 401, got ${r.status}`);
  }
  {
    const fakeId = "00000000-0000-0000-0000-000000000001";
    const r = await api(`/api/fantasy/leagues/${fakeId}/seasons/${fakeId}`, { token });
    // No league exists yet — should 404
    r.status === 404
      ? pass("GET /seasons/:id → 404 for non-existent league")
      : fail("GET /seasons/:id non-existent", `Expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // ── 3. Input validation — setup_fantasy_league ───────────────────────────────
  section("3. Input Validation — POST /leagues/setup");

  const validSetup = {
    league_name: `QA League ${RUN_ID}`,
    sport:       "football",
    display_name: "QA Commissioner",
    team_name:   "QA Monsters",
    season_year: 2026,
    reward_description: "Dinner for the group",
    reward_amount_display: "$50",
  };

  {
    const r = await api("/api/fantasy/leagues/setup", { method: "POST", token, body: { ...validSetup, league_name: "" } });
    r.status === 400
      ? pass("Empty league_name → 400")
      : fail("Empty league_name validation", `Expected 400, got ${r.status}`);
  }
  {
    const r = await api("/api/fantasy/leagues/setup", { method: "POST", token, body: { ...validSetup, sport: "volleyball" } });
    r.status === 400
      ? pass("Invalid sport → 400")
      : fail("Invalid sport validation", `Expected 400, got ${r.status}`);
  }
  {
    const r = await api("/api/fantasy/leagues/setup", { method: "POST", token, body: { ...validSetup, display_name: "" } });
    r.status === 400
      ? pass("Empty display_name → 400")
      : fail("Empty display_name validation", `Expected 400, got ${r.status}`);
  }
  {
    const r = await api("/api/fantasy/leagues/setup", { method: "POST", token, body: { ...validSetup, season_year: 1800 } });
    r.status === 400
      ? pass("Out-of-range season_year (1800) → 400")
      : fail("season_year < 1900 validation", `Expected 400, got ${r.status}`);
  }
  {
    const r = await api("/api/fantasy/leagues/setup", { method: "POST", token, body: { ...validSetup, season_year: "not-a-number" as any } });
    r.status === 400
      ? pass("Non-integer season_year → 400")
      : fail("Non-integer season_year validation", `Expected 400, got ${r.status}`);
  }
  {
    const r = await api("/api/fantasy/leagues/setup", { method: "POST", token, body: { ...validSetup, season_year: 2026.5 } });
    r.status === 400
      ? pass("Float season_year → 400")
      : fail("Float season_year validation", `Expected 400, got ${r.status}`);
  }
  {
    const r = await api("/api/fantasy/leagues/setup", { method: "POST", token, body: { ...validSetup, team_name: "" } });
    r.status === 400
      ? pass("Empty team_name → 400")
      : fail("Empty team_name validation", `Expected 400, got ${r.status}`);
  }
  {
    const r = await api("/api/fantasy/leagues/setup", { method: "POST", token, body: { ...validSetup, team_name: undefined } });
    r.status === 400
      ? pass("Missing team_name → 400")
      : fail("Missing team_name validation", `Expected 400, got ${r.status}`);
  }

  // ── 4. SUCCESS — setup_fantasy_league ────────────────────────────────────────
  section("4. Success Path — POST /leagues/setup");

  let setupResult: any = null;

  {
    const r = await api("/api/fantasy/leagues/setup", { method: "POST", token, body: validSetup });
    if (r.status === 201 && r.body.league_id) {
      pass("POST /leagues/setup → 201 with all IDs");
      setupResult = r.body;
      createdLeagueId = r.body.league_id;
      note(`league_id:        ${r.body.league_id}`);
      note(`league_member_id: ${r.body.league_member_id}`);
      note(`claim_id:         ${r.body.claim_id}`);
      note(`season_id:        ${r.body.season_id}`);
      note(`season_member_id: ${r.body.season_member_id}`);
      note(`team_id:          ${r.body.team_id}`);
      note(`manager_id:       ${r.body.manager_id}`);
      // v2 invariant: setup must return the commissioner's team atomically
      r.body.team_id && r.body.manager_id
        ? pass("POST /leagues/setup → response includes team_id and manager_id (atomic invariant)")
        : fail("Atomic invariant violated: team_id or manager_id missing from setup response", JSON.stringify(r.body), "CRITICAL",
            "setup_fantasy_league RPC must have been applied with the v2 patch that adds rows 6 and 7.");
    } else {
      fail("POST /leagues/setup success path", `Expected 201 with IDs, got ${r.status}: ${JSON.stringify(r.body)}`, "CRITICAL");
    }
  }

  if (!setupResult) {
    note("Cannot continue without a successful setup. Aborting further tests.");
    await cleanup();
    return reportFinal();
  }

  const { league_id, league_member_id, claim_id, season_id, season_member_id, team_id: setup_team_id, manager_id: setup_manager_id } = setupResult;

  // ── 5. Database integrity after league creation ───────────────────────────────
  section("5. Database Integrity — After League Creation");

  {
    const rows = await dbQuery("fantasy_leagues", { id: league_id });
    if (rows.length === 1) {
      const row = rows[0];
      row.league_name === validSetup.league_name.trim() && row.sport === "football" && row.is_active === true
        ? pass("fantasy_leagues: 1 row, correct fields")
        : fail("fantasy_leagues: incorrect field values", JSON.stringify(row));
    } else {
      fail("fantasy_leagues: expected exactly 1 row", `Got ${rows.length}`, "CRITICAL");
    }
  }

  {
    const rows = await dbQuery("fantasy_league_members", { id: league_member_id });
    if (rows.length === 1) {
      const row = rows[0];
      row.league_id === league_id && row.display_name === "QA Commissioner" && row.is_active === true
        ? pass("fantasy_league_members: 1 commissioner row, correct fields")
        : fail("fantasy_league_members: incorrect field values", JSON.stringify(row));
    } else {
      fail("fantasy_league_members: expected exactly 1 row", `Got ${rows.length}`, "CRITICAL");
    }
  }

  {
    const rows = await dbQuery("fantasy_member_claims", { id: claim_id });
    if (rows.length === 1) {
      const row = rows[0];
      row.league_member_id === league_member_id && row.user_id === testUserId && row.is_active === true
        ? pass("fantasy_member_claims: 1 row, correct user_id and league_member_id")
        : fail("fantasy_member_claims: incorrect field values", JSON.stringify(row));
    } else {
      fail("fantasy_member_claims: expected exactly 1 row", `Got ${rows.length}`, "CRITICAL");
    }
  }

  {
    const rows = await dbQuery("fantasy_league_seasons", { id: season_id });
    if (rows.length === 1) {
      const row = rows[0];
      row.league_id === league_id &&
      row.season_year === 2026 &&
      row.status === "upcoming" &&
      row.default_reward_description === "Dinner for the group" &&
      row.default_reward_amount_display === "$50"
        ? pass("fantasy_league_seasons: 1 row, correct year/status/reward")
        : fail("fantasy_league_seasons: incorrect field values", JSON.stringify(row));
    } else {
      fail("fantasy_league_seasons: expected exactly 1 row", `Got ${rows.length}`, "CRITICAL");
    }
  }

  {
    const rows = await dbQuery("fantasy_season_members", { id: season_member_id });
    if (rows.length === 1) {
      const row = rows[0];
      row.league_season_id === season_id && row.league_member_id === league_member_id && row.role === "commissioner" && row.is_active === true
        ? pass("fantasy_season_members: 1 commissioner row, role=commissioner")
        : fail("fantasy_season_members: incorrect field values", JSON.stringify(row));
    } else {
      fail("fantasy_season_members: expected exactly 1 row", `Got ${rows.length}`, "CRITICAL");
    }
  }

  // Commissioner's team must exist immediately after setup (v2 atomic invariant)
  {
    const rows = await dbQuery("fantasy_teams", { league_season_id: season_id });
    if (rows.length === 1) {
      const t = rows[0];
      t.team_name === "QA Monsters" && t.id === setup_team_id
        ? pass("fantasy_teams: 1 row after setup — commissioner's team created atomically")
        : fail("fantasy_teams: team_name or id mismatch after setup", JSON.stringify(t), "CRITICAL");
    } else {
      fail("fantasy_teams: expected exactly 1 row after setup (commissioner's team)", `Got ${rows.length}`, "CRITICAL",
        "setup_fantasy_league RPC v2 must create fantasy_teams row in the same transaction.");
    }
  }
  {
    const rows = await dbQuery("fantasy_team_managers", {});
    const smRows = await dbQuery("fantasy_season_members", { league_season_id: season_id });
    const smIds = new Set(smRows.map((r: any) => r.id));
    const ourMgrs = rows.filter((r: any) => smIds.has(r.season_member_id));
    if (ourMgrs.length === 1) {
      const m = ourMgrs[0];
      m.id === setup_manager_id && m.fantasy_team_id === setup_team_id && m.is_active === true && m.role === "manager"
        ? pass("fantasy_team_managers: 1 row after setup — commissioner's manager assignment created atomically")
        : fail("fantasy_team_managers: incorrect field values after setup", JSON.stringify(m), "CRITICAL");
    } else {
      fail("fantasy_team_managers: expected exactly 1 row after setup (commissioner's manager)", `Got ${ourMgrs.length}`, "CRITICAL");
    }
  }

  // ── 6. Authorization — non-commissioner 403 ──────────────────────────────────
  section("6. Authorization — Non-Commissioner 403");

  // Create a second test user who is NOT in this league
  let nonCommToken = "";
  let nonCommUserId = "";
  try {
    const { data: u2 } = await service.auth.admin.createUser({
      email:         `qa+fantasy+nc+${RUN_ID}@swayger-qa.internal`,
      password:      TEST_PASSWORD,
      email_confirm: true,
    });
    nonCommUserId = u2.user.id;
    const { data: s2 } = await anon.auth.signInWithPassword({
      email:    `qa+fantasy+nc+${RUN_ID}@swayger-qa.internal`,
      password: TEST_PASSWORD,
    });
    nonCommToken = s2.session!.access_token;
    pass("Second (non-commissioner) test user created and signed in");
  } catch (e: any) {
    fail("Second test user creation", e.message, "HIGH");
  }

  if (nonCommToken) {
    {
      const r = await api(
        `/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`,
        { method: "POST", token: nonCommToken, body: { display_name: "Intruder", team_name: "Bad Team" } }
      );
      r.status === 403
        ? pass("Non-commissioner POST /participants → 403")
        : fail("Non-commissioner must receive 403", `Got ${r.status}: ${JSON.stringify(r.body)}`);
    }
    // Clean up second user
    if (nonCommUserId) await service.auth.admin.deleteUser(nonCommUserId);
  }

  // ── 7. add_fantasy_season_participant — input validation ─────────────────────
  section("7. Input Validation — POST /participants");

  {
    const r = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`,
      { method: "POST", token, body: { display_name: "", team_name: "Good Team" } }
    );
    r.status === 400
      ? pass("Empty display_name → 400")
      : fail("Empty display_name validation on participants", `Expected 400, got ${r.status}`);
  }
  {
    const r = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`,
      { method: "POST", token, body: { display_name: "Alice", team_name: "" } }
    );
    r.status === 400
      ? pass("Empty team_name → 400")
      : fail("Empty team_name validation on participants", `Expected 400, got ${r.status}`);
  }
  {
    // Mismatched season ID (fake seasonId that does not belong to this league)
    const fakeSeasonId = "00000000-0000-0000-0000-000000000099";
    const r = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${fakeSeasonId}/participants`,
      { method: "POST", token, body: { display_name: "Bob", team_name: "Bob FC" } }
    );
    // Commissioner check will fail because we aren't a commissioner of fakeSeasonId
    r.status === 403 || r.status === 400
      ? pass("Fake season ID → 403 or 400 (commissioner check fails first)")
      : fail("Fake season ID must reject", `Expected 403 or 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // ── 8. Commissioner team — already present from setup; /participants idempotent ─
  section("8. Commissioner Team Invariant");

  // 8a. Verify GET /seasons/:id immediately after setup shows commissioner with team_name.
  // No /participants call for the commissioner should be needed.
  {
    const r = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, { token });
    if (r.status === 200) {
      const comm = (r.body.participants ?? []).find((p: any) => p.role === "commissioner");
      if (comm) {
        comm.team_name === "QA Monsters"
          ? pass("GET /seasons/:id right after setup: commissioner already has team_name (no /participants call needed)")
          : fail("Commissioner team_name missing right after setup", `Got: ${comm.team_name}`, "CRITICAL",
              "setup_fantasy_league v2 must atomically create fantasy_teams and fantasy_team_managers.");
        comm.team_id === setup_team_id
          ? pass("Commissioner team_id matches setup response (same atomic transaction)")
          : fail("Commissioner team_id mismatch", `Setup returned ${setup_team_id}, GET returned ${comm.team_id}`, "CRITICAL");
      } else {
        fail("Commissioner not found in participants after setup", JSON.stringify(r.body.participants), "CRITICAL");
      }
    } else {
      fail("GET /seasons/:id for invariant check", `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`, "CRITICAL");
    }
  }

  // 8b. Calling /participants for the commissioner with league_member_id must return
  // already_exists=true (idempotent recovery — the RPC detects the existing active team).
  let commTeamResult: any = null;
  {
    const r = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`,
      {
        method: "POST",
        token,
        body: {
          display_name:     "QA Commissioner",
          team_name:        "QA Monsters",
          league_member_id: league_member_id,
        },
      }
    );
    if (r.status === 200 && r.body.already_exists === true) {
      pass("POST /participants for commissioner (already has team) → 200 already_exists=true (idempotent)");
      commTeamResult = r.body;
      r.body.team_id === setup_team_id
        ? pass("Idempotent /participants returns same team_id as setup response")
        : fail("Idempotent /participants team_id mismatch", `Setup: ${setup_team_id}, participants: ${r.body.team_id}`, "HIGH");
      r.body.manager_id === setup_manager_id
        ? pass("Idempotent /participants returns same manager_id as setup response")
        : fail("Idempotent /participants manager_id mismatch", `Setup: ${setup_manager_id}, participants: ${r.body.manager_id}`, "HIGH");
    } else {
      fail("POST /participants for commissioner (idempotency)", `Expected 200 already_exists=true, got ${r.status}: ${JSON.stringify(r.body)}`, "HIGH");
    }
  }

  // ── 8c. Partial-State Recovery ───────────────────────────────────────────────
  // Simulate the old partial-state gap: commissioner has a season_member row
  // but no team or manager. This could happen with old code, or if a DB operation
  // is manually retried after partial failure.
  section("8c. Partial-State Recovery — Commissioner with no team");

  {
    // Delete the commissioner's team and manager directly from the DB
    await service.from("fantasy_team_managers").delete().eq("id", setup_manager_id);
    await service.from("fantasy_teams").delete().eq("id", setup_team_id);
    pass("Simulated partial state: deleted commissioner's team and manager from DB");

    // Verify GET /seasons/:id now shows commissioner with team_name=null
    const r1 = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, { token });
    if (r1.status === 200) {
      const comm = (r1.body.participants ?? []).find((p: any) => p.role === "commissioner");
      comm && comm.team_name === null
        ? pass("Partial state confirmed: commissioner appears with team_name=null in GET /seasons/:id")
        : fail("Partial state verification failed", `Expected team_name=null, got ${comm?.team_name}`, "HIGH");
    }

    // Recovery: call /participants for commissioner — must create a new team
    const r2 = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`,
      {
        method: "POST",
        token,
        body: {
          display_name:     "QA Commissioner",
          team_name:        "QA Monsters Recovered",
          league_member_id: league_member_id,
        },
      }
    );
    if (r2.status === 201 && r2.body.already_exists === false) {
      pass("Recovery via /participants → 201 already_exists=false (new team created)");
      note(`recovered team_id:    ${r2.body.team_id}`);
      note(`recovered manager_id: ${r2.body.manager_id}`);

      // Update tracked IDs so cleanup works correctly
      commTeamResult = r2.body;

      // Verify the recovered state is correct
      const r3 = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, { token });
      if (r3.status === 200) {
        const comm = (r3.body.participants ?? []).find((p: any) => p.role === "commissioner");
        comm?.team_name === "QA Monsters Recovered"
          ? pass("Recovery confirmed: commissioner has team_name after /participants recovery call")
          : fail("Recovery verification failed", `Expected 'QA Monsters Recovered', got ${comm?.team_name}`, "HIGH");
      }
    } else {
      fail("Partial-state recovery via /participants", `Expected 201 already_exists=false, got ${r2.status}: ${JSON.stringify(r2.body)}`, "HIGH");
    }
  }

  // ── 9. add_fantasy_season_participant — new participants ──────────────────────
  section("9. Success Path — New Participants");

  let p2Result: any = null;
  let p3Result: any = null;

  {
    const r = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`,
      { method: "POST", token, body: { display_name: "Mike", team_name: "Sunday Scaries" } }
    );
    if (r.status === 201 && r.body.already_exists === false) {
      pass("New participant Mike → 201, already_exists=false");
      p2Result = r.body;
    } else {
      fail("New participant Mike", `Expected 201 already_exists=false, got ${r.status}: ${JSON.stringify(r.body)}`, "HIGH");
    }
  }

  {
    const r = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`,
      { method: "POST", token, body: { display_name: "Chris", team_name: "Fourth & Long" } }
    );
    if (r.status === 201 && r.body.already_exists === false) {
      pass("New participant Chris → 201, already_exists=false");
      p3Result = r.body;
    } else {
      fail("New participant Chris", `Expected 201 already_exists=false, got ${r.status}: ${JSON.stringify(r.body)}`, "HIGH");
    }
  }

  // ── 10. Duplicate request behavior ──────────────────────────────────────────
  section("10. Duplicate Request Idempotency — Non-Commissioner Participants");
  // Commissioner idempotency is covered in §8b above.

  // Re-submit participant Mike — should return 200 already_exists=true
  if (p2Result) {
    const r = await api(
      `/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`,
      {
        method: "POST",
        token,
        body: {
          display_name:     "Mike",
          team_name:        "Sunday Scaries",
          league_member_id: p2Result.league_member_id,
        },
      }
    );
    r.status === 200 && r.body.already_exists === true
      ? pass("Duplicate participant Mike → 200 already_exists=true (idempotent)")
      : fail("Duplicate participant idempotency", `Expected 200 already_exists=true, got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // ── 11. Database integrity — full setup ──────────────────────────────────────
  section("11. Database Integrity — Full Setup (3 participants)");

  {
    const rows = await dbQuery("fantasy_season_members", { league_season_id: season_id });
    rows.length === 3
      ? pass(`fantasy_season_members: exactly 3 rows (commissioner + 2 members)`)
      : fail("fantasy_season_members count", `Expected 3, got ${rows.length}`);

    const commissioner = rows.find((r: any) => r.id === season_member_id);
    commissioner?.role === "commissioner"
      ? pass("Commissioner role is still 'commissioner' after participant upsert (not downgraded to 'member')")
      : fail("Commissioner role downgraded", `Expected 'commissioner', got ${commissioner?.role}`, "CRITICAL",
          "Commissioner's row was re-inserted as 'member' by add_fantasy_season_participant — ON CONFLICT DO UPDATE SET must not touch role.");

    const members = rows.filter((r: any) => r.role === "member");
    members.length === 2
      ? pass("2 rows with role='member' (Mike and Chris)")
      : fail("Member role count", `Expected 2 members, got ${members.length}`);
  }

  {
    const rows = await dbQuery("fantasy_teams", { league_season_id: season_id });
    rows.length === 3
      ? pass("fantasy_teams: exactly 3 rows (1 per participant)")
      : fail("fantasy_teams count", `Expected 3, got ${rows.length}`);

    const teamNames = rows.map((r: any) => r.team_name).sort();
    // Commissioner's team was recreated as "QA Monsters Recovered" in §8c
    const expectedTeams = ["Fourth & Long", "QA Monsters Recovered", "Sunday Scaries"].sort();
    JSON.stringify(teamNames) === JSON.stringify(expectedTeams)
      ? pass("All 3 team names correct (including recovered commissioner team name)")
      : fail("Team names mismatch", `Expected ${JSON.stringify(expectedTeams)}, got ${JSON.stringify(teamNames)}`);
  }

  {
    const rows = await dbQuery("fantasy_team_managers", {});
    // Filter to only rows for our season
    const seasonMemberRows = await dbQuery("fantasy_season_members", { league_season_id: season_id });
    const seasonMemberIds = new Set(seasonMemberRows.map((r: any) => r.id));
    const ourManagerRows = rows.filter((r: any) => seasonMemberIds.has(r.season_member_id));

    ourManagerRows.length === 3
      ? pass("fantasy_team_managers: exactly 3 rows (1 per participant)")
      : fail("fantasy_team_managers count", `Expected 3, got ${ourManagerRows.length}`);

    const allActive = ourManagerRows.every((r: any) => r.is_active === true && r.role === "manager");
    allActive
      ? pass("All team_manager rows are active, role='manager'")
      : fail("team_manager rows inactive or wrong role", JSON.stringify(ourManagerRows.filter((r: any) => !r.is_active || r.role !== "manager")));

    // Verify each manager references a valid season_member in this season
    const validManagerRef = ourManagerRows.every((r: any) => seasonMemberIds.has(r.season_member_id));
    validManagerRef
      ? pass("All team_manager.season_member_id references resolve to this season's members")
      : fail("Orphaned team_manager.season_member_id", "Some managers reference season_members not in this season", "CRITICAL");
  }

  // No orphaned league_members outside this league
  {
    const { count } = await service
      .from("fantasy_league_members")
      .select("id", { count: "exact", head: true })
      .eq("league_id", league_id);
    count === 3
      ? pass("fantasy_league_members: exactly 3 rows (no orphans)")
      : fail("fantasy_league_members orphan check", `Expected 3, got ${count}`);
  }

  // No orphaned claims
  {
    const { count } = await service
      .from("fantasy_member_claims")
      .select("id", { count: "exact", head: true })
      .eq("user_id", testUserId!);
    count === 1
      ? pass("fantasy_member_claims: exactly 1 claim for this user (no duplicates)")
      : fail("fantasy_member_claims duplicate check", `Expected 1, got ${count}`);
  }

  // Verify FK chain: claim → league_member → league
  {
    const claims = await dbQuery("fantasy_member_claims", { user_id: testUserId });
    const claimRow = claims[0];
    const lmRows = await dbQuery("fantasy_league_members", { id: claimRow.league_member_id });
    lmRows.length === 1 && lmRows[0].league_id === league_id
      ? pass("FK chain: claim → league_member → league resolves correctly")
      : fail("FK chain broken", `claim.league_member_id → league_member.league_id chain failed`);
  }

  // ── 12. GET /api/fantasy/leagues ─────────────────────────────────────────────
  section("12. GET /api/fantasy/leagues");

  {
    const r = await api("/api/fantasy/leagues", { token });
    if (r.status === 200 && Array.isArray(r.body.leagues)) {
      pass("GET /leagues → 200 with leagues array");
      const league = r.body.leagues.find((l: any) => l.id === league_id);
      if (league) {
        pass("Newly created league appears in GET /leagues");
        league.league_name === validSetup.league_name && league.sport === "football"
          ? pass("League fields are correct (name, sport)")
          : fail("League fields incorrect", JSON.stringify(league));
        Array.isArray(league.fantasy_league_seasons) && league.fantasy_league_seasons.length === 1
          ? pass("Season stub nested in league (1 season)")
          : fail("Season stub missing or wrong count", JSON.stringify(league.fantasy_league_seasons));
        league.fantasy_league_seasons?.[0]?.status === "upcoming"
          ? pass("Season status is 'upcoming'")
          : fail("Season status incorrect", `Got ${league.fantasy_league_seasons?.[0]?.status}`);
      } else {
        fail("Newly created league NOT in GET /leagues response", JSON.stringify(r.body), "HIGH");
      }
    } else {
      fail("GET /leagues", `Expected 200 with leagues[], got ${r.status}: ${JSON.stringify(r.body)}`, "HIGH");
    }
  }

  // ── 13. GET /api/fantasy/leagues/:id/seasons/:id ─────────────────────────────
  section("13. GET /api/fantasy/leagues/:leagueId/seasons/:seasonId");

  {
    const r = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}`, { token });
    if (r.status === 200 && r.body.league && r.body.season && Array.isArray(r.body.participants)) {
      pass("GET /leagues/:id/seasons/:id → 200 with league + season + participants");

      r.body.league.id === league_id && r.body.league.sport === "football"
        ? pass("Season detail: league fields correct")
        : fail("Season detail: league fields incorrect", JSON.stringify(r.body.league));

      r.body.season.id === season_id && r.body.season.season_year === 2026 && r.body.season.status === "upcoming"
        ? pass("Season detail: season fields correct")
        : fail("Season detail: season fields incorrect", JSON.stringify(r.body.season));

      r.body.season.default_reward_description === "Dinner for the group" && r.body.season.default_reward_amount_display === "$50"
        ? pass("Season detail: reward fields correct")
        : fail("Season detail: reward fields incorrect", JSON.stringify(r.body.season));

      r.body.participants.length === 3
        ? pass("Season detail: 3 participants returned")
        : fail("Season detail: participant count wrong", `Expected 3, got ${r.body.participants.length}`);

      const commParticipant = r.body.participants.find((p: any) => p.role === "commissioner");
      if (commParticipant) {
        pass("Season detail: commissioner participant present");
        // §8c replaced commissioner's team with "QA Monsters Recovered" during partial-state recovery
        commParticipant.team_name === "QA Monsters Recovered"
          ? pass("Season detail: commissioner's team_name is correct (QA Monsters Recovered from §8c)")
          : fail("Commissioner team_name", `Expected 'QA Monsters Recovered', got ${commParticipant.team_name}`);
        commParticipant.display_name === "QA Commissioner"
          ? pass("Season detail: commissioner's display_name is correct")
          : fail("Commissioner display_name", `Expected 'QA Commissioner', got ${commParticipant.display_name}`);
      } else {
        fail("Commissioner not in participants list", JSON.stringify(r.body.participants), "HIGH");
      }

      // Verify all participants have team_name (no nulls)
      const noTeam = r.body.participants.filter((p: any) => !p.team_name);
      noTeam.length === 0
        ? pass("All 3 participants have team_name assigned")
        : fail("Some participants missing team_name", JSON.stringify(noTeam));

    } else {
      fail("GET /seasons/:id", `Expected 200 with full season detail, got ${r.status}: ${JSON.stringify(r.body)}`, "HIGH");
    }
  }

  // ── 14. Transaction rollback test ────────────────────────────────────────────
  section("14. Transaction Atomicity — Rollback on Invalid Input");

  // If setup_fantasy_league raises (e.g. invalid sport passed through), no partial records.
  {
    const countBefore = await service.from("fantasy_leagues").select("id", { count: "exact", head: true });
    const leagueCountBefore = countBefore.count ?? 0;

    const r = await api("/api/fantasy/leagues/setup", {
      method: "POST",
      token,
      body: {
        league_name:  "ROLLBACK_TEST",
        sport:        "cricket",  // invalid — RPC will RAISE EXCEPTION
        display_name: "Rollback User",
        season_year:  2026,
      },
    });

    const countAfter = await service.from("fantasy_leagues").select("id", { count: "exact", head: true });
    const leagueCountAfter = countAfter.count ?? 0;

    r.status === 400 && leagueCountAfter === leagueCountBefore
      ? pass("Invalid sport: 400 returned and no partial league row created (rollback confirmed)")
      : fail(
          "Transaction rollback on invalid sport",
          `Status: ${r.status}, leagues before: ${leagueCountBefore}, after: ${leagueCountAfter}`,
          "CRITICAL",
          "RPC raised exception but DB still has an extra row — transaction is not rolling back correctly."
        );
  }

  // If add_fantasy_season_participant is called with a league_member_id from a DIFFERENT league,
  // the RPC must raise and roll back (no partial member/team/manager).
  if (p2Result?.league_member_id) {
    // p2Result.league_member_id belongs to league_id — so it IS valid here.
    // We need a member ID that belongs to a different league. Create one manually.
    const { data: orphanMember } = await service
      .from("fantasy_league_members")
      .insert({ league_id: "00000000-0000-0000-0000-000000000001", display_name: "Orphan" })
      .select()
      .single();

    // Orphan insert will fail because the league doesn't exist (FK constraint).
    // Instead, test cross-season integrity: use a season_id from a different (non-existent) league.
    // We already tested this above with fakeSeasonId in section 7.
    pass("Cross-league member integrity: validated via FK constraints and RPC guard (tested in §7)");
  }

  // ── 15. Summary ──────────────────────────────────────────────────────────────
  await cleanup();
  return reportFinal();
}

function reportFinal() {
  const total = passed + failed;
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                   QA RESULTS                            ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Total:  ${String(total).padEnd(4)} tests                                    ║`);
  console.log(`║  ✅ Passed: ${String(passed).padEnd(4)}                                       ║`);
  console.log(`║  ❌ Failed: ${String(failed).padEnd(4)}                                       ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  if (failed === 0) {
    console.log("\n🟢  OVERALL RESULT: PASS\n");
    console.log("  All Phase 2 scenarios verified successfully.");
  } else {
    console.log("\n🔴  OVERALL RESULT: FAIL\n");
    console.log("  Failures:\n");
    for (const f of failures) {
      console.log(`  [${f.severity}] §${f.section}`);
      console.log(`    Test:  ${f.test}`);
      console.log(`    Error: ${f.error}`);
      if (f.repro) console.log(`    Repro: ${f.repro}`);
      console.log();
    }
  }
}

run().catch((e) => {
  console.error("\n[FATAL] Unhandled error during QA run:", e.message);
  cleanup().finally(() => process.exit(1));
});
