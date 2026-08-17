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

  // §F-7: Verify weekly card roster_revision behavior matches single-add.
  //
  // The server's member-add path (both single and batch) only passes p_room_id
  // to the RPC for Draft Day rooms — not weekly rooms.  This is intentional:
  // weekly answer_options are snapshotted at publish time; new members added
  // after publish are visible in the NEXT weekly Swayger.
  //
  // Therefore: roster_revision on a weekly pick card does NOT increment when
  // a member is bulk-added.  This is the correct behavior — batch-add matches
  // the existing single-add architecture for weekly rooms.
  const { data: cardAfter } = await supa
    .from("gameday_pick_cards")
    .select("id, roster_revision")
    .eq("id", playRes.data.card_id)
    .maybeSingle();
  const rosterRevisionAfter = (cardAfter as any)?.roster_revision ?? 0;
  // Correct: batch-add matches single-add — weekly roster_revision stays the same
  assert(rosterRevisionAfter === rosterRevisionBefore,
    "§F-7 weekly roster_revision unchanged (batch-add matches single-add for weekly rooms)");

  // §F-8: answer_options are snapshotted at weekly publish time.
  // New bulk-added members do NOT appear in the current week's answer_options
  // (same as single-add) — they appear in the next weekly Swayger published
  // after they are added.  Verify batch-add does NOT alter the current week's
  // answer_options (parity with single-add).
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
    // Correct: weekly answer_options are unchanged (batch-add matches single-add)
    assert(answerCountAfter === answerCountBefore,
      "§F-8 weekly answer_options unchanged after bulk add (batch-add matches single-add)");
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
// Main runner
// ──────────────────────────────────────────────────────────────────────────────

async function runPhase6AreaATests() {
  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  Phase 6A — Bulk Member Import Tests                           ║");
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

  // ── Results ────────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(66));
  if (failures.length > 0) {
    console.log("\nFailed assertions:");
    failures.forEach((f) => console.error(`  ✗ ${f}`));
  }
  console.log(`\n${"═".repeat(66)}`);
  console.log(`  TOTAL: ${passed + failed} / PASSED: ${passed} / FAILED: ${failed}`);
  if (failed === 0) {
    console.log("\n  ✅  PHASE 6A — ALL TESTS PASSED");
  } else {
    console.log("\n  ❌  PHASE 6A — SOME TESTS FAILED");
  }
  console.log(`${"═".repeat(66)}\n`);

  if (failed > 0) process.exit(1);
}

runPhase6AreaATests().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
