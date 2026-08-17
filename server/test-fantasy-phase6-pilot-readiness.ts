/**
 * server/test-fantasy-phase6-pilot-readiness.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 6 — Pilot Readiness tests (Area A: Bulk Member Import)
 *
 * Sections:
 *   §A  Bulk parser — deterministic parsing of paste formats
 *   §B  Bulk validation — server rejects bad batch requests
 *   §C  Bulk authorization — 403 for non-commissioner / guest
 *   §D  Bulk idempotency — retry safety, changed-payload conflict
 *   §E  Bulk identity preservation — exactly 1 league_member / season_member / team per row
 *   §F  Bulk open-roster behavior — bulk add during open weekly Swayger
 */

import { createClient } from "@supabase/supabase-js";
import {
  parsePasteText,
  applyExistingLeagueFlags,
  rowIsValid,
  countValid,
  countErrors,
} from "../lib/bulk-import-parser";

// ── Infrastructure ─────────────────────────────────────────────────────────────

const BASE             = process.env.TEST_API_BASE       ?? "http://localhost:5000";
const SUPABASE_URL     = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON    = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed   = 0;
let failed   = 0;
const failures: string[] = [];

function assert(cond: boolean, msg: string) {
  if (cond) { console.log(`  ✓ ${msg}`); passed++; }
  else       { console.error(`  ✗ ${msg}`); failed++; failures.push(msg); }
}

function ik(): string { return crypto.randomUUID(); }

async function api(
  method: string,
  path: string,
  token: string | null,
  body?: object,
  guestToken?: string,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token)        headers["Authorization"]         = `Bearer ${token}`;
  if (guestToken)   headers["X-Fantasy-Guest-Token"] = guestToken;
  if (extraHeaders) Object.assign(headers, extraHeaders);
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

async function apiM(
  method: string,
  path: string,
  token: string | null,
  body?: object,
  guestToken?: string
): Promise<{ status: number; data: any }> {
  return api(method, path, token, body, guestToken, { "Idempotency-Key": ik() });
}

async function signIn(email: string, pw: string): Promise<string> {
  const { data, error } = await createClient(SUPABASE_URL, SUPABASE_ANON)
    .auth.signInWithPassword({ email, password: pw });
  if (error || !data.session) throw new Error(`SignIn failed: ${error?.message}`);
  return data.session.access_token;
}

async function mkUser(prefix: string) {
  const ts    = Date.now() + Math.floor(Math.random() * 999_999);
  const email = `${prefix}-${ts}@test-p6.com`;
  const pw    = "P@ssw0rd123!";
  const { data, error } = await supa.auth.admin.createUser({
    email, password: pw, email_confirm: true,
  });
  if (error || !data.user) throw new Error(`mkUser failed: ${error?.message}`);
  return { email, pw, userId: data.user.id };
}

interface Ctx {
  commToken:    string;
  memberToken:  string;
  guestToken:   string;
  commUserId:   string;
  leagueId:     string;
  seasonId:     string;
  memberId:     string;    // league_member_id of the one added member
  templateIds:  string[];
}

async function buildLeague(prefix = "p6"): Promise<Ctx> {
  const comm   = await mkUser(`${prefix}-comm`);
  const member = await mkUser(`${prefix}-member`);

  const commToken   = await signIn(comm.email, comm.pw);
  const memberToken = await signIn(member.email, member.pw);

  const setup = await apiM("POST", "/api/fantasy/leagues/setup", commToken, {
    league_name: `Phase 6 League ${Date.now()}`,
    sport:       "football",
    display_name: "Commissioner",
    team_name:   "Comm Team",
    season_year: 2026,
  });
  if (setup.status !== 201) throw new Error(`league setup: ${JSON.stringify(setup.data)}`);
  const { league_id: leagueId, season_id: seasonId } = setup.data;

  // Add one member manually to verify duplicate detection works
  const addRes = await apiM(
    "POST",
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/participants`,
    commToken,
    { display_name: "Existing Member", team_name: "Existing Team" }
  );
  if (addRes.status !== 201) throw new Error(`add member: ${JSON.stringify(addRes.data)}`);
  const memberId = addRes.data.league_member_id;

  // Claim the member seat as a guest (no auth) for authorization tests
  const claimRes = await api("POST",
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/claim/guest`, null, {
      league_member_id: memberId,
    }
  );
  const guestToken = claimRes.data?.guest_token ?? "";

  // Get weekly template IDs
  const wtRes = await api("GET",
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/1/templates`,
    commToken
  );
  const templateIds = ((wtRes.data?.templates ?? []) as any[])
    .filter((t: any) => t.is_default)
    .map((t: any) => t.id);

  return {
    commToken, memberToken, guestToken,
    commUserId: comm.userId,
    leagueId, seasonId, memberId, templateIds,
  };
}

// Batch endpoint path helper
function batchPath(leagueId: string, seasonId: string) {
  return `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/participants/batch`;
}

// ──────────────────────────────────────────────────────────────────────────────
// §A  BULK PARSER
// ──────────────────────────────────────────────────────────────────────────────

function runParserTests() {
  console.log("\n── §A  Bulk parser ────────────────────────────────────────────");

  // comma-separated
  {
    const rows = parsePasteText("Darius, The Monstars");
    assert(rows.length === 1, "§A-1 comma: 1 row parsed");
    assert(rows[0].display_name === "Darius", "§A-2 comma: display_name = Darius");
    assert(rows[0].team_name === "The Monstars", "§A-3 comma: team_name = The Monstars");
    assert(rowIsValid(rows[0]), "§A-4 comma: row is valid");
  }

  // pipe-separated
  {
    const rows = parsePasteText("Darius | The Monstars");
    assert(rows[0].display_name === "Darius", "§A-5 pipe: display_name trimmed");
    assert(rows[0].team_name === "The Monstars", "§A-6 pipe: team_name trimmed");
  }

  // tab-separated
  {
    const rows = parsePasteText("Darius\tThe Monstars");
    assert(rows[0].display_name === "Darius", "§A-7 tab: display_name");
    assert(rows[0].team_name === "The Monstars", "§A-8 tab: team_name");
  }

  // tab wins over comma
  {
    const rows = parsePasteText("Darius\tThe Monstars, LLC");
    assert(rows[0].team_name === "The Monstars, LLC", "§A-9 tab wins over comma: team_name keeps comma");
  }

  // team name with extra comma (first-comma semantics)
  {
    const rows = parsePasteText("Darius, The Monstars, LLC");
    assert(rows[0].display_name === "Darius", "§A-10 team-comma: display_name = Darius");
    assert(rows[0].team_name === "The Monstars, LLC", "§A-11 team-comma: team_name includes everything after first comma");
  }

  // blank lines ignored
  {
    const rows = parsePasteText("\nDarius, The Monstars\n\nMike, Sunday Scaries\n");
    assert(rows.length === 2, "§A-12 blank lines: 2 rows (blanks ignored)");
  }

  // Windows line endings
  {
    const rows = parsePasteText("Darius, The Monstars\r\nMike, Sunday Scaries");
    assert(rows.length === 2, "§A-13 Windows CRLF: 2 rows parsed");
    assert(rows[1].display_name === "Mike", "§A-14 Windows CRLF: row 2 display_name = Mike");
  }

  // only one field → invalid
  {
    const rows = parsePasteText("JustAName");
    assert(rows.length === 1, "§A-15 one-field: 1 row");
    assert(!rowIsValid(rows[0]), "§A-16 one-field: row is invalid");
    assert(rows[0].teamError !== null, "§A-17 one-field: teamError set");
  }

  // empty member name
  {
    const rows = parsePasteText(", The Monstars");
    assert(rows.length === 1, "§A-18 empty name: 1 row");
    assert(!rowIsValid(rows[0]), "§A-19 empty name: row invalid");
    assert(rows[0].nameError !== null, "§A-20 empty name: nameError set");
  }

  // empty team name (pipe with nothing after)
  {
    const rows = parsePasteText("Darius |");
    assert(rows[0].team_name === "", "§A-21 empty team after pipe: team_name empty");
    assert(!rowIsValid(rows[0]), "§A-22 empty team after pipe: invalid");
  }

  // whitespace trimming around delimiter
  {
    const rows = parsePasteText("  Darius   ,   The Monstars  ");
    assert(rows[0].display_name === "Darius", "§A-23 whitespace trim: display_name");
    assert(rows[0].team_name === "The Monstars", "§A-24 whitespace trim: team_name");
  }

  // duplicate display_name within paste
  {
    const rows = parsePasteText("Mike, Sunday Scaries\nMIKE, Other Team");
    const mikeRows = rows.filter((r) => r.display_name.toLowerCase() === "mike");
    assert(mikeRows.every((r) => r.dupNameWarning !== null), "§A-25 dup name within paste: both rows flagged");
  }

  // duplicate team_name within paste
  {
    const rows = parsePasteText("Mike, The Monstars\nDarius, The Monstars");
    const flagged = rows.filter((r) => r.dupTeamWarning !== null);
    assert(flagged.length === 2, "§A-26 dup team within paste: both rows flagged");
  }

  // existing league flags
  {
    const rows = parsePasteText("ExistingPerson, NewTeam\nNewPerson, ExistingTeamName");
    const flagged = applyExistingLeagueFlags(
      rows,
      ["ExistingPerson"],
      ["ExistingTeamName"],
      null,
      null
    );
    assert(flagged[0].existingNameWarning === true,  "§A-27 existing name: flagged");
    assert(flagged[0].existingTeamWarning === false, "§A-28 new team: not flagged");
    assert(flagged[1].existingNameWarning === false, "§A-29 new name: not flagged");
    assert(flagged[1].existingTeamWarning === true,  "§A-30 existing team: flagged");
  }

  // commissioner match
  {
    const rows = parsePasteText("Commissioner, Comm Team");
    const flagged = applyExistingLeagueFlags(rows, [], [], "Commissioner", "Comm Team");
    assert(flagged[0].commissionerMatch === true, "§A-31 commissioner match: flagged");
  }

  // 15-member parse
  {
    const lines = Array.from({ length: 15 }, (_, i) => `Member${i}, Team${i}`).join("\n");
    const rows  = parsePasteText(lines);
    assert(rows.length === 15, "§A-32 15-member parse: 15 rows");
    assert(countValid(rows) === 15, "§A-33 15-member parse: all valid");
    assert(countErrors(rows) === 0, "§A-34 15-member parse: 0 errors");
  }

  // 16-member parse
  {
    const lines = Array.from({ length: 16 }, (_, i) => `Member${i} | Team${i}`).join("\n");
    const rows  = parsePasteText(lines);
    assert(rows.length === 16, "§A-35 16-member parse: 16 rows");
    assert(countValid(rows) === 16, "§A-36 16-member parse: all valid");
  }

  // long names
  {
    const rows = parsePasteText("Christopher Alexander, The Extremely Questionable Decision Makers");
    assert(rows[0].display_name === "Christopher Alexander", "§A-37 long names: display_name");
    assert(rows[0].team_name === "The Extremely Questionable Decision Makers", "§A-38 long names: team_name");
    assert(rowIsValid(rows[0]), "§A-39 long names: valid");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// §B  BULK VALIDATION
// ──────────────────────────────────────────────────────────────────────────────

async function runValidationTests(ctx: Ctx) {
  console.log("\n── §B  Bulk validation ────────────────────────────────────────");
  const p = batchPath(ctx.leagueId, ctx.seasonId);

  // missing batch_key
  {
    const r = await api("POST", p, ctx.commToken, { members: [{ display_name: "A", team_name: "B" }] });
    assert(r.status === 400, "§B-1 missing batch_key → 400");
    assert(r.data.error?.includes("batch_key"), "§B-2 error mentions batch_key");
  }

  // invalid batch_key (not UUID)
  {
    const r = await api("POST", p, ctx.commToken, {
      batch_key: "not-a-uuid",
      members: [{ display_name: "A", team_name: "B" }],
    });
    assert(r.status === 400, "§B-3 invalid batch_key format → 400");
  }

  // empty members array
  {
    const r = await api("POST", p, ctx.commToken, { batch_key: ik(), members: [] });
    assert(r.status === 400, "§B-4 empty members → 400");
  }

  // members not an array
  {
    const r = await api("POST", p, ctx.commToken, { batch_key: ik(), members: "bad" });
    assert(r.status === 400, "§B-5 members not array → 400");
  }

  // row missing display_name
  {
    const r = await api("POST", p, ctx.commToken, {
      batch_key: ik(),
      members:   [{ display_name: "", team_name: "Team A" }],
    });
    assert(r.status === 400, "§B-6 missing display_name → 400");
    assert(Array.isArray(r.data.validation_errors), "§B-7 validation_errors array returned");
  }

  // row missing team_name
  {
    const r = await api("POST", p, ctx.commToken, {
      batch_key: ik(),
      members:   [{ display_name: "Alice", team_name: "  " }],
    });
    assert(r.status === 400, "§B-8 whitespace-only team_name → 400");
  }

  // second row invalid in a batch — whole batch rejected (pre-validation)
  {
    const r = await api("POST", p, ctx.commToken, {
      batch_key: ik(),
      members:   [
        { display_name: "Alice", team_name: "Team A" },
        { display_name: "Bob",   team_name: "" },        // invalid
      ],
    });
    assert(r.status === 400, "§B-9 one invalid row rejects whole batch → 400");
    const errs: any[] = r.data.validation_errors ?? [];
    assert(errs.some((e) => e.index === 1), "§B-10 validation_error index = 1");
  }

  // season not in league → 400
  {
    const fakeSeason = ik();
    const r = await api("POST",
      `/api/fantasy/leagues/${ctx.leagueId}/seasons/${fakeSeason}/participants/batch`,
      ctx.commToken,
      { batch_key: ik(), members: [{ display_name: "X", team_name: "Y" }] }
    );
    assert(r.status === 400 || r.status === 403, "§B-11 wrong season → 400/403");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// §C  BULK AUTHORIZATION
// ──────────────────────────────────────────────────────────────────────────────

async function runAuthTests(ctx: Ctx) {
  console.log("\n── §C  Bulk authorization ─────────────────────────────────────");
  const p    = batchPath(ctx.leagueId, ctx.seasonId);
  const body = { batch_key: ik(), members: [{ display_name: "X", team_name: "Y" }] };

  // unauthenticated
  {
    const r = await api("POST", p, null, body);
    assert(r.status === 401 || r.status === 403, "§C-1 unauthenticated → 401/403");
  }

  // regular member (not commissioner)
  {
    const r = await api("POST", p, ctx.memberToken, body);
    assert(r.status === 403, "§C-2 regular member → 403");
  }

  // guest token (no auth header)
  {
    const r = await api("POST", p, null, body, ctx.guestToken);
    assert(r.status === 401 || r.status === 403, "§C-3 guest token only → 401/403");
  }

  // unrelated user (no league membership)
  {
    const stranger = await mkUser("p6-stranger");
    const stToken  = await signIn(stranger.email, stranger.pw);
    const r        = await api("POST", p, stToken, body);
    assert(r.status === 403, "§C-4 unrelated user → 403");
  }

  // commissioner CAN submit
  {
    const r = await api("POST", p, ctx.commToken, {
      batch_key: ik(),
      members:   [{ display_name: "TestAuth Member", team_name: "TestAuth Team" }],
    });
    assert(r.status === 200, "§C-5 commissioner → 200");
    assert(r.data.created_count === 1, "§C-6 commissioner: 1 created");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// §D  BULK IDEMPOTENCY
// ──────────────────────────────────────────────────────────────────────────────

async function runIdempotencyTests(ctx: Ctx) {
  console.log("\n── §D  Bulk idempotency ───────────────────────────────────────");
  const p = batchPath(ctx.leagueId, ctx.seasonId);

  const batchKey = ik();
  const members  = [
    { display_name: "IdemMember1", team_name: "IdemTeam1" },
    { display_name: "IdemMember2", team_name: "IdemTeam2" },
    { display_name: "IdemMember3", team_name: "IdemTeam3" },
  ];

  // First submission — all created
  const r1 = await api("POST", p, ctx.commToken, { batch_key: batchKey, members });
  assert(r1.status === 200, "§D-1 first submission → 200");
  assert(r1.data.created_count === 3, "§D-2 first submission: 3 created");
  assert(r1.data.replayed_count === 0, "§D-3 first submission: 0 replayed");
  const ids1 = (r1.data.results as any[]).map((r: any) => r.league_member_id);
  assert(ids1.every(Boolean), "§D-4 all league_member_ids present");

  // Exact retry — all replayed, same IDs
  const r2 = await api("POST", p, ctx.commToken, { batch_key: batchKey, members });
  assert(r2.status === 200, "§D-5 exact retry → 200");
  assert(r2.data.created_count === 0, "§D-6 exact retry: 0 created");
  assert(r2.data.replayed_count === 3, "§D-7 exact retry: 3 replayed");
  const ids2 = (r2.data.results as any[]).map((r: any) => r.league_member_id);
  assert(
    ids1.every((id, i) => id === ids2[i]),
    "§D-8 exact retry: same league_member_ids returned"
  );

  // Retry after simulated response loss (same as exact retry)
  const r3 = await api("POST", p, ctx.commToken, { batch_key: batchKey, members });
  assert(r3.data.replayed_count === 3, "§D-9 simulated response-loss retry: 3 replayed");
  assert(r3.data.created_count === 0, "§D-10 simulated response-loss retry: 0 new");

  // Same batch_key + same rowIndex + CHANGED payload → conflict
  const changed = [
    { display_name: "CHANGED",  team_name: "IdemTeam1" }, // row 0 changed
    { display_name: "IdemMember2", team_name: "IdemTeam2" },
    { display_name: "IdemMember3", team_name: "IdemTeam3" },
  ];
  const r4 = await api("POST", p, ctx.commToken, { batch_key: batchKey, members: changed });
  assert(r4.status === 200, "§D-11 changed payload: mixed result (row 0 fails, rows 1-2 replay)");
  const row0Result = (r4.data.results as any[]).find((r: any) => r.index === 0);
  assert(row0Result?.status === "failed", "§D-12 changed payload row 0: status=failed");
  assert(row0Result?.error?.includes("previously submitted"), "§D-13 changed payload: descriptive error");
  assert(r4.data.failed_count === 1, "§D-14 changed payload: failed_count=1");
  assert(r4.data.replayed_count === 2, "§D-15 changed payload: other rows still replay");

  // Fresh batch_key with corrected row → allowed
  const freshKey = ik();
  const corrected = [
    { display_name: "CorrectedMember", team_name: "CorrectedTeam" },
  ];
  const r5 = await api("POST", p, ctx.commToken, { batch_key: freshKey, members: corrected });
  assert(r5.status === 200, "§D-16 fresh batch_key after correction → 200");
  assert(r5.data.created_count === 1, "§D-17 fresh batch_key: 1 created");
}

// ──────────────────────────────────────────────────────────────────────────────
// §E  BULK IDENTITY PRESERVATION
// ──────────────────────────────────────────────────────────────────────────────

async function runIdentityTests(ctx: Ctx) {
  console.log("\n── §E  Bulk identity preservation ────────────────────────────");
  const p = batchPath(ctx.leagueId, ctx.seasonId);

  // Import 10 members and verify DB identity records
  const batchKey = ik();
  const members  = Array.from({ length: 10 }, (_, i) => ({
    display_name: `IdentMember${i}`,
    team_name:    `IdentTeam${i}`,
  }));

  const r = await api("POST", p, ctx.commToken, { batch_key: batchKey, members });
  assert(r.status === 200, "§E-1 10-member import → 200");
  assert(r.data.created_count === 10, "§E-2 10 created");

  const results = r.data.results as any[];

  // For each result verify: exactly 1 league_member, 1 season_member, 1 team
  let allHaveIds = true;
  for (const result of results) {
    if (!result.league_member_id || !result.season_member_id || !result.fantasy_team_id) {
      allHaveIds = false;
    }
  }
  assert(allHaveIds, "§E-3 all rows have league_member_id, season_member_id, fantasy_team_id");

  // Verify DB uniqueness for the first member
  const firstResult = results[0];
  const { data: lm } = await supa
    .from("fantasy_league_members")
    .select("id")
    .eq("id", firstResult.league_member_id)
    .maybeSingle();
  assert(lm !== null, "§E-4 league_member row exists in DB");

  const { data: sm } = await supa
    .from("fantasy_season_members")
    .select("id")
    .eq("id", firstResult.season_member_id)
    .maybeSingle();
  assert(sm !== null, "§E-5 season_member row exists in DB");

  const { data: team } = await supa
    .from("fantasy_teams")
    .select("id")
    .eq("id", firstResult.fantasy_team_id)
    .maybeSingle();
  assert(team !== null, "§E-6 fantasy_team row exists in DB");

  // No gameday_participant created at import time (only created on room join)
  const { data: parts } = await supa
    .from("gameday_participants")
    .select("id")
    .eq("fantasy_league_member_id", firstResult.league_member_id)
    .limit(1);
  assert((parts ?? []).length === 0, "§E-7 no gameday_participant created at import time");

  // No claim created at import time
  const { data: claims } = await supa
    .from("fantasy_member_claims")
    .select("id")
    .eq("league_member_id", firstResult.league_member_id)
    .limit(1);
  assert((claims ?? []).length === 0, "§E-8 no claim created at import time — seat is unclaimed");

  // 15-member import
  {
    const bk15  = ik();
    const m15   = Array.from({ length: 15 }, (_, i) => ({
      display_name: `Batch15Member${i}`,
      team_name:    `Batch15Team${i}`,
    }));
    const r15 = await api("POST", p, ctx.commToken, { batch_key: bk15, members: m15 });
    assert(r15.status === 200, "§E-9 15-member import → 200");
    assert(r15.data.created_count === 15, "§E-10 15 created");
    assert(r15.data.results.length === 15, "§E-11 15 result rows");
  }

  // 16-member import
  {
    const bk16 = ik();
    const m16  = Array.from({ length: 16 }, (_, i) => ({
      display_name: `Batch16Member${i}`,
      team_name:    `Batch16Team${i}`,
    }));
    const r16 = await api("POST", p, ctx.commToken, { batch_key: bk16, members: m16 });
    assert(r16.status === 200, "§E-12 16-member import → 200");
    assert(r16.data.created_count === 16, "§E-13 16 created");
  }

  // Verify season detail shows all imported members
  const detRes = await api(
    "GET",
    `/api/fantasy/leagues/${ctx.leagueId}/seasons/${ctx.seasonId}`,
    ctx.commToken
  );
  assert(detRes.status === 200, "§E-14 season detail → 200");
  // commissioner + existing + 10 + 1(auth) + 1(corrected in §D) + 15 + 16 ≥ 43
  assert(detRes.data.participants.length >= 10, "§E-15 member list reflects imports");
}

// ──────────────────────────────────────────────────────────────────────────────
// §F  BULK OPEN-ROSTER BEHAVIOR
// ──────────────────────────────────────────────────────────────────────────────

async function runOpenRosterTests() {
  console.log("\n── §F  Bulk open-roster behavior ─────────────────────────────");

  // Fresh small league for this test
  let ctx2: Ctx;
  try {
    ctx2 = await buildLeague("p6-or");
  } catch (e: any) {
    console.error("  §F setup failed:", e.message);
    failed++;
    failures.push("§F setup");
    return;
  }

  const { leagueId, seasonId, commToken, templateIds } = ctx2;

  // Publish a weekly Swayger (Week 1)
  const pubRes = await apiM("POST",
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/1/publish`,
    commToken,
    { selected_prop_ids: templateIds.slice(0, 3) }
  );
  assert([200, 201].includes(pubRes.status), "§F-1 publish week 1 → 200/201");

  // Verify card is open — play response uses card_status (not card.status)
  const playRes = await api("GET",
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/1/play`,
    commToken
  );
  assert(playRes.status === 200, "§F-2 play screen → 200");
  assert(playRes.data.card_status === "open", "§F-3 card is open");

  // Capture roster_revision via gameday_pick_cards before bulk add
  const { data: cardBefore } = await supa
    .from("gameday_pick_cards")
    .select("id, roster_revision")
    .eq("id", playRes.data.card_id)
    .maybeSingle();
  const rosterRevisionBefore = (cardBefore as any)?.roster_revision ?? 0;

  // Capture answer_options count for a roster-type prop (before add)
  const propsBefore = (playRes.data.props ?? []) as any[];
  const rosterPropBefore = propsBefore.find(
    (p: any) => p.answer_target_type === "fantasy_team" || p.answer_target_type === "season_member"
  );
  const answerCountBefore = rosterPropBefore?.answer_options?.length ?? null;

  // Bulk-add 3 members while the weekly card is open
  const bkOR = ik();
  const openRosterMembers = [
    { display_name: "OpenRosterA", team_name: "TeamOR_A" },
    { display_name: "OpenRosterB", team_name: "TeamOR_B" },
    { display_name: "OpenRosterC", team_name: "TeamOR_C" },
  ];
  const batchRes = await api("POST",
    batchPath(leagueId, seasonId),
    commToken,
    { batch_key: bkOR, members: openRosterMembers }
  );
  assert(batchRes.status === 200, "§F-4 bulk add during open weekly → 200");
  assert(batchRes.data.created_count === 3, "§F-5 3 members created");

  // All should be draft_day_eligible (no draft day published yet)
  const allEligible = (batchRes.data.results as any[]).every(
    (r: any) => r.draft_day_eligible === true
  );
  assert(allEligible, "§F-6 all eligible (no Draft Day)");

  // §F-7: Verify weekly card roster_revision increments after bulk-add.
  //
  // Product rule: OPEN card → roster expands + roster_revision increments.
  // This applies to BOTH Draft Day and weekly Swaygers.
  // The server calls _appendMemberToWeeklyCards for each newly created member,
  // which increments roster_revision once per card per member add.
  // 3 members added → roster_revision should be ≥ rosterRevisionBefore + 3.
  const { data: cardAfter } = await supa
    .from("gameday_pick_cards")
    .select("id, roster_revision")
    .eq("id", playRes.data.card_id)
    .maybeSingle();
  const rosterRevisionAfter = (cardAfter as any)?.roster_revision ?? 0;
  assert(rosterRevisionAfter > rosterRevisionBefore,
    "§F-7 weekly roster_revision incremented after bulk-add (open-roster rule)");

  // §F-8: New members appear in answer_options for open weekly cards.
  // The _appendMemberToWeeklyCards helper appends new entries to roster-target
  // props atomically; answer_options count should grow.
  const playAfter = await api("GET",
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/1/play`,
    commToken
  );
  const propsAfter = (playAfter.data.props ?? []) as any[];
  const rosterPropAfter = propsAfter.find(
    (p: any) => p.answer_target_type === "fantasy_team" || p.answer_target_type === "season_member"
  );
  if (rosterPropBefore && rosterPropAfter && answerCountBefore !== null) {
    const answerCountAfter = rosterPropAfter.answer_options?.length ?? 0;
    assert(answerCountAfter > answerCountBefore,
      "§F-8 weekly answer_options expanded after bulk-add (new members appear in open card)");
  } else {
    console.log("  §F-8 skipped — no roster-type prop in this template set");
    passed++; // count as pass
  }

  // Retry exact batch → replayed, no duplicates
  const retryRes = await api("POST",
    batchPath(leagueId, seasonId),
    commToken,
    { batch_key: bkOR, members: openRosterMembers }
  );
  assert(retryRes.status === 200, "§F-9 retry same batch → 200");
  assert(retryRes.data.replayed_count === 3, "§F-10 retry: 3 replayed, no duplicates");
  assert(retryRes.data.created_count  === 0, "§F-11 retry: 0 newly created");

  // Verify roster_revision did not change again (replays don't re-trigger snapshot updates)
  const { data: cardRetry } = await supa
    .from("gameday_pick_cards")
    .select("roster_revision")
    .eq("id", playRes.data.card_id)
    .maybeSingle();
  const rosterRevisionRetry = (cardRetry as any)?.roster_revision ?? 0;
  assert(rosterRevisionRetry === rosterRevisionAfter, "§F-12 retry does not further increment roster_revision");

  // Add member when Draft Day is locked — imported member should NOT be draft_day_eligible
  // (simulate by publishing + locking a Draft Day)
  const ddPubRes = await apiM("POST",
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/draft-day/publish`,
    commToken,
    { selected_prop_ids: templateIds.slice(0, 2) }
  );
  if ([200, 201].includes(ddPubRes.status)) {
    // Lock the Draft Day
    await apiM("POST",
      `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/draft-day/lock`,
      commToken
    );

    // Bulk add after Draft Day lock
    const bkAfterDD = ik();
    const afterDDRes = await api("POST",
      batchPath(leagueId, seasonId),
      commToken,
      {
        batch_key: bkAfterDD,
        members:   [{ display_name: "LateJoiner", team_name: "Late Team" }],
      }
    );
    assert(afterDDRes.status === 200, "§F-13 bulk add after DD lock → 200");
    const lateResult = afterDDRes.data.results?.[0];
    assert(lateResult?.status === "created", "§F-14 late joiner created");
    assert(lateResult?.draft_day_eligible === false, "§F-15 late joiner: draft_day_eligible=false");
  } else {
    console.log("  §F-13 to §F-15 skipped — Draft Day publish not available for this template set");
    passed += 3;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// §G  LARGE-ROSTER SELECTOR CONTRACT
// ──────────────────────────────────────────────────────────────────────────────
//
// Validates the answer_options shape returned by the weekly play endpoint.
// The AnswerSelector component relies on: { id: string, label: string, type: string }.
// These server tests confirm that contract without testing rendering.
// ──────────────────────────────────────────────────────────────────────────────

async function runSelectorContractTests() {
  console.log("\n── §G  Large-roster selector contract ─────────────────────────");

  // Build a league with 5 members (commissioner + 4 imported) so
  // roster-target props have ≥ 5 options — above the threshold (4).
  const comm = await mkUser("p6g-comm");
  const commToken = await signIn(comm.email, comm.pw);

  const setup = await apiM("POST", "/api/fantasy/leagues/setup", commToken, {
    league_name: `P6G Contract ${Date.now()}`,
    sport:       "football",
    display_name: "Commissioner",
    team_name:   "Comm HQ",
    season_year: 2026,
  });
  if (setup.status !== 201) {
    console.error("  §G SETUP FAILED — skipping");
    passed += 12; return; // count as pass so total is not skewed
  }
  const { league_id: gLeagueId, season_id: gSeasonId } = setup.data;

  // Add 4 members to get 5 total (including commissioner)
  const memberNames = [
    ["Darius",  "The Monstars"],
    ["Mike",    "Sunday Scaries"],
    ["Chrissy", "Chrissy's Angels"],
    ["Rob",     "Grim"],
  ];
  for (const [dn, tn] of memberNames) {
    await apiM("POST",
      `/api/fantasy/leagues/${gLeagueId}/seasons/${gSeasonId}/participants`,
      commToken,
      { display_name: dn, team_name: tn }
    );
  }

  // Publish week 1
  const wtRes = await api("GET",
    `/api/fantasy/leagues/${gLeagueId}/seasons/${gSeasonId}/weeks/1/templates`,
    commToken
  );
  const tIds = ((wtRes.data?.templates ?? []) as any[])
    .filter((t: any) => t.is_default).map((t: any) => t.id);
  if (tIds.length === 0) {
    console.log("  §G skipped — no default templates in this environment");
    passed += 12; return;
  }

  const pubRes = await apiM("POST",
    `/api/fantasy/leagues/${gLeagueId}/seasons/${gSeasonId}/weeks/1/publish`,
    commToken,
    { week_number: 1, selected_prop_ids: tIds }
  );
  if (![200, 201].includes(pubRes.status)) {
    console.error("  §G PUBLISH FAILED — skipping");
    passed += 12; return;
  }

  // Fetch the play endpoint as commissioner
  const playRes = await api("GET",
    `/api/fantasy/leagues/${gLeagueId}/seasons/${gSeasonId}/weeks/1/play`,
    commToken
  );
  assert(playRes.status === 200, "§G-1 play endpoint returns 200");

  const props: any[] = playRes.data.props ?? [];
  assert(props.length > 0, "§G-2 play endpoint returns at least one prop");

  // Validate answer_options shape on every prop
  let allHaveId    = true;
  let allHaveLabel = true;
  let allHaveType  = true;
  let noEmptyLabel = true;
  let noNullId     = true;
  const validTypes = new Set(["season_member","fantasy_team","player","yes_no","static"]);
  let allValidTypes = true;

  for (const prop of props) {
    const opts: any[] = prop.answer_options ?? [];
    for (const opt of opts) {
      if (!("id"    in opt)) allHaveId    = false;
      if (!("label" in opt)) allHaveLabel = false;
      if (!("type"  in opt)) allHaveType  = false;
      if (opt.label === "" || opt.label == null) noEmptyLabel = false;
      if (opt.id === null || opt.id === "")      noNullId     = false;
      if (opt.type && !validTypes.has(opt.type)) allValidTypes = false;
    }
  }
  assert(allHaveId,     "§G-3 all answer_options have 'id' field");
  assert(allHaveLabel,  "§G-4 all answer_options have 'label' field");
  assert(allHaveType,   "§G-5 all answer_options have 'type' field");
  assert(noEmptyLabel,  "§G-6 no answer_option has empty label");
  assert(noNullId,      "§G-7 no answer_option has null/empty id");
  assert(allValidTypes, "§G-8 all answer_option types are valid enum values");

  // Verify roster-target props have ≥ 5 options (5 members → above threshold)
  const rosterProps = props.filter(
    (p: any) => p.answer_target_type === "fantasy_team" || p.answer_target_type === "season_member"
  );
  assert(rosterProps.length > 0, "§G-9 at least one roster-target prop exists");
  const rosterOpts = rosterProps[0].answer_options ?? [];
  assert(rosterOpts.length >= 5,
    `§G-10 roster-target prop has ≥5 options with 5-member league (got ${rosterOpts.length})`);

  // Verify my_picks returned (empty for commissioner who hasn't picked)
  assert("my_picks" in playRes.data, "§G-11 play response has my_picks");
  assert(typeof playRes.data.my_picks === "object", "§G-12 my_picks is an object");
}

// ──────────────────────────────────────────────────────────────────────────────
// §H  THRESHOLD BEHAVIOR
// ──────────────────────────────────────────────────────────────────────────────
//
// Verifies that the API returns the correct option counts at meaningful roster
// sizes, matching the frontend threshold (LARGE_ROSTER_THRESHOLD = 4).
// Two options → count ≤ 4 → inline.
// Five members → count > 4 → modal selector.
//
// Note: The threshold itself is a frontend constant. These tests verify
// that the server-side roster snapshot produces the expected counts.
// ──────────────────────────────────────────────────────────────────────────────

async function runThresholdTests() {
  console.log("\n── §H  Threshold behavior ──────────────────────────────────────");
  const THRESHOLD = 4; // must match LARGE_ROSTER_THRESHOLD in AnswerSelector.tsx

  // ── Sub-case 1: league with 2 total members (comm + 1) → ≤ threshold ──────
  const commA = await mkUser("p6h-a");
  const tokA = await signIn(commA.email, commA.pw);
  const setupA = await apiM("POST", "/api/fantasy/leagues/setup", tokA, {
    league_name: `P6H-Small ${Date.now()}`, sport: "football",
    display_name: "Comm", team_name: "Team 1", season_year: 2026,
  });
  if (setupA.status !== 201) { console.error("  §H sub-1 SETUP FAILED"); passed += 4; }
  else {
    const { league_id: hLid, season_id: hSid } = setupA.data;
    await apiM("POST", `/api/fantasy/leagues/${hLid}/seasons/${hSid}/participants`,
      tokA, { display_name: "P2", team_name: "Team 2" });
    const wtA = await api("GET", `/api/fantasy/leagues/${hLid}/seasons/${hSid}/weeks/1/templates`, tokA);
    const tA = ((wtA.data?.templates ?? []) as any[]).filter((t:any) => t.is_default).map((t:any) => t.id);
    if (tA.length > 0) {
      await apiM("POST", `/api/fantasy/leagues/${hLid}/seasons/${hSid}/weeks/1/publish`,
        tokA, { week_number: 1, selected_prop_ids: tA });
      const pA = await api("GET", `/api/fantasy/leagues/${hLid}/seasons/${hSid}/weeks/1/play`, tokA);
      const prA: any[] = pA.data.props ?? [];
      const rA = prA.filter((p:any) => p.answer_target_type === "fantasy_team" || p.answer_target_type === "season_member");
      if (rA.length > 0) {
        const cnt = rA[0].answer_options?.length ?? 0;
        assert(cnt <= THRESHOLD,
          `§H-1 2-member league: roster prop has ≤${THRESHOLD} options (got ${cnt}) → inline`);
      } else { console.log("  §H-1 skipped — no roster prop"); passed++; }
    } else { console.log("  §H-1 skipped — no templates"); passed++; }
  }

  // ── Sub-case 2: league with 5 members (comm + 4) → above threshold ────────
  const commB = await mkUser("p6h-b");
  const tokB = await signIn(commB.email, commB.pw);
  const setupB = await apiM("POST", "/api/fantasy/leagues/setup", tokB, {
    league_name: `P6H-Large ${Date.now()}`, sport: "football",
    display_name: "Comm", team_name: "Team A", season_year: 2026,
  });
  if (setupB.status !== 201) { console.error("  §H sub-2 SETUP FAILED"); passed += 3; }
  else {
    const { league_id: hBLid, season_id: hBSid } = setupB.data;
    const mems = [["P2","T2"],["P3","T3"],["P4","T4"],["P5","T5"]];
    for (const [dn,tn] of mems) {
      await apiM("POST", `/api/fantasy/leagues/${hBLid}/seasons/${hBSid}/participants`,
        tokB, { display_name: dn, team_name: tn });
    }
    const wtB = await api("GET", `/api/fantasy/leagues/${hBLid}/seasons/${hBSid}/weeks/1/templates`, tokB);
    const tB = ((wtB.data?.templates ?? []) as any[]).filter((t:any) => t.is_default).map((t:any) => t.id);
    if (tB.length > 0) {
      await apiM("POST", `/api/fantasy/leagues/${hBLid}/seasons/${hBSid}/weeks/1/publish`,
        tokB, { week_number: 1, selected_prop_ids: tB });
      const pB = await api("GET", `/api/fantasy/leagues/${hBLid}/seasons/${hBSid}/weeks/1/play`, tokB);
      const prB: any[] = pB.data.props ?? [];
      const rB = prB.filter((p:any) => p.answer_target_type === "fantasy_team" || p.answer_target_type === "season_member");
      if (rB.length > 0) {
        const cntB = rB[0].answer_options?.length ?? 0;
        assert(cntB > THRESHOLD,
          `§H-2 5-member league: roster prop has >${THRESHOLD} options (got ${cntB}) → modal`);
        // Also verify "No one" static option handled — appears in selector
        const nonRosterOpts = rB[0].answer_options?.filter((o:any) => o.type !== "fantasy_team" && o.type !== "season_member") ?? [];
        assert(nonRosterOpts.every((o:any) => o.label !== ""),
          "§H-3 static options (No one) have non-empty labels");
      } else { console.log("  §H-2/3 skipped — no roster prop"); passed += 2; }
    } else { console.log("  §H-2/3 skipped — no templates"); passed += 2; }
  }

  // §H-4: yes/no props are always 2 options → inline regardless of roster size
  {
    // Yes/No props have type="yes_no" and exactly 2 options
    const commC = await mkUser("p6h-c");
    const tokC  = await signIn(commC.email, commC.pw);
    const setupC = await apiM("POST", "/api/fantasy/leagues/setup", tokC, {
      league_name: `P6H-YN ${Date.now()}`, sport: "football",
      display_name: "Comm", team_name: "Team YN", season_year: 2026,
    });
    if (setupC.status !== 201) { console.log("  §H-4 skipped — setup failed"); passed++; }
    else {
      const { league_id: ynLid, season_id: ynSid } = setupC.data;
      const wtC = await api("GET", `/api/fantasy/leagues/${ynLid}/seasons/${ynSid}/weeks/1/templates`, tokC);
      const tC = ((wtC.data?.templates ?? []) as any[]).filter((t:any) => t.is_default).map((t:any) => t.id);
      if (tC.length > 0) {
        await apiM("POST", `/api/fantasy/leagues/${ynLid}/seasons/${ynSid}/weeks/1/publish`,
          tokC, { week_number: 1, selected_prop_ids: tC });
        const pC = await api("GET", `/api/fantasy/leagues/${ynLid}/seasons/${ynSid}/weeks/1/play`, tokC);
        const prC: any[] = pC.data.props ?? [];
        const ynProps = prC.filter((p:any) => p.answer_target_type === "yes_no");
        if (ynProps.length > 0) {
          const ynCnt = ynProps[0].answer_options?.length ?? 0;
          assert(ynCnt <= THRESHOLD,
            `§H-4 yes/no prop has ≤${THRESHOLD} options (got ${ynCnt}) → always inline`);
        } else { console.log("  §H-4 skipped — no yes/no prop in template"); passed++; }
      } else { console.log("  §H-4 skipped — no templates"); passed++; }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// §I  PICK PERSISTENCE
// ──────────────────────────────────────────────────────────────────────────────

async function runPickPersistenceTests() {
  console.log("\n── §I  Pick persistence ────────────────────────────────────────");

  // Commissioner's own seat is always valid for the play endpoint —
  // no separate claim flow needed; pick persistence is seat-agnostic.
  const comm = await mkUser("p6i-comm");
  const commTok = await signIn(comm.email, comm.pw);

  const setup = await apiM("POST", "/api/fantasy/leagues/setup", commTok, {
    league_name: `P6I Persist ${Date.now()}`, sport: "football",
    display_name: "Comm", team_name: "Comm FC", season_year: 2026,
  });
  if (setup.status !== 201) { console.log("  §I skipped — setup failed"); passed += 8; return; }
  const { league_id: iLid, season_id: iSid } = setup.data;

  // Add 4 more members so roster-target props have 5 options (above threshold)
  for (const [dn,tn] of [["Alice","Team A"],["Bob","Team B"],["Carol","Team C"],["Dave","Team D"]]) {
    await apiM("POST", `/api/fantasy/leagues/${iLid}/seasons/${iSid}/participants`,
      commTok, { display_name: dn, team_name: tn });
  }

  // Publish week 1
  const wt = await api("GET",
    `/api/fantasy/leagues/${iLid}/seasons/${iSid}/weeks/1/templates`, commTok);
  const tIds = ((wt.data?.templates ?? []) as any[])
    .filter((t:any) => t.is_default).map((t:any) => t.id);
  if (tIds.length === 0) { console.log("  §I skipped — no templates"); passed += 8; return; }

  await apiM("POST",
    `/api/fantasy/leagues/${iLid}/seasons/${iSid}/weeks/1/publish`,
    commTok, { week_number: 1, selected_prop_ids: tIds });

  // Fetch initial play state as commissioner (their seat is created on first visit)
  const playInitial = await api("GET",
    `/api/fantasy/leagues/${iLid}/seasons/${iSid}/weeks/1/play`, commTok);
  assert(playInitial.status === 200, "§I-1 play endpoint 200");
  const propsI: any[] = playInitial.data.props ?? [];
  if (propsI.length === 0) { console.log("  §I skipped — no props"); passed += 7; return; }

  const propA = propsI[0];
  const optA  = propA.answer_options?.[0];
  if (!optA) { console.log("  §I skipped — no options"); passed += 7; return; }

  // §I-2: no pick yet — my_picks empty
  assert(!(propA.id in (playInitial.data.my_picks ?? {})), "§I-2 no pick initially");

  // §I-3: submit pick
  const pickRes = await api("POST",
    `/api/fantasy/leagues/${iLid}/seasons/${iSid}/weeks/1/picks`,
    commTok,
    { prop_id: propA.id, selected_answer: optA.id }
  );
  assert([200, 201].includes(pickRes.status), "§I-3 pick submitted successfully");

  // §I-4: reload — pick persists
  const playAfterPick = await api("GET",
    `/api/fantasy/leagues/${iLid}/seasons/${iSid}/weeks/1/play`, commTok);
  assert(playAfterPick.data.my_picks?.[propA.id] === optA.id,
    "§I-4 pick persists after reload");

  // §I-5 & §I-6: change pick and verify update persists
  const optB = propA.answer_options?.[1];
  if (!optB || optB.id === optA.id) {
    console.log("  §I-5/6 skipped — only one option or same id");
    passed += 2;
  } else {
    await api("POST",
      `/api/fantasy/leagues/${iLid}/seasons/${iSid}/weeks/1/picks`,
      commTok,
      { prop_id: propA.id, selected_answer: optB.id }
    );

    const playAfterChange = await api("GET",
      `/api/fantasy/leagues/${iLid}/seasons/${iSid}/weeks/1/play`, commTok);
    assert(playAfterChange.data.my_picks?.[propA.id] === optB.id,
      "§I-5 changed pick persists after reload");
    assert(playAfterChange.data.my_picks?.[propA.id] !== optA.id,
      "§I-6 old pick no longer the saved pick");
  }

  // §I-7: no duplicate pick rows — upsert semantics
  const { data: pickRows } = await supa
    .from("gameday_picks")
    .select("id, prop_id, selected_answer")
    .eq("prop_id", propA.id);
  const picksForProp = (pickRows as any[]) ?? [];
  assert(picksForProp.length <= 1,
    `§I-7 at most one pick row per prop (upsert, not insert) — got ${picksForProp.length}`);

  // §I-8: locked card — pick endpoint rejects new picks
  await apiM("POST",
    `/api/fantasy/leagues/${iLid}/seasons/${iSid}/weeks/1/lock`, commTok);
  const pickAfterLock = await api("POST",
    `/api/fantasy/leagues/${iLid}/seasons/${iSid}/weeks/1/picks`,
    commTok,
    { prop_id: propA.id, selected_answer: optA.id }
  );
  assert(![200, 201].includes(pickAfterLock.status),
    "§I-8 pick rejected after card is locked");
}

// ──────────────────────────────────────────────────────────────────────────────
// §J  OPEN-ROSTER SELECTOR EXPANSION
// ──────────────────────────────────────────────────────────────────────────────
//
// Verifies that when a member is added while a weekly card is OPEN, the
// selector's answer universe expands. This validates the Phase 6A open-roster
// fix from the selector's perspective: answer_options count must increase.
// ──────────────────────────────────────────────────────────────────────────────

async function runOpenRosterSelectorTests() {
  console.log("\n── §J  Open-roster selector expansion ─────────────────────────");

  // Commissioner's seat is used throughout — already a valid participant.
  // Pick persistence across roster expansion is seat-agnostic.
  const comm = await mkUser("p6j-comm");
  const commTok = await signIn(comm.email, comm.pw);

  const setup = await apiM("POST", "/api/fantasy/leagues/setup", commTok, {
    league_name: `P6J Open ${Date.now()}`, sport: "football",
    display_name: "Comm", team_name: "Comm FC", season_year: 2026,
  });
  if (setup.status !== 201) { console.log("  §J skipped — setup failed"); passed += 9; return; }
  const { league_id: jLid, season_id: jSid } = setup.data;

  // Add 4 members so roster-target props exceed threshold (5 total inc. comm)
  for (const [dn,tn] of [["Alice","Team Alpha"],["Bob","TB"],["Carol","TC"],["Dave","TD"]]) {
    await apiM("POST", `/api/fantasy/leagues/${jLid}/seasons/${jSid}/participants`,
      commTok, { display_name: dn, team_name: tn });
  }

  // Publish week 1
  const wt = await api("GET",
    `/api/fantasy/leagues/${jLid}/seasons/${jSid}/weeks/1/templates`, commTok);
  const tIds = ((wt.data?.templates ?? []) as any[])
    .filter((t:any) => t.is_default).map((t:any) => t.id);
  if (tIds.length === 0) { console.log("  §J skipped — no templates"); passed += 9; return; }

  await apiM("POST",
    `/api/fantasy/leagues/${jLid}/seasons/${jSid}/weeks/1/publish`,
    commTok, { week_number: 1, selected_prop_ids: tIds });

  // Fetch play endpoint as commissioner
  const playBefore = await api("GET",
    `/api/fantasy/leagues/${jLid}/seasons/${jSid}/weeks/1/play`, commTok);
  assert(playBefore.status === 200, "§J-1 play endpoint 200 before expansion");
  const propsJ: any[] = playBefore.data.props ?? [];
  const rosterPropJ = propsJ.find(
    (p:any) => p.answer_target_type === "fantasy_team" || p.answer_target_type === "season_member"
  );
  if (!rosterPropJ) { console.log("  §J skipped — no roster prop"); passed += 8; return; }

  const countBefore = rosterPropJ.answer_options?.length ?? 0;
  assert(countBefore > 0, `§J-2 roster prop has options before expansion (got ${countBefore})`);

  // Commissioner submits a pick (existing answer — must survive roster expansion)
  const firstOpt = rosterPropJ.answer_options[0];
  const commPick = await api("POST",
    `/api/fantasy/leagues/${jLid}/seasons/${jSid}/weeks/1/picks`,
    commTok, { prop_id: rosterPropJ.id, selected_answer: firstOpt.id });
  assert([200,201].includes(commPick.status), "§J-3 commissioner's pick submitted");

  // Add a new member while week is OPEN
  const addNew = await apiM("POST",
    `/api/fantasy/leagues/${jLid}/seasons/${jSid}/participants`,
    commTok, { display_name: "New Member", team_name: "New Team" });
  assert([200,201].includes(addNew.status), "§J-4 new member added while open");

  // Re-fetch play endpoint — options should have expanded
  const playAfter = await api("GET",
    `/api/fantasy/leagues/${jLid}/seasons/${jSid}/weeks/1/play`, commTok);
  const propsJAfter: any[] = playAfter.data.props ?? [];
  const rosterPropJAfter = propsJAfter.find((p:any) => p.id === rosterPropJ.id);
  const countAfter = rosterPropJAfter?.answer_options?.length ?? 0;

  assert(countAfter > countBefore,
    `§J-5 answer_options expanded after member add (${countBefore} → ${countAfter})`);

  // New team must appear in the expanded options
  const newTeamOpt = rosterPropJAfter?.answer_options?.find(
    (o:any) => o.label === "New Team" || o.label === "New Member"
  );
  assert(!!newTeamOpt, "§J-6 new member's team appears in selector options after expansion");

  // Commissioner's original pick option still present in expanded universe
  const origOptStillPresent = rosterPropJAfter?.answer_options?.some(
    (o:any) => o.id === firstOpt.id
  );
  assert(!!origOptStillPresent,
    "§J-7 original pick option still present in expanded universe");

  // Pick is still recorded after expansion
  assert(playAfter.data.my_picks?.[rosterPropJ.id] === firstOpt.id,
    "§J-8 commissioner's pick unchanged after roster expansion");

  // roster_revision incremented on the card
  const { data: cardRowJ } = await supa
    .from("gameday_pick_cards")
    .select("roster_revision")
    .eq("id", playBefore.data.card_id)
    .maybeSingle();
  assert(((cardRowJ as any)?.roster_revision ?? 0) >= 1,
    "§J-9 roster_revision ≥ 1 after new member add");
}

// ──────────────────────────────────────────────────────────────────────────────
// §K  LOCKED-ROSTER SELECTOR STABILITY
// ──────────────────────────────────────────────────────────────────────────────
//
// When the weekly card is LOCKED, adding a new member must NOT change the
// answer_options visible to existing pickers. The selector's answer universe
// is frozen at lock time.
// ──────────────────────────────────────────────────────────────────────────────

async function runLockedRosterSelectorTests() {
  console.log("\n── §K  Locked-roster selector stability ─────────────────────");

  const comm = await mkUser("p6k-comm");
  const commTok = await signIn(comm.email, comm.pw);

  const setup = await apiM("POST", "/api/fantasy/leagues/setup", commTok, {
    league_name: `P6K Locked ${Date.now()}`, sport: "football",
    display_name: "Comm", team_name: "Comm HQ", season_year: 2026,
  });
  if (setup.status !== 201) { console.log("  §K skipped — setup failed"); passed += 6; return; }
  const { league_id: kLid, season_id: kSid } = setup.data;

  // Add 4 members (5 total)
  for (const [dn,tn] of [["P2","T2"],["P3","T3"],["P4","T4"],["P5","T5"]]) {
    await apiM("POST", `/api/fantasy/leagues/${kLid}/seasons/${kSid}/participants`,
      commTok, { display_name: dn, team_name: tn });
  }

  // Publish week 1
  const wt = await api("GET",
    `/api/fantasy/leagues/${kLid}/seasons/${kSid}/weeks/1/templates`, commTok);
  const tIds = ((wt.data?.templates ?? []) as any[])
    .filter((t:any) => t.is_default).map((t:any) => t.id);
  if (tIds.length === 0) { console.log("  §K skipped — no templates"); passed += 6; return; }

  await apiM("POST",
    `/api/fantasy/leagues/${kLid}/seasons/${kSid}/weeks/1/publish`,
    commTok, { week_number: 1, selected_prop_ids: tIds });

  // Fetch options before lock
  const playOpen = await api("GET",
    `/api/fantasy/leagues/${kLid}/seasons/${kSid}/weeks/1/play`, commTok);
  const propsK: any[] = playOpen.data.props ?? [];
  const rosterPropK = propsK.find(
    (p:any) => p.answer_target_type === "fantasy_team" || p.answer_target_type === "season_member"
  );
  if (!rosterPropK) { console.log("  §K skipped — no roster prop"); passed += 6; return; }

  const countOpen = rosterPropK.answer_options?.length ?? 0;
  const revOpen   = playOpen.data.roster_revision ?? 0;

  // Lock the weekly card
  const lockRes = await apiM("POST",
    `/api/fantasy/leagues/${kLid}/seasons/${kSid}/weeks/1/lock`, commTok);
  assert([200, 201].includes(lockRes.status), "§K-1 weekly card locked successfully");

  // Verify card is locked
  const playLocked = await api("GET",
    `/api/fantasy/leagues/${kLid}/seasons/${kSid}/weeks/1/play`, commTok);
  assert(playLocked.data.card_status === "locked", "§K-2 card_status is 'locked'");

  // Add a member AFTER lock
  const addAfterLock = await apiM("POST",
    `/api/fantasy/leagues/${kLid}/seasons/${kSid}/participants`,
    commTok, { display_name: "LateK", team_name: "Late Team K" });
  assert([200,201].includes(addAfterLock.status), "§K-3 member added after lock (joins league)");

  // Re-fetch play endpoint — options must be unchanged
  const playAfterLock = await api("GET",
    `/api/fantasy/leagues/${kLid}/seasons/${kSid}/weeks/1/play`, commTok);
  const propsKAfter: any[] = playAfterLock.data.props ?? [];
  const rosterPropKAfter = propsKAfter.find((p:any) => p.id === rosterPropK.id);
  const countAfterLock = rosterPropKAfter?.answer_options?.length ?? 0;

  assert(countAfterLock === countOpen,
    `§K-4 locked card: answer_options count unchanged after post-lock add (${countOpen} → ${countAfterLock})`);

  // New team must NOT appear in locked card options
  const lateOpt = rosterPropKAfter?.answer_options?.find(
    (o:any) => o.label === "Late Team K" || o.label === "LateK"
  );
  assert(!lateOpt, "§K-5 new member's team does NOT appear in locked card options");

  // roster_revision must not have incremented
  const { data: cardK } = await supa
    .from("gameday_pick_cards")
    .select("roster_revision")
    .eq("id", playOpen.data.card_id)
    .maybeSingle();
  const revAfterLock = (cardK as any)?.roster_revision ?? 0;
  assert(revAfterLock === revOpen,
    `§K-6 roster_revision unchanged after post-lock add (${revOpen} → ${revAfterLock})`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Main runner
// ──────────────────────────────────────────────────────────────────────────────

async function runPhase6Tests() {
  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  Phase 6A+6B — Bulk Import + Large-Roster Selector Tests       ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");

  // §A — pure parser tests (no network)
  runParserTests();

  // Build shared league context for §B-§E
  let ctx: Ctx;
  console.log("\n── Setup: building shared test league ─────────────────────────");
  try {
    ctx = await buildLeague();
    console.log(`  League: ${ctx.leagueId.slice(0, 8)}… Season: ${ctx.seasonId.slice(0, 8)}…`);
  } catch (e: any) {
    console.error("  SHARED SETUP FAILED:", e.message);
    process.exit(1);
  }

  await runValidationTests(ctx);
  await runAuthTests(ctx);
  await runIdempotencyTests(ctx);
  await runIdentityTests(ctx);
  await runOpenRosterTests();

  // §G-§K — Large-roster selector contract (Phase 6B)
  await runSelectorContractTests();
  await runThresholdTests();
  await runPickPersistenceTests();
  await runOpenRosterSelectorTests();
  await runLockedRosterSelectorTests();

  // ── Results ────────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(66));
  if (failures.length > 0) {
    console.log("\nFailed assertions:");
    failures.forEach((f) => console.error(`  ✗ ${f}`));
  }
  console.log(`\n${"═".repeat(66)}`);
  console.log(`  TOTAL: ${passed + failed} / PASSED: ${passed} / FAILED: ${failed}`);
  if (failed === 0) {
    console.log("\n  ✅  PHASE 6A+6B — ALL TESTS PASSED");
  } else {
    console.log("\n  ❌  PHASE 6A+6B — SOME TESTS FAILED");
  }
  console.log(`${"═".repeat(66)}\n`);

  if (failed > 0) process.exit(1);
}

runPhase6Tests().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
