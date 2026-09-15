import type {
  CompetitionReceiptData,
  CompetitionReceiptLeaderboardEntry,
  WeeklyReceiptData,
} from "./fantasy-api";

export const COMPACT_RECEIPT_MAX_ROWS = 5;
export const COMPACT_RECEIPT_MAX_TIE_ROWS = 8;

function formatNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "the winner";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

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

/**
 * Select a harmless, deterministic fact for a weekly receipt share. The
 * leaderboard is already server ordered, so the final row is preferred; the
 * explicit sort makes this stable for callers that provide an unsorted list.
 */
export function getWeeklyReceiptSafeFact(data: WeeklyReceiptData): string {
  const leaderboard = data.leaderboard ?? [];
  if (leaderboard.length > 0) {
    const lowest = leaderboard
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => a.entry.points - b.entry.points || a.index - b.index)[0].entry;
    const label = lowest.team_name
      ? `${lowest.display_name} (${lowest.team_name})`
      : lowest.display_name;
    return `Lowest score: ${label} with ${lowest.points} pts.`;
  }
  const questionCount = data.total_competition_props ?? data.competition_props?.length ?? 0;
  if (questionCount > 0) return `${questionCount} questions settled.`;
  return "The final weekly results are in.";
}

export function buildWeeklyReceiptShareText(
  data: WeeklyReceiptData,
  shortUrl: string,
): string {
  const winners = data.winners ?? [];
  const winnerLabel = formatNames(winners.map((winner) => winner.display_name));
  const points = winners[0]?.points ?? 0;
  const leagueName = data.league_name ?? "Our league";
  const week = data.week_number;
  const fact = getWeeklyReceiptSafeFact(data);
  const result = winners.length > 1
    ? `${winnerLabel} tied for`
    : `${winnerLabel} won`;
  return `🏆 ${result} ${leagueName}'s Week ${week} win with ${points} pts. ${fact}\n${shortUrl}`;
}