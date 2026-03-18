import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RAW = fs.readFileSync(
  path.join(__dirname, "../attached_assets/Pasted--access-token-eyJhbGciOiJFUzI1NiIsImtpZCI6IjM2NzFlYWIyL_1773842589482.txt"),
  "utf8"
).trim().replace(/^'|'$/g, "");

const SESSION = JSON.parse(RAW);
const STORAGE_KEY = "sb-vlxvoieneyxzhyaiimccp-auth-token";
const APP_URL = "http://localhost:8081";
const OUT = path.join(__dirname, "screenshots");

const PHONE_W = 390;
const PHONE_H = 844;

async function shot(page, name, waitMs = 1200) {
  await page.waitForTimeout(waitMs);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: PHONE_W, height: PHONE_H } });
  console.log(`📸 ${name}`);
  return file;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: PHONE_W, height: PHONE_H },
    deviceScaleFactor: 2,
  });

  await ctx.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: STORAGE_KEY, value: SESSION });

  const page = await ctx.newPage();

  console.log("Loading app…");
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Step 1 — Home feed
  await shot(page, "01-home", 500);

  // Step 2 — Tap the Create tab
  const createTab = page.locator('a[href="/create"], [aria-label*="reate"], text=Create').first();
  try {
    await createTab.click({ timeout: 4000 });
  } catch {
    await page.goto(`${APP_URL}/create`, { waitUntil: "networkidle" });
  }
  await shot(page, "02-create-empty", 1000);

  // Step 3 — Fill in the wager title + pick category
  const titleInput = page.locator('input[placeholder*="Wager"], input[placeholder*="wager"], input[placeholder*="title"], input[placeholder*="Who"], textarea').first();
  await titleInput.fill("Duke covers the spread vs Siena");
  await page.waitForTimeout(400);

  // Pick Sports category if not already selected
  try {
    const sportsBtn = page.locator('text=Sports').first();
    await sportsBtn.click({ timeout: 2000 });
    await page.waitForTimeout(300);
  } catch {}
  await shot(page, "03-title-category", 500);

  // Step 4 — Set stake + "Your Side"
  const stakeInput = page.locator('input[type="number"], input[placeholder*="stake"], input[placeholder*="SP"], input[placeholder*="Points"]').first();
  try {
    await stakeInput.fill("100");
    await page.waitForTimeout(300);
  } catch {}

  const pickInput = page.locator('input[placeholder*="Side"], input[placeholder*="pick"], input[placeholder*="Your"], input[placeholder*="stance"]').first();
  try {
    await pickInput.fill("Duke covers");
    await page.waitForTimeout(300);
  } catch {}
  await shot(page, "04-stake-pick", 500);

  // Step 5 — Submit and capture invite code screen
  const submitBtn = page.locator('text=Create Swayger, text=Create Challenge, button[type="submit"]').first();
  try {
    await submitBtn.click({ timeout: 3000 });
    await page.waitForTimeout(3000);
    await shot(page, "05-invite-code", 500);
  } catch (e) {
    console.log("Submit click failed, trying alternate:", e.message);
    const anyBtn = page.locator('button').filter({ hasText: /create/i }).first();
    await anyBtn.click({ timeout: 3000 });
    await page.waitForTimeout(3000);
    await shot(page, "05-invite-code", 500);
  }

  await browser.close();
  console.log("All screenshots saved to", OUT);
})();
