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
// Each window covers noon CDT (17:00 UTC) to midnight CDT (05:00 UTC next day)
// Final Four / Championship games start later so window starts at 5pm CDT (22:00 UTC)

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
  // First significant word match (length > 3 to avoid false positives)
  const aFirst = a.split(" ").find((w) => w.length > 3) ?? "";
  const bFirst = b.split(" ").find((w) => w.length > 3) ?? "";
  return aFirst.length > 3 && aFirst === bFirst;
}

// ─── Main: fetch completed scores, insert results, recompute ─────────────────

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

  // Only process games that completed AND commenced within our window
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

  // ── Get existing results to avoid double-inserts ──────────────────────────
  const { data: existingResults } = await supabase
    .from("mm_game_results")
    .select("matchup_id, round_id")
    .eq("round_id", window.roundId);
  const existingKeys = new Set(
    (existingResults ?? []).map(
      (r: { round_id: string; matchup_id: string }) => `${r.round_id}:${r.matchup_id}`,
    ),
  );

  // ── Get ranked matchups from DB so we can resolve matchup_ids ────────────
  type RankedRow = {
    round_id: string;
    matchup_id: string;
    team_a: string;
    team_b: string;
    seed_a: number;
    seed_b: number;
  };
  const { data: rankedRaw } = await supabase
    .from("mm_round_matchups")
    .select("round_id, matchup_id, team_a, team_b, seed_a, seed_b")
    .eq("round_id", window.roundId);
  const matchupRows = (rankedRaw ?? []) as RankedRow[];

  // Deduplicate by matchup_id (keep first occurrence per unique matchup)
  const seenMatchupIds = new Set<string>();
  const uniqueMatchupRows = matchupRows.filter((r) => {
    if (seenMatchupIds.has(r.matchup_id)) return false;
    seenMatchupIds.add(r.matchup_id);
    return true;
  });

  // ── Process each completed game ───────────────────────────────────────────
  let newResults = 0;

  for (const game of completedGames) {
    const scores = game.scores!;
    const homeScoreStr = scores.find((s) => s.name === game.home_team)?.score ?? "0";
    const awayScoreStr = scores.find((s) => s.name === game.away_team)?.score ?? "0";
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

    // Find our matchup entry by fuzzy-matching both teams
    const matchedRow = uniqueMatchupRows.find(
      (r) =>
        (teamsMatch(game.home_team, r.team_a) || teamsMatch(game.home_team, r.team_b)) &&
        (teamsMatch(game.away_team, r.team_a) || teamsMatch(game.away_team, r.team_b)),
    );

    // Use our matchup_id if found; otherwise generate a stable fallback from the odds game ID
    const matchupId = matchedRow?.matchup_id ?? `auto-${game.id.slice(-8)}`;
    const resultKey = `${window.roundId}:${matchupId}`;

    if (existingKeys.has(resultKey)) {
      continue; // already processed
    }

    // Determine seeds and upset flag
    let winnerSeed: number | null = null;
    let loserSeed:  number | null = null;
    let wasUpset = false;

    if (matchedRow) {
      const homeIsTeamA = teamsMatch(game.home_team, matchedRow.team_a);
      const winnerIsTeamA = winnerApiName === game.home_team ? homeIsTeamA : !homeIsTeamA;
      winnerSeed = winnerIsTeamA ? matchedRow.seed_a : matchedRow.seed_b;
      loserSeed  = winnerIsTeamA ? matchedRow.seed_b : matchedRow.seed_a;
      wasUpset   = winnerSeed > loserSeed; // higher seed number = bigger underdog
    }

    // Resolve team names — use our DB names if we matched, otherwise use API names
    const winnerName = matchedRow
      ? (teamsMatch(winnerApiName, matchedRow.team_a) ? matchedRow.team_a : matchedRow.team_b)
      : winnerApiName;
    const loserName = matchedRow
      ? (teamsMatch(loserApiName, matchedRow.team_a) ? matchedRow.team_a : matchedRow.team_b)
      : loserApiName;

    const { error } = await supabase.from("mm_game_results").upsert(
      {
        round_id:     window.roundId,
        matchup_id:   matchupId,
        winner_name:  winnerName,
        winner_seed:  winnerSeed,
        loser_name:   loserName,
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
      console.error(`[auto-score] Insert failed for ${winnerName} vs ${loserName}:`, error.message);
    } else {
      console.log(
        `[auto-score] ✓ ${winnerName} ${winnerScore}-${loserScore} over ${loserName}` +
        (wasUpset ? " (UPSET)" : "") +
        ` [${window.roundId}]`,
      );
      existingKeys.add(resultKey);
      newResults++;
    }
  }

  // ── Recompute scores silently if anything new came in ────────────────────
  let scored = 0;
  if (newResults > 0) {
    console.log(`[auto-score] ${newResults} new result(s) — recomputing scores (no emails)...`);
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
