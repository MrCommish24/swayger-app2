import {
  buildDraftDayReceiptShareText,
  buildWeeklyReceiptShareText,
  getWeeklyReceiptSafeFact,
  getCompactReceiptLeaderboard,
  WEEKLY_COMPACT_RECEIPT_MAX_ROWS,
  WEEKLY_COMPACT_RECEIPT_MAX_TIE_ROWS,
} from "../lib/fantasy-receipt-share";
import type { CompetitionReceiptData, WeeklyReceiptData } from "../lib/fantasy-api";
import {
  isReceiptPreviewCrawler,
  renderWeeklyReceiptPreviewHtml,
  renderWeeklyReceiptPreviewSvg,
} from "./fantasy-weekly-preview";

const receipt: CompetitionReceiptData = {
  finalized: true,
  league_name: "Sunday Crew",
  season_year: 2026,
  winners: [
    { display_name: "Alex", team_name: null, points: 8, correct_count: 4, rank: 1, rank_label: "1" },
  ],
  leaderboard: [
    { display_name: "Alex", team_name: null, points: 8, correct_count: 4, rank: 1, rank_label: "1" },
    { display_name: "Blair", team_name: null, points: 7, correct_count: 3, rank: 2, rank_label: "2" },
    { display_name: "Casey", team_name: null, points: 6, correct_count: 3, rank: 3, rank_label: "3" },
    { display_name: "Drew", team_name: null, points: 5, correct_count: 2, rank: 4, rank_label: "4" },
    { display_name: "Evan", team_name: null, points: 5, correct_count: 2, rank: 4, rank_label: "T-4" },
    { display_name: "Fran", team_name: null, points: 4, correct_count: 2, rank: 6, rank_label: "6" },
  ],
};

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

const shortUrl = "https://example.test/r/abcdefghijkl2345";
const singleText = buildDraftDayReceiptShareText(receipt, shortUrl);
assert(singleText.includes("Alex won Sunday Crew's Draft Day with 8 pts."), "Single-winner share text is concise and complete");
assert(singleText.endsWith(shortUrl), "Share text includes the stable short URL");

const coWinnerReceipt = {
  ...receipt,
  winners: [
    receipt.winners![0],
    { ...receipt.winners![0], display_name: "Blair" },
  ],
};
const coWinnerText = buildDraftDayReceiptShareText(coWinnerReceipt, shortUrl);
assert(coWinnerText.includes("Alex and Blair tied"), "Co-winner share text names both winners");

const compact = getCompactReceiptLeaderboard(
  receipt.leaderboard!,
  WEEKLY_COMPACT_RECEIPT_MAX_ROWS,
  WEEKLY_COMPACT_RECEIPT_MAX_TIE_ROWS,
);
assert(compact.length === 5 && compact.some((entry) => entry.display_name === "Evan"), "Compact standings retain a tie at the four-row cutoff");
assert(!JSON.stringify(compact).includes("question"), "Compact standings contain no question or pick data");

const weeklyProps: NonNullable<WeeklyReceiptData["competition_props"]> = [
  {
    prop_id: "highest",
    template_prop_id: "fantasy_weekly_nfl_highest_scoring_team",
    question: "Highest?",
    display_order: 10,
    point_value: 15,
    scoring_scope: "competition",
    correct_answer_ids: ["jasand"],
    correct_answer_labels: ["Team Jasand Shootaw"],
  },
  {
    prop_id: "lowest",
    template_prop_id: "fantasy_weekly_nfl_lowest_scoring_team",
    question: "Lowest?",
    display_order: 20,
    point_value: 10,
    scoring_scope: "competition",
    correct_answer_ids: ["appetite"],
    correct_answer_labels: ["Appetite 4 Destruction"],
  },
  {
    prop_id: "largest",
    template_prop_id: "fantasy_weekly_nfl_largest_margin_winner",
    question: "Largest margin?",
    display_order: 30,
    point_value: 20,
    scoring_scope: "competition",
    correct_answer_ids: ["dispimpin"],
    correct_answer_labels: ["Dispimpin"],
  },
  {
    prop_id: "smallest",
    template_prop_id: "fantasy_weekly_nfl_smallest_margin_winner",
    question: "Smallest margin?",
    display_order: 40,
    point_value: 20,
    scoring_scope: "competition",
    correct_answer_ids: ["roarke"],
    correct_answer_labels: ["Mr Roarke"],
  },
];

const weeklyReceipt: WeeklyReceiptData = {
  ...receipt,
  league_name: "Food Pyramid XX",
  week_number: 1,
  leaderboard: [
    { display_name: "J Askew", team_name: "Blue", points: 20, correct_count: 4, rank: 1, rank_label: "1" },
    { display_name: "Mr Roarke", team_name: "Big Guns", points: 10, correct_count: 1, rank: 2, rank_label: "2" },
  ],
  winners: [{ display_name: "J Askew", team_name: "Blue", points: 20, correct_count: 4, rank: 1, rank_label: "1" }],
  competition_props: weeklyProps,
  next_week_number: 2,
  next_week_published: false,
};
const weeklyText = buildWeeklyReceiptShareText(weeklyReceipt, shortUrl);
assert(weeklyText.includes("J Askew wins at 20 SP."), "Weekly winner score uses SP");
assert(!weeklyText.includes("Mr Roarke") && !weeklyText.includes("10 pts"), "Weekly fact is not derived from Swayger standings");
assert(getWeeklyReceiptSafeFact(weeklyReceipt) === "💥 Biggest blowout: Dispimpin.", "Largest-margin result has first priority");
assert(
  getWeeklyReceiptSafeFact({ ...weeklyReceipt, competition_props: weeklyProps.filter((prop) => prop.prop_id !== "largest") }) ===
    "🔥 Highest fantasy score: Team Jasand Shootaw.",
  "Highest fantasy score is the first fallback",
);
assert(
  getWeeklyReceiptSafeFact({ ...weeklyReceipt, competition_props: weeklyProps.filter((prop) => !["largest", "highest"].includes(prop.prop_id)) }) ===
    "📉 Fewest fantasy points: Appetite 4 Destruction.",
  "Lowest fantasy score is the second fallback",
);
assert(
  getWeeklyReceiptSafeFact({ ...weeklyReceipt, competition_props: weeklyProps.filter((prop) => prop.prop_id === "smallest") }) ===
    "😬 Closest win of the week: Mr Roarke.",
  "Closest win is the final fallback",
);
assert(getWeeklyReceiptSafeFact({ ...weeklyReceipt, competition_props: [] }) === "", "No supported result omits the fact line");
assert(
  getWeeklyReceiptSafeFact({
    ...weeklyReceipt,
    competition_props: [{
      ...weeklyProps[2],
      correct_answer_ids: ["a", "b"],
      correct_answer_labels: ["Team A", "Team B"],
    }],
  }) === "💥 Biggest wins: Team A + Team B.",
  "Multi-correct facts include every qualifying team",
);
assert(weeklyText.split("\n")[0] === "🏆 Food Pyramid XX — Week 1", "Weekly copy starts with the concise league and week line");
const coWinnerTextWeekly = buildWeeklyReceiptShareText({
  ...weeklyReceipt,
  winners: [
    weeklyReceipt.winners![0],
    { ...weeklyReceipt.winners![0], display_name: "J Spells" },
  ],
}, shortUrl);
assert(coWinnerTextWeekly.includes("J Askew + J Spells tie at 20 SP."), "Co-winner weekly copy names every winner");
assert(weeklyText.includes("Week 2 is next — don’t miss it."), "Unpublished next week keeps the compact next-week CTA");
assert(
  buildWeeklyReceiptShareText({ ...weeklyReceipt, next_week_published: true }, shortUrl)
    .includes("Week 2 is live — make your picks."),
  "Published next week without a reward keeps the live CTA",
);
assert(
  buildWeeklyReceiptShareText({
    ...weeklyReceipt,
    next_week_published: true,
    next_week_reward_amount_display: "$10",
  }, shortUrl).includes("Week 2 is live — $10 up for grabs."),
  "Published next week includes its reward",
);
assert(weeklyText.endsWith(shortUrl), "Weekly share text preserves the stable short URL");
assert(!/in the books|tie for the win|of the week/.test(weeklyText), "Weekly share text omits redundant verbose wording");

const preview = {
  leagueName: "Food Pyramid XX",
  weekNumber: 1,
  seasonYear: 2026,
  winners: [
    { displayName: "J Askew", points: 20 },
    { displayName: "J Spells", points: 20 },
  ],
  topStandings: [
    { displayName: "J Askew", points: 20, rankLabel: "T-1" },
    { displayName: "J Spells", points: 20, rankLabel: "T-1" },
    { displayName: "Mr Roarke", points: 10, rankLabel: "3" },
  ],
  fact: "Biggest blowout: Dispimpin",
};
const previewHtml = renderWeeklyReceiptPreviewHtml(
  preview,
  "https://www.swayger.app/r/abcdefghijkl2345",
  "https://www.swayger.app/fantasy/weeks/league/season/1/receipt",
  "https://www.swayger.app/r/abcdefghijkl2345/preview.svg",
);
const previewSvg = renderWeeklyReceiptPreviewSvg(preview);
assert(isReceiptPreviewCrawler("facebookexternalhit/1.1") && isReceiptPreviewCrawler("GroupMeBot"), "Known social preview crawlers are detected");
assert(!isReceiptPreviewCrawler("Mozilla/5.0 Chrome/140"), "Normal browser requests are not treated as crawlers");
assert(
  previewHtml.includes("Food Pyramid XX — Week 1 Receipt") &&
    previewHtml.includes("J Askew + J Spells tied at 20 SP. Biggest blowout: Dispimpin."),
  "Preview HTML contains receipt-specific title and description",
);
assert(
  !/(guest_token|member_id|claim_id|email|phone|who picked|correct_answer)/i.test(previewHtml),
  "Preview HTML omits protected receipt and identity fields",
);
assert(
  previewSvg.includes('width="1080" height="1350"') &&
    previewSvg.includes("SWAYGER FANTASY") &&
    previewSvg.includes("J Askew") &&
    !/question|selected_answer|participant_id/i.test(previewSvg),
  "Preview image is compact, branded, result-only, and viewer-independent",
);

console.log("Receipt share helper result: 27 passed, 0 failed");