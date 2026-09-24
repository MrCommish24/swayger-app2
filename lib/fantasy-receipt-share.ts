import type {
  CompetitionReceiptData,
  CompetitionReceiptLeaderboardEntry,
  WeeklyReceiptData,
} from "./fantasy-api";

export const COMPACT_RECEIPT_MAX_ROWS = 5;
export const COMPACT_RECEIPT_MAX_TIE_ROWS = 8;
export const WEEKLY_COMPACT_RECEIPT_MAX_ROWS = 4;
export const WEEKLY_COMPACT_RECEIPT_MAX_TIE_ROWS = 5;

function formatNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "the winner";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function formatShareNames(names: string[]): string {
  return names.join(" + ");
}

const WEEKLY_FACT_TEMPLATES = {
  largestMargin: "fantasy_weekly_nfl_largest_margin_winner",
  highestScore: "fantasy_weekly_nfl_highest_scoring_team",
  lowestScore: "fantasy_weekly_nfl_lowest_scoring_team",
  smallestMargin: "fantasy_weekly_nfl_smallest_margin_winner",
} as const;

export function getCompactReceiptLeaderboard(
  leaderboard: CompetitionReceiptLeaderboardEntry[] = [],
  maxRows = COMPACT_RECEIPT_MAX_ROWS,
  maxTieRows = COMPACT_RECEIPT_MAX_TIE_ROWS,
): CompetitionReceiptLeaderboardEntry[] {
  if (leaderboard.length <= maxRows) return leaderboard;

  const cutoffPoints = leaderboard[maxRows - 1]?.points;
  if (cutoffPoints === undefined) return leaderboard.slice(0, maxRows);

  const rows = leaderboard.filter(
    (entry, index) => index < maxRows || entry.points === cutoffPoints,
  );
  return rows.slice(0, Math.max(maxRows, maxTieRows));
}

export function buildDraftDayReceiptShareText(
  data: CompetitionReceiptData,
  shortUrl: string,
): string {
  const winners = data.winners ?? [];
  const winnerNames = winners.map((winner) => winner.display_name);
  const points = winners[0]?.points ?? 0;
  const leagueName = data.league_name ?? "Our league";
  const winnerLabel = formatNames(winnerNames);

  if (winners.length > 1) {
    return `🏆 ${winnerLabel} tied for the ${leagueName} Draft Day win with ${points} pts.\n${shortUrl}`;
  }
  return `🏆 ${winnerLabel} won ${leagueName}'s Draft Day with ${points} pts.\n${shortUrl}`;
}

export function getWeeklyReceiptSafeFact(data: WeeklyReceiptData): string {
  const props = data.competition_props ?? [];
  const resultFor = (templatePropId: string) => {
    const prop = props.find((entry) => entry.template_prop_id === templatePropId);
    return (prop?.correct_answer_labels ?? []).map((label) => label.trim()).filter(Boolean);
  };

  const largestMargin = resultFor(WEEKLY_FACT_TEMPLATES.largestMargin);
  if (largestMargin.length > 0) {
    return largestMargin.length === 1
      ? `💥 Biggest blowout: ${largestMargin[0]}.`
      : `💥 Biggest wins: ${formatShareNames(largestMargin)}.`;
  }

  const highestScore = resultFor(WEEKLY_FACT_TEMPLATES.highestScore);
  if (highestScore.length > 0) {
    return highestScore.length === 1
      ? `🔥 Highest fantasy score: ${highestScore[0]}.`
      : `🔥 Highest fantasy scores: ${formatShareNames(highestScore)}.`;
  }

  const lowestScore = resultFor(WEEKLY_FACT_TEMPLATES.lowestScore);
  if (lowestScore.length > 0) {
    return `📉 Fewest fantasy points: ${formatShareNames(lowestScore)}.`;
  }

  const smallestMargin = resultFor(WEEKLY_FACT_TEMPLATES.smallestMargin);
  if (smallestMargin.length > 0) {
    return smallestMargin.length === 1
      ? `😬 Closest win of the week: ${smallestMargin[0]}.`
      : `😬 Closest wins of the week: ${formatShareNames(smallestMargin)}.`;
  }

  return "";
}

export function formatWeeklyReceiptReward(
  amountDisplay?: string | null,
  description?: string | null,
): string | null {
  const details = [amountDisplay, description]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
  return details.length > 0 ? details.join(" · ") : null;
}

export function buildWeeklyReceiptShareText(
  data: WeeklyReceiptData,
  shortUrl: string,
): string {
  const winners = data.winners ?? [];
  const winnerLabel = formatShareNames(winners.map((winner) => winner.display_name));
  const points = winners[0]?.points ?? 0;
  const leagueName = data.league_name ?? "Our league";
  const week = data.week_number;
  const fact = getWeeklyReceiptSafeFact(data);
  const rewardDetails = formatWeeklyReceiptReward(
    data.reward_amount_display,
    data.reward_description,
  );
  const nextWeek = data.next_week_number ?? week + 1;
  const result = winners.length > 1
    ? `${winnerLabel} tie at ${points} SP.`
    : `${winnerLabel} wins at ${points} SP.`;
  const cta = data.next_week_published
    ? data.next_week_reward_amount_display
      ? `Week ${nextWeek} is live — ${data.next_week_reward_amount_display} up for grabs.`
      : `Week ${nextWeek} is live — make your picks.`
    : `Week ${nextWeek} is next — don’t miss it.`;
  return [
    `🏆 ${leagueName} — Week ${week}`,
    result,
    rewardDetails ? `🎁 Weekly reward: ${rewardDetails}` : "",
    fact,
    cta,
    shortUrl,
  ].filter(Boolean).join("\n");
}