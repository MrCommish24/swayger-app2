/**
 * Final results presentation: shared label helpers, the share image (rendered
 * through react-native-web), and the Final Standings page structure.
 * No database or network access; scoring is covered by the other suites.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

// Resolve the app's "@/" alias and react-native -> react-native-web for SSR.
const root = path.resolve(__dirname, "..");
const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  if (request === "react-native") request = "react-native-web";
  return originalResolve.call(this, request, ...rest);
};

let passed = 0;
const check = (name: string, condition: unknown) => {
  assert.ok(condition, name);
  passed++;
  console.log(`PASS ${name}`);
};

async function main() {
  const { buildMainResults, buildBonusGameResult, buildReceiptHeader, buildReceiptPickCard, pickTypeLabel } =
    await import("../lib/gameday-final-results");
  const React = await import("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { default: GameDayReceiptCard } = await import("../components/GameDayReceiptCard");

  const prop = (order: number, line: string | null, correct: string | null, extra: object = {}) => ({
    id: `p${order}`, prop_role: "main_matchup", answer_type: "choice", display_order: order, line_text: line,
    answer_options: [`A${order}`, `B${order}`], status: correct ? "settled" : "pending", correct_answer: correct, ...extra,
  });

  // ── Result labels ──────────────────────────────────────────────────────────
  const ats = buildMainResults([prop(1, "PK", "A1"), prop(0, "-6.5", "B0")], "spread");
  check("main results are ordered by display order", ats.map((r) => r.prop_id).join() === "p0,p1");
  check("ATS result shows both spreads", ats[0].result_label === "B0 -6.5 over A0 +6.5");
  check("PK result labels both sides PK", ats[1].result_label === "A1 PK over B1 PK");
  const su = buildMainResults([prop(0, "-6.5", "A0")], "straight_up");
  check("Straight Up label ignores line text", su[0].result_label === "A0 over B0" && su[0].matchup_label === "A0 vs B0");
  const legacy = buildMainResults([prop(0, "-6.5", "A0")], null);
  check("legacy null pick type is Straight Up", legacy[0].pick_type === "straight_up" && legacy[0].result_label === "A0 over B0");
  check("unsettled result has no label", buildMainResults([prop(0, "-3", null)], "spread")[0].result_label === null);
  check("invalid ATS line yields no guessed label", buildMainResults([prop(0, "context", "A0")], "spread")[0].result_label === null);
  check("stored multi-correct (push) never picks a side",
    buildMainResults([prop(0, "-3", "A0", { correct_answer_ids: ["A0", "B0"] })], "spread")[0].result_label === null);
  check("bonus and total props are not main results",
    buildMainResults([prop(0, "-3", "A0"), { ...prop(1, null, "x"), prop_role: "bonus_game" },
      { ...prop(2, null, null), prop_role: "bonus_total", answer_type: "integer" }], "spread").length === 1);
  const bonus = buildBonusGameResult([{ ...prop(7, "-10", "A7"), prop_role: "bonus_game" }], "spread");
  check("bonus game result uses ATS labels", bonus?.result_label === "A7 +10 over B7 -10");
  check("pick type labels are human readable", pickTypeLabel("spread") === "Against the Spread" && pickTypeLabel(undefined) === "Straight Up");

  // ── Receipt header ─────────────────────────────────────────────────────────
  const pickHeader = buildReceiptHeader({ roomName: "Week 5 Parlay", teamA: null, teamB: null, pickCard: { pickType: "spread", scoringMode: "all_correct" } });
  check("Pick Card header uses card name and mode", pickHeader.title === "Week 5 Parlay" && pickHeader.subtitle === "Against the Spread · Perfect Card");
  const single = buildReceiptHeader({ roomName: "Opening Night", teamA: "Lakers", teamB: "Celtics" });
  check("single-game header keeps Team A vs Team B", single.title === "Lakers vs Celtics" && single.subtitle === "Opening Night");
  const broken = buildReceiptHeader({ roomName: "Odd Room", teamA: null, teamB: "null" });
  check("invalid single-game teams are dropped", broken.title === "Odd Room" && broken.subtitle === null);

  // ── Rendered share image ───────────────────────────────────────────────────
  const entry = (id: string, name: string, correct: number, rank: number, win: boolean) => ({
    participant_id: id, display_name: name, is_guest: false, game_day_sp: correct * 10,
    correct_picks: correct, pending_picks: 0, total_picks: 6, rank, is_winner: win,
  });
  const render = (props: object) =>
    renderToStaticMarkup(React.createElement(GameDayReceiptCard as any, { leaderboard: [], ...props }));
  const cards = [{
    pick_type: "spread", display_order: 0,
    gameday_props: [
      ...[0, 1, 2, 3, 4, 5].map((i) => prop(i, "-3", `A${i}`)),
      { ...prop(6, "-10", "A6"), prop_role: "bonus_game" },
      { id: "t", prop_role: "bonus_total", answer_type: "integer", status: "settled", correct_numeric_answer: 47, display_order: 7 },
    ],
  }];
  const pickCard = buildReceiptPickCard(cards as any, ["A6", "B6"]);
  const noWinner = render({
    roomName: "Week 5 Parlay", teamA: null, teamB: null, scoringMode: "all_correct", pickCard,
    leaderboard: [entry("1", "Dace G", 3, 1, false)],
  });
  check("Pick Card image never renders null or undefined", !/null|undefined/.test(noWinner));
  check("Pick Card image shows card name once", noWinner.split("Week 5 Parlay").length === 2);
  check("Pick Card image shows mode and win condition", noWinner.includes("Against the Spread · Perfect Card"));
  check("Pick Card image shows no-winner message", noWinner.includes("No perfect card — no winner."));
  check("Pick Card image shows main score denominator", noWinner.includes("3/6 correct"));
  check("Pick Card image shows concise bonus and total", noWinner.includes("Bonus Game: A6 +10 over B6 -10") && noWinner.includes("Total Points: 47"));
  const legacyImage = render({
    roomName: "Legacy Card", teamA: null, teamB: null, scoringMode: "most_correct",
    pickCard: buildReceiptPickCard([{ ...cards[0], pick_type: null }] as any, null),
    leaderboard: [entry("1", "Sam", 4, 1, true)],
  });
  check("legacy Pick Card image is Straight Up without null fields", !/null|undefined/.test(legacyImage) && legacyImage.includes("Straight Up · Most Correct"));
  const singleImage = render({
    roomName: "Opening Night", teamA: "Lakers", teamB: "Celtics", gameDate: "2026-08-25",
    leaderboard: [entry("1", "Sam", 2, 1, true)],
  });
  check("single-game image keeps team header and points", singleImage.includes("Lakers vs Celtics") && /20(<!-- -->)? pts/.test(singleImage)
    && !singleImage.includes("/6 correct") && !/null|undefined/.test(singleImage));

  // ── Final Standings page structure (source order) ──────────────────────────
  const page = readFileSync(path.join(root, "app/gameday/[roomId]/index.tsx"), "utf8");
  const at = (needle: string) => {
    const i = page.indexOf(needle);
    assert.ok(i >= 0, `missing ${needle}`);
    return i;
  };
  const banner = at("{isFinalWeekly ? (\n            <FinalSummary");
  const sections = at("{isFinalWeekly ? (\n        <>");
  const order = [
    page.indexOf("<FinalSummary", banner),
    page.indexOf("<LeaderboardSection", sections),
    page.indexOf("<FinalCorrectResults", sections),
    page.indexOf("<FinalBreakdown", sections),
    page.indexOf("<FinalBonusSection", sections),
  ];
  check("page order is summary, leaderboard, results, breakdown, bonus/total",
    order.every((n, i) => n > 0 && (i === 0 || n > order[i - 1])));
  check("leaderboard precedes the raw reveal cards", sections < at("<RevealCard"));
  check("finalized Pick Cards skip the duplicate bottom leaderboard and reveal stack",
    page.includes("{isFinalWeekly ? null : <LeaderboardSection") && page.includes("(isFinalWeekly ? [] : cards.filter"));
  check("ATS terminology is mode-aware", page.includes("Correct ATS Results") && page.includes('pickType === "spread" ? "Covered" : "Winner"'));
  check("Straight Up terminology present", page.includes('"Correct Results"'));
  check("Bonus and Total are distinct sections", page.includes('Text style={styles.finalSectionTitle}>Bonus Game') && page.includes(">Total Points<"));
  check("bonus and total explicitly excluded from main score", page.includes("not part of the main card score"));
  check("final page never uses 'Who won?' for resolved results", !/Who won\?/.test(page.slice(at("function FinalSummary"), at("// ── Leaderboard"))));

  if (process.env.GENERATE_RECEIPT_PNG === "1") {
    const { chromium } = await import("playwright");
    const { StyleSheet } = require("react-native-web");
    const browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/repl/tools/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const output = path.join(root, "generated-artifacts/final-results");
      await mkdir(output, { recursive: true });
      const tab = await browser.newPage({ viewport: { width: 800, height: 1000 } });
      for (const [name, markup] of [["ats", noWinner], ["legacy-winner", legacyImage], ["single-game", singleImage]]) {
        await tab.setContent(`<html><head><style>${(StyleSheet as any).getSheet().textContent}</style></head>
          <body><div id="receipt" style="position:absolute;top:-9999px;left:-9999px;width:340px">${markup}</div></body></html>`);
        await tab.addScriptTag({ path: path.join(root, "node_modules/html2canvas/dist/html2canvas.min.js") });
        const result = await tab.evaluate(async () => {
          const canvas = await (window as any).html2canvas(document.getElementById("receipt"), {
            useCORS: true, allowTaint: false, backgroundColor: "#0C1220", scale: 2, logging: false,
          });
          const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          let brightPixels = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] > 180 && pixels[i + 1] > 180 && pixels[i + 2] > 180) brightPixels++;
          }
          return { url: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, brightPixels };
        });
        check(`${name} html2canvas generates PNG`, result.url.startsWith("data:image/png;base64,"));
        check(`${name} PNG has receipt dimensions`, result.width === 680 && result.height > 300);
        await writeFile(path.join(output, `${name}.png`), Buffer.from(result.url.split(",")[1], "base64"));
        console.log(`${name} capture: ${result.width}x${result.height}, ${result.brightPixels} bright text pixels`);
        check(`${name} PNG is not blank despite offscreen positioning`, result.brightPixels > 100);
      }
    } finally {
      await browser.close();
    }
  }
  console.log(`Final results: ${passed} passed, 0 failed`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
