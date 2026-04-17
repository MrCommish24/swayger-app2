// ─────────────────────────────────────────────────────────────
// NBA Playoffs 2026 — Challenge Data, Types & Helpers
//
// To disable after the season: set NBA_PLAYOFFS_ACTIVE = false
// ─────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import { getApiUrl } from "@/lib/query-client";

export const NBA_PLAYOFFS_ACTIVE = true;

// ─── Scoring System ──────────────────────────────────────────

export const ROUND_POINTS: Record<string, number> = {
  round1:      100,
  round2:      300,
  conf_finals: 1000,
  finals:      3000,
};

export const GAMES_BONUS_POINTS: Record<string, number> = {
  round1:      50,
  round2:      75,
  conf_finals: 150,
  finals:      250,
};

// ─── Prize Structure ─────────────────────────────────────────
// Marketed as "Win $100" — tiered across rounds

export const ROUND_PRIZES: Record<string, { amount: string; label: string }> = {
  round1:      { amount: "$15", label: "Best Round 1 score" },
  round2:      { amount: "$15", label: "Best Round 2 score" },
  conf_finals: { amount: "$20", label: "Best Conference Finals score" },
  finals:      { amount: "$50", label: "Overall Leaderboard Champion" },
};

// ─── Lock Dates ──────────────────────────────────────────────
// Each round locks before its first game tips off.
// Bracket picks for a round are only available before its lock date.

export const ROUND_LOCK_DATES: Record<string, string> = {
  round1:      "2026-04-18T11:00:00-05:00",  // 11am CDT Saturday April 18
  round2:      "2026-05-05T12:00:00-05:00",  // ~May 5 CDT — adjusted after R1 ends
  conf_finals: "2026-05-26T12:00:00-05:00",  // ~May 26 CDT
  finals:      "2026-06-09T12:00:00-05:00",  // ~June 9 CDT
};

export function isRoundLocked(round: string): boolean {
  const lockDate = ROUND_LOCK_DATES[round];
  if (!lockDate) return true;
  return new Date() >= new Date(lockDate);
}

export function isPlayoffsFullyLocked(): boolean {
  return new Date() >= new Date(ROUND_LOCK_DATES.finals);
}

// ─── Types ───────────────────────────────────────────────────

export type PlayoffRound = "round1" | "round2" | "conf_finals" | "finals";
export type Conference = "east" | "west";

export interface PlayoffSeries {
  id: string;
  season: string;
  round: PlayoffRound;
  conference: Conference | null;
  seed1: number | null;
  seed2: number | null;
  team1: string;
  team2: string;
  winner: string | null;
  games: number | null;
  starts_at: string | null;
  sort_order: number;
}

export interface BracketPick {
  id: string;
  user_id: string;
  series_id: string;
  season: string;
  picked_team: string;
  games_guess: number | null;
  created_at: string;
  updated_at: string;
}

export interface PlayoffScore {
  user_id: string;
  season: string;
  total_pts: number;
  round1_pts: number;
  round2_pts: number;
  conf_finals_pts: number;
  finals_pts: number;
  correct_picks: number;
  correct_games: number;
  updated_at: string;
  username?: string;
  display_name?: string;
}

export interface NBAGame {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  h2h_home: number | null;
  h2h_away: number | null;
  spread_home: number | null;
  spread_away: number | null;
  spread_home_odds: number | null;
  spread_away_odds: number | null;
  total: number | null;
  favorite_team: string | null;
}

// ─── Round Metadata ──────────────────────────────────────────

export const ROUND_LABELS: Record<PlayoffRound, string> = {
  round1:      "First Round",
  round2:      "Second Round",
  conf_finals: "Conference Finals",
  finals:      "NBA Finals",
};

export const ROUND_SHORT_LABELS: Record<PlayoffRound, string> = {
  round1:      "R1",
  round2:      "R2",
  conf_finals: "CF",
  finals:      "Finals",
};

export const PLAYOFF_ROUND_ORDER: PlayoffRound[] = [
  "round1",
  "round2",
  "conf_finals",
  "finals",
];

// ─── Helpers ─────────────────────────────────────────────────

export function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function getPointsForRound(round: string): number {
  return ROUND_POINTS[round] ?? 0;
}

export function getGamesBonusForRound(round: string): number {
  return GAMES_BONUS_POINTS[round] ?? 0;
}

export function formatLockDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function getMaxPossiblePoints(): number {
  // R1: 8 series × (100 + 50) + R2: 4 × (300 + 75) + CF: 2 × (1000 + 150) + Finals: 1 × (3000 + 250)
  return 8 * 150 + 4 * 375 + 2 * 1150 + 3250;
}

// ─── Supabase CRUD ───────────────────────────────────────────

export async function fetchAllSeries(): Promise<PlayoffSeries[]> {
  const { data, error } = await supabase
    .from("nba_playoff_series")
    .select("*")
    .eq("season", "2026")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as PlayoffSeries[];
}

export async function fetchMyBracketPicks(userId: string): Promise<BracketPick[]> {
  const { data, error } = await supabase
    .from("nba_playoff_bracket_picks")
    .select("*")
    .eq("user_id", userId)
    .eq("season", "2026");
  if (error) throw error;
  return (data ?? []) as BracketPick[];
}

export async function saveBracketPick(
  userId: string,
  seriesId: string,
  pickedTeam: string,
  gamesGuess: number | null
): Promise<void> {
  const { error } = await supabase
    .from("nba_playoff_bracket_picks")
    .upsert(
      {
        user_id: userId,
        series_id: seriesId,
        season: "2026",
        picked_team: pickedTeam,
        games_guess: gamesGuess,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,series_id" }
    );
  if (error) throw error;
}

export async function fetchLeaderboard(): Promise<PlayoffScore[]> {
  const base = getApiUrl();
  const url = new URL("/api/nba/leaderboard", base);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch leaderboard");
  return res.json();
}

export async function fetchNBAGames(): Promise<NBAGame[]> {
  const base = getApiUrl();
  const url = new URL("/api/nba/games", base);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch games");
  return res.json();
}
