import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

// Browser-only identity and API fixtures; never create accounts or write competitions.
async function member(page: Page, empty = false, host = false) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  test.skip(!url, "Public Supabase configuration required for session namespace");
  const id = "00000000-0000-4000-8000-000000000123";
  const user = { id, aud: "authenticated", role: "authenticated",
    email: "navigation-fixture@example.invalid", app_metadata: { provider: "email" },
    user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const encode = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = { access_token: `${encode({ alg: "HS256" })}.${encode({ sub: id, exp })}.fixture`,
    refresh_token: "fixture-only-not-a-credential", expires_at: exp, expires_in: 3600,
    token_type: "bearer", user };
  await page.route("**/*.supabase.co/**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith("/profiles") ? {
      ...user, username: "navigation_fixture", display_name: "Navigation Fixture", swayger_points: 100,
    } : path.endsWith("/user") ? user : [] });
  });
  const mutations: string[] = [];
  await page.route("**/api/**", route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    // Existing automatic push tagging is also fulfilled locally, not a gameplay write.
    if (req.method() !== "GET" && path !== "/api/push/tag-user") mutations.push(`${req.method()} ${path}`);
    const rooms = path.endsWith("/public-rooms") ? (empty ? [] : [{
      id: "layout-room", room_name: "Preview layout fixture", team_a_name: "Home",
      team_b_name: "Away", game_date: null, status: "active", room_code: "LAYOUT",
    }]) : path.endsWith("/my-rooms") ? [{
      room_id: "resume-room", room_name: "Resume fixture", room_code: "RESUME",
      sport: "madden", template_type: "madden_weekly_pick_card", game_date: null,
    }] : [];
    return route.fulfill({ json: { rooms, records: [], leagues: empty ? [] : [{
      id: "league-fixture", league_name: "Preview League", sport: "nfl",
      fantasy_league_seasons: [{ id: "season-fixture", season_year: 2026 }],
    }], leaderboard: [], balance: 100, isHost: host } });
  });
  await page.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session));
    // This fixture already reviewed the unrelated one-time app feedback prompt.
    localStorage.setItem("@swayger/app_feedback_prompt_v1", "1");
  },
    { key: `sb-${new URL(url!).hostname.split(".")[0]}-auth-token`, session });
  return mutations;
}

for (const width of [320, 390, 1440]) {
  test(`signed-in peer navigation and shared headers at ${width}px`, async ({ page }) => {
    const mutations = await member(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const ways = page.getByTestId("ways-to-play");
    await expect(ways).toBeVisible();
    const game = page.getByTestId("way-game-day");
    const one = page.getByTestId("way-1v1");
    const fantasy = page.getByTestId("way-fantasy");
    const boxes = await Promise.all([game, one, fantasy].map(el => el.boundingBox()));
    expect(boxes.every(Boolean)).toBe(true);
    expect(Math.max(...boxes.map(b => b!.y)) - Math.min(...boxes.map(b => b!.y))).toBeLessThan(2);
    expect(Math.max(...boxes.map(b => b!.width)) - Math.min(...boxes.map(b => b!.width))).toBeLessThan(2);
    for (const b of boxes) expect(b!.height).toBeGreaterThanOrEqual(44);
    await expect(game).not.toHaveAttribute("role", "button");
    await expect(page.getByText("Live Game Day", { exact: true })).toBeVisible();
    await expect(page.getByText("Join & Make Picks →", { exact: true })).toBeVisible();
    await expect(page.getByText("CONTINUE GAME DAYS", { exact: true })).toBeVisible();
    await expect(page.getByText("Resume →", { exact: true })).toBeVisible();
    await expect(page.getByText("Recent Game Days", { exact: true })).toBeVisible();
    await expect(page.getByText("MY FANTASY LEAGUES", { exact: true })).toHaveCount(0);
    const header = await page.getByTestId("app-section-header").boundingBox();
    fs.mkdirSync("generated-artifacts/signed-in-navigation", { recursive: true });
    await page.screenshot({ path: `generated-artifacts/signed-in-navigation/home-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(5);
    for (const [i, label] of ["Game Day", "1v1", "Fantasy", "Leaderboard", "Profile"].entries()) {
      await expect(tabs.nth(i)).toHaveAccessibleName(new RegExp(label));
    }
    const leaderboardLabel = tabs.filter({ hasText: "Leaderboard" }).getByText("Leaderboard", { exact: true });
    const labelMetrics = await leaderboardLabel.evaluate(el => ({
      content: el.scrollWidth, available: el.clientWidth,
      style: getComputedStyle(el).cssText,
      font: getComputedStyle(el).font,
      parentWidth: el.parentElement?.clientWidth,
    }));
    expect(labelMetrics.content, JSON.stringify(labelMetrics)).toBeLessThanOrEqual(labelMetrics.available + 1);
    await one.focus();
    await expect(one).toBeFocused();
    await one.press("Enter");
    await expect(page).toHaveURL(/\/challenges$/);
    await expect(page.getByTestId("app-section-header").filter({ hasText: /1v1/i })).toBeVisible();
    await tabs.filter({ hasText: "Game Day" }).click();
    await expect(page).toHaveURL(/\/$/);
    await fantasy.click();
    await expect(page).toHaveURL(/\/fantasy$/);
    await expect(page.getByText("Preview League", { exact: false })).toBeVisible();
    const fantasyHeader = await page.getByTestId("app-section-header").filter({ hasText: "FANTASY" }).boundingBox();
    expect(fantasyHeader!.x).toBeCloseTo(header!.x, 0);
    expect(fantasyHeader!.y).toBeCloseTo(header!.y, 0);
    await page.screenshot({ path: `generated-artifacts/signed-in-navigation/fantasy-${width}.png` });
    await tabs.filter({ hasText: "1v1" }).click();
    await expect(page).toHaveURL(/\/challenges$/);
    await tabs.filter({ hasText: "Fantasy" }).click();
    await expect(page).toHaveURL(/\/fantasy$/);
    for (const label of ["Leaderboard", "Profile"]) {
      await tabs.filter({ hasText: label }).click();
      const current = await page.getByTestId("app-section-header").filter({ hasText: label.toUpperCase() }).boundingBox();
      expect(current!.x).toBeCloseTo(header!.x, 0);
      expect(current!.y).toBeCloseTo(header!.y, 0);
    }
    await expect(page.getByText("Manage Game Day Rooms", { exact: true })).toHaveCount(0);
    expect(mutations).toEqual([]);
  });
}

test("empty Game Day has no dead join action; Fantasy setup and host access remain contextual", async ({ page }) => {
  const mutations = await member(page, true, true);
  await page.goto("/");
  await expect(page.getByText("Nothing live right now", { exact: true })).toBeVisible();
  await expect(page.getByText(/Join & Make Picks/)).toHaveCount(0);
  await expect(page.getByTestId("way-1v1")).toBeVisible();
  await page.getByTestId("way-fantasy").click();
  await expect(page.getByText("Create Fantasy League", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: /Profile/ }).click();
  await page.getByText("Manage Game Day Rooms", { exact: true }).click();
  await expect(page).toHaveURL(/\/gameday$/);
  expect(mutations).toEqual([]);
});
