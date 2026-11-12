import { test, expect } from "@playwright/test";

test("homepage scrolls with user input inside a non-scrolling app shell", async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const home = page.locator(".swayger-home");
    await expect(home).toBeVisible();
    // Reproduce the fixed-height preview/native-navigation shell. Programmatic
    // scrollIntoView alone can mask an unusable wheel/touch scrolling surface.
    await page.addStyleTag({ content: "html, body, #root { height:100%; overflow:hidden !important; }" });
    expect(await home.evaluate(el => el.scrollHeight > el.clientHeight)).toBeTruthy();
    await page.mouse.move(width / 2, 600);
    await page.mouse.wheel(0, 700);
    await expect.poll(() => home.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
    await page.mouse.wheel(0, 30000);
    await expect(page.locator("footer")).toBeInViewport();
    expect(await home.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  }
});

test("organizer dialog fits 320px and secondary hero CTA keeps its outline", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  const bring = page.getByRole("button", { name: "Bring Swayger to Your Group", exact: true });
  const border = await bring.evaluate(el => {
    const style = getComputedStyle(el);
    return { width: parseFloat(style.borderTopWidth), style: style.borderTopStyle };
  });
  expect(border.width).toBeGreaterThanOrEqual(1);
  expect(border.style).toBe("solid");
  await bring.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  const headingFits = await dialog.getByRole("heading", { level: 2 }).evaluate(el => el.scrollWidth <= el.clientWidth);
  expect(headingFits).toBeTruthy();
  const bounds = await dialog.boundingBox();
  const close = await dialog.getByRole("button", { name: "Close dialog" }).boundingBox();
  expect(bounds && close && close.x >= bounds.x && close.x + close.width <= bounds.x + bounds.width).toBeTruthy();
  for (const option of await dialog.locator(".experience-option").all()) {
    await option.scrollIntoViewIfNeeded();
    expect(await option.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  }
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
});

test("switching from organizer to Play clears only the homepage fallback", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bring Swayger to Your Group", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: /Sign in for 1v1/ }).click();
  await expect(page).toHaveURL(/\/auth$/);
  expect(await page.evaluate(() => localStorage.getItem("swayger_homepage_return"))).not.toBeNull();
  await page.goto("/");
  await page.evaluate(() => {
    const invite = JSON.stringify({ code: "AUDITINVALID", intent: "view" });
    localStorage.setItem("swayger_pending_invite", invite);
    sessionStorage.setItem("swayger_pending_invite", invite);
    localStorage.setItem("swayger_pending_auth_redirect", "/fantasy/join/keep/this?wn=2");
    localStorage.setItem("swayger_pending_referral", "keep-referral");
  });
  await page.locator("header").getByRole("button", { name: "Play Swayger" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Ready to compete?" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("swayger_homepage_return"))).toBeNull();
  await page.getByRole("dialog").getByRole("link", { name: /Sign in to play/ }).click();
  await expect(page).toHaveURL(/\/auth$/);
  const state = await page.evaluate(() => ({
    own: localStorage.getItem("swayger_homepage_return"),
    prior: localStorage.getItem("swayger_pending_auth_redirect"),
    invite: JSON.parse(sessionStorage.getItem("swayger_pending_invite")!),
    referral: localStorage.getItem("swayger_pending_referral"),
  }));
  expect(state.own).toBeNull();
  expect(state.prior).toBe("/fantasy/join/keep/this?wn=2");
  expect(state.invite.code).toBe("AUDITINVALID");
  expect(state.referral).toBe("keep-referral");
});

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
    await expect(chooser.getByRole("link", { name: /Sign in to play/ })).toHaveAttribute("href", "/auth");
    await expect(chooser.locator(".experience-option")).toHaveCount(0);
    await expect(chooser.getByText(/Have an invite/)).toBeVisible();
    await chooser.getByRole("button", { name: "Close dialog" }).click();
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
  await expect(organizerDialog.getByRole("heading", { name: "Start your competition." })).toBeVisible();
  await expect(organizerDialog.getByText(/You set it up, share its invite, and confirm results/)).toBeVisible();
  await expect(organizerDialog.getByText(/hosts and commissioners confirm results/)).toBeVisible();
  await expect(organizerDialog.locator(".experience-option")).toHaveCount(3);
  await expect(organizerDialog.getByText(/only if your account has Game Day host access/)).toBeVisible();
  await organizerDialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("link", { name: "See How It Works", exact: true }).click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Make your picks.");
  await expect(page.locator("#game-day")).toHaveCount(1);
  await expect(page.locator("#fantasy")).toHaveCount(1);
  await expect(page.locator('[id="1v1"]')).toHaveCount(1);
});

test("desktop root, reduced motion and Play Swayger enter sign in without promising browsing", async ({ page }) => {
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
  await page.getByRole("dialog").getByRole("link", { name: /Sign in to play/ }).click();
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.locator(".swayger-home")).toHaveCount(0);
  await expect(page.getByText("MAKE YOUR CALL", { exact: true })).toBeVisible();
  await expect(page.getByText(/Name the wager/)).toHaveCount(0);
});

test("aligned product cards and approved original standings fit mobile and desktop", async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator(".mode-card")).toHaveCount(3);
    const standings = page.locator(".proof-art img");
    await expect(standings).toHaveAttribute("src", "/assets/marketing/knicks-spurs-final-standings.png");
    await expect.poll(() => standings.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 680 && el.naturalHeight === 1022)).toBeTruthy();
    await expect(page.locator(".mode-card h3")).toHaveText(["Swayger Game Day", "1v1 Swaygers", "Swayger Fantasy"]);
    for (const filename of [
      "knicks-spurs-pregame-picks-homepage.jpg",
      "1v1-nba-playoffs-homepage.jpg",
      "fantasy-week-10-picks-homepage.jpg",
      "fantasy-week-1-homepage.jpg",
      "madden-week-5-pick-card-homepage.jpg",
      "gameday-organizer-homepage.jpg",
    ]) {
      const image = page.locator(`img[src="/assets/marketing/${filename}"]`);
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBeTruthy();
      await expect(image).toHaveAttribute("alt", /.+/);
      const bounds = await image.boundingBox();
      expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width).toBeTruthy();
    }
    await expect(page.locator(".community-proof figcaption")).toHaveText("Madden Weekly Pick Card");
    await expect(page.locator('img[src*="discord-week-5"]')).toHaveCount(0);
    await expect(page.getByText(/Capture pending|Approved Game Day capture awaiting upload/)).toHaveCount(0);
    await expect(page.getByText(/Illustrative component preview|Example data|Talk is cheap/)).toHaveCount(0);
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
    const proof = await page.locator(".proof-art").boundingBox();
    expect(proof && proof.x >= 0 && proof.x + proof.width <= width).toBeTruthy();
    if (width === 1440) {
      const imageWidths = await page.locator(".product-shot img").evaluateAll(els => els.map(el => el.getBoundingClientRect().width));
      expect(imageWidths.every(width => width >= 650)).toBeTruthy();
    }
    await page.locator("footer").scrollIntoViewIfNeeded();
    await expect(page.locator("footer")).toBeInViewport();
  }
});

test("each anonymous organizer choice saves its exact post-auth destination", async ({ page }) => {
  const choices = [
    [/Sign in to check host access/, "/gameday/create"],
    [/Sign in for Fantasy/, "/fantasy/setup"],
    [/Sign in for 1v1/, "/(tabs)/create"],
  ] as const;
  for (const [label, destination] of choices) {
    await page.goto("/");
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.getByRole("button", { name: "Bring Swayger to Your Group", exact: true }).click();
    await page.getByRole("dialog").getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(/\/auth$/);
    const saved = await page.evaluate(() => localStorage.getItem("swayger_homepage_return"));
    expect(JSON.parse(saved!).destination).toBe(destination);
    expect(await page.evaluate(() => localStorage.getItem("swayger_pending_auth_redirect"))).toBeNull();
  }
});

test("organizer choice never replaces a pending invitation or interrupted guest return", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const pending = JSON.stringify({ code: "AUDITINVALID", intent: "view" });
    sessionStorage.setItem("swayger_pending_invite", pending);
    localStorage.setItem("swayger_pending_invite", pending);
    localStorage.setItem("swayger_pending_auth_redirect", "/fantasy/join/keep/this?wn=2");
  });
  await page.getByRole("button", { name: "Bring Swayger to Your Group", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: /Sign in for Fantasy/ }).click();
  await expect(page).toHaveURL(/\/auth$/);
  const state = await page.evaluate(() => ({
    invite: JSON.parse(sessionStorage.getItem("swayger_pending_invite")!),
    previous: localStorage.getItem("swayger_pending_auth_redirect"),
    marketing: localStorage.getItem("swayger_homepage_return"),
  }));
  expect(state.invite.code).toBe("AUDITINVALID");
  expect(state.previous).toBe("/fantasy/join/keep/this?wn=2");
  expect(state.marketing).toBeNull();
});

test("public root never intercepts invite, Fantasy join or guest room destinations", async ({ page, request }) => {
  // Invalid identifiers deliberately avoid creating or changing gameplay data.
  for (const path of ["/invite/AUDITINVALID", "/fantasy/join/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000?wn=2", "/gameday/00000000-0000-0000-0000-000000000000"]) {
    await page.goto(path);
    await page.waitForTimeout(1200);
    await expect(page.locator(".swayger-home")).toHaveCount(0);
    expect(new URL(page.url()).pathname).not.toBe("/");
    expect(new URL(page.url()).pathname).not.toBe("/auth");
  }
  // /g/:code is Express-owned and is not forwarded by the existing Metro proxy.
  // Verify its unchanged invalid-code response at the backend without creating a room.
  const shortLink = await request.get(`${process.env.E2E_BACKEND_URL ?? "http://127.0.0.1:5000"}/g/AUDITINVALID`, { maxRedirects: 0 });
  expect(shortLink.status()).toBe(404);
  expect(await shortLink.text()).toBe("Room not found");
  await page.goto("/auth");
  await expect(page.getByText("Continue with Google")).toBeVisible();
  await expect(page.locator(".swayger-home")).toHaveCount(0);
});
