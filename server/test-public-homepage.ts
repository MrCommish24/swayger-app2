import assert from "node:assert/strict";
import fs from "node:fs";
import {
  isPublicHomepage,
  homepageAccountLink,
  homepageExperienceChoices,
} from "../lib/public-homepage";
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
const signedOutChoices = homepageExperienceChoices(false);
const signedInChoices = homepageExperienceChoices(true);
check("experience chooser exposes exactly three existing modes", signedOutChoices.map((choice) => choice.id).join(",") === "game-day,fantasy,1v1");
check("signed-out Game Day discloses authentication and host access", signedOutChoices[0].href === "/auth" && signedOutChoices[0].description.includes("host access"));
check("signed-out Fantasy choice uses the existing auth route", signedOutChoices[1].href === "/auth");
check("signed-out 1v1 choice uses the existing auth route", signedOutChoices[2].href === "/auth");
check("signed-in Fantasy choice opens existing setup", signedInChoices[1].href === "/fantasy/setup");
check("signed-in 1v1 choice opens existing create screen", signedInChoices[2].href === "/(tabs)/create");
check("signed-in Game Day targets permission-gated host setup", signedInChoices[0].href === "/gameday/create");
check("all anonymous organizer choices retain their exact destinations", signedOutChoices.every((choice, index) => choice.returnTo === signedInChoices[index].href));
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
  "Built for your crew",
  "You bring the crew. Swayger brings the competition.",
  "Make your call count.",
  "Play Swayger", "Bring Swayger to Your Group", "See How It Works",
]) check(`locked copy: ${copy}`, page.includes(copy));
check("exactly three product cards use the three-mode choices", page.includes("[...experienceChoices]") && signedOutChoices.length === 3 && page.includes('className="mode-card"'));
for (const label of ["Pick", "Lock", "Compete", "Get receipts"]) check(`step ${label}`, page.includes(`>${label}</h3>`));
for (const anchor of ["community", "organizers", "how-it-works", "main-content"]) {
  check(`anchor ${anchor} exists`, page.includes(`id="${anchor}"`));
}
check("actual active mark reused", page.includes('from "@/components/SwaygerMark"'));
check("no synthetic hero receipt", !page.includes("exampleStandings") && !page.includes("<GameDayReceiptCard"));
check("hero uses approved original standings capture",
  page.includes("/assets/marketing/knicks-spurs-final-standings.png") &&
  !page.includes("Approved Game Day capture awaiting upload") &&
  !page.includes("Capture pending"));
check("Play CTAs open participant choices", (page.match(/openChoices\("play"/g) || []).length >= 3);
check("organizer CTAs open group-start choices", (page.match(/openChoices\("organize"/g) || []).length >= 3);
check("choice dialog is semantically labeled", page.includes("<dialog") && page.includes("aria-labelledby=\"experience-dialog-title\""));
check("manual result confirmation is explicit", page.includes("hosts and commissioners confirm results"));
const experienceCopy = read("lib/public-homepage.ts");
check("guest and invitation behavior is disclosed", page.includes("Existing guest and preview options") && experienceCopy.includes("commissioner’s invite"));
check("participant action is distinct from organizer choices", page.includes("Sign in to play") && page.includes('choiceIntent === "organize"'));
check("public hero excludes developer labels and old slogan", !/Illustrative component preview|Example data|Talk is cheap/i.test(page));
check("organizer auth intent wired to existing routes", page.includes("prepareHomepageReturn(returnTo)") && page.includes("handleChoice(event, choice.returnTo)"));
check("homepage receipt sample has no stale date", !page.includes('gameDate="2025-10-12"'));
check("receipt stamp no longer overlays its caption", !page.includes(".art-stamp { position: absolute"));
check("community identifies the actual Madden web participant capture",
  page.includes("madden-week-5-pick-card-homepage.jpg") &&
  page.includes("Madden Weekly Pick Card") &&
  !page.includes("/assets/marketing/discord-week-5-pick-card.png"));
for (const filename of [
  "knicks-spurs-pregame-picks-homepage.jpg",
  "1v1-nba-playoffs-homepage.jpg",
  "fantasy-week-10-picks-homepage.jpg",
  "fantasy-week-1-homepage.jpg",
  "madden-week-5-pick-card-homepage.jpg",
  "gameday-organizer-homepage.jpg",
]) {
  check(`approved screenshot mapped: ${filename}`, page.includes(filename));
  check(`approved screenshot exists: ${filename}`, fs.existsSync(`assets/marketing/${filename}`));
}
check("no missing-asset placeholders after screenshot library arrived", !/Capture pending|Expected product capture|capture awaiting/i.test(page));
check("organizer CTA opens a mode choice, not Fantasy directly", !page.includes('className="button button-outline" href="/fantasy/setup"'));
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
