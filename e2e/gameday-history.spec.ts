import { test, expect, type Page } from "@playwright/test";

// UI-only fixtures: intercept every identity/API call. No real identity,
// competition, result or participant is created or changed.
const uid = "00000000-0000-4000-8000-000000000123";
function historyRecord(id: string, pending = false) {
  return {
    room: { room_id: id, room_code: `GDS-${id}`, room_name: "Week 5 Parlay",
      team_a_name: "Knicks", team_b_name: "Spurs", game_date: "2026-06-13",
      created_at: "2026-06-12T12:00:00Z", source: "app", community_context: null,
      sport: "nba", template_type: null, status: "finalized", archived: id === "ARCHIVE", is_private: true },
    state: pending ? "results_pending" : "final", participant_count: 3,
    participant: { participant_id: "mine", display_name: "Fixture Player", game_day_sp: 10,
      correct_picks: 1, pending_picks: pending ? 1 : 0, total_picks: 2, submitted_picks: 2,
      rank: pending ? null : 1, is_winner: !pending },
    scoring: { format: "standard_game_day", win_condition: "most_correct_ties_share_first",
      unit: "SP", points_per_correct_main_pick: 10, scored_prop_count: 2, all_scoring_props_settled: !pending },
    final_standings: pending ? null : [
      { participant_id: "mine", display_name: "Fixture Player", rank: 1, game_day_sp: 10, correct_picks: 1, pending_picks: 0, total_picks: 2, is_winner: true },
      { participant_id: "other", display_name: "Other Player", rank: 1, game_day_sp: 10, correct_picks: 1, pending_picks: 0, total_picks: 2, is_winner: true },
      { participant_id: "third", display_name: "Third Player", rank: 3, game_day_sp: 0, correct_picks: 0, pending_picks: 0, total_picks: 2, is_winner: false },
    ],
    cards: [{ card_id: "pregame", title: "Pregame Picks", phase: "pregame", status: pending ? "locked" : "settled", display_order: 0,
      props: [
        { prop_id: "p1", question: "Who wins?", answer_options: ["Knicks", "Spurs"], prop_role: "main_matchup", answer_type: "choice", status: "settled",
          correct_answers: { answer_ids: ["Knicks"], numeric_answer: null },
          own_pick: { selected_answer: "Knicks", numeric_answer: null, outcome: "correct" } },
        { prop_id: "p2", question: "Final scoring leader?", answer_options: ["Brunson", "Wembanyama"], prop_role: "main_matchup", answer_type: "choice", status: pending ? "pending" : "settled",
          correct_answers: pending ? null : { answer_ids: ["Wembanyama"], numeric_answer: null },
          own_pick: { selected_answer: "Brunson", numeric_answer: null, outcome: pending ? "pending" : "incorrect" } },
      ] }],
  };
}
const records = [historyRecord("ARCHIVE"), historyRecord("OTHER"), historyRecord("PARTIAL", true)];

async function setup(page: Page, options: { anonymous?: boolean; empty?: boolean; error?: boolean; many?: boolean } = {}) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  test.skip(!url, "Public Supabase configuration required");
  const storageKey = `sb-${new URL(url!).hostname.split(".")[0]}-auth-token`;
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const user = { id: uid, aud: "authenticated", role: "authenticated", email: "history-fixture@example.invalid",
    app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const session = { access_token: `${encode({ alg: "HS256" })}.${encode({ sub: uid, exp })}.fixture`,
    refresh_token: "fixture-not-a-credential", expires_at: exp, expires_in: 3600, token_type: "bearer", user };
  const mutations: string[] = [];
  await page.route("**/*.supabase.co/**", async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path.endsWith("/profiles") ? {
      id: uid, username: "history_fixture", display_name: "Fixture Player", created_at: user.created_at,
    } : path.endsWith("/user") ? user : [] });
  });
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/gameday/") && req.method() !== "GET") mutations.push(`${req.method()} ${path}`);
    if (path.includes("/my-history")) {
      if (options.error) return route.fulfill({ status: 500, json: { error: "Could not load Game Day history" } });
      if (options.anonymous) return route.fulfill({ status: 401, json: { error: "Unauthorized" } });
      const ref = path.split("/my-history/")[1];
      if (ref) {
        const record = records.find(r => r.room.room_id === ref);
        return route.fulfill(record ? { json: { record } } : { status: 404, json: { error: "History record not found" } });
      }
      return route.fulfill({ json: { records: options.empty ? [] : options.many
        ? [...records, ...Array.from({ length: 9 }, (_, i) => historyRecord(`OLDER-${i}`))]
        : records } });
    }
    await route.fulfill({ json: path.endsWith("/my-rooms") ? { rooms: [{
      room_id: "active", room_code: "GDS-ACTIVE", room_name: "Active Fixture", sport: "nba", game_date: "2026-11-12",
    }] } : path.endsWith("/is-host") ? { isHost: true } : { rooms: [], leagues: [], leaderboard: [], balance: 100 } });
  });
  await page.addInitScript(({ storageKey, session, anonymous }) => {
    if (!anonymous) localStorage.setItem(storageKey, JSON.stringify(session));
  }, { storageKey, session, anonymous: options.anonymous });
  return mutations;
}

test("dashboard retains active play and shows distinct recent history without live public rooms", async ({ page }) => {
  const mutations = await setup(page);
  await page.goto("/");
  await expect(page.getByText("CONTINUE GAME DAYS", { exact: true })).toBeVisible();
  await expect(page.getByText("Active Fixture", { exact: true })).toBeVisible();
  await expect(page.getByText(/Recent Game Days/i).first()).toBeVisible();
  await expect(page.getByText("Week 5 Parlay", { exact: true })).toHaveCount(3);
  await page.getByText("View All History", { exact: true }).click();
  await expect(page).toHaveURL(/\/gameday\/history\/?$/);
  // Expo keeps the previous stack screen mounted but hidden.
  await expect(page.getByText(/GDS-ARCHIVE/).last()).toBeVisible();
  await expect(page.getByText(/GDS-OTHER/).last()).toBeVisible();
  expect(mutations).toEqual([]);
});

for (const width of [320, 390, 1440]) {
  test(`archived receipt is read-only with shared ranks at ${width}px`, async ({ page }) => {
    const mutations = await setup(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/gameday/history/ARCHIVE");
    await expect(page.getByText(/co.winner/i).first()).toBeVisible();
    await expect(page.getByText("Other Player", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Third Player", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Pregame Picks", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Who wins?", { exact: true })).toBeVisible();
    await expect(page.getByText("#1", { exact: true })).toHaveCount(3);
    await expect(page.getByText("#3", { exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `generated-artifacts/history/final-${width}.png`, fullPage: true });
    await page.getByText("Share this result", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `generated-artifacts/history/picks-${width}.png` });
    expect(mutations).toEqual([]);
  });
}

test("pending results show own picks without revealing unsettled answers or final standings", async ({ page }) => {
  const mutations = await setup(page);
  await page.goto("/gameday/history/PARTIAL");
  await expect(page.getByText(/Results Pending/i).first()).toBeVisible();
  await expect(page.getByText(/Brunson/).first()).toBeVisible();
  await expect(page.getByText(/Wembanyama/)).toHaveCount(0);
  await expect(page.getByText("Other Player", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/co.winner/i)).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test("unknown private result shows no participant data", async ({ page }) => {
  await setup(page);
  await page.goto("/gameday/history/UNOWNED");
  await expect(page.getByText("Receipt unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("Fixture Player", { exact: true })).toHaveCount(0);
});

test("signed-out history never fetches or displays an account receipt", async ({ page }) => {
  await setup(page, { anonymous: true });
  await page.goto("/gameday/history/ARCHIVE");
  await expect(page.getByText(/Sign in/i).first()).toBeVisible();
  await expect(page.getByText("Week 5 Parlay", { exact: true })).toHaveCount(0);
});

test("empty list is clear", async ({ page }) => {
  await setup(page, { empty: true });
  await page.goto("/gameday/history");
  await expect(page.getByText(/no .*history|no .*game days|no .*results|your .*history.*appear/i).first()).toBeVisible();
});

test("failed list offers a retry rather than a false empty state", async ({ page }) => {
  await setup(page, { error: true });
  await page.goto("/gameday/history");
  await expect(page.getByText(/retry|try again/i).first()).toBeVisible({ timeout: 20000 });
});

test("older records load incrementally without dropping same-title competitions", async ({ page }) => {
  await setup(page, { many: true });
  await page.goto("/gameday/history");
  await expect(page.getByText("Week 5 Parlay", { exact: true })).toHaveCount(10);
  await page.getByText("Load older Game Days", { exact: true }).click();
  await expect(page.getByText("Week 5 Parlay", { exact: true })).toHaveCount(12);
});

test("Continue Playing still opens the existing room link", async ({ page }) => {
  await setup(page);
  await page.goto("/");
  await page.getByText("Active Fixture", { exact: true }).click();
  await expect(page).toHaveURL(/\/(?:g\/GDS-ACTIVE|gameday\/)/);
});

test("existing host management remains separate from participant history", async ({ page }) => {
  await setup(page);
  await page.goto("/profile");
  await page.getByText("Manage Game Day Rooms", { exact: true }).click();
  await expect(page).toHaveURL(/\/gameday$/);
  await expect(page.getByText("Create Room", { exact: true }).or(page.getByText(/New .*Room/i)).first()).toBeVisible();
});

test("320px recent cards and full list stay readable without horizontal overflow", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page.getByText("Recent Game Days", { exact: true }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "generated-artifacts/history/recent-320.png" });
  await page.getByText("View All History", { exact: true }).click();
  await expect(page.getByText(/GDS-ARCHIVE/).last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "generated-artifacts/history/list-320.png" });
});
