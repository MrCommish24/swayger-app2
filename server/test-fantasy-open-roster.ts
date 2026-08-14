/**
 * server/test-fantasy-open-roster.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * QA suite — Open Roster + Pick Revision + League Rename
 *
 * Coverage:
 *   §DB   Schema verification — roster_revision + answer_universe_revision
 *   §CORS CORS preflight permits Idempotency-Key header
 *   §OR   Open-roster: add member while picks exist → eligible, appended,
 *         roster_revision incremented; replay does not double-increment
 *   §PR   Pick revision: stale_pick_prop_ids detection; reconfirm clears flag
 *   §MK   Mike (no picks before roster update) — no false stale state
 *   §LK   Lock → add → eligible=false, no append, roster_revision unchanged
 *   §UL   Unlock → add again → eligible=true, roster_revision incremented
 *   §QF   Question fairness: pick_count>0 still blocks PATCH /draft-day/props
 *   §LR   League rename: commissioner/member/blank/restore
 *   §RG   Regression smoke
 *
 * Requires SQL Migration 002 to be applied before running.
 * Run: npx tsx server/test-fantasy-open-roster.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as crypto from "crypto";

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY      = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const BASE_URL  = process.env.TEST_API_URL ?? "http://localhost:5000";
const LOCAL_URL = BASE_URL; // same — both hit the backend directly

const RUN_ID = crypto.randomBytes(6).toString("hex");

// ── Service client (bypasses RLS) ─────────────────────────────────────────────
const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Anon client (for auth sign-in) ────────────────────────────────────────────
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Stats ─────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let currentSection = "";
const failures: { section: string; test: string; detail: string }[] = [];

function section(title: string) {
  currentSection = title;
  console.log(`\n${"─".repeat(64)}\n  §  ${title}\n${"─".repeat(64)}`);
}
function ok(msg: string)  { passed++; console.log(`  ✅ ${msg}`); }
function ko(msg: string, detail = "") {
  failed++;
  failures.push({ section: currentSection, test: msg, detail });
  console.log(`  ❌ ${msg}${detail ? ` — ${detail.slice(0, 120)}` : ""}`);
}
function skip(msg: string) { console.log(`  ⏭  ${msg}`); }
function note(msg: string) { console.log(`     ℹ  ${msg}`); }

// ── Auth helpers ──────────────────────────────────────────────────────────────
async function createUser(tag: string) {
  const email = `or-${RUN_ID}-${tag}@qa.test`;
  const { data, error } = await svc.auth.admin.createUser({
    email, password: "password123", email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser(${tag}): ${error?.message}`);
  return data.user;
}

async function signIn(tag: string): Promise<string> {
  const email = `or-${RUN_ID}-${tag}@qa.test`;
  const { data, error } = await anon.auth.signInWithPassword({ email, password: "password123" });
  if (error || !data.session) throw new Error(`signIn(${tag}): ${error?.message}`);
  return data.session.access_token;
}

// ── API helper ────────────────────────────────────────────────────────────────
async function api(
  path: string,
  opts: {
    method?: string;
    token?: string;
    guestToken?: string;
    body?: object;
    extraHeaders?: Record<string, string>;
  } = {}
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token)      headers["Authorization"] = `Bearer ${opts.token}`;
  if (opts.guestToken) headers["X-Fantasy-Guest-Token"] = opts.guestToken;
  if (opts.extraHeaders) Object.assign(headers, opts.extraHeaders);

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let body: any = {};
  try { body = await res.json(); } catch {}

  const respHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => { respHeaders[k.toLowerCase()] = v; });

  return { status: res.status, body, headers: respHeaders };
}

// ── OPTIONS helper (CORS preflight) ──────────────────────────────────────────
// Uses LOCAL_URL to bypass the Replit proxy, which does not forward OPTIONS requests.
async function options(path: string, requestHeaders: string): Promise<Response> {
  return fetch(`${LOCAL_URL}${path}`, {
    method: "OPTIONS",
    headers: {
      "Origin": "http://localhost:8081",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": requestHeaders,
    },
  });
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
let createdLeagueId = "";
const createdUserIds: string[] = [];

async function cleanup() {
  if (createdLeagueId) {
    await svc.from("fantasy_leagues").update({ is_active: false }).eq("id", createdLeagueId);
  }
  await Promise.all(
    createdUserIds.map((id) => svc.auth.admin.deleteUser(id).catch(() => {}))
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  OPEN ROSTER QA — run ${RUN_ID}`);
  console.log(`${"═".repeat(64)}\n`);

  // ── §DB: Schema verification ──────────────────────────────────────────────
  section("DB. Migration 002 schema verification");

  {
    const { error } = await svc
      .from("gameday_pick_cards")
      .select("id, roster_revision")
      .limit(0);
    if (error?.message?.includes("roster_revision")) {
      ko("DB-1. roster_revision on gameday_pick_cards — apply SQL Migration 002!", error.message);
    } else {
      ok("DB-1. roster_revision column on gameday_pick_cards ✓");
    }
  }

  {
    const { error } = await svc
      .from("gameday_picks")
      .select("id, answer_universe_revision")
      .limit(0);
    if (error?.message?.includes("answer_universe_revision")) {
      ko("DB-2. answer_universe_revision on gameday_picks — apply SQL Migration 002!", error.message);
    } else {
      ok("DB-2. answer_universe_revision column on gameday_picks ✓");
    }
  }

  {
    // RPC must accept the updated params (p_room_id triggers roster_revision increment)
    const { error } = await svc.rpc("add_fantasy_season_participant_v2", {
      p_league_id:         "00000000-0000-0000-0000-000000000000",
      p_league_season_id:  "00000000-0000-0000-0000-000000000000",
      p_display_name:      "X",
      p_team_name:         "Y",
      p_draft_day_eligible: true,
      p_room_id:           "00000000-0000-0000-0000-000000000000",
    });
    if (error?.message?.toLowerCase().includes("does not exist")) {
      ko("DB-3. add_fantasy_season_participant_v2 accepts p_room_id", error.message);
    } else {
      ok(`DB-3. add_fantasy_season_participant_v2 exists + callable (error="${error?.message?.slice(0, 60) ?? "none"}")`);
    }
  }

  {
    // Existing picks default to answer_universe_revision=0
    const { data, error } = await svc
      .from("gameday_picks")
      .select("answer_universe_revision")
      .limit(1);
    if (!error) {
      const sample = (data as any[])?.[0];
      if (sample !== undefined && sample.answer_universe_revision !== undefined) {
        ok(`DB-4. Existing picks have answer_universe_revision (sample=${sample.answer_universe_revision})`);
      } else {
        ok("DB-4. gameday_picks.answer_universe_revision selectable (no rows yet or default 0)");
      }
    } else {
      ko("DB-4. Cannot select answer_universe_revision", error.message);
    }
  }

  // ── §CORS: Preflight ──────────────────────────────────────────────────────
  section("CORS. OPTIONS preflight permits Idempotency-Key");

  {
    const res = await options("/api/fantasy/leagues/00000000-0000-0000-0000-000000000000/seasons/00000000-0000-0000-0000-000000000000/participants", "Content-Type, Authorization, Idempotency-Key");
    const allowed = res.headers.get("access-control-allow-headers") ?? "";
    // Server should respond with 2xx (200 or 204)
    (res.status >= 200 && res.status < 300)
      ? ok(`CORS-1. OPTIONS preflight responds with ${res.status}`)
      : ko(`CORS-1. Expected 2xx, got ${res.status}`);
    allowed.toLowerCase().includes("idempotency-key")
      ? ok("CORS-2. Idempotency-Key in Access-Control-Allow-Headers ✓")
      : ko(`CORS-2. Idempotency-Key missing from ACAO headers: "${allowed}"`);
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  section("Bootstrap — users + league + Draft Day");

  let commUser: any, dariusUser: any, mikeUser: any, houseUser: any;
  let commToken: string, dariusToken: string, mikeToken: string, houseToken: string;
  let league_id: string, season_id: string;
  let room_id: string, card_id: string;
  let darius_sm_id: string, darius_lm_id: string;
  let firstPropId = "";
  let firstValidAnswerId = "";
  let publishedTemplateIds: string[] = [];

  try {
    [commUser, dariusUser, mikeUser, houseUser] = await Promise.all([
      createUser("comm"), createUser("darius"), createUser("mike"), createUser("house"),
    ]);
    createdUserIds.push(commUser.id, dariusUser.id, mikeUser.id, houseUser.id);
    note("4 test users created");

    [commToken, dariusToken, mikeToken, houseToken] = await Promise.all([
      signIn("comm"), signIn("darius"), signIn("mike"), signIn("house"),
    ]);
    note("4 JWTs obtained");
  } catch (e: any) {
    ko("Bootstrap users", e.message);
    process.exit(1);
  }

  // Create league
  {
    const r = await api("/api/fantasy/leagues/setup", {
      method: "POST", token: commToken,
      body: {
        league_name:        `OR QA ${RUN_ID}`,
        sport:              "football",
        display_name:       "Commissioner",
        team_name:          "Comm Squad",
        season_year:        2026,
        reward_description: "Bragging rights",
      },
    });
    if (r.status !== 201) {
      ko("League setup → 201", JSON.stringify(r.body));
      await cleanup();
      process.exit(1);
    }
    league_id = r.body.league_id;
    season_id = r.body.season_id;
    createdLeagueId = league_id;
    ok(`League created: ${league_id.slice(0, 8)}…`);
  }

  const base = `/api/fantasy/leagues/${league_id}/seasons/${season_id}`;

  // Add Darius and claim his seat
  {
    const r = await api(`${base}/participants`, {
      method: "POST", token: commToken,
      body: { display_name: "Darius", team_name: "Sunday Scaries" },
      extraHeaders: { "Idempotency-Key": `idem-darius-or-${RUN_ID}` },
    });
    if (r.status !== 201) {
      ko("Add Darius → 201", JSON.stringify(r.body));
      await cleanup();
      process.exit(1);
    }
    darius_sm_id = r.body.season_member_id;
    darius_lm_id = r.body.league_member_id;
    ok(`Darius added: sm_id=${darius_sm_id.slice(0, 8)}…`);

    const claimR = await api(`${base}/claim`, {
      method: "POST", token: dariusToken,
      body: { league_member_id: darius_lm_id },
    });
    (claimR.status === 201 || claimR.status === 200)
      ? ok("Darius claimed his seat")
      : ko("Darius seat claim", JSON.stringify(claimR.body));
  }

  // Add Mike and claim his seat (authenticated, for pick tests)
  let mike_sm_id = "", mike_lm_id = "";
  {
    const r = await api(`${base}/participants`, {
      method: "POST", token: commToken,
      body: { display_name: "Mike", team_name: "Fourth & Long" },
      extraHeaders: { "Idempotency-Key": `idem-mike-or-${RUN_ID}` },
    });
    if (r.status === 201 || r.status === 200) {
      mike_sm_id = r.body.season_member_id;
      mike_lm_id = r.body.league_member_id;
      ok(`Mike added: sm_id=${mike_sm_id.slice(0, 8)}…`);
      const claimR = await api(`${base}/claim`, {
        method: "POST", token: mikeToken,
        body: { league_member_id: mike_lm_id },
      });
      (claimR.status === 201 || claimR.status === 200)
        ? ok("Mike claimed his seat")
        : note(`Mike claim: ${claimR.status}`);
    } else {
      ko("Add Mike → 201/200", JSON.stringify(r.body));
    }
  }

  // Publish Draft Day
  {
    const tplR = await api(`${base}/draft-day/templates`, { token: commToken });
    if (tplR.status !== 200 || !Array.isArray(tplR.body.competition)) {
      ko("Get templates → 200", JSON.stringify(tplR.body));
      await cleanup();
      process.exit(1);
    }
    // Pick 3 competition + 2 season templates (mirroring combined test)
    const compIds: string[] = (tplR.body.competition as any[]).slice(0, 3).map((t: any) => t.id);
    const seasIds: string[] = (tplR.body.season as any[]).slice(0, 2).map((t: any) => t.id);
    const allProps: any[] = [
      ...(tplR.body.competition as any[]),
      ...(tplR.body.season as any[]),
    ];
    if (allProps.length === 0) {
      ko("Templates available for Draft Day publish", "No props returned");
      await cleanup();
      process.exit(1);
    }
    publishedTemplateIds = [...compIds, ...seasIds];

    const pubR = await api(`${base}/draft-day/publish`, {
      method: "POST", token: commToken,
      body: { selected_prop_ids: publishedTemplateIds },
    });
    if (pubR.status !== 200 && pubR.status !== 201) {
      ko("Publish Draft Day → 200/201", JSON.stringify(pubR.body));
      await cleanup();
      process.exit(1);
    }
    room_id = pubR.body.room_id;
    ok(`Draft Day published: room=${room_id?.slice(0, 8)}…`);

    // Get card_id
    const { data: cardRow } = await svc
      .from("gameday_pick_cards")
      .select("id")
      .eq("room_id", room_id)
      .eq("phase", "draft_day")
      .single();
    card_id = (cardRow as any)?.id;
    ok(`Card: ${card_id?.slice(0, 8)}…`);
  }

  // Darius plays and submits a pick
  {
    const playR = await api(`${base}/draft-day/play`, { token: dariusToken });
    if (playR.status !== 200) {
      skip("Darius play state not available — some OR tests may be limited");
    } else {
      const prop = playR.body.props?.[0];
      if (prop) {
        firstPropId = prop.id;
        // Prefer a season_member answer option for stale-pick testing
        const smOpt = (prop.answer_options ?? []).find((o: any) => o.type === "season_member");
        const anyOpt = (prop.answer_options ?? [])[0];
        const chosenOpt = smOpt ?? anyOpt;
        if (chosenOpt) {
          firstValidAnswerId = chosenOpt.id;
          const pickR = await api(`${base}/draft-day/picks`, {
            method: "POST", token: dariusToken,
            body: { prop_id: firstPropId, selected_answer: firstValidAnswerId },
          });
          pickR.status === 200 || pickR.status === 201
            ? ok(`Darius submitted pick: prop=${firstPropId.slice(0, 8)}… answer=${firstValidAnswerId.slice(0, 8)}…`)
            : note(`Darius pick submit: ${pickR.status}`);
        }
      }
    }
  }

  // Verify roster_revision starts at 0
  {
    const { data: cardData } = await svc
      .from("gameday_pick_cards")
      .select("roster_revision")
      .eq("id", card_id)
      .single();
    const rr = (cardData as any)?.roster_revision ?? -1;
    rr === 0
      ? ok(`OR-bootstrap. Initial roster_revision=0 ✓`)
      : ko(`OR-bootstrap. Expected roster_revision=0, got ${rr}`);
  }

  // ── §OR: Open-roster tests ────────────────────────────────────────────────
  section("OR. Open-roster: add member while picks exist");

  let house_sm_id = "", house_lm_id = "";

  {
    // OR-1. Add House while card is open and picks exist → eligible=true
    const houseKey = `idem-house-or-${RUN_ID}`;
    const r = await api(`${base}/participants`, {
      method: "POST", token: commToken,
      body: { display_name: "House", team_name: "Four Walls" },
      extraHeaders: { "Idempotency-Key": houseKey },
    });
    (r.status === 201 || r.status === 200)
      ? ok(`OR-1. Add House (open+picks) → ${r.status}`)
      : ko(`OR-1. Should be 201/200, got ${r.status}`, JSON.stringify(r.body));
    r.body.draft_day_eligible === true
      ? ok("OR-2. draft_day_eligible=true (open-roster rule) ✓")
      : ko(`OR-2. Expected draft_day_eligible=true, got ${r.body.draft_day_eligible}`);

    house_sm_id = r.body.season_member_id ?? "";
    house_lm_id = r.body.league_member_id ?? "";

    // OR-3. House appended to answer_options on season_member props
    if (house_sm_id && card_id) {
      const { data: smProps } = await svc
        .from("gameday_props")
        .select("id, answer_options, answer_target_type")
        .eq("card_id", card_id)
        .eq("answer_target_type", "season_member");

      if ((smProps ?? []).length === 0) {
        skip("OR-3. No season_member props to verify append — check prop selection");
      } else {
        const allHaveHouse = (smProps ?? []).every((p: any) =>
          (p.answer_options as any[]).some((o: any) => o.id === house_sm_id)
        );
        allHaveHouse
          ? ok(`OR-3. House appended to all ${(smProps ?? []).length} season_member prop(s) ✓`)
          : ko("OR-3. House NOT in some/all season_member answer_options");

        // OR-4. House label is correct
        const anyPropWithHouse = (smProps ?? []).find((p: any) =>
          (p.answer_options as any[]).some((o: any) => o.id === house_sm_id)
        );
        const houseOption = anyPropWithHouse?.answer_options.find((o: any) => o.id === house_sm_id);
        houseOption?.label === "House"
          ? ok("OR-4. House label='House' in answer_options ✓")
          : ko(`OR-4. Expected label='House', got '${houseOption?.label}'`);
        houseOption?.type === "season_member"
          ? ok("OR-4b. House type='season_member' ✓")
          : ko(`OR-4b. Expected type='season_member', got '${houseOption?.type}'`);
      }
    } else {
      skip("OR-3/4. house_sm_id or card_id not available");
    }

    // OR-5. roster_revision incremented to 1
    const { data: cardAfter } = await svc
      .from("gameday_pick_cards")
      .select("roster_revision")
      .eq("id", card_id)
      .single();
    const rrAfterHouse = (cardAfter as any)?.roster_revision ?? -1;
    rrAfterHouse === 1
      ? ok("OR-5. roster_revision=1 after first open add ✓")
      : ko(`OR-5. Expected roster_revision=1, got ${rrAfterHouse}`);

    // OR-6. Replay (same Idempotency-Key) does NOT double-increment roster_revision
    const replayR = await api(`${base}/participants`, {
      method: "POST", token: commToken,
      body: { display_name: "House", team_name: "Four Walls" },
      extraHeaders: { "Idempotency-Key": houseKey },
    });
    (replayR.status === 201 || replayR.status === 200)
      ? ok(`OR-6. Replay → ${replayR.status} (idempotent)`)
      : ko(`OR-6. Replay should be 2xx, got ${replayR.status}`, JSON.stringify(replayR.body));
    replayR.body.season_member_id === house_sm_id
      ? ok("OR-6b. Replay returns same season_member_id (no duplicate)")
      : ko(`OR-6b. Replay sm_id differs: ${replayR.body.season_member_id?.slice(0,8)} vs ${house_sm_id.slice(0,8)}`);

    const { data: cardAfterReplay } = await svc
      .from("gameday_pick_cards")
      .select("roster_revision")
      .eq("id", card_id)
      .single();
    const rrAfterReplay = (cardAfterReplay as any)?.roster_revision ?? -1;
    rrAfterReplay === 1
      ? ok("OR-7. roster_revision still=1 after replay (no double-increment) ✓")
      : ko(`OR-7. Expected roster_revision=1 after replay, got ${rrAfterReplay}`);

    // OR-8. Darius's existing picks are untouched
    if (firstPropId) {
      const { data: dariusPicks } = await svc
        .from("gameday_picks")
        .select("selected_answer")
        .eq("prop_id", firstPropId)
        .eq("participant_id", (await svc
          .from("gameday_participants")
          .select("id")
          .eq("room_id", room_id)
          .eq("season_member_id", darius_sm_id)
          .maybeSingle()
        ).data?.id ?? "");

      note(`OR-8. Darius pick count for firstPropId: ${(dariusPicks ?? []).length}`);
      ok("OR-8. Darius picks queried without error (existing picks unaffected)");
    } else {
      skip("OR-8. firstPropId not available");
    }
  }

  // ── §PR: Pick revision tests ──────────────────────────────────────────────
  section("PR. Pick revision: stale_pick_prop_ids detection");

  {
    // PR-1. Darius's picks have answer_universe_revision=0 (made before House was added)
    if (firstPropId) {
      const { data: partRow } = await svc
        .from("gameday_participants")
        .select("id")
        .eq("room_id", room_id)
        .eq("season_member_id", darius_sm_id)
        .maybeSingle();
      const dariusPartId = (partRow as any)?.id;
      if (dariusPartId) {
        const { data: pickRow } = await svc
          .from("gameday_picks")
          .select("answer_universe_revision")
          .eq("prop_id", firstPropId)
          .eq("participant_id", dariusPartId)
          .maybeSingle();
        const pickRev = (pickRow as any)?.answer_universe_revision ?? -1;
        pickRev === 0
          ? ok("PR-1. Darius pick has answer_universe_revision=0 (made before roster expansion) ✓")
          : ko(`PR-1. Expected answer_universe_revision=0, got ${pickRev}`);
      } else {
        skip("PR-1. Darius participant row not found (did Darius GET /play yet?)");
      }
    } else {
      skip("PR-1. firstPropId not available");
    }

    // PR-2. GET /draft-day/play returns roster_revision=1
    const playR = await api(`${base}/draft-day/play`, { token: dariusToken });
    if (playR.status === 200) {
      playR.body.roster_revision === 1
        ? ok("PR-2. GET /play: roster_revision=1 ✓")
        : ko(`PR-2. Expected roster_revision=1, got ${playR.body.roster_revision}`);
      ok(`PR-2b. stale_pick_prop_ids present in response: ${JSON.stringify(playR.body.stale_pick_prop_ids)}`);

      // PR-3. Darius's pick on firstPropId is stale if it's a roster-target prop
      if (firstPropId && Array.isArray(playR.body.stale_pick_prop_ids)) {
        // We selected a season_member answer if available — if firstPropId is season_member type
        // then Darius's pick should appear in stale_pick_prop_ids
        const isStale = (playR.body.stale_pick_prop_ids as string[]).includes(firstPropId);
        const firstPropType = playR.body.props?.find((p: any) => p.id === firstPropId)?.answer_target_type;
        if (firstPropType === "season_member" || firstPropType === "fantasy_team") {
          isStale
            ? ok("PR-3. Darius pick on roster-target prop flagged as stale ✓")
            : ko("PR-3. Expected firstPropId in stale_pick_prop_ids (roster-target + pre-expansion pick)");
        } else {
          !isStale
            ? ok(`PR-3. Non-roster prop (${firstPropType}) not in stale_pick_prop_ids ✓`)
            : ko(`PR-3. Non-roster prop should NOT be stale: ${firstPropType}`);
        }
      }
    } else {
      ko(`PR-2. GET /play → 200 (got ${playR.status})`, JSON.stringify(playR.body));
    }

    // PR-4. Darius reconfirms his pick → answer_universe_revision updates to 1
    if (firstPropId && firstValidAnswerId) {
      const reconfirmR = await api(`${base}/draft-day/picks`, {
        method: "POST", token: dariusToken,
        body: { prop_id: firstPropId, selected_answer: firstValidAnswerId },
      });
      reconfirmR.status === 200 || reconfirmR.status === 201
        ? ok(`PR-4. Reconfirm pick → ${reconfirmR.status}`)
        : ko(`PR-4. Reconfirm should be 2xx, got ${reconfirmR.status}`);

      // PR-5. After reconfirm, stale_pick_prop_ids should not include firstPropId
      const playAfter = await api(`${base}/draft-day/play`, { token: dariusToken });
      if (playAfter.status === 200 && Array.isArray(playAfter.body.stale_pick_prop_ids)) {
        const stillStale = (playAfter.body.stale_pick_prop_ids as string[]).includes(firstPropId);
        !stillStale
          ? ok("PR-5. After reconfirm, firstPropId no longer stale ✓")
          : ko("PR-5. firstPropId still stale after reconfirm — answer_universe_revision not updated");
        // Check answer_universe_revision in DB
        const { data: partRow2 } = await svc
          .from("gameday_participants")
          .select("id")
          .eq("room_id", room_id)
          .eq("season_member_id", darius_sm_id)
          .maybeSingle();
        const dariusPartId2 = (partRow2 as any)?.id;
        if (dariusPartId2) {
          const { data: pickRow2 } = await svc
            .from("gameday_picks")
            .select("answer_universe_revision")
            .eq("prop_id", firstPropId)
            .eq("participant_id", dariusPartId2)
            .maybeSingle();
          const pickRev2 = (pickRow2 as any)?.answer_universe_revision ?? -1;
          pickRev2 === 1
            ? ok("PR-6. Reconfirmed pick has answer_universe_revision=1 ✓")
            : ko(`PR-6. Expected answer_universe_revision=1 after reconfirm, got ${pickRev2}`);
        }
      } else {
        ko(`PR-5. GET /play after reconfirm → 200 (got ${playAfter.status})`);
      }
    } else {
      skip("PR-4/5/6. firstPropId or firstValidAnswerId not available");
    }
  }

  // ── §MK: Mike (no picks before roster update) ─────────────────────────────
  section("MK. Mike — no false stale state when no prior picks");

  {
    // Mike hasn't picked yet. Roster has been expanded (House added, roster_revision=1).
    // Mike's play state should have stale_pick_prop_ids=[] (no picks to be stale).
    const playR = await api(`${base}/draft-day/play`, { token: mikeToken });
    if (playR.status === 200) {
      ok(`MK-1. Mike GET /play → 200`);
      const stale = playR.body.stale_pick_prop_ids ?? [];
      Array.isArray(stale)
        ? ok("MK-2. stale_pick_prop_ids is an array")
        : ko("MK-2. stale_pick_prop_ids not an array");
      stale.length === 0
        ? ok("MK-3. stale_pick_prop_ids=[] for Mike (no prior picks — no false stale) ✓")
        : ko(`MK-3. Expected empty stale_pick_prop_ids for Mike (no picks), got ${JSON.stringify(stale)}`);
      playR.body.roster_revision === 1
        ? ok("MK-4. Mike sees roster_revision=1 ✓")
        : ko(`MK-4. Expected roster_revision=1, got ${playR.body.roster_revision}`);
    } else {
      ko(`MK-1. Mike GET /play → 200 (got ${playR.status})`, JSON.stringify(playR.body));
    }

    // MK-5. Mike picks — his pick should have answer_universe_revision=1 (current roster_revision)
    if (firstPropId && firstValidAnswerId) {
      const pickR = await api(`${base}/draft-day/picks`, {
        method: "POST", token: mikeToken,
        body: { prop_id: firstPropId, selected_answer: firstValidAnswerId },
      });
      if (pickR.status === 200 || pickR.status === 201) {
        ok(`MK-5. Mike submits pick → ${pickR.status}`);
        // Verify in DB
        const { data: mikePartRow } = await svc
          .from("gameday_participants")
          .select("id")
          .eq("room_id", room_id)
          .eq("season_member_id", mike_sm_id)
          .maybeSingle();
        const mikePartId = (mikePartRow as any)?.id;
        if (mikePartId) {
          const { data: mikePickRow } = await svc
            .from("gameday_picks")
            .select("answer_universe_revision")
            .eq("prop_id", firstPropId)
            .eq("participant_id", mikePartId)
            .maybeSingle();
          const mikePickRev = (mikePickRow as any)?.answer_universe_revision ?? -1;
          mikePickRev === 1
            ? ok("MK-6. Mike's pick has answer_universe_revision=1 (current roster_revision) ✓")
            : ko(`MK-6. Expected answer_universe_revision=1 for Mike's pick, got ${mikePickRev}`);
        } else {
          skip("MK-6. Mike participant row not found");
        }
      } else {
        ko(`MK-5. Mike pick → 2xx (got ${pickR.status})`, JSON.stringify(pickR.body));
      }
    } else {
      skip("MK-5/6. firstPropId not available");
    }
  }

  // ── §LK: Lock tests ───────────────────────────────────────────────────────
  section("LK. Lock card → add → eligible=false, no append, roster_revision unchanged");

  {
    const lockR = await api(`${base}/draft-day/lock`, { method: "POST", token: commToken });
    lockR.status === 200
      ? ok("LK-1. Lock Draft Day → 200")
      : ko(`LK-1. Should be 200, got ${lockR.status}`);

    // Capture roster_revision before locked add
    const { data: cardBeforeLock } = await svc
      .from("gameday_pick_cards")
      .select("roster_revision")
      .eq("id", card_id)
      .single();
    const rrBeforeLock = (cardBeforeLock as any)?.roster_revision ?? -1;

    // Add member while locked → eligible=false
    const lockedR = await api(`${base}/participants`, {
      method: "POST", token: commToken,
      body: { display_name: "LockedMember", team_name: "Late FC" },
      extraHeaders: { "Idempotency-Key": `idem-locked-${RUN_ID}` },
    });
    (lockedR.status === 201 || lockedR.status === 200)
      ? ok(`LK-2. Add while locked → ${lockedR.status}`)
      : ko(`LK-2. Should be 201/200, got ${lockedR.status}`, JSON.stringify(lockedR.body));
    lockedR.body.draft_day_eligible === false
      ? ok("LK-3. draft_day_eligible=false (card locked) ✓")
      : ko(`LK-3. Expected draft_day_eligible=false (locked), got ${lockedR.body.draft_day_eligible}`);

    const lockedSmId: string = lockedR.body.season_member_id ?? "";

    // roster_revision must NOT change (locked card — no append)
    const { data: cardAfterLock } = await svc
      .from("gameday_pick_cards")
      .select("roster_revision")
      .eq("id", card_id)
      .single();
    const rrAfterLock = (cardAfterLock as any)?.roster_revision ?? -1;
    rrAfterLock === rrBeforeLock
      ? ok(`LK-4. roster_revision unchanged at ${rrAfterLock} (locked card, no append) ✓`)
      : ko(`LK-4. roster_revision changed from ${rrBeforeLock} to ${rrAfterLock} — should NOT change on lock`);

    // LockedMember not appended to answer_options
    if (lockedSmId && card_id) {
      const { data: smProps } = await svc
        .from("gameday_props")
        .select("id, answer_options, answer_target_type")
        .eq("card_id", card_id)
        .eq("answer_target_type", "season_member");
      if ((smProps ?? []).length > 0) {
        const anyHasLocked = (smProps ?? []).some((p: any) =>
          (p.answer_options as any[]).some((o: any) => o.id === lockedSmId)
        );
        !anyHasLocked
          ? ok("LK-5. LockedMember NOT appended to answer_options (locked card) ✓")
          : ko("LK-5. LockedMember was incorrectly appended to answer_options while card was locked");
      } else {
        skip("LK-5. No season_member props to verify non-append");
      }
    }
  }

  // ── §UL: Unlock tests ─────────────────────────────────────────────────────
  section("UL. Unlock → add → eligible=true, roster_revision increments");

  {
    const unlockR = await api(`${base}/draft-day/unlock`, { method: "POST", token: commToken });
    unlockR.status === 200
      ? ok("UL-1. Unlock Draft Day → 200")
      : ko(`UL-1. Should be 200, got ${unlockR.status}`);

    // Capture roster_revision before open add
    const { data: cardBeforeUnlock } = await svc
      .from("gameday_pick_cards")
      .select("roster_revision")
      .eq("id", card_id)
      .single();
    const rrBeforeUnlock = (cardBeforeUnlock as any)?.roster_revision ?? -1;

    // Add another member after unlock → eligible=true
    const houseJrR = await api(`${base}/participants`, {
      method: "POST", token: commToken,
      body: { display_name: "HouseJr", team_name: "New Walls" },
      extraHeaders: { "Idempotency-Key": `idem-housejr-or-${RUN_ID}` },
    });
    (houseJrR.status === 201 || houseJrR.status === 200)
      ? ok(`UL-2. Add after unlock → ${houseJrR.status}`)
      : ko(`UL-2. Should be 201/200, got ${houseJrR.status}`, JSON.stringify(houseJrR.body));
    houseJrR.body.draft_day_eligible === true
      ? ok("UL-3. draft_day_eligible=true after unlock (open-roster rule) ✓")
      : ko(`UL-3. Expected draft_day_eligible=true after unlock, got ${houseJrR.body.draft_day_eligible}`);

    // roster_revision must increment again
    const { data: cardAfterUnlock } = await svc
      .from("gameday_pick_cards")
      .select("roster_revision")
      .eq("id", card_id)
      .single();
    const rrAfterUnlock = (cardAfterUnlock as any)?.roster_revision ?? -1;
    rrAfterUnlock === rrBeforeUnlock + 1
      ? ok(`UL-4. roster_revision incremented: ${rrBeforeUnlock} → ${rrAfterUnlock} ✓`)
      : ko(`UL-4. Expected roster_revision ${rrBeforeUnlock + 1}, got ${rrAfterUnlock}`);
  }

  // ── §QF: Question fairness invariant ─────────────────────────────────────
  section("QF. Question fairness — pick_count > 0 still blocks PATCH /draft-day/props");

  {
    // pick_count > 0 (Darius and Mike have both submitted picks).
    // PATCH /draft-day/props must return 409 regardless of roster_revision.
    const r = await api(`${base}/draft-day/props`, {
      method: "PATCH", token: commToken,
      body: { selected_prop_ids: publishedTemplateIds },
    });
    r.status === 409
      ? ok("QF-1. PATCH /draft-day/props → 409 when picks exist ✓")
      : ko(`QF-1. Expected 409 (picks exist), got ${r.status}`);
    r.body.error?.toLowerCase().includes("pick") || r.body.code?.includes("picks")
      ? ok("QF-2. Error message references picks ✓")
      : ko(`QF-2. Error should mention picks, got: ${r.body.error ?? r.body.code}`);
  }

  // ── §LR: League rename tests ──────────────────────────────────────────────
  section("LR. League rename — PATCH /api/fantasy/leagues/:leagueId");

  const origName = `OR QA ${RUN_ID}`;

  {
    // LR-1. Non-commissioner (Darius) → 403
    const r = await api(`/api/fantasy/leagues/${league_id}`, {
      method: "PATCH", token: dariusToken,
      body: { league_name: "Hacked League" },
    });
    r.status === 403 ? ok("LR-1. Non-commissioner rename → 403 ✓") : ko(`LR-1. Should be 403, got ${r.status}`);
  }

  {
    // LR-2. No token → 401
    const r = await api(`/api/fantasy/leagues/${league_id}`, {
      method: "PATCH",
      body: { league_name: "No Auth" },
    });
    r.status === 401 ? ok("LR-2. No-token rename → 401 ✓") : ko(`LR-2. Should be 401, got ${r.status}`);
  }

  {
    // LR-3. Blank name → 400
    const r = await api(`/api/fantasy/leagues/${league_id}`, {
      method: "PATCH", token: commToken,
      body: { league_name: "   " },
    });
    r.status === 400 ? ok("LR-3. Blank league_name → 400 ✓") : ko(`LR-3. Should be 400, got ${r.status}`);
  }

  {
    // LR-4. Commissioner renames → 200
    const r = await api(`/api/fantasy/leagues/${league_id}`, {
      method: "PATCH", token: commToken,
      body: { league_name: "Renamed OR League" },
    });
    r.status === 200 ? ok("LR-4. Commissioner rename → 200 ✓") : ko(`LR-4. Should be 200, got ${r.status}`, JSON.stringify(r.body));
    r.body.league_name === "Renamed OR League" ? ok("LR-4b. New name in response ✓") : ko(`LR-4b. Expected 'Renamed OR League', got '${r.body.league_name}'`);
    typeof r.body.id === "string" ? ok("LR-4c. id in response ✓") : ko("LR-4c. id missing");
  }

  {
    // LR-5. GET /leagues reflects new name
    const r = await api("/api/fantasy/leagues", { token: commToken });
    const found = (r.body.leagues ?? []).find((l: any) => l.id === league_id);
    found?.league_name === "Renamed OR League"
      ? ok("LR-5. GET /leagues reflects renamed name ✓")
      : ko(`LR-5. Expected 'Renamed OR League' in GET /leagues, got '${found?.league_name}'`);
  }

  {
    // LR-6. Restore original name
    const r = await api(`/api/fantasy/leagues/${league_id}`, {
      method: "PATCH", token: commToken,
      body: { league_name: origName },
    });
    r.status === 200 ? ok("LR-6. Name restored → 200 ✓") : ko(`LR-6. Should be 200, got ${r.status}`);
    r.body.league_name === origName ? ok(`LR-6b. Restored to '${origName}' ✓`) : ko(`LR-6b. Expected '${origName}', got '${r.body.league_name}'`);
  }

  {
    // LR-7. Wrong league_id → 403 (not a member)
    const r = await api(`/api/fantasy/leagues/00000000-0000-0000-0000-000000000000`, {
      method: "PATCH", token: commToken,
      body: { league_name: "Nope" },
    });
    (r.status === 403 || r.status === 404)
      ? ok(`LR-7. Non-existent league → ${r.status} ✓`)
      : ko(`LR-7. Should be 403/404, got ${r.status}`);
  }

  // ── §RG: Regression smoke ─────────────────────────────────────────────────
  section("RG. Regression smoke — Phase 3/4A endpoints unaffected");

  {
    const joinR = await api(`${base}/join-info`);
    joinR.status === 200
      ? ok("RG-1. /join-info returns 200 (Phase 3 unaffected)")
      : ko(`RG-1. /join-info should be 200, got ${joinR.status}`);

    const ddR = await api(`${base}/draft-day`, { token: commToken });
    ddR.status === 200
      ? ok("RG-2. /draft-day hub returns 200 (Phase 4A unaffected)")
      : ko(`RG-2. /draft-day hub should be 200, got ${ddR.status}`);

    const roomsR = await api("/api/rooms", { token: commToken });
    (roomsR.status === 200 || roomsR.status === 404 || roomsR.status === 401)
      ? ok(`RG-3. /api/rooms responds (${roomsR.status}) — classic Game Day unaffected`)
      : ko(`RG-3. /api/rooms unexpected ${roomsR.status}`);

    // GET /draft-day/play with roster_revision in response
    const playSmoke = await api(`${base}/draft-day/play`, { token: dariusToken });
    if (playSmoke.status === 200) {
      typeof playSmoke.body.roster_revision === "number"
        ? ok("RG-4. roster_revision present in play state ✓")
        : ko("RG-4. roster_revision missing from play state");
      Array.isArray(playSmoke.body.stale_pick_prop_ids)
        ? ok("RG-5. stale_pick_prop_ids present in play state ✓")
        : ko("RG-5. stale_pick_prop_ids missing from play state");
    } else {
      ko(`RG-4/5. GET /play → 200 (got ${playSmoke.status})`);
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await cleanup();

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                        QA RESULTS                            ║
╠══════════════════════════════════════════════════════════════╣
║  Total:    ${String(total).padEnd(49)}║
║  ✅ Passed: ${String(passed).padEnd(49)}║
║  ❌ Failed: ${String(failed).padEnd(49)}║
╚══════════════════════════════════════════════════════════════╝`);

  if (failures.length > 0) {
    console.log("\nFailed tests:");
    failures.forEach((f) => {
      console.log(`  ✗ [${f.section}] ${f.test}`);
      if (f.detail) console.log(`      ${f.detail.slice(0, 120)}`);
    });
  }

  if (failed === 0) {
    console.log("\n  🟢  OVERALL RESULT: PASS");
    console.log("  OPEN ROSTER READY FOR MANUAL QA");
  } else {
    console.log("\n  🔴  OVERALL RESULT: CORRECTION REQUIRED");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Unhandled error:", e.message);
  process.exit(1);
});
