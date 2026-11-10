import assert from "node:assert/strict";
import fs from "node:fs";
import { isPublicHomepage, homepageAccountLink } from "../lib/public-homepage";
import { injectPublicMetadata, publicSitemap } from "./public-site";

let passed = 0;
function check(name: string, value: unknown) {
  assert.ok(value, name);
  passed++;
  console.log(`PASS ${name}`);
}
const read = (path: string) => fs.readFileSync(path, "utf8");
check("anonymous header links to existing auth route", homepageAccountLink(false).href === "/auth" && homepageAccountLink(false).label === "Sign In");
check("authenticated header links to existing root dashboard", homepageAccountLink(true).href === "/" && homepageAccountLink(true).label === "Dashboard");
for (const platform of ["web", "ios", "android"]) {
  for (const route of ["/", "/auth", "/auth-callback", "/username-setup", "/g/CODE", "/gameday", "/gameday/room", "/fantasy/join/league/season", "/invite/CODE", "/admin"]) {
    for (const signedIn of [false, true]) {
      check(`${platform} ${route} ${signedIn ? "member" : "anonymous"} routing`, isPublicHomepage(platform, route, signedIn) === (platform === "web" && route === "/" && !signedIn));
    }
  }
}
const page = read("components/marketing/PublicHomepage.web.tsx");
for (const copy of [
  "Make sports talk ", "competitive.", "Make your picks. Prove your takes. Keep the receipts.",
  "The competitive prediction layer for sports communities.",
  "Already have the group? Bring Swayger to it.",
  "Run the competition. Let Swayger handle the rest.",
  "Play Swayger", "Bring Swayger to Your Group", "See How It Works",
]) check(`locked copy: ${copy}`, page.includes(copy));
check("exactly three product cards", (page.match(/<article className="mode-card">/g) || []).length === 3);
for (const label of ["Pick", "Lock", "Compete", "Settle", "Share"]) check(`step ${label}`, page.includes(`>${label}</h3>`));
for (const anchor of ["community", "organizers", "how-it-works", "main-content"]) {
  check(`anchor ${anchor} exists`, page.includes(`id="${anchor}"`));
}
check("actual active mark reused", page.includes('from "@/components/SwaygerMark"'));
check("actual receipt reused", page.includes('from "@/components/GameDayReceiptCard"'));
check("sample data disclosed", page.includes("Names and scores are examples."));
check("no old logo", !/swayger-icon\.png|images\/icon\.png|glowing/i.test(page));
check("no sportsbook language", !/\b(?:wager|wagering|sportsbook|betting|payout|odds)\b/i.test(page));
check("reduced motion", page.includes("prefers-reduced-motion"));
check("keyboard focus", page.includes(":focus-visible"));
check("skip navigation", page.includes('href="#main-content"'));
check("native fallback has no DOM", !/<(?:div|main|style|a|section)\b/.test(read("components/marketing/PublicHomepage.tsx")));
const root = read("app/_layout.tsx");
check("public bypass follows auth loading guard", root.indexOf("if (isLoading) return;") < root.indexOf("if (isPublicHomepage("));
for (const guard of ["if (inAuthCallback) return;", "if (inInvite && !session) return;", "if (inGameday && !session) return;", "if (inFantasy && !session) return;", "PENDING_AUTH_REDIRECT_KEY", 'router.replace("/username-setup")']) {
  check(`existing guard retained ${guard}`, root.includes(guard));
}
const tabs = read("app/(tabs)/_layout.tsx");
check("restored session resolves before homepage", tabs.indexOf('pathname === "/" && isLoading') < tabs.indexOf("return <PublicHomepage"));
check("dashboard remains intact", read("app/(tabs)/index.tsx").includes("export default function GameDayHomeScreen()"));
const html = '<html><head><title>Old</title><meta name="description" content="old"><meta property="og:title" content="old"><link rel="canonical" href="old"></head><body></body></html>';
for (const path of ["/", "/how-it-works"] as const) {
  const result = injectPublicMetadata(html, path);
  check(`${path}: exactly one title`, (result.match(/<title\b/g) || []).length === 1);
  check(`${path}: exactly one description`, (result.match(/name="description"/g) || []).length === 1);
  check(`${path}: canonical`, result.includes(`href="https://www.swayger.app${path}"`));
  check(`${path}: social PNG`, result.includes("/assets/marketing/swayger-social.png"));
  check(`${path}: reinjection has no duplicate social tags`, (injectPublicMetadata(result, path).match(/property="og:title"/g) || []).length === 1);
}
check("real sitemap", publicSitemap().includes("<urlset") && publicSitemap().includes("/how-it-works</loc>"));
const fallback = read("server/templates/landing-page.html");
check("fallback has no auth redirect", !/http-equiv="refresh"|location\.replace/.test(fallback));
check("fallback has public hero", fallback.includes("Make sports talk competitive."));
const how = read("server/templates/swayger-how-it-works.html");
check("how page explains all three modes", ["game-day", "fantasy", "1v1"].every(id => how.includes(`id="${id}"`)));
check("how page retires wagering copy", !/\bwager(?:s|ing)?\b|\bbet\b/i.test(how));
check("how route remains Express-owned", !fs.existsSync("app/how-it-works.tsx"));
console.log(`\n${passed} public homepage checks passed.`);
