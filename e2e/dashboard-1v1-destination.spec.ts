import { test, expect } from "@playwright/test";
import fs from "node:fs";

// Browser-only fixtures. No real account, competition, or database is changed.
test("1v1 dashboard destination is compact, responsive, keyboard accessible, and opens existing Swaygers", async ({ page }) => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  test.skip(!supabaseUrl, "Public Supabase configuration is required for the session namespace");
  const id = "00000000-0000-4000-8000-000000000123";
  const user = {
    id, aud: "authenticated", role: "authenticated",
    email: "dashboard-fixture@example.invalid",
    app_metadata: { provider: "email" }, user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  const profile = { ...user, username: "dashboard_fixture", display_name: "Dashboard Fixture", swayger_points: 100 };
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, aud: "authenticated", role: "authenticated", exp })}.fixture-signature`,
    refresh_token: "fixture-only-not-a-credential", expires_at: exp,
    expires_in: 3600, token_type: "bearer", user,
  };
  await page.route("**/*.supabase.co/**", async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path.endsWith("/profiles") ? profile : path.endsWith("/user") ? user : [] });
  });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.endsWith("/public-rooms") ? {
        rooms: [{
          id: "00000000-0000-4000-8000-000000000456",
          room_name: "Dashboard layout fixture", team_a_name: "Home", team_b_name: "Away",
          game_date: null, status: "open", room_code: "LAYOUT",
        }],
      } : { rooms: [], leagues: [], records: [], history: [], leaderboard: [], balance: 100, isHost: false },
    });
  });
  await page.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session));
  }, { key: `sb-${new URL(supabaseUrl!).hostname.split(".")[0]}-auth-token`, session });
  fs.mkdirSync("generated-artifacts/dashboard-1v1", { recursive: true });

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const title = page.getByText("1v1 SWAYGERS", { exact: true });
    const button = page.getByRole("button", { name: "My 1v1 Swaygers", exact: true });
    await expect(title).toBeVisible();
    await expect(page.getByText("Got a take? Challenge a friend and settle it.", { exact: true })).toBeVisible();
    await expect(page.locator(".swayger-home")).toHaveCount(0);
    await button.scrollIntoViewIfNeeded();
    const buttonBox = await button.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
    expect(buttonBox!.x).toBeGreaterThanOrEqual(0);
    expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(width + 1);
    const titleBox = await title.boundingBox();
    expect(buttonBox!.y + buttonBox!.height - titleBox!.y).toBeLessThan(210);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: `generated-artifacts/dashboard-1v1/dashboard-${width}.png` });
    const borderBeforeFocus = await button.evaluate(el => getComputedStyle(el).borderColor);
    await button.focus();
    await expect(button).toBeFocused();
    await expect.poll(() => button.evaluate(el => getComputedStyle(el).borderColor)).toBe("rgb(130, 148, 255)");
    expect(await button.evaluate(el => getComputedStyle(el).borderColor)).not.toBe(borderBeforeFocus);
    if (width === 320) {
      await page.screenshot({ path: "generated-artifacts/dashboard-1v1/dashboard-320-focused.png" });
    }
    await button.press("Enter");
    await expect(page).toHaveURL(/\/challenges$/);
    expect(new URL(page.url()).pathname).not.toContain("create");
  }
});
