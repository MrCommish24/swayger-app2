// ─────────────────────────────────────────────────────────────
// March Madness 2026 — Tournament Data Module
// Update matchup data as the bracket is announced and rounds progress.
// To disable the feature after the season: set MARCH_MADNESS_ACTIVE = false
// ─────────────────────────────────────────────────────────────

export const MARCH_MADNESS_ACTIVE = true;

export interface MMTeam {
  name: string;
  seed: number;
}

export interface MMMatchup {
  id: string;
  teamA: MMTeam;
  teamB: MMTeam;
  region: string;
  prompt: string;
  gameDateLabel?: string;
}

export interface MMRound {
  id: string;
  label: string;
  shortLabel: string;
  startDate: string;
  endDate: string;
  featured: MMMatchup[];
}

// ─────────────────────────────────────────────────────────────
// TOURNAMENT ROUNDS
// Update startDate/endDate to match official schedule.
// Update featured matchups as rounds are announced.
// ─────────────────────────────────────────────────────────────

export const MM_ROUNDS: MMRound[] = [
  {
    id: "first-four",
    label: "First Four",
    shortLabel: "First Four",
    startDate: "2026-03-17",
    endDate: "2026-03-18",
    featured: [
      {
        id: "ff-1",
        teamA: { name: "Alabama St.", seed: 16 },
        teamB: { name: "St. Francis", seed: 16 },
        region: "East",
        prompt: "Who survives the play-in to face the #1 seed?",
        gameDateLabel: "Mar 17",
      },
      {
        id: "ff-2",
        teamA: { name: "San Jose St.", seed: 11 },
        teamB: { name: "Virginia", seed: 11 },
        region: "West",
        prompt: "Which 11-seed earns a date with a 6?",
        gameDateLabel: "Mar 17",
      },
      {
        id: "ff-3",
        teamA: { name: "Texas Southern", seed: 16 },
        teamB: { name: "SIUE", seed: 16 },
        region: "South",
        prompt: "Who gets the honor of facing Houston?",
        gameDateLabel: "Mar 18",
      },
      {
        id: "ff-4",
        teamA: { name: "Boston Univ.", seed: 11 },
        teamB: { name: "Nebraska", seed: 11 },
        region: "Midwest",
        prompt: "The last spot in the field of 64 is up for grabs.",
        gameDateLabel: "Mar 18",
      },
    ],
  },
  {
    id: "round-64",
    label: "Round of 64",
    shortLabel: "R64",
    startDate: "2026-03-19",
    endDate: "2026-03-20",
    featured: [
      {
        id: "r64-1",
        teamA: { name: "Duke", seed: 1 },
        teamB: { name: "Mount St. Mary's", seed: 16 },
        region: "East",
        prompt: "Duke opens as a massive favorite — do they cover?",
        gameDateLabel: "Mar 19",
      },
      {
        id: "r64-2",
        teamA: { name: "St. John's", seed: 5 },
        teamB: { name: "McNeese", seed: 12 },
        region: "East",
        prompt: "Classic 5-12 upset alert. McNeese or bust?",
        gameDateLabel: "Mar 19",
      },
      {
        id: "r64-3",
        teamA: { name: "Kentucky", seed: 2 },
        teamB: { name: "Murray State", seed: 15 },
        region: "East",
        prompt: "In-state Kentucky grudge match. Big Blue vs. Racers.",
        gameDateLabel: "Mar 20",
      },
      {
        id: "r64-4",
        teamA: { name: "Houston", seed: 1 },
        teamB: { name: "Longwood", seed: 16 },
        region: "South",
        prompt: "Cougars looking to defend their rep. Any path for Longwood?",
        gameDateLabel: "Mar 20",
      },
      {
        id: "r64-5",
        teamA: { name: "Gonzaga", seed: 5 },
        teamB: { name: "James Madison", seed: 12 },
        region: "South",
        prompt: "Gonzaga has NCAA tournament grief against double-digit seeds.",
        gameDateLabel: "Mar 19",
      },
      {
        id: "r64-6",
        teamA: { name: "Kansas", seed: 1 },
        teamB: { name: "Howard", seed: 16 },
        region: "West",
        prompt: "Rock Chalk or upset history? Howard shocked #1 Alabama in 2023.",
        gameDateLabel: "Mar 19",
      },
      {
        id: "r64-7",
        teamA: { name: "Auburn", seed: 1 },
        teamB: { name: "Idaho St.", seed: 16 },
        region: "Midwest",
        prompt: "Can Auburn finally make a deep run? Tournament starts now.",
        gameDateLabel: "Mar 20",
      },
      {
        id: "r64-8",
        teamA: { name: "UConn", seed: 2 },
        teamB: { name: "Albany", seed: 15 },
        region: "Midwest",
        prompt: "Three-peat or bust for the Huskies? They start here.",
        gameDateLabel: "Mar 20",
      },
    ],
  },
  {
    id: "round-32",
    label: "Round of 32",
    shortLabel: "R32",
    startDate: "2026-03-21",
    endDate: "2026-03-22",
    featured: [
      {
        id: "r32-1",
        teamA: { name: "Duke", seed: 1 },
        teamB: { name: "TBD", seed: 8 },
        region: "East",
        prompt: "Duke advances — who stands between them and the Sweet 16?",
        gameDateLabel: "Mar 21",
      },
      {
        id: "r32-2",
        teamA: { name: "Houston", seed: 1 },
        teamB: { name: "TBD", seed: 8 },
        region: "South",
        prompt: "Houston looks to punch their Sweet 16 ticket.",
        gameDateLabel: "Mar 22",
      },
      {
        id: "r32-3",
        teamA: { name: "Kansas", seed: 1 },
        teamB: { name: "TBD", seed: 8 },
        region: "West",
        prompt: "Can Kansas get to the second week of the tournament?",
        gameDateLabel: "Mar 21",
      },
      {
        id: "r32-4",
        teamA: { name: "Auburn", seed: 1 },
        teamB: { name: "TBD", seed: 8 },
        region: "Midwest",
        prompt: "Auburn in the Round of 32 — who's the next challenger?",
        gameDateLabel: "Mar 22",
      },
      {
        id: "r32-5",
        teamA: { name: "Kentucky", seed: 2 },
        teamB: { name: "TBD", seed: 7 },
        region: "East",
        prompt: "Kentucky vs. a 7-seed — still a coin flip.",
        gameDateLabel: "Mar 21",
      },
      {
        id: "r32-6",
        teamA: { name: "UConn", seed: 2 },
        teamB: { name: "TBD", seed: 7 },
        region: "Midwest",
        prompt: "UConn defending champions — can they reach the Sweet 16?",
        gameDateLabel: "Mar 22",
      },
    ],
  },
  {
    id: "sweet-16",
    label: "Sweet 16",
    shortLabel: "S16",
    startDate: "2026-03-27",
    endDate: "2026-03-28",
    featured: [
      {
        id: "s16-1",
        teamA: { name: "TBD", seed: 1 },
        teamB: { name: "TBD", seed: 4 },
        region: "East",
        prompt: "East Regional Sweet 16 — who punches their Elite 8 ticket?",
        gameDateLabel: "Mar 27",
      },
      {
        id: "s16-2",
        teamA: { name: "TBD", seed: 1 },
        teamB: { name: "TBD", seed: 5 },
        region: "South",
        prompt: "South Regional Sweet 16 — battle for a trip to San Antonio.",
        gameDateLabel: "Mar 27",
      },
      {
        id: "s16-3",
        teamA: { name: "TBD", seed: 1 },
        teamB: { name: "TBD", seed: 4 },
        region: "West",
        prompt: "West Regional — who earns a spot in the Elite 8?",
        gameDateLabel: "Mar 28",
      },
      {
        id: "s16-4",
        teamA: { name: "TBD", seed: 1 },
        teamB: { name: "TBD", seed: 5 },
        region: "Midwest",
        prompt: "Midwest Regional — can a double-digit miracle maker survive?",
        gameDateLabel: "Mar 28",
      },
    ],
  },
  {
    id: "elite-8",
    label: "Elite 8",
    shortLabel: "E8",
    startDate: "2026-03-29",
    endDate: "2026-03-30",
    featured: [
      {
        id: "e8-1",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "East",
        prompt: "East Regional Final — who's headed to the Final Four?",
        gameDateLabel: "Mar 29",
      },
      {
        id: "e8-2",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "South",
        prompt: "South Regional Final — Final Four or go home.",
        gameDateLabel: "Mar 29",
      },
      {
        id: "e8-3",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "West",
        prompt: "West Regional Final — one game away from the Final Four.",
        gameDateLabel: "Mar 30",
      },
      {
        id: "e8-4",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "Midwest",
        prompt: "Midwest Regional Final — the last ticket to San Antonio.",
        gameDateLabel: "Mar 30",
      },
    ],
  },
  {
    id: "final-four",
    label: "Final Four",
    shortLabel: "FF",
    startDate: "2026-04-04",
    endDate: "2026-04-05",
    featured: [
      {
        id: "ff-sf1",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "Semifinal 1",
        prompt: "Final Four — Semifinal 1. Who's playing for the title?",
        gameDateLabel: "Apr 4",
      },
      {
        id: "ff-sf2",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "Semifinal 2",
        prompt: "Final Four — Semifinal 2. The other side of the bracket.",
        gameDateLabel: "Apr 5",
      },
    ],
  },
  {
    id: "championship",
    label: "Championship",
    shortLabel: "🏆",
    startDate: "2026-04-07",
    endDate: "2026-04-07",
    featured: [
      {
        id: "champ-1",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "Championship",
        prompt: "Who wins the 2026 NCAA Championship? Put your reputation on it.",
        gameDateLabel: "Apr 7",
      },
    ],
  },
];

// Returns the active round based on today's date.
// If tournament hasn't started, returns Round of 64.
// If tournament is over, returns the last round.
export function getCurrentRound(): MMRound {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  let activeRound = MM_ROUNDS[1]; // Default: Round of 64
  for (const round of MM_ROUNDS) {
    if (round.startDate <= today) {
      activeRound = round;
    }
  }
  return activeRound;
}

// Returns featured matchups for the current round, up to `limit`.
export function getFeaturedMatchups(limit = 6): MMMatchup[] {
  const round = getCurrentRound();
  return round.featured.slice(0, limit);
}

// Build a create-swayger URL param set from a matchup
export function matchupToCreateParams(matchup: MMMatchup): Record<string, string> {
  const seedA = matchup.teamA.seed > 0 ? `#${matchup.teamA.seed} ` : "";
  const seedB = matchup.teamB.seed > 0 ? `#${matchup.teamB.seed} ` : "";
  return {
    counterCategory: "March Madness",
    counterTitle: `${seedA}${matchup.teamA.name} vs. ${seedB}${matchup.teamB.name}`,
    counterDescription: matchup.prompt,
    openChallenge: "true",
  };
}
