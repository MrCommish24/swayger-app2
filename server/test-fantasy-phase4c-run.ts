/**
 * server/test-fantasy-phase4c-run.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Self-contained bootstrap + Phase 4C test runner.
 *
 * Creates a fresh fixture (commissioner, member Darius, guest Mike), publishes
 * a locked Draft Day with competition props that use NON-10 point values (5, 15,
 * 25) to prove SUM(point_value) scoring, then spawns test-fantasy-phase4c.ts.
 *
 * Run: npx tsx server/test-fantasy-phase4c-run.ts
 */

import { createClient } from "@supabase/supabase-js";
import { execSync }     from "child_process";

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL = process.env.TEST_API_URL ?? "http://localhost:5000";
const SUP_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUP_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const RUN_ID   = Math.random().toString(36).slice(2, 10).toUpperCase();
const PW       = `QA_p4c_${RUN_ID}!`;

const PASS = "\x1b[32m  ✅ \x1b[0m";
const FAIL = "\x1b[31m  ❌ \x1b[0m";
const INFO = "\x1b[36m  ℹ  \x1b[0m";

let totalFail = 0;
function pass(msg: string) { console.log(PASS + msg); }
function fail(msg: string, d = "") {
  totalFail++;
  console.error(FAIL + msg);
  if (d) console.error(`     ↳ ${d}`);
}
function note(msg: string) { console.log(INFO + msg); }

// ── Supabase admin client ─────────────────────────────────────────────────────
const service = createClient(SUP_URL, SUP_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function api(
  path: string,
  opts: {
    method?: string;
    token?: string;
    guestToken?: string;
    body?: object;
    extra?: Record<string, string>;
  } = {}
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token)     headers["Authorization"]          = `Bearer ${opts.token}`;
  if (opts.guestToken) headers["x-fantasy-guest-token"] = opts.guestToken;
  if (opts.extra)     Object.assign(headers, opts.extra);
  const res = await fetch(`${BASE_URL}${path}`, {
    method:  opts.method ?? "GET",
    headers,
    body:    opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let body: any = {};
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}

// ── User management ───────────────────────────────────────────────────────────
async function createUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `qa-p4c-${tag}-${RUN_ID}@swayger-test.invalid`;
  const { data, error } = await service.auth.admin.createUser({
    email, password: PW, email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser(${tag}): ${error?.message}`);
  return { id: data.user.id, email };
}
async function signIn(email: string): Promise<string> {
  const { data, error } = await service.auth.signInWithPassword({ email, password: PW });
  if (error || !data.session) throw new Error(`signIn(${email}): ${error?.message}`);
  return data.session.access_token;
}
async function deleteUser(id: string) {
  await service.auth.admin.deleteUser(id);
}

// ── Main bootstrap ────────────────────────────────────────────────────────────
async function bootstrap() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║   SWAYGER FANTASY PHASE 4C — Bootstrap + Test Runner     ║
║   Run ID: ${RUN_ID.padEnd(46)}║
╚══════════════════════════════════════════════════════════╝`);

  // Validate env
  if (!SUP_URL || !SUP_KEY) {
    console.error(FAIL + "EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    process.exit(1);
  }

  // ── 1. Create users ─────────────────────────────────────────────────────────
  note("Creating test users…");
  let commUser:   { id: string; email: string };
  let dariusUser: { id: string; email: string };
  let mikeUser:   { id: string; email: string };
  let commToken:   string;
  let dariusToken: string;

  try {
    [commUser, dariusUser, mikeUser] = await Promise.all([
      createUser("comm"),
      createUser("darius"),
      createUser("mike"),
    ]);
    [commToken, dariusToken] = await Promise.all([
      signIn(commUser.email),
      signIn(dariusUser.email),
    ]);
    pass(`Users created: comm=${commUser.id.slice(0,8)}… darius=${dariusUser.id.slice(0,8)}… mike=${mikeUser.id.slice(0,8)}…`);
  } catch (e: any) {
    fail("User creation failed", e.message);
    process.exit(1);
  }

  const createdUserIds = [commUser.id, dariusUser.id, mikeUser.id];

  async function cleanup() {
    note("Cleaning up test users…");
    for (const id of createdUserIds) {
      try { await deleteUser(id); } catch {}
    }
  }

  // ── 2. Create league + season ───────────────────────────────────────────────
  note("Creating league + season…");
  let leagueId  = "";
  let seasonId  = "";
  let commSmId  = "";  // commissioner season_member_id

  {
    const r = await api("/api/fantasy/leagues/setup", {
      method: "POST",
      token:  commToken,
      body: {
        league_name:        `Phase4C-League-${RUN_ID}`,
        sport:              "football",
        display_name:       "Commissioner",
        team_name:          "The Bosses",
        season_year:        2026,
        reward_description: "QA Test Prize",
      },
    });
    if (r.status !== 201) {
      fail("League setup failed", `${r.status}: ${JSON.stringify(r.body)}`);
      await cleanup();
      process.exit(1);
    }
    leagueId = r.body.league_id;
    seasonId = r.body.season_id;
    commSmId = r.body.season_member_id;
    pass(`League created: leagueId=${leagueId.slice(0,8)}… seasonId=${seasonId.slice(0,8)}…`);
  }

  const BASE = `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}`;

  // ── 3. Add Darius + Mike as participants ────────────────────────────────────
  note("Adding participants…");
  let dariusLmId = "";
  let mikeLmId   = "";

  {
    const [rd, rm] = await Promise.all([
      api(`${BASE}/participants`, {
        method: "POST", token: commToken,
        body: { display_name: "Darius", team_name: "The Swaygers" },
        extra: { "Idempotency-Key": `p4c-darius-${RUN_ID}` },
      }),
      api(`${BASE}/participants`, {
        method: "POST", token: commToken,
        body: { display_name: "Mike", team_name: "Sunday Scaries" },
        extra: { "Idempotency-Key": `p4c-mike-${RUN_ID}` },
      }),
    ]);
    if (rd.status === 201) {
      dariusLmId = rd.body.league_member_id;
      pass(`Darius added: lmId=${dariusLmId.slice(0,8)}…`);
    } else {
      fail("Add Darius participant", `${rd.status}: ${JSON.stringify(rd.body)}`);
    }
    if (rm.status === 201) {
      mikeLmId = rm.body.league_member_id;
      pass(`Mike added: lmId=${mikeLmId.slice(0,8)}…`);
    } else {
      fail("Add Mike participant", `${rm.status}: ${JSON.stringify(rm.body)}`);
    }
  }

  // ── 4. Darius claims his seat ───────────────────────────────────────────────
  note("Darius claiming seat…");
  {
    const r = await api(`${BASE}/claim`, {
      method: "POST", token: dariusToken,
      body: { league_member_id: dariusLmId },
    });
    if (r.status === 201 || r.status === 200) {
      pass("Darius claimed seat");
    } else {
      fail("Darius seat claim", `${r.status}: ${JSON.stringify(r.body)}`);
    }
  }

  // ── 5. Mike claims seat with guest token ────────────────────────────────────
  const MIKE_GUEST_TOKEN = `fgt_p4c_${RUN_ID.toLowerCase()}mike0000`;
  note(`Mike claiming seat as guest (token=${MIKE_GUEST_TOKEN})…`);
  {
    const r = await api(`${BASE}/claim`, {
      method: "POST",
      guestToken: MIKE_GUEST_TOKEN,
      body: { league_member_id: mikeLmId },
    });
    if (r.status === 201 || r.status === 200) {
      pass("Mike claimed seat as guest");
    } else {
      fail("Mike guest seat claim", `${r.status}: ${JSON.stringify(r.body)}`);
    }
  }

  // ── 6. Fetch templates ──────────────────────────────────────────────────────
  note("Fetching Draft Day templates…");
  let compTemplates: any[] = [];
  let seasonTemplates: any[] = [];

  {
    const r = await api(`${BASE}/draft-day/templates`, { token: commToken });
    if (r.status === 200) {
      compTemplates   = r.body.competition ?? [];
      seasonTemplates = r.body.season ?? [];
      pass(`Templates: ${compTemplates.length} competition, ${seasonTemplates.length} season`);
    } else {
      fail("Fetch templates", `${r.status}: ${JSON.stringify(r.body)}`);
      await cleanup();
      process.exit(1);
    }
  }

  if (compTemplates.length < 3) {
    fail("Need ≥3 competition templates to guarantee non-10 point_value proof", `Got ${compTemplates.length}`);
    await cleanup();
    process.exit(1);
  }
  if (seasonTemplates.length < 1) {
    fail("Need ≥1 season template for late-settlement §34 test", `Got ${seasonTemplates.length}`);
    await cleanup();
    process.exit(1);
  }

  // ── 7. Publish Draft Day ────────────────────────────────────────────────────
  note("Publishing Draft Day…");
  // Select first 3 competition templates + first season template
  const selectedCompIds   = compTemplates.slice(0, 3).map((t: any) => t.id);
  const selectedSeasonIds = seasonTemplates.slice(0, 1).map((t: any) => t.id);
  const selectedIds       = [...selectedCompIds, ...selectedSeasonIds];
  note(`Selecting template IDs: ${selectedIds.join(", ")}`);

  let publishedCardId = "";

  {
    const r = await api(`${BASE}/draft-day/publish`, {
      method: "POST", token: commToken,
      body: { selected_prop_ids: selectedIds },
    });
    if (r.status === 201 || r.status === 200) {
      publishedCardId = r.body.card_id;
      pass(`Draft Day published: cardId=${publishedCardId.slice(0,8)}…`);
    } else {
      fail("Publish Draft Day", `${r.status}: ${JSON.stringify(r.body)}`);
      await cleanup();
      process.exit(1);
    }
  }

  // ── 8. Set non-10 point values on the 3 competition props ──────────────────
  // This proves that scoring uses SUM(point_value), not correct_count × 10.
  note("Setting competition prop point_values to 5, 15, 25…");
  const NON_10_VALUES = [5, 15, 25];

  {
    // Get the competition props for this card
    const { data: compProps, error } = await service
      .from("gameday_props")
      .select("id, scoring_scope, point_value")
      .eq("card_id", publishedCardId)
      .eq("scoring_scope", "competition")
      .order("created_at", { ascending: true });

    if (error || !compProps || compProps.length < 3) {
      fail("Fetch competition props for point_value update", error?.message ?? `Got ${compProps?.length}`);
      await cleanup();
      process.exit(1);
    }

    for (let i = 0; i < Math.min(3, compProps.length); i++) {
      const { error: upErr } = await service
        .from("gameday_props")
        .update({ point_value: NON_10_VALUES[i] })
        .eq("id", compProps[i].id);
      if (upErr) {
        fail(`Update point_value for prop ${i+1}`, upErr.message);
      } else {
        pass(`Prop ${i+1}: point_value set to ${NON_10_VALUES[i]}`);
      }
    }
  }

  // ── 9. Darius makes picks ───────────────────────────────────────────────────
  note("Darius entering play and making picks…");
  {
    // Create participant + get props
    const playR = await api(`${BASE}/draft-day/play`, { token: dariusToken });
    if (playR.status !== 200) {
      fail("Darius GET /play", `${playR.status}: ${JSON.stringify(playR.body)}`);
    } else {
      pass(`Darius play state: ${playR.body.props?.length ?? 0} props`);
      const props = (playR.body.props ?? []) as any[];
      // Pick first answer option for every prop
      for (const prop of props) {
        const firstOptionId = prop.answer_options?.[0]?.id;
        if (!firstOptionId) continue;
        const pickR = await api(`${BASE}/draft-day/picks`, {
          method: "POST", token: dariusToken,
          body: { prop_id: prop.id, selected_answer: firstOptionId },
        });
        if (pickR.status === 200) {
          pass(`Darius picked prop ${prop.id.slice(0,8)}… → ${firstOptionId.slice(0,8)}…`);
        } else {
          fail(`Darius pick for prop ${prop.id.slice(0,8)}…`, `${pickR.status}: ${JSON.stringify(pickR.body)}`);
        }
      }
    }
  }

  // ── 10. Mike (guest) makes picks ────────────────────────────────────────────
  note("Mike (guest) entering play and making picks…");
  {
    const playR = await api(`${BASE}/draft-day/play`, { guestToken: MIKE_GUEST_TOKEN });
    if (playR.status !== 200) {
      fail("Mike GET /play", `${playR.status}: ${JSON.stringify(playR.body)}`);
    } else {
      pass(`Mike play state: ${playR.body.props?.length ?? 0} props`);
      const props = (playR.body.props ?? []) as any[];
      // Pick second answer option where available (so Mike may get different results)
      for (const prop of props) {
        const opts = prop.answer_options ?? [];
        const optionId = (opts.length > 1 ? opts[1] : opts[0])?.id;
        if (!optionId) continue;
        const pickR = await api(`${BASE}/draft-day/picks`, {
          method: "POST",
          guestToken: MIKE_GUEST_TOKEN,
          body: { prop_id: prop.id, selected_answer: optionId },
        });
        if (pickR.status === 200) {
          pass(`Mike picked prop ${prop.id.slice(0,8)}… → ${optionId.slice(0,8)}…`);
        } else {
          fail(`Mike pick for prop ${prop.id.slice(0,8)}…`, `${pickR.status}: ${JSON.stringify(pickR.body)}`);
        }
      }
    }
  }

  // ── 11. Lock the Draft Day ──────────────────────────────────────────────────
  note("Locking Draft Day…");
  {
    const r = await api(`${BASE}/draft-day/lock`, { method: "POST", token: commToken });
    if (r.status === 200) {
      pass("Draft Day locked");
    } else {
      fail("Lock Draft Day", `${r.status}: ${JSON.stringify(r.body)}`);
      await cleanup();
      process.exit(1);
    }
  }

  // ── 12. Verify fixture state ─────────────────────────────────────────────────
  note("Verifying fixture state (locked, active)…");
  {
    const r = await api(`${BASE}/draft-day`, { token: commToken });
    if (r.status === 200) {
      const ok = r.body.card_status === "locked" && r.body.room_status === "active";
      ok
        ? pass(`Fixture ready: card_status=${r.body.card_status} room_status=${r.body.room_status}`)
        : fail("Fixture state", `Expected locked+active, got card=${r.body.card_status} room=${r.body.room_status}`);
    } else {
      fail("Verify fixture state", `${r.status}: ${JSON.stringify(r.body)}`);
    }
  }

  if (totalFail > 0) {
    console.error(`\n${FAIL}Bootstrap had ${totalFail} error(s). Aborting Phase 4C tests.\n`);
    await cleanup();
    process.exit(1);
  }

  // ── 13. Emit env summary ─────────────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════════════════════╗
║   Bootstrap Complete — Fixture Ready                     ║
╚══════════════════════════════════════════════════════════╝
  League ID  : ${leagueId}
  Season ID  : ${seasonId}
  Commissioner token (first 20): ${commToken.slice(0, 20)}…
  Darius token (first 20)      : ${dariusToken.slice(0, 20)}…
  Mike guest token             : ${MIKE_GUEST_TOKEN}
  Point values                 : 5, 15, 25 (competition); 10 (season)
`);

  // ── 14. Run Phase 4C test suite ──────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════════════════════╗
║   Running Phase 4C Test Suite                            ║
╚══════════════════════════════════════════════════════════╝`);

  const env = {
    ...process.env,
    TEST_API_BASE:             BASE_URL,
    TEST_COMMISSIONER_TOKEN:   commToken,
    TEST_MEMBER_TOKEN_DARIUS:  dariusToken,
    TEST_GUEST_TOKEN_MIKE:     MIKE_GUEST_TOKEN,
    TEST_LEAGUE_ID:            leagueId,
    TEST_SEASON_ID:            seasonId,
    TEST_COMP_POINT_VALUES:    "5,15,25",
  };

  let exitCode = 0;
  try {
    execSync(`npx tsx server/test-fantasy-phase4c.ts`, {
      env,
      stdio: "inherit",
      cwd: process.cwd(),
    });
  } catch (e: any) {
    exitCode = e.status ?? 1;
  }

  // ── 15. Cleanup ──────────────────────────────────────────────────────────────
  await cleanup();

  console.log(`\n${exitCode === 0 ? PASS : FAIL} Phase 4C runner finished (exit ${exitCode})\n`);
  process.exit(exitCode);
}

bootstrap().catch((e) => {
  console.error(FAIL + "Unexpected bootstrap error:", e.message);
  process.exit(1);
});
