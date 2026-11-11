import { test, expect } from "@playwright/test";

test("header Sign In stays usable beside Play Swayger at mobile and desktop widths", async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const header = page.locator("header");
    const signIn = header.getByRole("link", { name: "Sign In", exact: true });
    const play = header.getByRole("button", { name: "Play Swayger" });
    await expect(signIn).toBeVisible();
    await expect(play).toBeVisible();
    await expect(signIn).toHaveAttribute("href", "/auth");
    await play.click();
    const chooser = page.getByRole("dialog");
    await expect(chooser).toBeVisible();
    await expect(chooser.getByRole("link", { name: /Open Game Day/ })).toHaveAttribute("href", "/gameday");
    await expect(chooser.getByRole("link", { name: /Sign in for Fantasy/ })).toHaveAttribute("href", "/auth");
    await expect(chooser.getByRole("link", { name: /Sign in for 1v1/ })).toHaveAttribute("href", "/auth");
    await chooser.getByRole("button", { name: "Close experience choices" }).click();
    const target = await signIn.boundingBox();
    expect(target && target.height >= 44 && target.x >= 0 && target.x + target.width <= width).toBeTruthy();
    const logo = await header.getByRole("link", { name: "Swayger home" }).boundingBox();
    expect(target && logo && Math.abs((target.y + target.height / 2) - (logo.y + logo.height / 2)) < 5).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await signIn.click();
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByText("Continue with Google")).toBeVisible();
  }
});

test("anonymous mobile homepage, keyboard access and working CTAs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Make sports talk competitive.");
  await expect(page.locator(".mode-card")).toHaveCount(3);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.locator(".swayger-home")).toBeVisible();
  const signIn = page.locator("header").getByRole("link", { name: "Sign In", exact: true });
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveAttribute("href", "/auth");
  const play = page.locator("header").getByRole("button", { name: "Play Swayger" });
  await expect(play).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await play.click();
  const playDialog = page.getByRole("dialog");
  await expect(playDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(playDialog).not.toBeVisible();
  await expect(play).toBeFocused();
  await page.getByRole("button", { name: "Bring Swayger to Your Group", exact: true }).click();
  const organizerDialog = page.getByRole("dialog");
  await expect(organizerDialog.getByRole("heading", { name: "Bring Swayger to your group." })).toBeVisible();
  await expect(organizerDialog.getByText(/You set up the competition, invite people, and confirm results/)).toBeVisible();
  await expect(organizerDialog.getByText(/hosts and commissioners confirm results/)).toBeVisible();
  await organizerDialog.getByRole("button", { name: "Close experience choices" }).click();
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
  await expect(page.locator("header").getByRole("link", { name: "Sign In", exact: true })).toBeVisible();
  const anchors = await page.locator(".swayger-home a").evaluateAll(links =>
    links.map(a => a.getAttribute("href")));
  expect(anchors.every(href => href && !["#", "", "javascript:void(0)"].includes(href))).toBeTruthy();
  await page.locator("header").getByRole("button", { name: "Play Swayger" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("link", { name: /Open Game Day/ }).click();
  await expect(page).toHaveURL(/\/gameday$/);
  await expect(page.locator(".swayger-home")).toHaveCount(0);
});

test("real product proof components fit the viewport at mobile and desktop widths", async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator(".mode-card")).toHaveCount(3);
    await expect(page.locator(".fantasy-proof-viewport")).toBeVisible();
    await expect(page.locator(".onevone-proof-viewport")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    const cards = await page.locator(".mode-card").evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
    );
    expect(cards.every(({ left, right }) => left >= 0 && right <= width)).toBeTruthy();
    const headlineFragments = await page.locator("h1").evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return Array.from(range.getClientRects()).map((rect) => ({ left: rect.left, right: rect.right }));
    });
    expect(headlineFragments.every(({ left, right }) => left >= 0 && right <= width)).toBeTruthy();
    const previews = await page.locator(".mode-proof-viewport").evaluateAll((els) =>
      els.map((el) => {
        const container = el.getBoundingClientRect();
        const proof = el.firstElementChild?.getBoundingClientRect();
        return !!proof && proof.left >= container.left && proof.right <= container.right;
      }),
    );
    expect(previews.every(Boolean)).toBeTruthy();
    const receiptFits = await page.locator(".receipt-preview > div").evaluate((el) => {
      const container = el.parentElement!.getBoundingClientRect();
      const preview = el.getBoundingClientRect();
      return preview.left >= container.left && preview.right <= container.right;
    });
    expect(receiptFits).toBeTruthy();
  }
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
