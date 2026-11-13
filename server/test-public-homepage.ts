import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { gameNightMarkup } from "../components/marketing/game-night-content";
import { gameNightStyles } from "../components/marketing/game-night-styles";
import { gameNightAssetHashes } from "../components/marketing/game-night-provenance";
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
const markup = gameNightMarkup;
const source = read("attached_assets/Swayger-Game-Night-Prototype_1794554314870.html");
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
check("exact approved HTML source retained", sha(source) === "78c0fb1bf3e4f1d5039c83df967366235d6a743160ce58334cb5a857f7fd2203");
const embeddedHashes = new Set([...source.matchAll(/data:[^;,]+;base64,([A-Za-z0-9+/=]+)/g)]
  .map(match => sha(Buffer.from(match[1], "base64"))));
for (const [filename, expected] of Object.entries(gameNightAssetHashes)) {
  const bytes = fs.readFileSync(`assets/marketing/game-night/${filename}`);
  check(`approved embedded asset is byte-identical: ${filename}`, sha(bytes) === expected && embeddedHashes.has(expected));
}
check("every unique embedded asset was extracted", embeddedHashes.size === Object.keys(gameNightAssetHashes).length);
for (const copy of [
  "Make sports talk ", "competitive.", "Make your picks. Prove your takes. Keep the receipts.",
  "Bring Swayger<br>to your crew.", "Play Swayger", "Host Game Day",
]) check(`approved source copy: ${copy}`, markup.includes(copy) && source.includes(copy));
check("exactly three illustrated product cards retained", (markup.match(/<article class="card"/g) || []).length === 3);
for (const anchor of ["game-day", "fantasy", "one-on-one", "groups", "main"]) {
  check(`source anchor ${anchor} exists`, markup.includes(`id="${anchor}"`));
}
check("actual source mark reused", markup.includes("/assets/marketing/game-night/swayger-mark.svg"));
check("no synthetic hero receipt", !page.includes("exampleStandings") && !page.includes("<GameDayReceiptCard"));
check("hero uses original source phone and authentic full revealed capture",
  markup.includes('class="board phone"') && markup.includes("knicks-spurs-revealed-phone.webp") &&
  markup.includes('data-full="/assets/marketing/game-night/knicks-spurs-revealed-full.jpg"'));
check("Play CTA invokes participant choice", markup.includes('data-home-action="play"') && page.includes('action.dataset.homeAction === "organize" ? "organize" : "play"'));
check("both host CTAs invoke existing organizer choice", (markup.match(/data-home-action="organize"/g) || []).length === 2);
check("choice dialog is semantically labeled", page.includes("<dialog") && page.includes("aria-labelledby=\"experience-dialog-title\""));
check("capture dialog is semantically labeled", page.includes('className="capture-dialog"') && page.includes('aria-labelledby="detail-title"'));
check("source Explore actions open retained capture previews", (markup.match(/data-showcase/g) || []).length === 3 && page.includes("openCapture(shot, showcase)"));
check("trusted markup is script-free", !/<script|\son\w+=|javascript:/i.test(markup));
check("real DOM integration does not flatten or iframe the source", page.includes("dangerouslySetInnerHTML") && !page.includes("<iframe"));
check("manual result confirmation is explicit", page.includes("hosts and commissioners confirm results"));
const experienceCopy = read("lib/public-homepage.ts");
check("guest and invitation behavior is disclosed", page.includes("Existing guest and preview options") && experienceCopy.includes("commissioner’s invite"));
check("participant action is distinct from organizer choices", page.includes("Sign in to play") && page.includes('choiceIntent === "organize"'));
check("public hero excludes developer labels and old slogan", !/Illustrative component preview|Example data|Talk is cheap/i.test(page));
check("organizer auth intent wired to existing routes", page.includes("prepareHomepageReturn(returnTo)") && page.includes("handleChoice(event, choice.returnTo)"));
check("source styling retained phone perspective", gameNightStyles.includes("perspective(1100px) rotateY(-12deg) rotateZ(8deg)"));
check("source CSS is isolated from authenticated app", gameNightStyles.includes(".swayger-home .hero") && !gameNightStyles.includes(":root{"));
check("card-body selector was not corrupted by scoping", gameNightStyles.includes(".swayger-home .card .card-body{") && !gameNightStyles.includes(".card-.swayger-home"));
check("homepage owns scrolling inside Expo shell", page.includes("overflow-y:auto") && page.includes("height:100dvh"));
check("no obsolete mark", !/swayger-icon\.png|images\/icon\.png/i.test(markup));
check("no sportsbook language in consumer copy", !/\b(?:wager|wagering|sportsbook|betting|payout|odds)\b/i.test(markup));
check("reduced motion", gameNightStyles.includes("prefers-reduced-motion"));
check("keyboard focus", gameNightStyles.includes(":focus-visible"));
check("skip navigation", markup.includes('href="#main"'));
check("privacy and explainer remain local existing routes", markup.includes('href="/privacy"') && markup.includes('href="/how-it-works"'));
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
