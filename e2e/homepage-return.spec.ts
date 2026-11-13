import { test, expect, type Page } from "@playwright/test";

// Route regression fixtures only: all identity/data calls are intercepted.
// No real account is created, no email sent, and no gameplay is written.
const userId = "00000000-0000-4000-8000-000000000123";
const profile = { id: userId, username: "route_fixture", display_name: "Route Fixture", swayger_points: 100, created_at: "2026-01-01T00:00:00Z" };

async function mockMember(page: Page, options: {
  destination?: string; missingProfile?: boolean; pendingInvite?: boolean; priorReturn?: string;
} = {}) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  test.skip(!url, "Public Supabase config is needed to identify the app's session-storage namespace");
  const storageKey = `sb-${new URL(url!).hostname.split(".")[0]}-auth-token`;
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "route-fixture@example.invalid", app_metadata: { provider: "email" }, user_metadata: {}, created_at: profile.created_at };
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, aud: "authenticated", role: "authenticated", exp })}.fixture-signature`;
  const session = { access_token: accessToken, refresh_token: "fixture-only-not-a-credential", expires_at: exp, expires_in: 3600, token_type: "bearer", user };
  let profileCreated = !options.missingProfile;
  await page.route("**/*.supabase.co/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/profiles")) {
      if (route.request().method() === "POST") profileCreated = true;
      await route.fulfill({
        status: profileCreated ? 200 : 406,
        json: profileCreated ? profile : { code: "PGRST116", message: "No row found" },
      });
    } else if (path.endsWith("/user")) {
      await route.fulfill({ json: user });
    } else {
      await route.fulfill({ json: [] });
    }
  });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path.endsWith("/is-host") ? { isHost: false } : { rooms: [], leagues: [], leaderboard: [], balance: 100 } });
  });
  await page.addInitScript(({ storageKey, session, options }) => {
    // sessionStorage flag keeps refreshes from reseeding consumed return intents.
    if (sessionStorage.getItem("homepage-fixture-seeded")) return;
    sessionStorage.setItem("homepage-fixture-seeded", "1");
    localStorage.setItem(storageKey, JSON.stringify(session));
    if (options.destination) localStorage.setItem("swayger_homepage_return", JSON.stringify({ destination: options.destination, createdAt: Date.now() }));
    if (options.priorReturn) localStorage.setItem("swayger_pending_auth_redirect", options.priorReturn);
    if (options.pendingInvite) {
      const invite = JSON.stringify({ code: "AUDITINVALID", intent: "view" });
      sessionStorage.setItem("swayger_pending_invite", invite);
      localStorage.setItem("swayger_pending_invite", invite);
    }
  }, { storageKey, session, options });
}

for (const [destination, label] of [
  ["/fantasy/setup", "Create Fantasy League"],
  ["/(tabs)/create", "Create Swayger"],
  ["/gameday/create", "You don't have host access."],
] as const) {
  test(`ready signed-in profile resumes ${destination} without widening permissions`, async ({ page }) => {
    await mockMember(page, { destination });
    await page.goto("/auth");
    await expect(page).toHaveURL(new RegExp(destination === "/(tabs)/create" ? "/create$" : `${destination}$`));
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    await expect(page.locator(".swayger-home")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("swayger_homepage_return"))).toBeNull();
  });
}

test("OAuth fallback landing resumes only after username setup finishes", async ({ page }) => {
  await mockMember(page, { destination: "/fantasy/setup", missingProfile: true });
  await page.goto("/");
  await expect(page).toHaveURL(/\/username-setup$/);
  expect(await page.evaluate(() => localStorage.getItem("swayger_homepage_return"))).not.toBeNull();
  await page.getByPlaceholder("username", { exact: true }).fill("route_fixture");
  await page.getByText("Continue", { exact: true }).click();
  await expect(page).toHaveURL(/\/fantasy\/setup$/);
  await expect(page.getByText("Create Fantasy League", { exact: true })).toBeVisible();
});

test("existing interrupted return wins over homepage organizer intent", async ({ page }) => {
  await mockMember(page, { destination: "/fantasy/setup", priorReturn: "/gameday" });
  await page.goto("/auth");
  await expect(page).toHaveURL(/\/gameday$/);
  await expect(page.locator(".swayger-home")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("swayger_homepage_return"))).toBeNull();
});

test("callback invitation wins over homepage organizer intent", async ({ page }) => {
  await mockMember(page, { destination: "/fantasy/setup", pendingInvite: true });
  await page.goto("/auth-callback");
  await expect(page).toHaveURL(/\/invite\/AUDITINVALID$/);
  await expect(page.locator(".swayger-home")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("swayger_homepage_return"))).toBeNull();
});

test("ordinary signed-in root remains the existing dashboard", async ({ page }) => {
  await mockMember(page);
  await page.goto("/");
  await expect(page.locator(".swayger-home")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /1v1/ })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});
