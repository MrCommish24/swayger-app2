import { createClient } from "@supabase/supabase-js";
import { computeAndSaveScores } from "./routes-mm-admin";

// ─── Supabase ─────────────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key);
}

// ─── Game windows (CDT = UTC-5) ───────────────────────────────────────────────
// Round of 64/32: noon CDT (17:00 UTC) to midnight CDT (05:00 UTC next day)
// Final Four / Championship start later — window opens at 5pm CDT (22:00 UTC)

export interface GameWindow {
  roundId: string;
  startMs: number;
  endMs: number;
}

export const GAME_WINDOWS: GameWindow[] = [
  { roundId: "round-64",     startMs: new Date("2026-03-19T17:00:00Z").getTime(), endMs: new Date("2026-03-21T05:00:00Z").getTime() },
  { roundId: "round-32",     startMs: new Date("2026-03-21T17:00:00Z").getTime(), endMs: new Date("2026-03-23T05:00:00Z").getTime() },
  { roundId: "sweet-16",     startMs: new Date("2026-03-27T17:00:00Z").getTime(), endMs: new Date("2026-03-29T05:00:00Z").getTime() },
  { roundId: "elite-8",      startMs: new Date("2026-03-29T17:00:00Z").getTime(), endMs: new Date("2026-03-31T05:00:00Z").getTime() },
  { roundId: "final-four",   startMs: new Date("2026-04-04T22:00:00Z").getTime(), endMs: new Date("2026-04-06T05:00:00Z").getTime() },
  { roundId: "championship", startMs: new Date("2026-04-07T22:00:00Z").getTime(), endMs: new Date("2026-04-08T05:00:00Z").getTime() },
];

export function getActiveGameWindow(): GameWindow | null {
  const now = Date.now();
  return GAME_WINDOWS.find((w) => now >= w.startMs && now < w.endMs) ?? null;
}

// ─── Odds API types ───────────────────────────────────────────────────────────

interface OddsScoreGame {
  id: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: Array<{ name: string; score: string }> | null;
}

// ─── Team name fuzzy matching ─────────────────────────────────────────────────
// Handles "Louisville Cardinals" → "Louisville", "South Florida Bulls" → "South Florida", etc.

function normalizeTeam(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(university|college|state|st\.?|the|of|at|&)\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function teamsMatch(apiName: string, ourName: string): boolean {
  if (!apiName || !ourName) return false;
  const a = normalizeTeam(apiName);
  const b = normalizeTeam(ourName);
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  // First significant word match (length > 3 to avoid false positives like "the", "ohio")
  const aFirst = a.split(" ").find((w) => w.length > 3) ?? "";
  const bFirst = b.split(" ").find((w) => w.length > 3) ?? "";
  return aFirst.length > 3 && aFirst === bFirst;
}

// ─── Main: fetch completed scores → insert per-matchup-id results → recompute ─
//
// KEY DESIGN: Each physical game has up to 3 different matchup_ids in mm_round_matchups
// (one per pick_type: upset, blowout, high_scorer). We insert ONE result row per
// matchup_id so that each pick_type's scoring logic finds the correct row.
//
// Team names in result rows use the CURATED (upset) row's short names when available
// (e.g. "Louisville" not "Louisville Cardinals") so they match mm_locked_takes.teams.

export async function checkAndAutoScore(): Promise<{ newResults: number; scored: number; skipped: string }> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return { newResults: 0, scored: 0, skipped: "no ODDS_API_KEY" };
  }

  const window = getActiveGameWindow();
  if (!window) {
    return { newResults: 0, scored: 0, skipped: "not in active game window" };
  }

  // ── Fetch completed scores from Odds API ──────────────────────────────────
  const oddsUrl = `https://api.the-odds-api.com/v4/sports/basketball_ncaab/scores/?apiKey=${apiKey}&daysFrom=2`;
  let allGames: OddsScoreGame[];
  try {
    const res = await fetch(oddsUrl);
    if (!res.ok) {
      const body = await res.text();
      console.error(`[auto-score] Odds API error ${res.status}: ${body}`);
      return { newResults: 0, scored: 0, skipped: `odds api ${res.status}` };
    }
    allGames = (await res.json()) as OddsScoreGame[];
  } catch (e) {
    console.error("[auto-score] Odds API fetch failed:", e);
    return { newResults: 0, scored: 0, skipped: "fetch error" };
  }

  // Only process games that completed AND commenced within our active window
  const completedGames = allGames.filter((g) => {
    if (!g.completed || !g.scores || g.scores.length < 2) return false;
    const commenceMs = new Date(g.commence_time).getTime();
    return commenceMs >= window.startMs && commenceMs < window.endMs;
  });

  if (!completedGames.length) {
    console.log(`[auto-score] No completed ${window.roundId} games found yet`);
    return { newResults: 0, scored: 0, skipped: "no completed games" };
  }

  const supabase = getSupabase();

  // ── Load existing result keys to avoid double-inserts ─────────────────────
  const { data: existingResultsRaw } = await supabase
    .from("mm_game_results")
    .select("matchup_id, round_id")
    .eq("round_id", window.roundId);
  const existingKeys = new Set(
    (existingResultsRaw ?? []).map(
      (r: { round_id: string; matchup_id: string }) => `${r.round_id}:${r.matchup_id}`,
    ),
  );

  // ── Load all matchup rows for this round (all pick_types) ─────────────────
  // Critically: include pick_type so we can prefer the curated "upset" row for
  // canonical team names, and insert a result row for EVERY pick_type's matchup_id.
  type RankedRow = {
    matchup_id: string;
    pick_type: string;
    team_a: string;
    team_b: string;
    seed_a: number;
    seed_b: number;
  };
  const { data: rankedRaw } = await supabase
    .from("mm_round_matchups")
    .select("matchup_id, pick_type, team_a, team_b, seed_a, seed_b")
    .eq("round_id", window.roundId);
  const allMatchupRows = (rankedRaw ?? []) as RankedRow[];

  // ── Process each completed game ───────────────────────────────────────────
  let newResults = 0;

  for (const game of completedGames) {
    const gameScores = game.scores!;
    const homeScoreStr = gameScores.find((s) => s.name === game.home_team)?.score ?? "0";
    const awayScoreStr = gameScores.find((s) => s.name === game.away_team)?.score ?? "0";
    const homeScore = parseInt(homeScoreStr, 10);
    const awayScore = parseInt(awayScoreStr, 10);

    if (isNaN(homeScore) || isNaN(awayScore)) {
      console.warn(`[auto-score] Invalid scores for ${game.home_team} vs ${game.away_team}`);
      continue;
    }

    const winnerApiName = homeScore > awayScore ? game.home_team : game.away_team;
    const loserApiName  = homeScore > awayScore ? game.away_team : game.home_team;
    const winnerScore   = Math.max(homeScore, awayScore);
    const loserScore    = Math.min(homeScore, awayScore);

    // Find ALL matchup rows that reference these two teams (across all pick_types)
    const matchingRows = allMatchupRows.filter(
      (r) =>
        (teamsMatch(game.home_team, r.team_a) || teamsMatch(game.home_team, r.team_b)) &&
        (teamsMatch(game.away_team, r.team_a) || teamsMatch(game.away_team, r.team_b)),
    );

    // Prefer the curated "upset" row for canonical team names (short names like "Louisville"
    // rather than full API names like "Louisville Cardinals") — these must match mm_locked_takes.teams
    const canonicalRow =
      matchingRows.find((r) => r.pick_type === "upset") ??
      matchingRows[0] ??
      null;

    // Resolve canonical winner/loser names and seeds from the best row we have
    let canonicalWinnerName: string;
    let canonicalLoserName: string;
    let winnerSeed: number | null = null;
    let loserSeed:  number | null = null;
    let wasUpset = false;

    if (canonicalRow) {
      const homeIsTeamA   = teamsMatch(game.home_team, canonicalRow.team_a);
      const winnerIsTeamA = (winnerApiName === game.home_team) ? homeIsTeamA : !homeIsTeamA;
      canonicalWinnerName = winnerIsTeamA ? canonicalRow.team_a : canonicalRow.team_b;
      canonicalLoserName  = winnerIsTeamA ? canonicalRow.team_b : canonicalRow.team_a;
      winnerSeed = winnerIsTeamA ? canonicalRow.seed_a : canonicalRow.seed_b;
      loserSeed  = winnerIsTeamA ? canonicalRow.seed_b : canonicalRow.seed_a;
      wasUpset   = (winnerSeed ?? 0) > (loserSeed ?? 0); // higher seed # = underdog
    } else {
      // Game not in our picks system — use raw API names (won't match any picks,
      // but winner_name still goes into winnersByRound for potential locked_takes)
      canonicalWinnerName = winnerApiName;
      canonicalLoserName  = loserApiName;
    }

    // Collect all unique matchup_ids to insert results for
    // (one per pick_type that covers this game — so each pick_type's scoring finds its row)
    const matchupIdsForGame = new Set<string>();
    for (const r of matchingRows) {
      matchupIdsForGame.add(r.matchup_id);
    }
    if (matchupIdsForGame.size === 0) {
      // Game not tracked in our system — insert one fallback row under a stable ID
      matchupIdsForGame.add(`auto-${game.id.slice(-8)}`);
    }

    // Insert one result row per matchup_id (skip any already in DB)
    for (const matchupId of matchupIdsForGame) {
      const resultKey = `${window.roundId}:${matchupId}`;
      if (existingKeys.has(resultKey)) continue;

      const { error } = await supabase.from("mm_game_results").upsert(
        {
          round_id:     window.roundId,
          matchup_id:   matchupId,
          winner_name:  canonicalWinnerName,
          winner_seed:  winnerSeed,
          loser_name:   canonicalLoserName,
          loser_seed:   loserSeed,
          winner_score: winnerScore,
          loser_score:  loserScore,
          was_upset:    wasUpset,
          resolved_at:  new Date().toISOString(),
          resolved_by:  "auto-odds-api",
        },
        { onConflict: "round_id,matchup_id" },
      );

      if (error) {
        console.error(
          `[auto-score] Insert failed for matchup ${matchupId} (${canonicalWinnerName} vs ${canonicalLoserName}):`,
          error.message,
        );
      } else {
        existingKeys.add(resultKey);
        newResults++;
      }
    }

    if (matchupIdsForGame.size > 0) {
      const upsetLabel = wasUpset ? " (UPSET)" : "";
      console.log(
        `[auto-score] ✓ ${canonicalWinnerName} ${winnerScore}-${loserScore} over ${canonicalLoserName}${upsetLabel}` +
        ` [${window.roundId}] — ${matchupIdsForGame.size} row(s) inserted`,
      );
    }
  }

  // ── Recompute scores silently if anything changed ─────────────────────────
  let scored = 0;
  if (newResults > 0) {
    console.log(`[auto-score] ${newResults} new result row(s) — recomputing scores (no emails)...`);
    const { scored: s, error } = await computeAndSaveScores(supabase);
    if (error) {
      console.error("[auto-score] Score compute error:", error);
    } else {
      scored = s;
      console.log(`[auto-score] Leaderboard updated for ${scored} user(s)`);
    }
  }

  return { newResults, scored, skipped: "" };
}
