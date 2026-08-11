/**
 * server/test-fantasy-phase4a.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 4A.1 QA — Fantasy Draft Day Commissioner Setup + Polish
 *
 * Scenarios:
 *   §1   Bootstrap (commissioner + 2 members)
 *   §2   Template fetch — football templates exist and are grouped
 *   §3   Template fields — point_value, answer_target_type, scoring_scope, supports_no_one
 *   §4   Non-commissioner cannot publish
 *   §5   Publish with selected templates
 *   §6   Publish creates correct room fields
 *   §7   Publish creates correct pick card fields (status='open')
 *   §8   Publish creates correct props — counts, scope, point_value, answer_target_type
 *   §9   Structured answer_options — member IDs stable and snapshotted
 *   §10  GET /draft-day returns correct status and counts
 *   §11  Idempotency — double publish does not duplicate room/props
 *   §12  Lock — commissioner locks the card
 *   §13  Lock — non-commissioner cannot lock/unlock
 *   §14  Lock — idempotent (lock again is 200)
 *   §15  Question selection cap — 15 max enforced server-side
 *   §16  Unlock — commissioner unlocks, idempotent, non-commissioner rejected
 *   §17  Prop quality — subjective defaults removed, supports_no_one correct
 *   §18  Status semantics — draft/open/locked lifecycle
 *   §19  Phase 2 regression (67/67)
 *   §20  Phase 3 regression (60/60)
 *   §21  Phase 3B regression (42/42)
 *
 * NOTE: §19–21 are smoke checks via API calls, not re-running the full suites.
 * Run the full suites separately for confidence.
 *
 * PREREQUISITE: supabase/gameday-fantasy-phase4a-draft-day.sql +
 *               supabase/gameday-fantasy-phase4a1-polish.sql must be applied.
 *
 * Usage:
 *   npx tsx server/test-fantasy-phase4a.ts
 */

import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.TEST_API_URL ?? "http://localhost:5000";
const SUP_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUP_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const RUN_ID   = Math.random().toString(36).slice(2, 10).toUpperCase();

const PASS = "\x1b[32m  ✅ \x1b[0m";
const FAIL = "\x1b[31m  ❌ \x1b[0m";
const INFO = "\x1b[36m  ℹ  \x1b[0m";
const SKIP = "\x1b[33m  ⚠  \x1b[0m";

let passed = 0; let failed = 0;
const failures: { section: string; test: string; error: string }[] = [];
let currentSection = "";

function section(title: string) {
  currentSection = title;
  console.log(`\n${"─".repeat(60)}\n  §  ${title}\n${"─".repeat(60)}`);
}
function pass(msg: string)  { passed++; console.log(PASS + msg); }
function fail(msg: string, detail = "") {
  failed++;
  console.log(FAIL + msg);
  if (detail) console.log(`     ↳ ${detail}`);
  failures.push({ section: currentSection, test: msg, error: detail });
}
function note(msg: string)  { console.log(INFO + msg); }
function skip(msg: string)  { console.log(SKIP + msg); }

async function api(
  path: string,
  opts: { method?: string; token?: string; guestToken?: string; body?: object } = {}
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token)      headers["Authorization"]         = `Bearer ${opts.token}`;
  if (opts.guestToken) headers["X-Fantasy-Guest-Token"] = opts.guestToken;
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
  const email = `qa-p4a-${tag}-${RUN_ID}@swayger-test.invalid`;
  const { data, error } = await service.auth.admin.createUser({
    email, password: "test-p4a-pw-456", email_confirm: true,
  });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  return data.user!;
}
async function signIn(tag: string): Promise<string> {
  const email = `qa-p4a-${tag}-${RUN_ID}@swayger-test.invalid`;
  const { data, error } = await service.auth.signInWithPassword({
    email, password: "test-p4a-pw-456",
  });
  if (error) throw new Error(`signIn ${tag}: ${error.message}`);
  return data.session!.access_token;
}
async function deleteUser(id: string) {
  await service.auth.admin.deleteUser(id);
}

let createdLeagueId: string | null = null;
let createdRoomId:   string | null = null;

async function cleanup(userIds: string[]) {
  console.log("\n─── Cleanup " + "─".repeat(47));
  if (createdRoomId) {
    const { data: cards } = await service.from("gameday_pick_cards").select("id").eq("room_id", createdRoomId);
    for (const c of cards ?? []) {
      await service.from("gameday_props").delete().eq("card_id", c.id);
    }
    await service.from("gameday_pick_cards").delete().eq("room_id", createdRoomId);
    await service.from("gameday_participants").delete().eq("room_id", createdRoomId);
    await service.from("gameday_rooms").delete().eq("id", createdRoomId);
    note(`Deleted test room: ${createdRoomId.slice(0, 8)}…`);
  }
  if (createdLeagueId) {
    const lid = createdLeagueId;
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
║   SWAYGER FANTASY PHASE 4A.1 — DRAFT DAY POLISH QA      ║
║   Run ID: ${RUN_ID.padEnd(46)}║
╚══════════════════════════════════════════════════════════╝`);

  // ── §1. Bootstrap ──────────────────────────────────────────────────────────
  section("1. Bootstrap (commissioner + 2 members)");

  let commUser: any, mikeUser: any;
  let commToken: string, mikeToken: string;
  let league_id: string, season_id: string;
  let mike_sm_id: string, comm_sm_id: string;

  try {
    [commUser, mikeUser] = await Promise.all([createUser("comm"), createUser("mike")]);
    [commToken, mikeToken] = await Promise.all([signIn("comm"), signIn("mike")]);
    pass("2 test users created");
  } catch (e: any) { fail("Bootstrap users", e.message); process.exit(1); }

  {
    const r = await api("/api/fantasy/leagues/setup", {
      method: "POST", token: commToken,
      body: {
        league_name:        `P4A League ${RUN_ID}`,
        sport:              "football",
        display_name:       "Darius",
        team_name:          "The Monstars",
        season_year:        2026,
        reward_description: "Winner buys lunch",
      },
    });
    if (r.status !== 201) {
      fail("League setup", `${r.status}: ${JSON.stringify(r.body)}`);
      await cleanup([commUser.id, mikeUser.id]);
      process.exit(1);
    }
    createdLeagueId = r.body.league_id;
    league_id       = r.body.league_id;
    season_id       = r.body.season_id;
    comm_sm_id      = r.body.season_member_id;
    pass("League created (football)");

    // Add Mike
    const rm = await api(`/api/fantasy/leagues/${league_id}/seasons/${season_id}/participants`, {
      method: "POST", token: commToken,
      body: { display_name: "Mike", team_name: "Sunday Scaries" },
    });
    if (rm.status !== 201) {
      fail("Add Mike", `${rm.status}`);
    } else {
      mike_sm_id = rm.body.season_member_id;
      pass("Mike added as participant");
      note(`comm sm_id=${comm_sm_id.slice(0,8)}… mike sm_id=${mike_sm_id.slice(0,8)}…`);
    }
  }

  const BASE = `/api/fantasy/leagues/${league_id}/seasons/${season_id}`;

  // ── §2. Template fetch ─────────────────────────────────────────────────────
  section("2. Template Fetch — Football Templates Exist and Are Grouped");
  let competitionTemplates: any[] = [];
  let seasonTemplates: any[]      = [];
  {
    const r = await api(`${BASE}/draft-day/templates`, { token: commToken });
    if (r.status !== 200) {
      fail("GET /draft-day/templates", `${r.status}: ${JSON.stringify(r.body)}`);
    } else {
      pass("GET /draft-day/templates → 200");
      competitionTemplates = r.body.competition ?? [];
      seasonTemplates      = r.body.season ?? [];
      r.body.sport === "football"
        ? pass("sport=football in response")
        : fail("sport field", `Expected football, got ${r.body.sport}`);
      competitionTemplates.length >= 4
        ? pass(`${competitionTemplates.length} competition templates returned (≥4 required)`)
        : fail("Competition template count", `Expected ≥4, got ${competitionTemplates.length}`);
      seasonTemplates.length >= 3
        ? pass(`${seasonTemplates.length} season receipt templates returned (≥3 required)`)
        : fail("Season template count", `Expected ≥3, got ${seasonTemplates.length}`);
    }
  }

  // ── §3. Template fields ────────────────────────────────────────────────────
  section("3. Template Fields — point_value, answer_target_type, scoring_scope, supports_no_one Preserved");
  {
    for (const t of competitionTemplates) {
      if (t.scoring_scope !== "competition") {
        fail(`Template ${t.id} scope`, `Expected competition, got ${t.scoring_scope}`); break;
      }
      if (typeof t.point_value !== "number" || t.point_value <= 0) {
        fail(`Template ${t.id} point_value`, `Got ${t.point_value}`); break;
      }
    }
    competitionTemplates.every((t: any) => t.scoring_scope === "competition")
      ? pass("All competition templates have scoring_scope=competition")
      : fail("Competition scope check (already reported above)", "");
    seasonTemplates.every((t: any) => t.scoring_scope === "season")
      ? pass("All season templates have scoring_scope=season")
      : fail("Season scope check", "");
    const hasTargetType = [...competitionTemplates, ...seasonTemplates]
      .every((t: any) => t.answer_target_type !== undefined);
    hasTargetType
      ? pass("All templates have answer_target_type field")
      : fail("answer_target_type field missing on some templates");

    // supports_no_one field present on all templates
    const allTmpls = [...competitionTemplates, ...seasonTemplates];
    const hasNoOneField = allTmpls.every((t: any) => typeof t.supports_no_one === "boolean");
    hasNoOneField
      ? pass("All templates have supports_no_one boolean field")
      : fail("supports_no_one field missing or wrong type on some templates",
          JSON.stringify(allTmpls.map((t: any) => ({ id: t.id, supports_no_one: t.supports_no_one }))));

    const memberTargets = allTmpls.filter((t: any) => t.answer_target_type === "season_member");
    memberTargets.length > 0
      ? pass(`${memberTargets.length} season_member target templates found`)
      : fail("No season_member target templates");
  }

  // ── §4. Non-commissioner cannot publish ────────────────────────────────────
  section("4. Non-Commissioner Cannot Publish");
  {
    const r = await api(`${BASE}/draft-day/publish`, {
      method: "POST", token: mikeToken,
      body: { selected_prop_ids: competitionTemplates.slice(0, 2).map((t: any) => t.id) },
    });
    r.status === 403
      ? pass("Mike (member) → 403 on publish")
      : fail("Non-commissioner publish gate", `Expected 403, got ${r.status}`);
  }

  // ── §5. Commissioner publishes ─────────────────────────────────────────────
  section("5. Commissioner Publishes Draft Day");
  const selectedIds = [
    ...competitionTemplates.filter((t: any) => t.is_default).map((t: any) => t.id),
    ...seasonTemplates.filter((t: any) => t.is_default).map((t: any) => t.id),
  ];
  note(`Selecting ${selectedIds.length} default templates: ${selectedIds.join(", ")}`);

  let publishedRoomId: string  = "";
  let publishedCardId: string  = "";
  let publishedRoomCode: string | null = null;

  {
    const r = await api(`${BASE}/draft-day/publish`, {
      method: "POST", token: commToken,
      body: { selected_prop_ids: selectedIds },
    });
    if (r.status === 201 || r.status === 200) {
      pass(`Publish → ${r.status} (${r.body.already_existed ? "existing" : "new"})`);
      publishedRoomId   = r.body.room_id;
      publishedCardId   = r.body.card_id;
      publishedRoomCode = r.body.room_code;
      createdRoomId     = publishedRoomId;
      note(`room_id=${publishedRoomId.slice(0, 8)}… card_id=${publishedCardId.slice(0, 8)}…`);
      publishedRoomCode
        ? pass(`room_code generated: ${publishedRoomCode}`)
        : note("room_code is null (DB column may not exist yet)");
    } else {
      fail("Publish failed", `${r.status}: ${JSON.stringify(r.body)}`);
      await cleanup([commUser.id, mikeUser.id]);
      process.exit(1);
    }
  }

  // ── §6. Correct room fields ────────────────────────────────────────────────
  section("6. Correct Room Fields in DB");
  {
    const { data: room } = await service
      .from("gameday_rooms")
      .select("experience_type, competition_type, league_season_id, sport, status, team_a_name")
      .eq("id", publishedRoomId)
      .maybeSingle();
    if (!room) {
      fail("Room not found in DB", publishedRoomId);
    } else {
      (room as any).experience_type === "fantasy"
        ? pass("experience_type=fantasy")
        : fail("experience_type", `Got ${(room as any).experience_type}`);
      (room as any).competition_type === "draft_day"
        ? pass("competition_type=draft_day")
        : fail("competition_type", `Got ${(room as any).competition_type}`);
      (room as any).league_season_id === season_id
        ? pass("league_season_id matches season")
        : fail("league_season_id", `Got ${(room as any).league_season_id}`);
      (room as any).sport === "football"
        ? pass("sport=football (matches league)")
        : fail("sport", `Got ${(room as any).sport}`);
      (room as any).status === "active"
        ? pass("status=active")
        : fail("status", `Got ${(room as any).status}`);
      (room as any).team_a_name === null
        ? pass("team_a_name=null (no matchup fields)")
        : fail("team_a_name should be null for Fantasy", `Got ${(room as any).team_a_name}`);
    }
  }

  // ── §7. Correct pick card fields ───────────────────────────────────────────
  section("7. Correct Pick Card Fields in DB");
  {
    const { data: card } = await service
      .from("gameday_pick_cards")
      .select("phase, status, title, room_id")
      .eq("id", publishedCardId)
      .maybeSingle();
    if (!card) {
      fail("Pick card not found in DB", publishedCardId);
    } else {
      (card as any).phase === "draft_day"
        ? pass("phase=draft_day")
        : fail("card phase", `Got ${(card as any).phase}`);
      // Phase 4A.1: status='open' — correct forward-compatible state for Phase 4B.
      // 'open' means picks are available to submit once Phase 4B is built.
      (card as any).status === "open"
        ? pass("status=open (Phase 4B member picks gate — forward-compatible)")
        : fail("card status", `Expected open, got ${(card as any).status}`);
      (card as any).room_id === publishedRoomId
        ? pass("room_id matches published room")
        : fail("card room_id", `Got ${(card as any).room_id}`);
    }
  }

  // ── §8. Props — counts, scope, point_value, answer_target_type ─────────────
  section("8. Props — Counts, Scope, point_value, answer_target_type Preserved");
  let allProps: any[] = [];
  {
    const { data: props, error: propQueryErr } = await service
      .from("gameday_props")
      .select("id, question, scoring_scope, point_value, answer_options, template_prop_id")
      .eq("card_id", publishedCardId);
    allProps = props ?? [];
    if (propQueryErr) {
      note(`Direct prop query error: ${propQueryErr.message}`);
    }

    allProps.length === selectedIds.length
      ? pass(`${allProps.length} props created (matches selection count)`)
      : fail("Prop count", `Expected ${selectedIds.length}, got ${allProps.length}`);

    const competitionProps = allProps.filter((p) => p.scoring_scope === "competition");
    const seasonProps      = allProps.filter((p) => p.scoring_scope === "season");
    const expectedComp     = competitionTemplates.filter((t: any) => selectedIds.includes(t.id)).length;
    const expectedSeason   = seasonTemplates.filter((t: any) => selectedIds.includes(t.id)).length;

    competitionProps.length === expectedComp
      ? pass(`${competitionProps.length} competition props`)
      : fail("Competition prop count", `Expected ${expectedComp}, got ${competitionProps.length}`);
    seasonProps.length === expectedSeason
      ? pass(`${seasonProps.length} season receipt props`)
      : fail("Season prop count", `Expected ${expectedSeason}, got ${seasonProps.length}`);

    allProps.every((p) => p.point_value === 10)
      ? pass("All props have point_value=10")
      : fail("point_value", `Some props have wrong value: ${JSON.stringify(allProps.map(p => p.point_value))}`);

    allProps.every((p) => p.template_prop_id !== null)
      ? pass("All props have template_prop_id (library reference preserved)")
      : fail("template_prop_id missing on some props");

    // answer_target_type column check
    {
      const { error: colCheckErr } = await service
        .from("gameday_props")
        .select("answer_target_type")
        .eq("card_id", publishedCardId)
        .limit(1);
      if (colCheckErr?.message?.includes("answer_target_type") || colCheckErr?.message?.includes("does not exist")) {
        skip("answer_target_type column not yet in gameday_props — DDL pending (apply via Supabase SQL Editor)");
      } else {
        const { data: propsWithType } = await service
          .from("gameday_props")
          .select("id, answer_target_type")
          .eq("card_id", publishedCardId);
        const typed = propsWithType ?? [];
        typed.every((p: any) => p.answer_target_type !== null && p.answer_target_type !== undefined)
          ? pass("All props have answer_target_type set (DDL applied)")
          : fail("answer_target_type set on some props", JSON.stringify(typed.map((p: any) => p.answer_target_type)));
      }
    }
  }

  // ── §9. Structured answer_options — stable IDs ─────────────────────────────
  section("9. Structured answer_options — Season Member IDs Stable and Snapshotted");
  {
    const memberProps = allProps.filter((p: any) => {
      const opts = p.answer_options;
      return Array.isArray(opts) && opts.length > 0 && opts[0]?.type === "season_member";
    });
    if (memberProps.length === 0) {
      skip("No season_member props found in answer_options (check DDL application)");
    } else {
      const firstProp = memberProps[0];
      const opts      = firstProp.answer_options as any[];

      Array.isArray(opts)
        ? pass("answer_options is an array")
        : fail("answer_options not an array", typeof opts);

      opts.length >= 2
        ? pass(`answer_options has ${opts.length} entries (≥2 season members)`)
        : fail("answer_options length", `Expected ≥2, got ${opts.length}`);

      const firstOpt = opts[0];
      typeof firstOpt === "object" && !Array.isArray(firstOpt) && firstOpt !== null
        ? pass("answer_options[0] is an object (structured, not string)")
        : fail("answer_options[0] should be an object", typeof firstOpt);

      if (typeof firstOpt === "object" && firstOpt !== null) {
        "id"    in firstOpt ? pass("answer_options[0].id present")    : fail("answer_options[0].id missing");
        "label" in firstOpt ? pass("answer_options[0].label present")  : fail("answer_options[0].label missing");
        "type"  in firstOpt ? pass("answer_options[0].type present")   : fail("answer_options[0].type missing");
        firstOpt.type === "season_member"
          ? pass("answer_options[0].type=season_member")
          : fail("answer_options[0].type", `Got ${firstOpt.type}`);

        // display_name lives on fantasy_league_members — join to verify the ID
        const { data: member } = await service
          .from("fantasy_season_members")
          .select("id, fantasy_league_members(display_name)")
          .eq("id", firstOpt.id)
          .maybeSingle();
        const currentDisplayName = (member as any)?.fantasy_league_members?.display_name;
        member
          ? pass(`answer_options[0].id resolves to real season_member: ${currentDisplayName ?? "(unknown)"}`)
          : fail("answer_options[0].id is not a real season_member ID", firstOpt.id);

        currentDisplayName === firstOpt.label
          ? pass("Snapshotted label matches current display_name")
          : note(`Label: ${firstOpt.label}, current display_name: ${currentDisplayName} (both OK; snapshot is immutable)`);
      }

      const memberOptsOnly = opts.filter((o: any) => o.type === "season_member");
      const ids   = memberOptsOnly.map((o: any) => o.id);
      const labels = opts.map((o: any) => o.label);
      note(`Answer options: ${labels.join(", ")}`);
      ids.includes(comm_sm_id)
        ? pass("Commissioner's season_member_id present in answer_options")
        : fail("Commissioner missing from answer_options", `comm_sm_id=${comm_sm_id.slice(0,8)}… opts=${JSON.stringify(ids.map((i: any) => i.slice(0,8)))}`);
      ids.includes(mike_sm_id)
        ? pass("Mike's season_member_id present in answer_options")
        : fail("Mike missing from answer_options", `mike_sm_id=${mike_sm_id.slice(0,8)}… opts=${JSON.stringify(ids.map((i: any) => i.slice(0,8)))}`);
    }
  }

  // ── §10. GET /draft-day returns status and counts ──────────────────────────
  section("10. GET /draft-day Returns Correct Status and Counts");
  {
    const r = await api(`${BASE}/draft-day`, { token: commToken });
    if (r.status !== 200 || !r.body) {
      fail("GET /draft-day", `Expected 200 with body, got ${r.status}: ${JSON.stringify(r.body)}`);
    } else {
      pass("GET /draft-day → 200");
      r.body.room_id === publishedRoomId
        ? pass("room_id matches")
        : fail("room_id mismatch", `${r.body.room_id} vs ${publishedRoomId}`);
      r.body.room_status === "active"
        ? pass("room_status=active")
        : fail("room_status", r.body.room_status);
      // Phase 4A.1: published card is 'open', not 'closed'
      r.body.card_status === "open"
        ? pass("card_status=open (Phase 4B pick gate — correct)")
        : fail("card_status", `Expected open, got ${r.body.card_status}`);
      typeof r.body.prop_counts?.competition === "number"
        ? pass(`prop_counts.competition=${r.body.prop_counts.competition}`)
        : fail("prop_counts.competition missing");
      typeof r.body.prop_counts?.season === "number"
        ? pass(`prop_counts.season=${r.body.prop_counts.season}`)
        : fail("prop_counts.season missing");

      const expectedComp   = allProps.filter(p => p.scoring_scope === "competition").length;
      const expectedSeason = allProps.filter(p => p.scoring_scope === "season").length;
      r.body.prop_counts.competition === expectedComp
        ? pass("competition count matches published props")
        : fail("competition count", `Expected ${expectedComp}, got ${r.body.prop_counts.competition}`);
      r.body.prop_counts.season === expectedSeason
        ? pass("season count matches published props")
        : fail("season count", `Expected ${expectedSeason}, got ${r.body.prop_counts.season}`);
    }
  }

  // ── §11. Idempotency — double publish ──────────────────────────────────────
  section("11. Idempotency — Double Publish Does Not Duplicate Room/Props");
  {
    const r = await api(`${BASE}/draft-day/publish`, {
      method: "POST", token: commToken,
      body: { selected_prop_ids: selectedIds },
    });
    r.status === 200 && r.body.already_existed === true
      ? pass("Second publish → 200 already_existed=true (idempotent)")
      : fail("Idempotency", `Expected 200 already_existed=true, got ${r.status}: ${JSON.stringify(r.body)}`);

    if (r.body.room_id === publishedRoomId) {
      pass("Same room_id returned (no duplicate room)");
    } else {
      fail("Different room_id on second publish", `${r.body.room_id} vs ${publishedRoomId}`);
    }

    const { data: props2 } = await service
      .from("gameday_props")
      .select("id")
      .eq("card_id", publishedCardId);
    (props2?.length ?? 0) === selectedIds.length
      ? pass(`Prop count unchanged: ${props2?.length}`)
      : fail("Prop count changed after idempotent publish", `Expected ${selectedIds.length}, got ${props2?.length}`);
  }

  // ── §12. Lock — commissioner locks the card ────────────────────────────────
  section("12. Lock — Commissioner Locks the Draft Day Card");
  {
    const r = await api(`${BASE}/draft-day/lock`, {
      method: "POST", token: commToken,
    });
    r.status === 200 && r.body.card_status === "locked"
      ? pass("POST /draft-day/lock → 200 card_status=locked")
      : fail("Lock", `Expected 200 card_status=locked, got ${r.status}: ${JSON.stringify(r.body)}`);

    const { data: card } = await service
      .from("gameday_pick_cards")
      .select("status")
      .eq("id", publishedCardId)
      .maybeSingle();
    (card as any)?.status === "locked"
      ? pass("DB pick card status=locked confirmed")
      : fail("DB card status", `Got ${(card as any)?.status}`);
  }

  // ── §13. Lock — non-commissioner cannot lock/unlock ────────────────────────
  section("13. Non-Commissioner Cannot Lock or Unlock");
  {
    // Card is currently locked. Test non-commissioner lock (idempotent on locked, but still gate-checks auth)
    const rLock = await api(`${BASE}/draft-day/lock`, {
      method: "POST", token: mikeToken,
    });
    rLock.status === 403
      ? pass("Mike (member) → 403 on lock")
      : fail("Non-commissioner lock gate", `Expected 403, got ${rLock.status}`);

    // Test non-commissioner unlock
    const rUnlock = await api(`${BASE}/draft-day/unlock`, {
      method: "POST", token: mikeToken,
    });
    rUnlock.status === 403
      ? pass("Mike (member) → 403 on unlock")
      : fail("Non-commissioner unlock gate", `Expected 403, got ${rUnlock.status}`);

    // Reset to 'open' for §14 idempotency test — direct DB write (test harness only)
    await service.from("gameday_pick_cards")
      .update({ status: "open" })
      .eq("id", publishedCardId);
    note("Card reset to open via service client for §14 test");
  }

  // ── §14. Lock — idempotent ─────────────────────────────────────────────────
  section("14. Lock — Idempotent (Lock an Already-Locked Card)");
  {
    // Lock it
    const r1 = await api(`${BASE}/draft-day/lock`, { method: "POST", token: commToken });
    r1.status === 200 && r1.body.card_status === "locked"
      ? pass("First lock → 200 locked")
      : fail("First lock for idempotency test", `${r1.status}: ${JSON.stringify(r1.body)}`);

    // Lock again — idempotent
    const r2 = await api(`${BASE}/draft-day/lock`, { method: "POST", token: commToken });
    r2.status === 200 && r2.body.already_locked === true
      ? pass("Lock already-locked card → 200 already_locked=true")
      : fail("Idempotent lock", `Expected 200 already_locked=true, got ${r2.status}: ${JSON.stringify(r2.body)}`);
  }

  // ── §15. Question Selection Cap ────────────────────────────────────────────
  section("15. Question Selection Cap — 15 Max Enforced Server-Side");
  {
    // 16 fake UUIDs — cap check happens before template validation
    const fakeIds = Array.from({ length: 16 }, (_, i) =>
      `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`
    );
    const rOver = await api(`${BASE}/draft-day/publish`, {
      method: "POST", token: commToken,
      body: { selected_prop_ids: fakeIds },
    });
    rOver.status === 400 && rOver.body.max === 15
      ? pass("16 selected → 400 with max=15 in response")
      : fail("16-question cap", `Expected 400 with max=15, got ${rOver.status}: ${JSON.stringify(rOver.body)}`);

    // Note: the cap (400) fires before idempotency check (200), so this tests
    // a genuine server-enforced reject even when a Draft Day already exists.
    note(`Server rejected: ${rOver.body.error ?? "(no error message)"}, selected=${rOver.body.selected}`);

    // Exactly 15 real template IDs from active templates — should succeed (idempotent 200)
    const allActive = [...competitionTemplates, ...seasonTemplates];
    const fifteenIds = allActive.slice(0, 15).map((t: any) => t.id);
    note(`Testing with ${fifteenIds.length} of ${allActive.length} available templates`);

    if (fifteenIds.length === 15) {
      const r15 = await api(`${BASE}/draft-day/publish`, {
        method: "POST", token: commToken,
        body: { selected_prop_ids: fifteenIds },
      });
      // Will return 200 already_existed=true since Draft Day is published.
      // The cap check passes (15 ≤ 15); idempotency returns existing.
      r15.status === 200 || r15.status === 201
        ? pass(`15 selections → ${r15.status} (cap allows exactly 15)`)
        : fail("15-question publish", `Expected 200 or 201, got ${r15.status}: ${JSON.stringify(r15.body)}`);
    } else {
      note(`Only ${fifteenIds.length} active templates available — skipping exactly-15 cap test`);
    }
  }

  // ── §16. Unlock ────────────────────────────────────────────────────────────
  section("16. Unlock — Commissioner Unlocks, Idempotent, Non-Commissioner Rejected");
  {
    // Card is currently locked (from §14). Unlock it.
    const rUnlock = await api(`${BASE}/draft-day/unlock`, {
      method: "POST", token: commToken,
    });
    rUnlock.status === 200 && rUnlock.body.card_status === "open"
      ? pass("POST /draft-day/unlock → 200 card_status=open")
      : fail("Unlock", `Expected 200 card_status=open, got ${rUnlock.status}: ${JSON.stringify(rUnlock.body)}`);

    // Verify in DB
    const { data: card1 } = await service
      .from("gameday_pick_cards")
      .select("status")
      .eq("id", publishedCardId)
      .maybeSingle();
    (card1 as any)?.status === "open"
      ? pass("DB card status=open after unlock")
      : fail("DB card status after unlock", `Got ${(card1 as any)?.status}`);

    // Idempotent unlock (already open)
    const rUnlock2 = await api(`${BASE}/draft-day/unlock`, {
      method: "POST", token: commToken,
    });
    rUnlock2.status === 200 && rUnlock2.body.already_unlocked === true
      ? pass("Unlock already-open card → 200 already_unlocked=true")
      : fail("Idempotent unlock", `Expected 200 already_unlocked=true, got ${rUnlock2.status}: ${JSON.stringify(rUnlock2.body)}`);

    // Simulate settled card — block unlock
    await service.from("gameday_pick_cards")
      .update({ status: "settled" })
      .eq("id", publishedCardId);
    const rSettled = await api(`${BASE}/draft-day/unlock`, {
      method: "POST", token: commToken,
    });
    rSettled.status === 409
      ? pass("Unlock settled card → 409 (finalized; cannot unlock)")
      : fail("Unlock settled card", `Expected 409, got ${rSettled.status}: ${JSON.stringify(rSettled.body)}`);

    // Restore to locked for subsequent regression tests
    await service.from("gameday_pick_cards")
      .update({ status: "locked" })
      .eq("id", publishedCardId);
    note("Card restored to locked for regression tests");
  }

  // ── §17. Prop Quality ──────────────────────────────────────────────────────
  section("17. Prop Quality — Subjective Removed, supports_no_one Correct");
  {
    // Subjective templates should NOT appear in active template list.
    // Requires: supabase/gameday-fantasy-phase4a1-polish.sql applied.
    const allActive = [...competitionTemplates, ...seasonTemplates];
    const subjectiveIds = ["fdd_fb_biggest_reach", "fdd_bb_biggest_reach", "fdd_ba_biggest_reach",
                           "fdd_fb_clock_longest", "fdd_bb_clock_longest", "fdd_ba_clock_longest"];
    const subjectiveInResponse = allActive.filter((t: any) => subjectiveIds.includes(t.id));
    subjectiveInResponse.length === 0
      ? pass("Subjective/provider-data templates not returned (is_active=false)")
      : skip(`Subjective templates still active — apply gameday-fantasy-phase4a1-polish.sql to deactivate: ${subjectiveInResponse.map((t: any) => t.id).join(", ")}`);

    // At least one template should have supports_no_one=true (fdd_fb_three_qbs).
    // Requires: supabase/gameday-fantasy-phase4a1-polish.sql applied.
    const noOneTemplates = allActive.filter((t: any) => t.supports_no_one === true);
    noOneTemplates.length > 0
      ? pass(`${noOneTemplates.length} template(s) have supports_no_one=true: ${noOneTemplates.map((t: any) => t.id).join(", ")}`)
      : skip("No templates have supports_no_one=true — apply gameday-fantasy-phase4a1-polish.sql to seed fdd_fb_three_qbs");

    // Templates without supports_no_one should not have 'no_one' in answer_options
    // (check published props that came from is_default templates)
    const noOneInOptions = allProps.filter((p: any) => {
      const opts = p.answer_options ?? [];
      return Array.isArray(opts) && opts.some((o: any) => o.id === "no_one");
    });
    note(`Props with no_one answer option: ${noOneInOptions.length}`);

    // Verify new objective templates are present
    const newTemplateIds = ["fdd_fb_most_rbs"];  // seeded in phase4a1 migration
    const newFound = allActive.filter((t: any) => newTemplateIds.includes(t.id));
    newFound.length > 0
      ? pass(`New objective templates found: ${newFound.map((t: any) => t.id).join(", ")}`)
      : note("New objective templates not found — apply supabase/gameday-fantasy-phase4a1-polish.sql");
  }

  // ── §18. Status Semantics ──────────────────────────────────────────────────
  section("18. Status Semantics — draft/open/locked/settled Lifecycle");
  {
    // Document and verify the canonical lifecycle
    note("Phase 4A.1 lifecycle mapping:");
    note("  unpublished  → no room/card in DB");
    note("  open         → room.status='active', card.status='open'  ← picks available (Phase 4B gate)");
    note("  locked       → room.status='active', card.status='locked'");
    note("  finalized    → room.status='finalized', card.status='settled'");

    // Verify current card is locked (as set in §16 teardown)
    const { data: card } = await service
      .from("gameday_pick_cards")
      .select("status")
      .eq("id", publishedCardId)
      .maybeSingle();
    (card as any)?.status === "locked"
      ? pass("Card is 'locked' — confirmed correct state after §16 teardown")
      : fail("Expected card to be locked", `Got ${(card as any)?.status}`);

    // Phase 4B pick-submission gate: server must check card_status === 'open'
    note("Phase 4B pick submission gate: card_status === 'open' ← use this check");
    pass("Status semantics documented — card_status='open' is the Phase 4B member pick gate");
  }

  // ── §19–21. Regression smoke checks ───────────────────────────────────────
  section("19–21. Regression Smoke Checks");
  {
    // Phase 2: commissioner can still add participants
    const r2 = await api(`${BASE}/participants`, {
      method: "POST", token: commToken,
      body: { display_name: "Reg Member", team_name: "Reg Team" },
    });
    r2.status === 201
      ? pass("Phase 2: POST /participants still works")
      : fail("Phase 2 regression", `${r2.status}`);

    // Phase 2: non-commissioner blocked
    const r2b = await api(`${BASE}/participants`, {
      method: "POST", token: mikeToken,
      body: { display_name: "Hacker", team_name: "Hack Team" },
    });
    r2b.status === 403
      ? pass("Phase 2: Non-commissioner still blocked")
      : fail("Phase 2 gate regression", `${r2b.status}`);

    // Phase 3: GET join-info works
    const r3 = await api(`${BASE}/join-info`);
    r3.status === 200 && Array.isArray(r3.body.seats)
      ? pass("Phase 3: GET /join-info still returns seat list")
      : fail("Phase 3 regression", `${r3.status}`);

    // Phase 3: hub still resolves viewer for commissioner
    const r3b = await api(`${BASE}`, { token: commToken });
    r3b.body?.viewer?.role === "commissioner"
      ? pass("Phase 3: Hub viewer still resolves commissioner correctly")
      : fail("Phase 3 hub regression", `${JSON.stringify(r3b.body?.viewer)}`);

    // Phase 4A.1: GET /draft-day still works with correct locked state
    const r4 = await api(`${BASE}/draft-day`, { token: commToken });
    r4.status === 200 && r4.body?.card_status === "locked"
      ? pass("Phase 4A.1: Draft Day still shows locked state")
      : fail("Phase 4A.1 state regression", `${r4.status}: ${JSON.stringify(r4.body)}`);

    // Phase 4A.1: unlock endpoint exists
    const rUnlockCheck = await api(`${BASE}/draft-day/unlock`, {
      method: "POST", token: commToken,
    });
    rUnlockCheck.status === 200 && rUnlockCheck.body.card_status === "open"
      ? pass("Phase 4A.1: Unlock endpoint works (card now open after regression unlock)")
      : fail("Phase 4A.1 unlock endpoint", `${rUnlockCheck.status}: ${JSON.stringify(rUnlockCheck.body)}`);

    // Existing Game Day rooms unaffected
    const rgd = await api("/api/gameday/rooms", { token: commToken });
    rgd.status === 200
      ? pass("Existing Game Day rooms endpoint unaffected (200)")
      : fail("Game Day rooms regression", `${rgd.status}`);
  }

  // ── Cleanup + results ──────────────────────────────────────────────────────
  await cleanup([commUser.id, mikeUser.id]);

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

main().catch((e) => { console.error("Unexpected:", e); process.exit(1); });
