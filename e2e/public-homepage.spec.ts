import { test, expect } from "@playwright/test";

test("anonymous mobile homepage, keyboard access and working CTAs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Make sports talk competitive.");
  await expect(page.locator(".mode-card")).toHaveCount(3);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.locator(".swayger-home")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.getByRole("link", { name: "Bring Swayger to Your Group", exact: true }).click();
  // Expo can normalize the URL hash; the contract is reaching the section,
  // not changing the address bar or leaving the public homepage.
  await expect(page).toHaveURL(/\/(?:#community)?$/);
  await expect(page.locator("#community")).toBeInViewport();
  await page.getByRole("link", { name: "See How It Works", exact: true }).click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Make your picks.");
  await expect(page.locator("#game-day")).toHaveCount(1);
  await expect(page.locator("#fantasy")).toHaveCount(1);
  await expect(page.locator('[id="1v1"]')).toHaveCount(1);
});

test("desktop root, reduced motion and Play Swayger preserve guest route", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Make sports talk competitive.");
  const anchors = await page.locator(".swayger-home a").evaluateAll(links =>
    links.map(a => a.getAttribute("href")));
  expect(anchors.every(href => href && !["#", "", "javascript:void(0)"].includes(href))).toBeTruthy();
  await page.getByRole("link", { name: "Play Swayger" }).first().click();
  await expect(page).toHaveURL(/\/gameday$/);
  await expect(page.locator(".swayger-home")).toHaveCount(0);
});

test("public root never intercepts invite, Fantasy join or guest room destinations", async ({ page }) => {
  // Invalid identifiers deliberately avoid creating or changing gameplay data.
  for (const path of ["/invite/AUDITINVALID", "/fantasy/join/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000?wn=2", "/gameday/00000000-0000-0000-0000-000000000000"]) {
    await page.goto(path);
    await page.waitForTimeout(1200);
    await expect(page.locator(".swayger-home")).toHaveCount(0);
    expect(new URL(page.url()).pathname).not.toBe("/");
    expect(new URL(page.url()).pathname).not.toBe("/auth");
  }
  await page.goto("/auth");
  await expect(page.getByText("Continue with Google")).toBeVisible();
  await expect(page.locator(".swayger-home")).toHaveCount(0);
});
