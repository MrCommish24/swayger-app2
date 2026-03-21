import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { FULL_BRACKET } from "../lib/march-madness";

// ─── Seed lookup from bracket data ───────────────────────────────────────────

// Known aliases: Odds API name fragment → bracket name fragment
const TEAM_ALIASES: Record<string, string> = {
  "liu": "long island",
  "unc": "north carolina",
  "uconn": "connecticut",
  "nc state": "nc state",
  "fau": "florida atlantic",
  "vcu": "vcu",
  "ucf": "ucf",
  "usc": "usc",
  "utsa": "utsa",
  "utep": "utep",
  "smu": "smu",
  "tcu": "tcu",
};

// Build a flat map: normalized team name → seed
const BRACKET_SEED_MAP = new Map<string, number>();
(function buildSeedMap() {
  const regions = ["east", "west", "south", "midwest"] as const;
  for (const region of regions) {
    const games = (FULL_BRACKET as any)[region] ?? [];
    for (const g of games) {
      if (g.team1) BRACKET_SEED_MAP.set(g.team1.toLowerCase().trim(), g.seed1);
      if (g.team2) BRACKET_SEED_MAP.set(g.team2.toLowerCase().trim(), g.seed2);
    }
  }
  // First Four teams
  for (const g of FULL_BRACKET.firstFour ?? []) {
    if ((g as any).teamA) BRACKET_SEED_MAP.set((g as any).teamA.toLowerCase().trim(), (g as any).slot);
    if ((g as any).teamB) BRACKET_SEED_MAP.set((g as any).teamB.toLowerCase().trim(), (g as any).slot);
  }
})();

function lookupSeed(apiTeamName: string): number {
  const norm = apiTeamName.toLowerCase().trim();
  // 1. Exact match
  if (BRACKET_SEED_MAP.has(norm)) return BRACKET_SEED_MAP.get(norm)!;
  // 2. Alias match
  for (const [alias, bracketFrag] of Object.entries(TEAM_ALIASES)) {
    if (norm.includes(alias)) {
      for (const [bName, seed] of BRACKET_SEED_MAP) {
        if (bName.includes(bracketFrag)) return seed;
      }
    }
  }
  // 3. Bracket name is substring of API name (e.g. "Arizona" in "Arizona Wildcats")
  for (const [bName, seed] of BRACKET_SEED_MAP) {
    if (norm.includes(bName) || bName.includes(norm)) return seed;
  }
  // 4. First significant word match
  const firstWord = norm.split(" ")[0];
  if (firstWord.length > 3) {
    for (const [bName, seed] of BRACKET_SEED_MAP) {
      if (bName.startsWith(firstWord)) return seed;
    }
  }
  return 0;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface RankedMatchup {
  matchupId: string;
  teamA: string;
  teamB: string;
  seedA: number;
  seedB: number;
  region: string;
  rank: number;
  underdogTeam?: string;
  underdogSeed?: number;
  favoriteTeam?: string;
  favoriteSeed?: number;
  upsetProbability?: number;
  spread?: number;
  overUnder?: number;
  underdogMoneyline?: number;
  gameDate?: string;
  site?: string;
  oddsSource: "live" | "seed-based";
  keyStat?: string;
}

interface OddsGame {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: Array<{
    key: string;
    markets: Array<{
      key: string;
      outcomes: Array<{ name: string; price?: number; point?: number }>;
    }>;
  }>;
}

// ─── Round date ranges for filtering Odds API ────────────────────────────────

const ROUND_DATE_RANGES: Record<string, { start: string; end: string }> = {
  "first-four": { start: "2026-03-17", end: "2026-03-19" },
  "round-64":   { start: "2026-03-19", end: "2026-03-21" },
  "round-32":   { start: "2026-03-21", end: "2026-03-23" },
  "sweet-16":   { start: "2026-03-26", end: "2026-03-28" },
  "elite-8":    { start: "2026-03-28", end: "2026-03-30" },
  "final-four": { start: "2026-04-04", end: "2026-04-05" },
  "championship": { start: "2026-04-06", end: "2026-04-07" },
};

// How many candidates to surface per type per round
const CANDIDATE_COUNTS: Record<string, Record<string, number>> = {
  "round-64":   { upset: 15, blowout: 5, high_scorer: 5 },
  "round-32":   { upset: 5, blowout: 5, high_scorer: 5 },
  "sweet-16":   { upset: 4, blowout: 5, high_scorer: 5 },
  "elite-8":    { upset: 3, blowout: 5, high_scorer: 5 },
  "final-four": { upset: 2, blowout: 2, high_scorer: 2 },
  "championship": { upset: 0, blowout: 0, high_scorer: 0 },
};

// ─── Historical upset probabilities by seed matchup ──────────────────────────

const UPSET_PROB: Record<string, number> = {
  "9v8": 0.49, "8v9": 0.49,
  "10v7": 0.40, "7v10": 0.40,
  "11v6": 0.37, "6v11": 0.37,
  "12v5": 0.35, "5v12": 0.35,
  "13v4": 0.21, "4v13": 0.21,
  "14v3": 0.15, "3v14": 0.15,
  "15v2": 0.06, "2v15": 0.06,
  "16v1": 0.02, "1v16": 0.02,
};

function getUpsetProb(seedFavorite: number, seedUnderdog: number): number {
  const key = `${seedUnderdog}v${seedFavorite}`;
  return UPSET_PROB[key] ?? Math.max(0.02, 0.5 - (seedUnderdog - seedFavorite) * 0.03);
}

// ─── Manually curated Round-64 upset candidates ───────────────────────────────
// These replace the auto-ranked upset list for R64 — chosen for intrigue,
// not just raw upset probability. Odds computed from seed-based formula;
// if live Odds API data is available it will be merged in below.

// Sorted by upset probability descending. Ranks are reassigned dynamically in the hybrid logic.
const CURATED_R64_UPSETS: RankedMatchup[] = [
  {
    matchupId: "midwest-7v10-santaclara",
    teamA: "Kentucky",     seedA: 7,
    teamB: "Santa Clara",  seedB: 10,
    region: "Midwest",
    rank: 1,
    favoriteTeam: "Kentucky",    favoriteSeed: 7,
    underdogTeam: "Santa Clara", underdogSeed: 10,
    upsetProbability: 0.40,
    spread: 5.5,
    underdogMoneyline: 150,
    overUnder: 139,
    gameDate: "Mar 20",
    site: "St. Louis, MO",
    oddsSource: "seed-based",
    keyStat: "Kentucky ranks 299th nationally in forcing turnovers",
  },
  {
    matchupId: "south-6v11-vcu",
    teamA: "North Carolina", seedA: 6,
    teamB: "VCU",            seedB: 11,
    region: "South",
    rank: 2,
    favoriteTeam: "North Carolina", favoriteSeed: 6,
    underdogTeam: "VCU",            underdogSeed: 11,
    upsetProbability: 0.39,
    spread: 9.0,
    underdogMoneyline: 170,
    overUnder: 139,
    gameDate: "Mar 19",
    site: "Greenville, SC",
    oddsSource: "seed-based",
    keyStat: "UNC missing star Caleb Wilson (broken thumb, out for season)",
  },
  {
    matchupId: "west-6v11-texas",
    teamA: "BYU",   seedA: 6,
    teamB: "Texas", seedB: 11,
    region: "West",
    rank: 3,
    favoriteTeam: "BYU",   favoriteSeed: 6,
    underdogTeam: "Texas", underdogSeed: 11,
    upsetProbability: 0.37,
    spread: 9.0,
    underdogMoneyline: 170,
    overUnder: 144,
    gameDate: "Mar 19",
    site: "Portland, OR",
    oddsSource: "seed-based",
    keyStat: "Longhorns lost 5 of their last 6 entering the tournament",
  },
  {
    matchupId: "midwest-6v11-smu",
    teamA: "Tennessee", seedA: 6,
    teamB: "SMU",       seedB: 11,
    region: "Midwest",
    rank: 4,
    favoriteTeam: "Tennessee", favoriteSeed: 6,
    underdogTeam: "SMU",       underdogSeed: 11,
    upsetProbability: 0.25,
    spread: 9.0,
    underdogMoneyline: 220,
    overUnder: 133,
    gameDate: "Mar 20",
    site: "Philadelphia, PA",
    oddsSource: "seed-based",
    keyStat: "B.J. Edwards returning from ankle injury that cost SMU 5 games",
  },
  {
    matchupId: "west-5v12-highpoint",
    teamA: "Wisconsin",  seedA: 5,
    teamB: "High Point", seedB: 12,
    region: "West",
    rank: 5,
    favoriteTeam: "Wisconsin",  favoriteSeed: 5,
    underdogTeam: "High Point", underdogSeed: 12,
    upsetProbability: 0.24,
    spread: 12.5,
    underdogMoneyline: 240,
    overUnder: 150,
    gameDate: "Mar 19",
    site: "Portland, OR",
    oddsSource: "seed-based",
    keyStat: "High Point top-5 nationally in turnover rate at both ends",
  },
  {
    matchupId: "east-6v11-usf",
    teamA: "Louisville",     seedA: 6,
    teamB: "South Florida",  seedB: 11,
    region: "East",
    rank: 6,
    favoriteTeam: "Louisville",    favoriteSeed: 6,
    underdogTeam: "South Florida", underdogSeed: 11,
    upsetProbability: 0.19,
    spread: 9.0,
    underdogMoneyline: 190,
    overUnder: 139,
    gameDate: "Mar 19",
    site: "Buffalo, NY",
    oddsSource: "seed-based",
    keyStat: "USF is 19-3 since late December, losses by combined 5 points",
  },
  {
    matchupId: "south-5v12-mcneese",
    teamA: "Vanderbilt", seedA: 5,
    teamB: "McNeese",    seedB: 12,
    region: "South",
    rank: 7,
    favoriteTeam: "Vanderbilt", favoriteSeed: 5,
    underdogTeam: "McNeese",    underdogSeed: 12,
    upsetProbability: 0.19,
    spread: 12.5,
    underdogMoneyline: 185,
    overUnder: 137,
    gameDate: "Mar 19",
    site: "Oklahoma City, OK",
    oddsSource: "seed-based",
    keyStat: "McNeese #1 nationally in points off turnovers (22.3 per game)",
  },
  {
    matchupId: "midwest-5v12-akron",
    teamA: "Texas Tech", seedA: 5,
    teamB: "Akron",      seedB: 12,
    region: "Midwest",
    rank: 8,
    favoriteTeam: "Texas Tech", favoriteSeed: 5,
    underdogTeam: "Akron",      underdogSeed: 12,
    upsetProbability: 0.18,
    spread: 13.5,
    underdogMoneyline: 230,
    overUnder: 141,
    gameDate: "Mar 20",
    site: "Tampa, FL",
    oddsSource: "seed-based",
    keyStat: "JT Toppin out for season (ACL) — Akron on 10-game win streak",
  },
  {
    matchupId: "east-5v12-northernIowa",
    teamA: "St. John's",    seedA: 5,
    teamB: "Northern Iowa", seedB: 12,
    region: "East",
    rank: 9,
    favoriteTeam: "St. John's",    favoriteSeed: 5,
    underdogTeam: "Northern Iowa", underdogSeed: 12,
    upsetProbability: 0.15,
    spread: 12.5,
    underdogMoneyline: 260,
    overUnder: 137,
    gameDate: "Mar 20",
    site: "San Diego, CA",
    oddsSource: "seed-based",
    keyStat: "UNI top-5 nationally in turnover rate at both ends of the court",
  },
];

// ─── Curated Round-32 matchup candidates ─────────────────────────────────────
// All data sourced from live Odds API — March 21-22, 2026.
// Mar 21 games: Michigan/SaintLouis, MSU/Louisville, Duke/TCU, Houston/TexasAM,
//               Gonzaga/Texas, Illinois/VCU, Nebraska/Vanderbilt, Arkansas/HighPoint
// Mar 22 games: Purdue/Miami, IowaState/Kentucky, Kansas/StJohns, Virginia/Tennessee,
//               Florida/Iowa, Arizona/UtahState, UConn/UCLA, Alabama/TexasTech

const CURATED_R32_UPSETS: RankedMatchup[] = [
  {
    matchupId: "r32-west-arkansas-highpoint",
    teamA: "High Point", seedA: 12,
    teamB: "Arkansas",   seedB: 4,
    region: "West",
    rank: 1,
    favoriteTeam: "Arkansas",   favoriteSeed: 4,
    underdogTeam: "High Point", underdogSeed: 12,
    upsetProbability: 0.35,
    spread: 11.5,
    underdogMoneyline: 525,
    overUnder: 169.5,
    gameDate: "Mar 21",
    site: "Portland, OR",
    oddsSource: "live",
    keyStat: "High Point already stunned Wisconsin 83-82 — highest O/U (169.5) on the slate",
  },
  {
    matchupId: "r32-south-illinois-vcu",
    teamA: "VCU",      seedA: 11,
    teamB: "Illinois", seedB: 3,
    region: "South",
    rank: 2,
    favoriteTeam: "Illinois", favoriteSeed: 3,
    underdogTeam: "VCU",      underdogSeed: 11,
    upsetProbability: 0.30,
    spread: 11.5,
    underdogMoneyline: 425,
    overUnder: 151.5,
    gameDate: "Mar 21",
    site: "Greenville, SC",
    oddsSource: "live",
    keyStat: "VCU just upset #6 North Carolina — tournament mode fully unlocked",
  },
  {
    matchupId: "r32-west-gonzaga-texas",
    teamA: "Texas",   seedA: 11,
    teamB: "Gonzaga", seedB: 3,
    region: "West",
    rank: 3,
    favoriteTeam: "Gonzaga", favoriteSeed: 3,
    underdogTeam: "Texas",   underdogSeed: 11,
    upsetProbability: 0.28,
    spread: 6.5,
    underdogMoneyline: 220,
    overUnder: 147.5,
    gameDate: "Mar 21",
    site: "Portland, OR",
    oddsSource: "live",
    keyStat: "Texas won First Four + upset BYU — Gonzaga still without a title in 6 Final Fours",
  },
  {
    matchupId: "r32-south-houston-texasam",
    teamA: "Texas A&M", seedA: 10,
    teamB: "Houston",   seedB: 2,
    region: "South",
    rank: 4,
    favoriteTeam: "Houston",   favoriteSeed: 2,
    underdogTeam: "Texas A&M", underdogSeed: 10,
    upsetProbability: 0.22,
    spread: 10.5,
    underdogMoneyline: 380,
    overUnder: 141.5,
    gameDate: "Mar 21",
    site: "Oklahoma City, OK",
    oddsSource: "live",
    keyStat: "Texas A&M upset #7 Saint Mary's — defense and ball pressure travel in March",
  },
  {
    matchupId: "r32-south-nebraska-vanderbilt",
    teamA: "Nebraska",   seedA: 4,
    teamB: "Vanderbilt", seedB: 5,
    region: "South",
    rank: 5,
    favoriteTeam: "Vanderbilt", favoriteSeed: 5,
    underdogTeam: "Nebraska",   underdogSeed: 4,
    upsetProbability: 0.47,
    spread: 1.5,
    underdogMoneyline: 120,
    overUnder: 146.5,
    gameDate: "Mar 21",
    site: "Oklahoma City, OK",
    oddsSource: "live",
    keyStat: "Spread: Vanderbilt -1.5 — the closest game on today's slate, effectively a pick'em",
  },
];

const CURATED_R32_BLOWOUT: RankedMatchup[] = [
  {
    matchupId: "r32-midwest-michigan-stlouis",
    teamA: "Michigan",    seedA: 1,
    teamB: "Saint Louis", seedB: 9,
    region: "Midwest",
    rank: 1,
    favoriteTeam: "Michigan",    favoriteSeed: 1,
    underdogTeam: "Saint Louis", underdogSeed: 9,
    spread: 12.5,
    overUnder: 161.5,
    gameDate: "Mar 21",
    site: "Buffalo, NY",
    oddsSource: "live",
    keyStat: "Michigan -12.5 | O/U 161.5 — Wolverines averaged +18 point margin late in season",
  },
  {
    matchupId: "r32-east-duke-tcu",
    teamA: "Duke", seedA: 1,
    teamB: "TCU",  seedB: 9,
    region: "East",
    rank: 2,
    favoriteTeam: "Duke", favoriteSeed: 1,
    underdogTeam: "TCU",  underdogSeed: 9,
    spread: 11.5,
    overUnder: 140.5,
    gameDate: "Mar 21",
    site: "Raleigh, NC",
    oddsSource: "live",
    keyStat: "Duke -11.5 — hasn't lost since January, allows only 61 ppg",
  },
  {
    matchupId: "r32-south-illinois-vcu",
    teamA: "Illinois", seedA: 3,
    teamB: "VCU",      seedB: 11,
    region: "South",
    rank: 3,
    favoriteTeam: "Illinois", favoriteSeed: 3,
    underdogTeam: "VCU",      underdogSeed: 11,
    spread: 11.5,
    overUnder: 151.5,
    gameDate: "Mar 21",
    site: "Greenville, SC",
    oddsSource: "live",
    keyStat: "Illinois -11.5 | averages 9.8 made threes per game — can light it up fast",
  },
  {
    matchupId: "r32-west-arkansas-highpoint",
    teamA: "Arkansas",   seedA: 4,
    teamB: "High Point", seedB: 12,
    region: "West",
    rank: 4,
    favoriteTeam: "Arkansas",   favoriteSeed: 4,
    underdogTeam: "High Point", underdogSeed: 12,
    spread: 11.5,
    overUnder: 169.5,
    gameDate: "Mar 21",
    site: "Portland, OR",
    oddsSource: "live",
    keyStat: "Arkansas -11.5 | highest O/U on the slate (169.5) — someone's getting blown out",
  },
  {
    matchupId: "r32-west-arizona-utahst",
    teamA: "Arizona",    seedA: 1,
    teamB: "Utah State", seedB: 9,
    region: "West",
    rank: 5,
    favoriteTeam: "Arizona",    favoriteSeed: 1,
    underdogTeam: "Utah State", underdogSeed: 9,
    spread: 11.5,
    overUnder: 155.5,
    gameDate: "Mar 22",
    site: "San Diego, CA",
    oddsSource: "live",
    keyStat: "Arizona -11.5 | averages 84.2 ppg — one of the most efficient offenses in the nation",
  },
];

const CURATED_R32_HIGH_SCORER: RankedMatchup[] = [
  {
    matchupId: "r32-west-arkansas-highpoint",
    teamA: "Arkansas",   seedA: 4,
    teamB: "High Point", seedB: 12,
    region: "West",
    rank: 1,
    favoriteTeam: "Arkansas",   favoriteSeed: 4,
    underdogTeam: "High Point", underdogSeed: 12,
    spread: 11.5,
    overUnder: 169.5,
    gameDate: "Mar 21",
    site: "Portland, OR",
    oddsSource: "live",
    keyStat: "O/U 169.5 — the highest over/under on the ENTIRE R32 weekend slate",
  },
  {
    matchupId: "r32-midwest-alabama-texastech",
    teamA: "Alabama",    seedA: 4,
    teamB: "Texas Tech", seedB: 5,
    region: "Midwest",
    rank: 2,
    favoriteTeam: "Alabama",    favoriteSeed: 4,
    underdogTeam: "Texas Tech", underdogSeed: 5,
    spread: 1.5,
    overUnder: 164.5,
    gameDate: "Mar 22",
    site: "Tampa, FL",
    oddsSource: "live",
    keyStat: "O/U 164.5 — Alabama's up-tempo style vs Texas Tech's pace = fireworks expected",
  },
  {
    matchupId: "r32-midwest-michigan-stlouis",
    teamA: "Michigan",    seedA: 1,
    teamB: "Saint Louis", seedB: 9,
    region: "Midwest",
    rank: 3,
    favoriteTeam: "Michigan",    favoriteSeed: 1,
    underdogTeam: "Saint Louis", underdogSeed: 9,
    spread: 12.5,
    overUnder: 161.5,
    gameDate: "Mar 21",
    site: "Buffalo, NY",
    oddsSource: "live",
    keyStat: "O/U 161.5 — Michigan opens the day and both teams can score in bunches",
  },
  {
    matchupId: "r32-west-arizona-utahst",
    teamA: "Arizona",    seedA: 1,
    teamB: "Utah State", seedB: 9,
    region: "West",
    rank: 4,
    favoriteTeam: "Arizona",    favoriteSeed: 1,
    underdogTeam: "Utah State", underdogSeed: 9,
    spread: 11.5,
    overUnder: 155.5,
    gameDate: "Mar 22",
    site: "San Diego, CA",
    oddsSource: "live",
    keyStat: "O/U 155.5 — Arizona averages 84 ppg and plays at a fast pace",
  },
  {
    matchupId: "r32-south-illinois-vcu",
    teamA: "Illinois", seedA: 3,
    teamB: "VCU",      seedB: 11,
    region: "South",
    rank: 5,
    favoriteTeam: "Illinois", favoriteSeed: 3,
    underdogTeam: "VCU",      underdogSeed: 11,
    spread: 11.5,
    overUnder: 151.5,
    gameDate: "Mar 21",
    site: "Greenville, SC",
    oddsSource: "live",
    keyStat: "O/U 151.5 — Illinois averages 9.8 made threes, VCU forces transition chaos",
  },
];

// ─── Server-side 30-minute cache ─────────────────────────────────────────────

const matchupCache = new Map<string, { data: unknown; fetchedAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = matchupCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    matchupCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown) {
  matchupCache.set(key, { data, fetchedAt: Date.now() });
}

// ─── Seed-based ranking (fallback, no API needed) ────────────────────────────

const REGIONS = ["east", "south", "west", "midwest"] as const;

function buildSeedBasedMatchups(roundId: string): {
  upset: RankedMatchup[];
  blowout: RankedMatchup[];
  highScorer: RankedMatchup[];
} {
  // ── Round of 32: return curated lists based on confirmed R64 results ──────
  if (roundId === "round-32") {
    const counts = CANDIDATE_COUNTS["round-32"];
    return {
      upset:      CURATED_R32_UPSETS.slice(0, counts.upset).map((m, i) => ({ ...m, rank: i + 1 })),
      blowout:    CURATED_R32_BLOWOUT.slice(0, counts.blowout).map((m, i) => ({ ...m, rank: i + 1 })),
      highScorer: CURATED_R32_HIGH_SCORER.slice(0, counts.high_scorer).map((m, i) => ({ ...m, rank: i + 1 })),
    };
  }

  // ── For Sweet 16 and beyond: auto-build from whatever matchup data is available ──
  if (roundId !== "round-64") {
    return { upset: [], blowout: [], highScorer: [] };
  }

  // ── Round of 64: auto-build from full bracket ─────────────────────────────
  const all: RankedMatchup[] = [];
  for (const region of REGIONS) {
    const games = FULL_BRACKET[region];
    for (const g of games) {
      if (g.team1.includes("/") || g.team2.includes("/")) continue;
      const matchupId = `${region}-${g.seed1}v${g.seed2}`;
      const seedDiff = g.seed2 - g.seed1;
      const upsetProb = getUpsetProb(g.seed1, g.seed2);
      all.push({
        matchupId,
        teamA: g.team1,
        teamB: g.team2,
        seedA: g.seed1,
        seedB: g.seed2,
        region,
        rank: 0,
        favoriteTeam: g.team1,
        favoriteSeed: g.seed1,
        underdogTeam: g.team2,
        underdogSeed: g.seed2,
        upsetProbability: upsetProb,
        spread: seedDiff * 1.8,
        overUnder: 140 - seedDiff,
        gameDate: (g as { date?: string }).date,
        site: (g as { site?: string }).site,
        oddsSource: "seed-based",
      });
    }
  }

  const upsetSorted    = [...all].sort((a, b) => (b.upsetProbability ?? 0) - (a.upsetProbability ?? 0));
  const blowoutSorted  = [...all].sort((a, b) => (b.seedB - b.seedA) - (a.seedB - a.seedA));
  const highScorerSorted = [...all].sort((a, b) => (a.seedB - a.seedA) - (b.seedB - b.seedA));

  const counts = CANDIDATE_COUNTS[roundId] ?? { upset: 5, blowout: 5, high_scorer: 5 };

  return {
    upset:      upsetSorted.slice(0, counts.upset).map((m, i) => ({ ...m, rank: i + 1 })),
    blowout:    blowoutSorted.slice(0, counts.blowout).map((m, i) => ({ ...m, rank: i + 1 })),
    highScorer: highScorerSorted.slice(0, counts.high_scorer).map((m, i) => ({ ...m, rank: i + 1 })),
  };
}

// ─── Odds API ranking ─────────────────────────────────────────────────────────

async function buildOddsBasedMatchups(roundId: string): Promise<{
  upset: RankedMatchup[];
  blowout: RankedMatchup[];
  highScorer: RankedMatchup[];
} | null> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return null;

  const dateRange = ROUND_DATE_RANGES[roundId];
  if (!dateRange) return null;

  try {
    const url = `https://api.the-odds-api.com/v4/sports/basketball_ncaab/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=${dateRange.start}T00:00:00Z&commenceTimeTo=${dateRange.end}T23:59:59Z`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[odds-api] HTTP ${res.status}:`, await res.text());
      return null;
    }
    const games = (await res.json()) as OddsGame[];
    if (!games.length) return null;

    const matchups: RankedMatchup[] = games.map((game) => {
      // Extract odds from first available US bookmaker
      let spread: number | undefined;
      let overUnder: number | undefined;
      let homeMoneyline: number | undefined;
      let awayMoneyline: number | undefined;

      for (const bm of game.bookmakers ?? []) {
        for (const market of bm.markets ?? []) {
          if (market.key === "spreads" && spread === undefined) {
            const home = market.outcomes.find((o) => o.name === game.home_team);
            spread = home?.point !== undefined ? Math.abs(home.point) : undefined;
          }
          if (market.key === "totals" && overUnder === undefined) {
            overUnder = market.outcomes[0]?.point;
          }
          if (market.key === "h2h") {
            if (homeMoneyline === undefined) {
              homeMoneyline = market.outcomes.find((o) => o.name === game.home_team)?.price;
            }
            if (awayMoneyline === undefined) {
              awayMoneyline = market.outcomes.find((o) => o.name === game.away_team)?.price;
            }
          }
        }
        if (spread !== undefined && overUnder !== undefined && homeMoneyline !== undefined) break;
      }

      // Determine favorite/underdog by moneyline
      const homeIsUnderdog =
        homeMoneyline !== undefined && awayMoneyline !== undefined
          ? homeMoneyline > awayMoneyline
          : false;

      const underdogMoneyline = homeIsUnderdog ? homeMoneyline : awayMoneyline;
      const favoriteTeam = homeIsUnderdog ? game.away_team : game.home_team;
      const underdogTeam = homeIsUnderdog ? game.home_team : game.away_team;

      const matchupId = `odds-${game.id}`;
      const commenceDate = new Date(game.commence_time);
      const gameDate = commenceDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      return {
        matchupId,
        teamA: game.home_team,
        teamB: game.away_team,
        seedA: lookupSeed(game.home_team),
        seedB: lookupSeed(game.away_team),
        region: "—",
        rank: 0,
        favoriteTeam,
        underdogTeam,
        underdogMoneyline,
        spread,
        overUnder,
        gameDate,
        oddsSource: "live" as const,
      };
    });

    const counts = CANDIDATE_COUNTS[roundId] ?? { upset: 5, blowout: 5, high_scorer: 5 };

    // Filter to only recognized tournament teams (seed > 0 for at least one team)
    // This prevents NIT/CBI games from polluting the tournament candidate lists.
    const tournamentMatchups = matchups.filter((m) => m.seedA > 0 || m.seedB > 0);

    // Sort: upset by underdog moneyline desc (+800 > +300 = bigger underdog)
    // Cap at +900: above that the underdog has <10% chance — not a meaningful pick.
    // Lower cutoff at +120: anything below is essentially a pick 'em, not an upset.
    const upsetSorted = [...tournamentMatchups]
      .filter((m) => m.underdogMoneyline !== undefined && m.underdogMoneyline > 120 && m.underdogMoneyline <= 900)
      .sort((a, b) => (b.underdogMoneyline ?? 0) - (a.underdogMoneyline ?? 0));

    // Sort: blowout by spread desc (bigger spread = expected bigger margin)
    const blowoutSorted = [...tournamentMatchups]
      .filter((m) => m.spread !== undefined)
      .sort((a, b) => (b.spread ?? 0) - (a.spread ?? 0));

    // Sort: high scorer by over/under desc
    const highScorerSorted = [...tournamentMatchups]
      .filter((m) => m.overUnder !== undefined)
      .sort((a, b) => (b.overUnder ?? 0) - (a.overUnder ?? 0));

    return {
      upset: upsetSorted.slice(0, counts.upset).map((m, i) => ({ ...m, rank: i + 1 })),
      blowout: blowoutSorted.slice(0, counts.blowout).map((m, i) => ({ ...m, rank: i + 1 })),
      highScorer: highScorerSorted.slice(0, counts.high_scorer).map((m, i) => ({ ...m, rank: i + 1 })),
    };
  } catch (e) {
    console.error("[odds-api] Fetch failed:", e);
    return null;
  }
}

// ─── Persist ranked matchups for scoring ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function persistRankedMatchups(
  supabase: any,
  roundId: string,
  upset: RankedMatchup[],
  blowout: RankedMatchup[],
  highScorer: RankedMatchup[],
) {
  const toRow = (m: RankedMatchup, pickType: string) => ({
    round_id: roundId,
    pick_type: pickType,
    matchup_id: m.matchupId,
    team_a: m.teamA,
    team_b: m.teamB,
    seed_a: m.seedA,
    seed_b: m.seedB,
    rank: m.rank,
    // Store the complete matchup so we can reconstruct it from the DB after round lock
    odds_data: {
      spread: m.spread,
      overUnder: m.overUnder,
      underdogMoneyline: m.underdogMoneyline,
      favoriteTeam: m.favoriteTeam,
      underdogTeam: m.underdogTeam,
      favoriteSeed: m.favoriteSeed,
      underdogSeed: m.underdogSeed,
      region: m.region,
      gameDate: m.gameDate,
      site: m.site,
      keyStat: m.keyStat,
      source: m.oddsSource,
    },
    updated_at: new Date().toISOString(),
  });

  const rows = [
    ...upset.map((m) => toRow(m, "upset")),
    ...blowout.map((m) => toRow(m, "blowout")),
    ...highScorer.map((m) => toRow(m, "high_scorer")),
  ];

  if (rows.length === 0) return;

  // Only delete+reinsert while the round is still open. Once locked, the persisted
  // rows are the source-of-truth for the picks UI — never overwrite them.
  const lockDatesForPersist: Record<string, string> = {
    "first-four":   "2026-03-17T12:00:00-05:00",
    "round-64":     "2026-03-19T11:00:00-05:00",
    "round-32":     "2026-03-21T12:00:00-05:00",
    "sweet-16":     "2026-03-27T12:00:00-05:00",
    "elite-8":      "2026-03-28T12:00:00-05:00",
    "final-four":   "2026-04-04T18:00:00-05:00",
  };
  const lockAt = lockDatesForPersist[roundId];
  const roundIsLocked = lockAt ? new Date() >= new Date(lockAt) : false;
  if (roundIsLocked) {
    // Check if rows already exist — if so, leave them intact
    const { data: existing } = await supabase
      .from("mm_round_matchups")
      .select("matchup_id")
      .eq("round_id", roundId)
      .limit(1);
    if (existing && existing.length > 0) {
      console.log(`[mm-special] ${roundId} is locked — skipping persist to protect stored matchups`);
      return;
    }
  }

  await supabase.from("mm_round_matchups").delete().eq("round_id", roundId);
  await supabase
    .from("mm_round_matchups")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(rows as any);
}

// ─── Route Registration ───────────────────────────────────────────────────────

export function registerMMSpecialRoutes(app: Express) {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

  app.get("/api/mm/round-matchups/:roundId", async (req: Request, res: Response) => {
    const roundId = req.params.roundId as string;

    const lockDates: Record<string, string> = {
      "first-four":   "2026-03-17T12:00:00-05:00",
      "round-64":     "2026-03-19T11:00:00-05:00",
      "round-32":     "2026-03-21T12:00:00-05:00",
      "sweet-16":     "2026-03-27T12:00:00-05:00",
      "elite-8":      "2026-03-28T12:00:00-05:00",
      "final-four":   "2026-04-04T18:00:00-05:00",
    };
    const lockDate = lockDates[roundId] ?? "2026-03-19T11:00:00-05:00";
    const isLocked = new Date() >= new Date(lockDate);

    // Check in-memory cache first (fast path)
    const cacheKey = `round-matchups-${roundId}`;
    const cached = getCached<object>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── After lock: serve from persisted DB — never call the Odds API ──────────
    // Once games tip off, bookmakers pull lines and the API returns nothing.
    // The DB has the exact matchups users saw when they made their picks.
    if (isLocked) {
      const { data: rows } = await supabase
        .from("mm_round_matchups")
        .select("*")
        .eq("round_id", roundId)
        .order("rank", { ascending: true });

      if (rows && rows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rowToMatchup = (r: any): RankedMatchup => ({
          matchupId:         r.matchup_id,
          teamA:             r.team_a,
          teamB:             r.team_b,
          seedA:             r.seed_a ?? 0,
          seedB:             r.seed_b ?? 0,
          rank:              r.rank,
          favoriteTeam:      r.odds_data?.favoriteTeam ?? r.team_a,
          underdogTeam:      r.odds_data?.underdogTeam ?? r.team_b,
          favoriteSeed:      r.odds_data?.favoriteSeed,
          underdogSeed:      r.odds_data?.underdogSeed,
          spread:            r.odds_data?.spread,
          overUnder:         r.odds_data?.overUnder,
          underdogMoneyline: r.odds_data?.underdogMoneyline,
          region:            r.odds_data?.region ?? "—",
          gameDate:          r.odds_data?.gameDate,
          site:              r.odds_data?.site,
          keyStat:           r.odds_data?.keyStat,
          oddsSource:        r.odds_data?.source ?? "live",
        });

        const upset      = rows.filter((r: any) => r.pick_type === "upset").map(rowToMatchup);
        const blowout    = rows.filter((r: any) => r.pick_type === "blowout").map(rowToMatchup);
        const highScorer = rows.filter((r: any) => r.pick_type === "high_scorer").map(rowToMatchup);

        console.log(`[mm-special] ${roundId} (locked) served from DB: upset=${upset.length} blowout=${blowout.length} hs=${highScorer.length}`);

        const response = { roundId, upset, blowout, highScorer, isLocked: true, lockedAt: lockDate, oddsSource: "persisted" };
        setCache(cacheKey, response);
        return res.json(response);
      }

      // No persisted rows yet — fall through to build them fresh (first lock hit)
    }

    // ── Pre-lock: build from Odds API or seed-based fallback ───────────────────
    let ranked = await buildOddsBasedMatchups(roundId);
    let source: "live" | "seed-based" = "live";

    if (!ranked) {
      ranked = buildSeedBasedMatchups(roundId);
      source = "seed-based";
    }

    // For Round of 64: curated entries first, auto-fill remaining slots to reach target count
    if (roundId === "round-64") {
      const counts = CANDIDATE_COUNTS["round-64"];
      const curatedUnderdogs = new Set(
        CURATED_R64_UPSETS.map((m) => (m.underdogTeam ?? m.teamB).toLowerCase()),
      );
      const autoFill = ranked.upset.filter(
        (m) => !curatedUnderdogs.has((m.underdogTeam ?? m.teamB).toLowerCase()),
      );
      const combined = [...CURATED_R64_UPSETS, ...autoFill]
        .slice(0, counts.upset)
        .map((m, i) => ({ ...m, rank: i + 1 }));
      ranked = { ...ranked, upset: combined };
    }

    console.log(`[mm-special] ${roundId} matchups: ${source}, ` +
      `upset=${ranked.upset.length} blowout=${ranked.blowout.length} hs=${ranked.highScorer.length}`);

    // Persist for scoring (non-blocking)
    persistRankedMatchups(supabase, roundId, ranked.upset, ranked.blowout, ranked.highScorer)
      .catch((e) => console.error("[mm-special] persist failed:", e));

    const response = {
      roundId,
      upset: ranked.upset,
      blowout: ranked.blowout,
      highScorer: ranked.highScorer,
      isLocked,
      lockedAt: lockDate,
      oddsSource: source,
    };

    setCache(cacheKey, response);
    return res.json(response);
  });
}
