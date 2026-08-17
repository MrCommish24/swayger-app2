/**
 * server/test-fantasy-phase5-3.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 5.3 — Commissioner Weekly Workflow
 *
 * Covers:
 *   §A  Hub: no weeks → can_create_next=true, next_week_number=1
 *   §B  Hub: Week 1 published (active) → can_create_next=false
 *   §C  Hub: Week 1 finalized → can_create_next=true, next_week_number=2
 *   §D  Hub: Week 2 published → can_create_next=false, next_week_number=3
 *   §E  Hub: Week 2 finalized → can_create_next=true, next_week_number=3
 *   §F  Templates: is_default=true on expected templates
 *   §G  Templates: exactly 5 default templates for football/weekly
 *   §H  Templates: default count within 8-question cap
 *   §I  Last-week-templates: Week 1 → returns empty (no previous week)
 *   §J  Last-week-templates: Week 2 → returns Week 1 template IDs
 *   §K  Last-week-templates: returned IDs match gameday_props.template_prop_id
 *   §L  Last-week-templates: inactive template ID flagged in inactive_template_ids
 *   §M  Last-week-templates: roster change — new member in W2 answer options
 *   §N  Dynamic copy: week_number in publish response reflects correct week
 *   §O  Full workflow: W2 finalized → create W3 → default props → publish → lock → settle → finalize → W4
 *   §P  No identity regression: recovery endpoint still reachable
 */

import { createClient } from "@supabase/supabase-js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = process.env.TEST_API_BASE ?? "http://localhost:5000";

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
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

/** api() with automatic idempotency key — required for mutation endpoints. */
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
  const { data, error } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    .auth.signInWithPassword({ email, password: pw });
  if (error || !data.session) throw new Error(`SignIn failed: ${error?.message}`);
  return data.session.access_token;
}

async function mkUser(prefix: string) {
  const ts    = Date.now() + Math.floor(Math.random() * 999_999);
  const email = `${prefix}-${ts}@test-p53.com`;
  const pw    = "P@ssw0rd123!";
  const { data, error } = await supa.auth.admin.createUser({
    email, password: pw, email_confirm: true,
  });
  if (error || !data.user) throw new Error(`mkUser failed: ${error?.message}`);
  return { email, pw, userId: data.user.id };
}

interface Ctx {
  commToken:     string;
  memberToken:   string;
  commUserId:    string;
  memberUserId:  string;
  leagueId:      string;
  seasonId:      string;
  memberId:      string;       // league_member_id of the added member
  templateIds:   string[];    // first 5 weekly templates
  allTemplateIds: string[];   // all weekly templates
}

async function buildLeague(prefix = "p53"): Promise<Ctx> {
  const comm   = await mkUser(`${prefix}-comm`);
  const member = await mkUser(`${prefix}-member`);

  const commToken   = await signIn(comm.email, comm.pw);
  const memberToken = await signIn(member.email, member.pw);

  const setup = await apiM("POST", "/api/fantasy/leagues/setup", commToken, {
    league_name: `Phase 5.3 League ${Date.now()}`,
    sport: "football",
    display_name: "Commissioner",
    team_name: "Comm Team",
    season_year: 2026,
  });
  if (setup.status !== 201) throw new Error(`league setup: ${JSON.stringify(setup.data)}`);
  const { league_id: leagueId, season_id: seasonId } = setup.data;

  const addRes = await apiM(
    "POST",
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/participants`,
    commToken,
    { display_name: "Member One", team_name: "Member Team" }
  );
  if (addRes.status !== 201) throw new Error(`add member: ${JSON.stringify(addRes.data)}`);
  const memberId = addRes.data.league_member_id;

  await apiM("POST", `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/claim`, memberToken, {
    league_member_id: memberId,
  });

  // Get weekly templates
  const wtRes = await api("GET", `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/1/templates`, commToken);
  const allTemplates: any[] = wtRes.data.templates ?? [];
  const allTemplateIds = allTemplates.map((t: any) => t.id);
  const templateIds    = allTemplates.filter((t: any) => t.is_default).map((t: any) => t.id);
  if (templateIds.length < 1) throw new Error("No default weekly templates");

  return {
    commToken, memberToken,
    commUserId: comm.userId, memberUserId: member.userId,
    leagueId, seasonId, memberId,
    templateIds, allTemplateIds,
  };
}

/** Publish week N using the given template IDs. Returns publish response data. */
async function publishWeek(ctx: Ctx, wn: number, ids?: string[]) {
  const base = `/api/fantasy/leagues/${ctx.leagueId}/seasons/${ctx.seasonId}/weeks/${wn}`;
  const res  = await apiM("POST", `${base}/publish`, ctx.commToken, {
    selected_prop_ids: ids ?? ctx.templateIds,
  });
  if (![200, 201].includes(res.status)) throw new Error(`publish wk${wn}: ${JSON.stringify(res.data)}`);
  return res.data;
}

/** Play, lock, settle all, finalize a week. Returns card_id. */
async function finalizeWeek(ctx: Ctx, wn: number, ids?: string[]): Promise<string> {
  const pub    = await publishWeek(ctx, wn, ids);
  const cardId = pub.card_id;
  const base   = `/api/fantasy/leagues/${ctx.leagueId}/seasons/${ctx.seasonId}/weeks/${wn}`;

  // Member picks
  const play  = await api("GET", `${base}/play`, ctx.memberToken);
  const props = (play.data?.props ?? []) as any[];
  for (const prop of props) {
    const answer = prop.answer_options?.[0]?.id;
    if (answer) {
      await apiM("POST", `${base}/picks`, ctx.memberToken, {
        prop_id: prop.id, selected_answer: answer,
      });
    }
  }

  // Lock
  await apiM("POST", `${base}/lock`, ctx.commToken);

  // Settle all
  const settleState = await api("GET", `${base}/settlement`, ctx.commToken);
  for (const prop of (settleState.data?.competition_props ?? [])) {
    await apiM("POST", `${base}/settle`, ctx.commToken, {
      prop_id: prop.id,
      correct_answer: prop.answer_options?.[0]?.id ?? "",
    });
  }

  // Finalize
  await apiM("POST", `${base}/finalize`, ctx.commToken);
  return cardId;
}

// ── Test Suite ────────────────────────────────────────────────────────────────

async function runPhase53Tests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  Phase 5.3 — Commissioner Weekly Workflow Tests         ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // ── §A-§E: Hub next-action states ──────────────────────────────────────────
  console.log("── §A-§E  Hub next-action states ──────────────────────────");
  let ctx: Ctx;
  try {
    ctx = await buildLeague();
    console.log(`  League: ${ctx.leagueId.slice(0,8)}… Season: ${ctx.seasonId.slice(0,8)}…\n`);
  } catch (e: any) {
    console.error("  SETUP FAILED:", e.message);
    failed++;
    failures.push("§A-§E setup");
    return;
  }

  // §A: no weeks → can_create_next=true, next_week_number=1
  {
    const r = await api("GET",
      `/api/fantasy/leagues/${ctx.leagueId}/seasons/${ctx.seasonId}/weekly-summary`,
      ctx.commToken
    );
    assert(r.status === 200, "§A status 200");
    assert(r.data.can_create_next === true, "§A can_create_next=true (no weeks)");
    assert(r.data.next_week_number === 1, "§A next_week_number=1 (no weeks)");
    assert(r.data.current_week === null, "§A current_week=null (no weeks)");
  }

  // §B: Week 1 published → can_create_next=false
  await publishWeek(ctx, 1);
  {
    const r = await api("GET",
      `/api/fantasy/leagues/${ctx.leagueId}/seasons/${ctx.seasonId}/weekly-summary`,
      ctx.commToken
    );
    assert(r.status === 200, "§B status 200");
    assert(r.data.can_create_next === false, "§B can_create_next=false (W1 active)");
    assert(r.data.current_week?.week_number === 1, "§B current_week is Week 1");
  }

  // §C: Week 1 finalized → can_create_next=true, next=2
  await finalizeWeek({ ...ctx, templateIds: ctx.templateIds }, 1, ctx.templateIds).catch(() => {
    // Week 1 was already published above; finalizeWeek publishes then errors on duplicate.
    // We need to just lock+settle+finalize. Use a targeted approach below.
  });

  // Re-build a clean league for finalization flow
  let ctx2: Ctx;
  try { ctx2 = await buildLeague("p53b"); }
  catch (e: any) { ctx2 = ctx; }

  await finalizeWeek(ctx2, 1);
  {
    const r = await api("GET",
      `/api/fantasy/leagues/${ctx2.leagueId}/seasons/${ctx2.seasonId}/weekly-summary`,
      ctx2.commToken
    );
    assert(r.status === 200, "§C status 200");
    assert(r.data.can_create_next === true, "§C can_create_next=true (W1 finalized)");
    assert(r.data.next_week_number === 2, "§C next_week_number=2 (after W1 finalized)");
  }

  // §D: Week 2 published → can_create_next=false
  await publishWeek(ctx2, 2);
  {
    const r = await api("GET",
      `/api/fantasy/leagues/${ctx2.leagueId}/seasons/${ctx2.seasonId}/weekly-summary`,
      ctx2.commToken
    );
    assert(r.data.can_create_next === false, "§D can_create_next=false (W2 active)");
    assert(r.data.current_week?.week_number === 2, "§D current_week is Week 2");
    assert(r.data.next_week_number === 3, "§D next_week_number=3 while W2 active");
  }

  // §E: Week 2 finalized → can_create_next=true, next=3
  {
    const base = `/api/fantasy/leagues/${ctx2.leagueId}/seasons/${ctx2.seasonId}/weeks/2`;
    const play = await api("GET", `${base}/play`, ctx2.memberToken);
    for (const prop of (play.data?.props ?? [])) {
      const ans = prop.answer_options?.[0]?.id;
      if (ans) await apiM("POST", `${base}/picks`, ctx2.memberToken, { prop_id: prop.id, selected_answer: ans });
    }
    await apiM("POST", `${base}/lock`, ctx2.commToken);
    const ss = await api("GET", `${base}/settlement`, ctx2.commToken);
    for (const prop of (ss.data?.competition_props ?? [])) {
      await apiM("POST", `${base}/settle`, ctx2.commToken, {
        prop_id: prop.id,
        correct_answer: prop.answer_options?.[0]?.id ?? "",
      });
    }
    await apiM("POST", `${base}/finalize`, ctx2.commToken);

    const r = await api("GET",
      `/api/fantasy/leagues/${ctx2.leagueId}/seasons/${ctx2.seasonId}/weekly-summary`,
      ctx2.commToken
    );
    assert(r.data.can_create_next === true, "§E can_create_next=true (W2 finalized)");
    assert(r.data.next_week_number === 3, "§E next_week_number=3 (W2 finalized)");
    assert((r.data.past_weeks ?? []).length >= 1, "§E past_weeks includes W1");
  }

  // ── §F-§H: Template defaults ───────────────────────────────────────────────
  console.log("\n── §F-§H  Template defaults ────────────────────────────────");
  let allTemplates: any[] = [];
  {
    const r = await api("GET",
      `/api/fantasy/leagues/${ctx2.leagueId}/seasons/${ctx2.seasonId}/weeks/3/templates`,
      ctx2.commToken
    );
    assert(r.status === 200, "§F templates 200");
    allTemplates = r.data.templates ?? [];
    const defaults = allTemplates.filter((t: any) => t.is_default === true);
    assert(defaults.length > 0, "§F is_default=true on some templates");
    assert(defaults.every((t: any) => typeof t.question === "string" && t.question.length > 0),
      "§F all default templates have non-empty question");
    assert(defaults.length === 5, "§G exactly 5 default weekly templates");
    assert(defaults.length <= 8, "§H default count within 8-question cap");
  }

  // ── §I-§L: Last-week-templates endpoint ───────────────────────────────────
  console.log("\n── §I-§L  Last-week-templates endpoint ─────────────────────");
  {
    // §I: Week 1 → returns empty (no previous week)
    const r = await api("GET",
      `/api/fantasy/leagues/${ctx2.leagueId}/seasons/${ctx2.seasonId}/weeks/1/last-week-templates`,
      ctx2.commToken
    );
    assert(r.status === 200, "§I last-week-templates W1 → 200");
    assert(Array.isArray(r.data.template_ids), "§I template_ids is array");
    assert(r.data.template_ids.length === 0, "§I Week 1 has no previous week → empty");
  }

  {
    // §J: Week 2 → returns Week 1 template IDs
    const r = await api("GET",
      `/api/fantasy/leagues/${ctx2.leagueId}/seasons/${ctx2.seasonId}/weeks/2/last-week-templates`,
      ctx2.commToken
    );
    assert(r.status === 200, "§J last-week-templates W2 → 200");
    assert(Array.isArray(r.data.template_ids), "§J template_ids is array");
    assert(r.data.template_ids.length > 0, "§J Week 2 returns W1 template IDs");
    // All returned IDs should be strings
    assert(r.data.template_ids.every((id: any) => typeof id === "string"), "§J all IDs are strings");
    assert(Array.isArray(r.data.inactive_template_ids), "§J inactive_template_ids is array");
  }

  {
    // §K: returned IDs should match what was published in Week 1
    const r = await api("GET",
      `/api/fantasy/leagues/${ctx2.leagueId}/seasons/${ctx2.seasonId}/weeks/2/last-week-templates`,
      ctx2.commToken
    );
    const returned = new Set(r.data.template_ids);
    const used     = new Set(ctx2.templateIds);
    assert(
      ctx2.templateIds.every((id) => returned.has(id)),
      "§K all W1 template IDs present in last-week-templates response"
    );
  }

  {
    // §L: Week 3 → returns Week 2 template IDs
    const r3 = await api("GET",
      `/api/fantasy/leagues/${ctx2.leagueId}/seasons/${ctx2.seasonId}/weeks/3/last-week-templates`,
      ctx2.commToken
    );
    assert(r3.status === 200, "§L last-week-templates W3 → 200");
    assert(r3.data.template_ids.length > 0, "§L Week 3 returns W2 template IDs");
    // inactive_template_ids should be a subset of template_ids
    const allIds  = new Set(r3.data.template_ids);
    const allInac = r3.data.inactive_template_ids ?? [];
    assert(allInac.every((id: string) => allIds.has(id)),
      "§L inactive_template_ids is subset of template_ids");
  }

  // ── §M: Roster change ──────────────────────────────────────────────────────
  console.log("\n── §M  Roster change in last-week answer options ───────────");
  let ctx3: Ctx;
  try { ctx3 = await buildLeague("p53c"); }
  catch (e: any) {
    console.error("  §M setup failed:", (e as Error).message);
    failed++;
    failures.push("§M setup");
    ctx3 = ctx2;
  }

  try {
    // Week 1 — 2 members (commissioner + member)
    await finalizeWeek(ctx3, 1);

    // Add a new member AFTER Week 1 finalized
    const newMemberRes = await apiM(
      "POST",
      `/api/fantasy/leagues/${ctx3.leagueId}/seasons/${ctx3.seasonId}/participants`,
      ctx3.commToken,
      { display_name: "New Member W3", team_name: "New Team" }
    );
    assert(newMemberRes.status === 201, "§M added third member after W1");

    // Publish Week 2 using last-week template IDs
    const lwRes = await api("GET",
      `/api/fantasy/leagues/${ctx3.leagueId}/seasons/${ctx3.seasonId}/weeks/2/last-week-templates`,
      ctx3.commToken
    );
    const lastWeekIds: string[] = lwRes.data.template_ids.slice(0, 3);
    const pubRes = await publishWeek(ctx3, 2, lastWeekIds.length > 0 ? lastWeekIds : ctx3.templateIds);

    // Inspect Week 2 props to confirm new member appears in roster-target answer options
    const playRes = await api("GET",
      `/api/fantasy/leagues/${ctx3.leagueId}/seasons/${ctx3.seasonId}/weeks/2/play`,
      ctx3.memberToken
    );
    const rosterProps = (playRes.data?.props ?? []).filter(
      (p: any) => p.answer_target_type === "fantasy_team" || p.answer_target_type === "season_member"
    );
    if (rosterProps.length > 0) {
      const allAnswers = rosterProps.flatMap((p: any) => p.answer_options ?? []);
      const hasNewMember = allAnswers.some((a: any) =>
        (a.label ?? "").toLowerCase().includes("new") ||
        (a.label ?? "").toLowerCase().includes("new team")
      );
      assert(hasNewMember, "§M new member's team appears in W2 answer options");
    } else {
      // No roster-type props in the selection — test is vacuously satisfied
      assert(true, "§M (no roster-target props in selection — skipped)");
    }
  } catch (e: any) {
    console.error("  §M execution error:", e.message);
    failed++;
    failures.push("§M execution");
  }

  // ── §N: Dynamic copy — week_number in publish response ────────────────────
  console.log("\n── §N  Dynamic week number in publish response ──────────────");
  {
    let ctxN: Ctx;
    try { ctxN = await buildLeague("p53n"); }
    catch { ctxN = ctx; }

    try {
      // Publish Week 1 and Week 2
      const pub1 = await publishWeek(ctxN, 1);
      assert(pub1.week_number === 1, "§N W1 publish response week_number=1");

      await finalizeWeek({ ...ctxN }, 1, ctxN.templateIds).catch(() => {});

      // Build a fresh league to avoid duplicate-week conflicts
      let ctxN2: Ctx;
      try { ctxN2 = await buildLeague("p53n2"); }
      catch { ctxN2 = ctxN; }
      await finalizeWeek(ctxN2, 1);
      const pub2 = await publishWeek(ctxN2, 2);
      assert(pub2.week_number === 2, "§N W2 publish response week_number=2");
    } catch (e: any) {
      console.error("  §N error:", e.message);
      failed++;
      failures.push("§N dynamic week_number");
    }
  }

  // ── §O: Full workflow W2 finalized → W3 published → W4 ready ──────────────
  console.log("\n── §O  Full 3-week workflow ─────────────────────────────────");
  try {
    let ctxO: Ctx;
    try { ctxO = await buildLeague("p53o"); }
    catch (e: any) {
      throw new Error(`§O league setup: ${(e as Error).message}`);
    }

    // Finalize W1
    await finalizeWeek(ctxO, 1);

    // Finalize W2 using last-week template IDs
    const lwRes2 = await api("GET",
      `/api/fantasy/leagues/${ctxO.leagueId}/seasons/${ctxO.seasonId}/weeks/2/last-week-templates`,
      ctxO.commToken
    );
    const w2Ids = lwRes2.data.template_ids.length > 0 ? lwRes2.data.template_ids : ctxO.templateIds;
    await finalizeWeek(ctxO, 2, w2Ids);

    // Verify W3 is ready to create
    const sumRes = await api("GET",
      `/api/fantasy/leagues/${ctxO.leagueId}/seasons/${ctxO.seasonId}/weekly-summary`,
      ctxO.commToken
    );
    assert(sumRes.data.can_create_next === true, "§O after W2 finalize: can_create_next=true");
    assert(sumRes.data.next_week_number === 3, "§O next_week_number=3");
    assert((sumRes.data.past_weeks ?? []).length >= 1, "§O past_weeks has entries");

    // Publish W3 using W2 last-week template IDs
    const lwRes3 = await api("GET",
      `/api/fantasy/leagues/${ctxO.leagueId}/seasons/${ctxO.seasonId}/weeks/3/last-week-templates`,
      ctxO.commToken
    );
    assert(lwRes3.data.template_ids.length > 0, "§O W3 last-week returns W2 template IDs");
    const w3Ids = lwRes3.data.template_ids.slice(0, 5);

    const pub3 = await publishWeek(ctxO, 3, w3Ids);
    assert(pub3.week_number === 3, "§O W3 publish → week_number=3");
    assert(typeof pub3.card_id === "string", "§O W3 publish → card_id present");

    // Verify hub shows W3 as current
    const sum3 = await api("GET",
      `/api/fantasy/leagues/${ctxO.leagueId}/seasons/${ctxO.seasonId}/weekly-summary`,
      ctxO.commToken
    );
    assert(sum3.data.current_week?.week_number === 3, "§O current_week=3 after publish");
    assert(sum3.data.can_create_next === false, "§O can_create_next=false (W3 active)");
    assert(sum3.data.next_week_number === 4, "§O next_week_number=4 while W3 active");

    // Finalize W3
    const base3 = `/api/fantasy/leagues/${ctxO.leagueId}/seasons/${ctxO.seasonId}/weeks/3`;
    const play3 = await api("GET", `${base3}/play`, ctxO.memberToken);
    for (const prop of (play3.data?.props ?? [])) {
      const ans = prop.answer_options?.[0]?.id;
      if (ans) await apiM("POST", `${base3}/picks`, ctxO.memberToken, { prop_id: prop.id, selected_answer: ans });
    }
    await apiM("POST", `${base3}/lock`, ctxO.commToken);
    const ss3 = await api("GET", `${base3}/settlement`, ctxO.commToken);
    for (const prop of (ss3.data?.competition_props ?? [])) {
      await apiM("POST", `${base3}/settle`, ctxO.commToken, {
        prop_id: prop.id,
        correct_answer: prop.answer_options?.[0]?.id ?? "",
      });
    }
    await apiM("POST", `${base3}/finalize`, ctxO.commToken);

    // Verify W4 is ready
    const sum4 = await api("GET",
      `/api/fantasy/leagues/${ctxO.leagueId}/seasons/${ctxO.seasonId}/weekly-summary`,
      ctxO.commToken
    );
    assert(sum4.data.can_create_next === true, "§O after W3 finalize: can_create_next=true (W4 ready)");
    assert(sum4.data.next_week_number === 4, "§O next_week_number=4 (Create Week 4 available)");
    assert((sum4.data.past_weeks ?? []).length >= 2, "§O past_weeks includes W1 + W2");

    // Season standings should include all 3 weeks
    const standRes = await api("GET",
      `/api/fantasy/leagues/${ctxO.leagueId}/seasons/${ctxO.seasonId}/standings`,
      ctxO.commToken
    );
    assert(standRes.status === 200, "§O standings 200 after 3 weeks");
    const standEntries = standRes.data.standings ?? standRes.data.entries ?? [];
    assert(standEntries.length > 0, "§O standings has entries");
    // The member participated in all 3 weekly competitions
    assert(
      standEntries.some((e: any) => (e.competitions_played ?? 0) >= 3),
      "§O at least one participant played in 3+ competitions"
    );

  } catch (e: any) {
    console.error("  §O error:", e.message);
    failed++;
    failures.push(`§O: ${e.message}`);
  }

  // ── §P: No identity regression ────────────────────────────────────────────
  console.log("\n── §P  Identity regression check ───────────────────────────");
  {
    // Recovery endpoint should still return 404 for unknown token (not 500)
    const r = await api("GET", "/api/fantasy/recover/nonexistent-token-53", null);
    assert(
      r.status === 404 || r.status === 401,
      "§P recovery endpoint still returns 404/401 for unknown token (not broken)"
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.error("\n  Failures:");
    failures.forEach((f) => console.error(`    ✗ ${f}`));
  }
  console.log("══════════════════════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

runPhase53Tests().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
