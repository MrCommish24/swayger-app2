import {
  buildDraftDayReceiptShareText,
  buildWeeklyReceiptShareText,
  getWeeklyReceiptSafeFact,
  getCompactReceiptLeaderboard,
} from "../lib/fantasy-receipt-share";
import type { CompetitionReceiptData, WeeklyReceiptData } from "../lib/fantasy-api";

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
    { display_name: "Evan", team_name: null, points: 4, correct_count: 2, rank: 5, rank_label: "5" },
    { display_name: "Fran", team_name: null, points: 4, correct_count: 2, rank: 5, rank_label: "T-5" },
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

const compact = getCompactReceiptLeaderboard(receipt.leaderboard!);
assert(compact.length === 6 && compact.some((entry) => entry.display_name === "Fran"), "Compact standings retain a tie at the cutoff");
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
assert(weeklyText.includes("J Askew wins Week 1 with 20 SP."), "Weekly winner score uses SP");
assert(!weeklyText.includes("Mr Roarke") && !weeklyText.includes("10 pts"), "Weekly fact is not derived from Swayger standings");
assert(getWeeklyReceiptSafeFact(weeklyReceipt) === "💥 Biggest blowout of the week: Dispimpin.", "Largest-margin result has first priority");
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
  }) === "💥 Biggest wins of the week: Team A + Team B.",
  "Multi-correct facts include every qualifying team",
);
assert(weeklyText.includes("🏆 Food Pyramid XX — Week 1 is in the books."), "Single-winner weekly copy uses the requested format");
const coWinnerTextWeekly = buildWeeklyReceiptShareText({
  ...weeklyReceipt,
  winners: [
    weeklyReceipt.winners![0],
    { ...weeklyReceipt.winners![0], display_name: "J Spells" },
  ],
}, shortUrl);
assert(coWinnerTextWeekly.includes("J Askew + J Spells tie for the win with 20 SP."), "Co-winner weekly copy names every winner");
assert(weeklyText.includes("Week 2 is next. Don’t miss it."), "Unpublished next week keeps the next-week CTA");
assert(
  buildWeeklyReceiptShareText({ ...weeklyReceipt, next_week_published: true }, shortUrl)
    .includes("Week 2 is live. Make your picks."),
  "Published next week keeps the live CTA",
);
assert(weeklyText.endsWith(shortUrl), "Weekly share text preserves the stable short URL");

console.log("Receipt share helper result: 21 passed, 0 failed");