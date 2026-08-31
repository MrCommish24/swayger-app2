import {
  buildDraftDayReceiptShareText,
  getCompactReceiptLeaderboard,
} from "../lib/fantasy-receipt-share";
import type { CompetitionReceiptData } from "../lib/fantasy-api";

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

console.log("Receipt share helper result: 6 passed, 0 failed");