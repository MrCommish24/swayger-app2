/**
 * server/test-fantasy-phase5.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 5 — Fantasy Weekly Competitions & Season Standings
 *
 * Covers:
 *   §25  Publish Week 1 (commissioner creates weekly competition)
 *   §26  Weekly hub state (GET /weeks/1)
 *   §27  Templates endpoint
 *   §28  Member play state (creates participant)
 *   §29  Submit picks (valid + invalid)
 *   §30  Lock / unlock (idempotent, settlement guard)
 *   §31  Settlement (commissioner only, result correction)
 *   §32  Finalize (requires locked + all settled)
 *   §33  Results (post-finalization)
 *   §34  Season standings (cross-competition aggregation)
 *   §35  Idempotency (duplicate publish → already_existed)
 *   §36  Authorization guards (non-commissioner blocked)
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

function assert(condition: boolean, msg: string): void {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
    failures.push(msg);
  }
}

async function api(
  method: string,
  path: string,
  token: string | null,
  body?: object,
  guestToken?: string,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (guestToken) headers["X-Fantasy-Guest-Token"] = guestToken;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

function idempotencyKey(): string {
  return crypto.randomUUID();
}

async function signIn(email: string, password: string): Promise<string> {
  const { data, error } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    .auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`SignIn failed for ${email}: ${error?.message}`);
  return data.session.access_token;
}

async function createTestUser(prefix: string): Promise<{ email: string; password: string; userId: string }> {
  const ts    = Date.now();
  const email = `${prefix}-${ts}@test-p5.com`;
  const password = "P@ssw0rd123!";
  const { data, error } = await supa.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return { email, password, userId: data.user.id };
}

// ── Test setup ────────────────────────────────────────────────────────────────

interface TestContext {
  commissionerToken: string;
  memberToken:       string;
  leagueId:          string;
  seasonId:          string;
  week1PropTemplateIds: string[];
}

async function setupTestLeague(): Promise<TestContext> {
  // Create commissioner + member
  const comm   = await createTestUser("p5-comm");
  const member = await createTestUser("p5-member");

  const commToken   = await signIn(comm.email, comm.password);
  const memberToken = await signIn(member.email, member.password);

  // Setup league as commissioner
  const setupRes = await api("POST", "/api/fantasy/leagues/setup", commToken, {
    league_name:    "Phase 5 Test League",
    sport:          "football",
    display_name:   "Commissioner",
    team_name:      "Comm Team",
    season_year:    2026,
  });
  assert(setupRes.status === 201, `Setup league → 201 (got ${setupRes.status})`);

  const { league_id: leagueId, season_id: seasonId } = setupRes.data;

  // Add member
  const addMemberRes = await api(
    "POST",
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/participants`,
    commToken,
    { display_name: "Member One", team_name: "Test Team" },
    undefined,
    { "Idempotency-Key": idempotencyKey() }
  );

  assert(addMemberRes.status === 201, `Add member → 201 (got ${addMemberRes.status})`);
  const memberSmId = addMemberRes.data.season_member_id;

  // Claim seat as member
  const claimRes = await api("POST", `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/claim`, memberToken, {
    league_member_id: addMemberRes.data.league_member_id,
  });
  assert([200, 201].includes(claimRes.status), `Member claim → 200/201 (got ${claimRes.status})`);

  // Fetch weekly templates to get prop IDs
  const tmplRes = await api("GET", `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/1/templates`, commToken);
  assert(tmplRes.status === 200, `GET /weeks/1/templates → 200`);
  assert(Array.isArray(tmplRes.data.templates), "Templates is array");

  const templateIds: string[] = (tmplRes.data.templates ?? []).slice(0, 3).map((t: any) => t.id);
  assert(templateIds.length >= 1, `At least 1 weekly template found (got ${templateIds.length})`);

  return { commissionerToken: commToken, memberToken, leagueId, seasonId, week1PropTemplateIds: templateIds };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

async function runPhase5Tests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  Phase 5 — Fantasy Weekly + Season Standings Tests      ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // ── Setup ──────────────────────────────────────────────────────────────────
  console.log("── SETUP ──────────────────────────────────────────────────");
  let ctx: TestContext;
  try {
    ctx = await setupTestLeague();
    console.log(`  League: ${ctx.leagueId.slice(0, 8)}… Season: ${ctx.seasonId.slice(0, 8)}…\n`);
  } catch (e: any) {
    console.error(`FATAL: setup failed — ${e.message}`);
    process.exit(1);
  }
  const { commissionerToken: cToken, memberToken: mToken, leagueId, seasonId } = ctx;
  const weeklyBase = `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/1`;

  // ── §25: Hub state before publish ─────────────────────────────────────────
  console.log("── §25 Hub state (pre-publish) ───────────────────────────");
  {
    const res = await api("GET", weeklyBase, cToken);
    assert(res.status === 200, `GET /weeks/1 → 200 (not 404) pre-publish`);
    assert(res.data === null, `GET /weeks/1 returns null when not published`);
  }

  // ── §26: Publish Week 1 ───────────────────────────────────────────────────
  console.log("\n── §26 Publish Week 1 ────────────────────────────────────");
  let roomId: string | null = null;
  let cardId: string | null = null;
  {
    const res = await api("POST", `${weeklyBase}/publish`, cToken, {
      selected_prop_ids: ctx.week1PropTemplateIds,
    });
    assert(res.status === 201, `POST /weeks/1/publish → 201 (got ${res.status})`);
    assert(res.data.room_id, "Publish returns room_id");
    assert(res.data.card_id, "Publish returns card_id");
    assert(res.data.already_existed === false, "already_existed = false on first publish");
    assert(res.data.week_number === 1, "week_number = 1");
    roomId = res.data.room_id;
    cardId = res.data.card_id;
  }

  // ── §26b: Idempotent re-publish ───────────────────────────────────────────
  console.log("\n── §35 Idempotent re-publish ─────────────────────────────");
  {
    const res = await api("POST", `${weeklyBase}/publish`, cToken, {
      selected_prop_ids: ctx.week1PropTemplateIds,
    });
    assert([200, 409].includes(res.status), `Re-publish → 200 or 409 (got ${res.status})`);
    assert(!!res.data.already_existed, "Re-publish sets already_existed=true");
  }

  // ── §26c: Hub state after publish ────────────────────────────────────────
  console.log("\n── §26c Hub state (post-publish) ─────────────────────────");
  {
    const res = await api("GET", weeklyBase, cToken);
    assert(res.status === 200, `GET /weeks/1 → 200 (got ${res.status})`);
    assert(res.data !== null, "Hub state is not null after publish");
    assert(res.data.card_status === "open", `Card status is 'open' (got ${res.data?.card_status})`);
    assert(res.data.room_status === "active", `Room status is 'active' (got ${res.data?.room_status})`);
    assert(res.data.week_number === 1, "week_number = 1");
    assert(res.data.prop_count >= 1, `prop_count ≥ 1 (got ${res.data?.prop_count})`);
  }

  // ── §27: Templates ────────────────────────────────────────────────────────
  console.log("\n── §27 Templates ─────────────────────────────────────────");
  {
    const res = await api("GET", `${weeklyBase}/templates`, cToken);
    assert(res.status === 200, `GET /weeks/1/templates → 200`);
    assert(Array.isArray(res.data.templates), "Templates is array");
    assert(res.data.sport === "football", `Sport is 'football' (got ${res.data.sport})`);
    if (res.data.templates.length > 0) {
      const t = res.data.templates[0];
      assert(t.id && t.question, "Template has id and question");
      assert(t.scoring_scope === "competition", "Weekly template scoring_scope is 'competition'");
    }
  }

  // ── §28: Member play state ────────────────────────────────────────────────
  console.log("\n── §28 Member play state ─────────────────────────────────");
  let playState: any = null;
  {
    const res = await api("GET", `${weeklyBase}/play`, mToken);
    assert(res.status === 200, `GET /weeks/1/play → 200 (got ${res.status})`);
    assert(Array.isArray(res.data.props), "Props is array");
    assert(res.data.card_status === "open", `Card is open (got ${res.data?.card_status})`);
    assert(res.data.participant_id, "Returns participant_id");
    assert(res.data.week_number === 1, "week_number = 1");
    assert(Object.keys(res.data.my_picks ?? {}).length === 0, "No picks yet");
    playState = res.data;
  }

  // ── §29: Submit picks ─────────────────────────────────────────────────────
  console.log("\n── §29 Submit picks ──────────────────────────────────────");
  const propIds: string[] = (playState?.props ?? []).map((p: any) => p.id);
  const correctAnswers: Record<string, string> = {};

  if (propIds.length > 0) {
    // Submit a pick on the first prop
    const firstProp = playState.props[0];
    const firstAnswer = firstProp.answer_options?.[0]?.id;
    assert(!!firstAnswer, "First prop has answer options");

    if (firstAnswer) {
      const pickRes = await api("POST", `${weeklyBase}/picks`, mToken, {
        prop_id: firstProp.id,
        selected_answer: firstAnswer,
      });
      assert(pickRes.status === 200, `POST /weeks/1/picks → 200 (got ${pickRes.status})`);
      assert(pickRes.data.pick_id, "Pick returns pick_id");
      assert(pickRes.data.prop_id === firstProp.id, "pick prop_id matches");
      assert(pickRes.data.selected_answer === firstAnswer, "selected_answer matches");
      correctAnswers[firstProp.id] = firstAnswer; // use this as "correct" for settlement

      // Submit all remaining props
      for (const prop of playState.props.slice(1)) {
        const answer = prop.answer_options?.[0]?.id;
        if (!answer) continue;
        await api("POST", `${weeklyBase}/picks`, mToken, {
          prop_id: prop.id,
          selected_answer: answer,
        });
        correctAnswers[prop.id] = answer;
      }

      // Invalid answer
      const badRes = await api("POST", `${weeklyBase}/picks`, mToken, {
        prop_id: firstProp.id,
        selected_answer: "invalid-answer-id-xyz",
      });
      assert(badRes.status === 400, `Invalid answer → 400 (got ${badRes.status})`);

      // Re-confirm hub pick_count updates
      const hubAfterPicks = await api("GET", weeklyBase, mToken);
      assert(hubAfterPicks.status === 200, "Hub GET after picks → 200");
      assert((hubAfterPicks.data?.pick_count ?? 0) > 0, "pick_count > 0 after picks");
    }
  }

  // ── §36: Authorization guards ─────────────────────────────────────────────
  console.log("\n── §36 Authorization guards ──────────────────────────────");
  {
    // Member cannot lock
    const memberLockRes = await api("POST", `${weeklyBase}/lock`, mToken);
    assert(memberLockRes.status === 403, `Member lock → 403 (got ${memberLockRes.status})`);

    // Member cannot access settlement
    const memberSettleRes = await api("GET", `${weeklyBase}/settlement`, mToken);
    assert(memberSettleRes.status === 403, `Member GET settlement → 403 (got ${memberSettleRes.status})`);

    // Settle before lock should fail
    const preLockSettle = await api("POST", `${weeklyBase}/settle`, cToken, {
      prop_id: propIds[0],
      correct_answer: correctAnswers[propIds[0]] ?? "x",
    });
    assert(preLockSettle.status === 409, `Settle before lock → 409 (got ${preLockSettle.status})`);
  }

  // ── §30: Lock / unlock ────────────────────────────────────────────────────
  console.log("\n── §30 Lock / unlock ─────────────────────────────────────");
  {
    // Lock
    const lockRes = await api("POST", `${weeklyBase}/lock`, cToken);
    assert(lockRes.status === 200, `POST /weeks/1/lock → 200 (got ${lockRes.status})`);
    assert(lockRes.data.card_status === "locked", `card_status is 'locked' (got ${lockRes.data.card_status})`);

    // Idempotent re-lock
    const reLockRes = await api("POST", `${weeklyBase}/lock`, cToken);
    assert(reLockRes.status === 200, `Re-lock → 200`);
    assert(reLockRes.data.already_locked === true, "Re-lock is idempotent");

    // Member cannot submit pick when locked
    if (propIds.length > 0 && playState?.props?.[0]?.answer_options?.[0]) {
      const lockedPickRes = await api("POST", `${weeklyBase}/picks`, mToken, {
        prop_id: propIds[0],
        selected_answer: playState.props[0].answer_options[0].id,
      });
      assert(lockedPickRes.status === 409, `Pick when locked → 409 (got ${lockedPickRes.status})`);
    }

    // Unlock (settlement not started — allowed)
    const unlockRes = await api("POST", `${weeklyBase}/unlock`, cToken);
    assert(unlockRes.status === 200, `POST /weeks/1/unlock → 200 (got ${unlockRes.status})`);
    assert(unlockRes.data.card_status === "open", `After unlock: card_status = 'open'`);

    // Re-lock for settlement
    await api("POST", `${weeklyBase}/lock`, cToken);
  }

  // ── §31: Settlement ───────────────────────────────────────────────────────
  console.log("\n── §31 Settlement ────────────────────────────────────────");
  {
    // GET settlement state
    const settlementRes = await api("GET", `${weeklyBase}/settlement`, cToken);
    assert(settlementRes.status === 200, `GET /weeks/1/settlement → 200 (got ${settlementRes.status})`);
    assert(Array.isArray(settlementRes.data.competition_props), "competition_props is array");
    assert(settlementRes.data.card_status === "locked", `Card is locked for settlement`);
    assert(settlementRes.data.week_number === 1, "week_number = 1");

    // Settle all competition props
    const props = settlementRes.data.competition_props as any[];
    let settledOk = 0;

    for (const prop of props) {
      const correctAnswer = prop.answer_options?.[0]?.id;
      if (!correctAnswer) continue;

      const settleRes = await api("POST", `${weeklyBase}/settle`, cToken, {
        prop_id:        prop.id,
        correct_answer: correctAnswer,
      });
      if (settleRes.status === 200) {
        settledOk++;
        correctAnswers[prop.id] = correctAnswer;
      }
      assert(settleRes.status === 200, `Settle prop ${prop.id.slice(0, 8)}… → 200 (got ${settleRes.status})`);
    }

    assert(settledOk === props.length, `All ${props.length} props settled (got ${settledOk})`);

    // Verify settlement state updated
    const afterSettle = await api("GET", `${weeklyBase}/settlement`, cToken);
    assert(afterSettle.data.settled_count === props.length, `settled_count = ${props.length}`);
    assert(afterSettle.data.all_settled === true, "all_settled = true");

    // Result correction (idempotent same answer)
    if (props.length > 0 && props[0].answer_options?.[0]?.id) {
      const idempotentRes = await api("POST", `${weeklyBase}/settle`, cToken, {
        prop_id:        props[0].id,
        correct_answer: correctAnswers[props[0].id] ?? props[0].answer_options[0].id,
      });
      assert(idempotentRes.status === 200, `Idempotent settle → 200`);
      assert(idempotentRes.data.idempotent === true, "Idempotent same answer");
    }

    // Unlock should be blocked after settlement started
    const unlockAfterSettle = await api("POST", `${weeklyBase}/unlock`, cToken);
    assert(unlockAfterSettle.status === 409, `Unlock after settlement → 409 (got ${unlockAfterSettle.status})`);
  }

  // ── §32: Finalize ─────────────────────────────────────────────────────────
  console.log("\n── §32 Finalize ──────────────────────────────────────────");
  {
    const finalizeRes = await api("POST", `${weeklyBase}/finalize`, cToken);
    assert(finalizeRes.status === 200, `POST /weeks/1/finalize → 200 (got ${finalizeRes.status})`);
    assert(finalizeRes.data.ok === true, "finalize ok = true");
    assert(finalizeRes.data.already_finalized === false, "already_finalized = false");

    // Idempotent re-finalize
    const reFinalizeRes = await api("POST", `${weeklyBase}/finalize`, cToken);
    assert(reFinalizeRes.status === 200, `Re-finalize → 200`);
    assert(reFinalizeRes.data.already_finalized === true, "already_finalized = true on re-finalize");

    // Cannot settle after finalization
    if (propIds.length > 0 && correctAnswers[propIds[0]]) {
      const postFinalSettle = await api("POST", `${weeklyBase}/settle`, cToken, {
        prop_id:        propIds[0],
        correct_answer: correctAnswers[propIds[0]],
      });
      assert(postFinalSettle.status === 409, `Settle after finalize → 409 (got ${postFinalSettle.status})`);
    }
  }

  // ── §33: Results ──────────────────────────────────────────────────────────
  console.log("\n── §33 Results ───────────────────────────────────────────");
  {
    const resultsRes = await api("GET", `${weeklyBase}/results`, mToken);
    assert(resultsRes.status === 200, `GET /weeks/1/results → 200 (got ${resultsRes.status})`);
    assert(resultsRes.data.finalized === true, "results.finalized = true");
    assert(resultsRes.data.week_number === 1, "week_number = 1");
    assert(Array.isArray(resultsRes.data.leaderboard), "leaderboard is array");
    assert(Array.isArray(resultsRes.data.winners), "winners is array");
    assert(Array.isArray(resultsRes.data.my_competition_picks), "my_competition_picks is array");
    assert(resultsRes.data.leaderboard.length > 0, `leaderboard has entries (got ${resultsRes.data.leaderboard.length})`);

    const lb = resultsRes.data.leaderboard as any[];
    if (lb.length > 0) {
      assert(lb[0].rank === 1, "Top leaderboard entry has rank 1");
      assert(typeof lb[0].points === "number", "Leaderboard entry has numeric points");
    }
  }

  // ── §34: Season Standings ─────────────────────────────────────────────────
  console.log("\n── §34 Season Standings ──────────────────────────────────");
  {
    const standingsPath = `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/standings`;
    const standingsRes  = await api("GET", standingsPath, mToken);
    assert(standingsRes.status === 200, `GET /standings → 200 (got ${standingsRes.status})`);
    assert(Array.isArray(standingsRes.data.standings), "standings is array");
    assert(Array.isArray(standingsRes.data.finalized_competitions), "finalized_competitions is array");
    assert(standingsRes.data.finalized_competitions.length >= 1, "At least 1 finalized competition");

    const comps = standingsRes.data.finalized_competitions as any[];
    const hasWeekly = comps.some((c: any) => c.competition_type === "weekly" && c.week_number === 1);
    assert(hasWeekly, "Week 1 appears in finalized_competitions");

    const standings = standingsRes.data.standings as any[];
    if (standings.length > 0) {
      const top = standings[0];
      assert(typeof top.total_points === "number", "Standing entry has numeric total_points");
      assert(typeof top.competitions_played === "number", "Standing entry has competitions_played");
      assert(typeof top.rank === "number", "Standing entry has rank");
      assert(top.rank === 1, "Top standing entry has rank 1");
      assert(top.competitions_played >= 1, `competitions_played ≥ 1 (got ${top.competitions_played})`);

      // Verify breakdown sums correctly
      const sum = top.draft_day_points + top.weekly_points;
      assert(sum === top.total_points, `draft_day_points (${top.draft_day_points}) + weekly_points (${top.weekly_points}) = total (${top.total_points})`);
    } else {
      console.log("  ℹ No standings entries (member may not have submitted picks)");
    }

    // Commissioner can also view
    const commStandingsRes = await api("GET", standingsPath, cToken);
    assert(commStandingsRes.status === 200, `Commissioner GET /standings → 200`);

    // Unknown season returns 404
    const badStandingsRes = await api("GET", `/api/fantasy/leagues/${leagueId}/seasons/00000000-0000-0000-0000-000000000000/standings`, cToken);
    assert(badStandingsRes.status === 404, `Unknown season standings → 404 (got ${badStandingsRes.status})`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log(`║  Results: ${passed} passed, ${failed} failed`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  if (failures.length > 0) {
    console.error("\nFailed assertions:");
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }
}

runPhase5Tests().catch((e) => {
  console.error("Uncaught error:", e.message);
  process.exit(1);
});
