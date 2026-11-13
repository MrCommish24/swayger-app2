import { test, expect } from "@playwright/test";

// Design checks follow the approved HTML, not the superseded homepage.
// Existing participant/organizer, auth-return and invite guarantees remain.
test("approved Game Night homepage scrolls inside a non-scrolling app shell", async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const home = page.locator(".swayger-home");
    await expect(home).toBeVisible();
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

test("organizer dialog fits 320px and approved secondary hero CTA keeps its outline", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  const host = page.getByRole("button", { name: "Host Game Day", exact: true });
  const border = await host.evaluate(el => {
    const style = getComputedStyle(el);
    return { width: parseFloat(style.borderTopWidth), style: style.borderTopStyle };
  });
  expect(border.width).toBeGreaterThanOrEqual(1);
  expect(border.style).toBe("solid");
  await host.click();
  const dialog = page.locator(".experience-dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  expect(await dialog.getByRole("heading", { level: 2 }).evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  for (const option of await dialog.locator(".experience-option").all()) {
    await option.scrollIntoViewIfNeeded();
    expect(await option.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  }
  await page.screenshot({ path: "generated-artifacts/game-night/organizer-320.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(host).toBeFocused();
});

test("switching from organizer to Play clears only the homepage fallback", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Host Game Day", exact: true }).click();
  await page.locator(".experience-dialog").getByRole("link", { name: /Sign in for 1v1/ }).click();
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
  await page.getByRole("button", { name: "Play Swayger" }).click();
  await expect(page.locator(".experience-dialog").getByRole("heading", { name: "Ready to compete?" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("swayger_homepage_return"))).toBeNull();
  await page.locator(".experience-dialog").getByRole("link", { name: /Sign in to play/ }).click();
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

test("header Sign In stays accessible at mobile and desktop widths", async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const signIn = page.locator("header").getByRole("link", { name: "Sign In", exact: true });
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute("href", "/auth");
    const target = await signIn.boundingBox();
    expect(target && target.height >= 44 && target.x >= 0 && target.x + target.width <= width).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await signIn.click();
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByText("Continue with Google")).toBeVisible();
    await expect(page.locator(".swayger-home")).toHaveCount(0);
  }
});

test("anonymous mobile homepage preserves approved copy, keyboard access and participant journey", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Make sports talk competitive.");
  await expect(page.locator(".hero-copy p")).toHaveText("Make your picks. Prove your takes. Keep the receipts.");
  await expect(page.locator(".cards > .card")).toHaveCount(3);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  const play = page.getByRole("button", { name: "Play Swayger" });
  await play.click();
  const dialog = page.locator(".experience-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".experience-option")).toHaveCount(0);
  await expect(dialog.getByText(/Have an invite/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Sign in to play/ })).toHaveAttribute("href", "/auth");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(play).toBeFocused();
  await page.getByRole("button", { name: "Sign in to host" }).click();
  await expect(dialog.getByRole("heading", { name: "Start your competition." })).toBeVisible();
  await expect(dialog.locator(".experience-option")).toHaveCount(3);
  await expect(dialog.getByText(/only if your account has Game Day host access/)).toBeVisible();
  await expect(dialog.getByText(/hosts and commissioners confirm results/)).toBeVisible();
});

test("public how-it-works and privacy links retain existing route ownership", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Make your picks.");
  await expect(page.locator("#game-day")).toHaveCount(1);
  await expect(page.locator("#fantasy")).toHaveCount(1);
  await expect(page.locator('[id="1v1"]')).toHaveCount(1);
  const privacy = await request.get("/privacy");
  expect(privacy.ok()).toBeTruthy();
  expect(await privacy.text()).toContain("Privacy");
});

test("approved artwork, tilted phone and aligned cards fit 320, 390 and 1440 layouts", async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const phone = page.locator(".phone .shot img");
    await expect(phone).toHaveAttribute("src", "/assets/marketing/game-night/knicks-spurs-revealed-phone.webp");
    await expect.poll(() => phone.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBeTruthy();
    await expect(page.locator(".cards h3")).toHaveText(["Swayger Game Day", "Swayger Fantasy", "1v1 Swaygers"]);
    await expect(page.locator(".swayger-home iframe")).toHaveCount(0);
    for (const selector of [".phone", ".cards", ".organizer-inner", ".hero-copy h1"]) {
      const rect = await page.locator(selector).boundingBox();
      expect(rect && rect.x >= 0 && rect.x + rect.width <= width, `${selector} fits ${width}px`).toBeTruthy();
    }
    const cards = await page.locator(".cards > .card").evaluateAll(els => els.map(el => {
      const rect = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, image: css.backgroundImage };
    }));
    expect(cards.every(card => card.left >= 0 && card.right <= width && card.image.includes("/assets/marketing/game-night/"))).toBeTruthy();
    if (width === 1440) expect(new Set(cards.map(card => card.top)).size).toBe(1);
    const imageRequests = await page.locator(".swayger-home img").evaluateAll(els =>
      els.every(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0));
    expect(imageRequests).toBeTruthy();
    const home = page.locator(".swayger-home");
    expect(await home.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
    await page.screenshot({ path: `generated-artifacts/game-night/home-${width}.png` });
    await page.locator(".organizer").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `generated-artifacts/game-night/groups-${width}.png` });
  }
});

test("hero and all three Explore buttons open genuine capture dialogs and restore keyboard focus", async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const examples = [
      { selector: ".phone .shot", filename: "knicks-spurs-revealed-full.jpg" },
      { selector: "#game-day [data-showcase]", filename: "knicks-spurs-revealed-full.jpg" },
      { selector: "#fantasy [data-showcase]", filename: "fantasy-week-10-capture.jpg" },
      { selector: "#one-on-one [data-showcase]", filename: "one-on-one-settled-capture.jpg" },
    ];
    for (const example of examples) {
      const trigger = page.locator(example.selector);
      await trigger.click();
      const viewer = page.locator(".capture-dialog");
      await expect(viewer).toBeVisible();
      await expect.poll(async () => new URL((await viewer.locator("img").getAttribute("src"))!, page.url()).pathname)
        .toBe(`/assets/marketing/game-night/${example.filename}`);
      await expect.poll(() => viewer.locator("img").evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBeTruthy();
      expect(await viewer.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
      const bounds = await viewer.boundingBox();
      expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width).toBeTruthy();
      if (example.selector === ".phone .shot") await page.screenshot({ path: `generated-artifacts/game-night/capture-${width}.png` });
      await page.keyboard.press("Escape");
      await expect(viewer).not.toBeVisible();
      await expect(trigger).toBeFocused();
    }
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
    await page.getByRole("button", { name: "Host Game Day", exact: true }).click();
    await page.locator(".experience-dialog").getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(/\/auth$/);
    const saved = await page.evaluate(() => localStorage.getItem("swayger_homepage_return"));
    expect(JSON.parse(saved!).destination).toBe(destination);
    expect(await page.evaluate(() => localStorage.getItem("swayger_pending_auth_redirect"))).toBeNull();
  }
});

test("organizer never replaces a pending invite or interrupted guest return", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const pending = JSON.stringify({ code: "AUDITINVALID", intent: "view" });
    sessionStorage.setItem("swayger_pending_invite", pending);
    localStorage.setItem("swayger_pending_invite", pending);
    localStorage.setItem("swayger_pending_auth_redirect", "/fantasy/join/keep/this?wn=2");
  });
  await page.getByRole("button", { name: "Host Game Day", exact: true }).click();
  await page.locator(".experience-dialog").getByRole("link", { name: /Sign in for Fantasy/ }).click();
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

test("public root never intercepts invite, Fantasy join or guest room routes", async ({ page, request }) => {
  for (const path of ["/invite/AUDITINVALID", "/fantasy/join/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000?wn=2", "/gameday/00000000-0000-0000-0000-000000000000"]) {
    await page.goto(path);
    await page.waitForTimeout(1200);
    await expect(page.locator(".swayger-home")).toHaveCount(0);
    expect(new URL(page.url()).pathname).not.toBe("/");
    expect(new URL(page.url()).pathname).not.toBe("/auth");
  }
  const shortLink = await request.get(`${process.env.E2E_BACKEND_URL ?? "http://127.0.0.1:5000"}/g/AUDITINVALID`, { maxRedirects: 0 });
  expect(shortLink.status()).toBe(404);
  expect(await shortLink.text()).toBe("Room not found");
  await page.goto("/auth");
  await expect(page.getByText("Continue with Google")).toBeVisible();
  await expect(page.locator(".swayger-home")).toHaveCount(0);
});
