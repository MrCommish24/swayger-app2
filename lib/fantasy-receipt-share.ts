import type {
  CompetitionReceiptData,
  CompetitionReceiptLeaderboardEntry,
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