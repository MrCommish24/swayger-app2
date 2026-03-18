// ─────────────────────────────────────────────────────────────
// March Madness 2026 — Official Tournament Data
// Source: Verified 2026 NCAA Men's Basketball Tournament bracket
//
// To update as rounds progress:
//   1. Update the `featured` array for the completed round with real teams/seeds
//   2. The hub's "NOW PLAYING" state and round pills update automatically by date
//
// To disable after the season: set MARCH_MADNESS_ACTIVE = false
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
  site?: string;
  keyStat?: string; // short reason why this is an intriguing upset pick
}

export interface MMRound {
  id: string;
  label: string;
  shortLabel: string;
  startDate: string;
  endDate: string;
  // lockDate: ISO 8601 with UTC offset. Special picks for this round lock at this time.
  // Bracket takes use a separate BRACKET_LOCK_DATE.
  lockDate: string;
  featured: MMMatchup[];
}

// ─────────────────────────────────────────────────────────────
// FULL BRACKET — 2026 NCAA Tournament
// All 32 Round of 64 matchups are accurate.
// Future rounds will be populated as teams advance.
// ─────────────────────────────────────────────────────────────

export const MM_ROUNDS: MMRound[] = [
  // ── FIRST FOUR ────────────────────────────────────────────
  {
    id: "first-four",
    label: "First Four",
    shortLabel: "First Four",
    startDate: "2026-03-17",
    endDate: "2026-03-18",
    lockDate: "2026-03-17T12:00:00-05:00",
    featured: [
      {
        id: "ff-2",
        teamA: { name: "Lehigh", seed: 16 },
        teamB: { name: "Prairie View A&M", seed: 16 },
        region: "South",
        prompt: "One of these teams faces #1 Florida. Which program pulls off the play-in?",
        gameDateLabel: "Mar 18",
        site: "TBD",
      },
      {
        id: "ff-4",
        teamA: { name: "SMU", seed: 11 },
        teamB: { name: "Miami (OH)", seed: 11 },
        region: "Midwest",
        prompt: "The 11-seed winner sets up a matchup with #6 Tennessee. Who gets the shot?",
        gameDateLabel: "Mar 18",
        site: "TBD",
      },
    ],
  },

  // ── ROUND OF 64 ───────────────────────────────────────────
  {
    id: "round-64",
    label: "Round of 64",
    shortLabel: "R64",
    startDate: "2026-03-19",
    endDate: "2026-03-20",
    lockDate: "2026-03-19T12:00:00-05:00",
    featured: [
      // ── EAST ──
      {
        id: "r64-east-1",
        teamA: { name: "Duke", seed: 1 },
        teamB: { name: "Siena", seed: 16 },
        region: "East",
        prompt: "Duke opens as the consensus title favorite. Any world where Siena shocks them?",
        gameDateLabel: "Mar 19",
        site: "Greenville, SC",
      },
      {
        id: "r64-east-5",
        teamA: { name: "St. John's", seed: 5 },
        teamB: { name: "Northern Iowa", seed: 12 },
        region: "East",
        prompt: "The most dangerous number in brackets: 5 vs 12. St. John's resurgent or Northern Iowa moment?",
        gameDateLabel: "Mar 20",
        site: "San Diego, CA",
      },
      {
        id: "r64-east-7",
        teamA: { name: "UConn", seed: 2 },
        teamB: { name: "Furman", seed: 15 },
        region: "East",
        prompt: "UConn won back-to-back titles in '23 and '24, then Florida stole the crown. Is this the Huskies' redemption run?",
        gameDateLabel: "Mar 20",
        site: "Philadelphia, PA",
      },
      // ── SOUTH ──
      {
        id: "r64-south-1",
        teamA: { name: "Vanderbilt", seed: 5 },
        teamB: { name: "McNeese", seed: 12 },
        region: "South",
        prompt: "McNeese had a cult following last March. Are they doing it again or was that lightning in a bottle?",
        gameDateLabel: "Mar 19",
        site: "Oklahoma City, OK",
      },
      {
        id: "r64-south-2",
        teamA: { name: "Houston", seed: 2 },
        teamB: { name: "Idaho", seed: 15 },
        region: "South",
        prompt: "Houston is built different. But Idaho (21-14) has nothing to lose. How far does Cougar momentum carry?",
        gameDateLabel: "Mar 20",
        site: "Oklahoma City, OK",
      },
      // ── WEST ──
      {
        id: "r64-west-1",
        teamA: { name: "Arizona", seed: 1 },
        teamB: { name: "Long Island", seed: 16 },
        region: "West",
        prompt: "Arizona is always a Final Four pick. They're also always a question mark when it matters.",
        gameDateLabel: "Mar 20",
        site: "San Diego, CA",
      },
      {
        id: "r64-west-2",
        teamA: { name: "Gonzaga", seed: 3 },
        teamB: { name: "Kennesaw St.", seed: 14 },
        region: "West",
        prompt: "Gonzaga has never won it all. Is this finally the year, or does the early-round curse continue?",
        gameDateLabel: "Mar 19",
        site: "Portland, OR",
      },
      // ── MIDWEST ──
      {
        id: "r64-midwest-1",
        teamA: { name: "Texas Tech", seed: 5 },
        teamB: { name: "Akron", seed: 12 },
        region: "Midwest",
        prompt: "Akron is 29-5. They aren't a fluke. This is the 12-seed that actually scares people.",
        gameDateLabel: "Mar 20",
        site: "Tampa, FL",
      },
      {
        id: "r64-midwest-2",
        teamA: { name: "Kentucky", seed: 7 },
        teamB: { name: "Santa Clara", seed: 10 },
        region: "Midwest",
        prompt: "Kentucky as a 7-seed is the storyline of the tournament. Are they dangerous or done?",
        gameDateLabel: "Mar 20",
        site: "St. Louis, MO",
      },
    ],
  },

  // ── ROUND OF 32 ───────────────────────────────────────────
  {
    id: "round-32",
    label: "Round of 32",
    shortLabel: "R32",
    startDate: "2026-03-21",
    endDate: "2026-03-22",
    lockDate: "2026-03-21T12:00:00-05:00",
    featured: [
      {
        id: "r32-1",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "East",
        prompt: "East bracket Round of 32 — update with real matchups after the first weekend.",
        gameDateLabel: "Mar 21",
      },
      {
        id: "r32-2",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "South",
        prompt: "South bracket Round of 32 — update with real matchups after the first weekend.",
        gameDateLabel: "Mar 21",
      },
      {
        id: "r32-3",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "West",
        prompt: "West bracket Round of 32 — update with real matchups after the first weekend.",
        gameDateLabel: "Mar 22",
      },
      {
        id: "r32-4",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "Midwest",
        prompt: "Midwest bracket Round of 32 — update with real matchups after the first weekend.",
        gameDateLabel: "Mar 22",
      },
    ],
  },

  // ── SWEET 16 ──────────────────────────────────────────────
  {
    id: "sweet-16",
    label: "Sweet 16",
    shortLabel: "S16",
    startDate: "2026-03-26",
    endDate: "2026-03-27",
    lockDate: "2026-03-27T12:00:00-05:00",
    featured: [
      {
        id: "s16-east",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "East",
        prompt: "East Sweet 16 — Washington, DC. Update with real teams.",
        gameDateLabel: "Mar 26",
      },
      {
        id: "s16-south",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "South",
        prompt: "South Sweet 16 — Houston, TX. Update with real teams.",
        gameDateLabel: "Mar 26",
      },
      {
        id: "s16-west",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "West",
        prompt: "West Sweet 16 — San Jose, CA. Update with real teams.",
        gameDateLabel: "Mar 27",
      },
      {
        id: "s16-midwest",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "Midwest",
        prompt: "Midwest Sweet 16 — Chicago, IL. Update with real teams.",
        gameDateLabel: "Mar 27",
      },
    ],
  },

  // ── ELITE 8 ───────────────────────────────────────────────
  {
    id: "elite-8",
    label: "Elite 8",
    shortLabel: "E8",
    startDate: "2026-03-28",
    endDate: "2026-03-29",
    lockDate: "2026-03-28T12:00:00-05:00",
    featured: [
      {
        id: "e8-east",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "East",
        prompt: "East Regional Final — Washington, DC. One team punches their Final Four ticket.",
        gameDateLabel: "Mar 28",
      },
      {
        id: "e8-south",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "South",
        prompt: "South Regional Final — Houston, TX. Final Four or go home.",
        gameDateLabel: "Mar 28",
      },
      {
        id: "e8-west",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "West",
        prompt: "West Regional Final — San Jose, CA. One game away from Indianapolis.",
        gameDateLabel: "Mar 29",
      },
      {
        id: "e8-midwest",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "Midwest",
        prompt: "Midwest Regional Final — Chicago, IL. The last ticket to the Final Four.",
        gameDateLabel: "Mar 29",
      },
    ],
  },

  // ── FINAL FOUR ────────────────────────────────────────────
  {
    id: "final-four",
    label: "Final Four",
    shortLabel: "FF",
    startDate: "2026-04-04",
    endDate: "2026-04-04",
    lockDate: "2026-04-04T18:00:00-05:00",
    featured: [
      {
        id: "ff-sf1",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "Semifinal 1",
        prompt: "Final Four — Semifinal 1. Indianapolis, IN. Who plays for the title?",
        gameDateLabel: "Apr 4",
        site: "Indianapolis, IN",
      },
      {
        id: "ff-sf2",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "Semifinal 2",
        prompt: "Final Four — Semifinal 2. Indianapolis, IN. The other side of the bracket.",
        gameDateLabel: "Apr 4",
        site: "Indianapolis, IN",
      },
    ],
  },

  // ── CHAMPIONSHIP ──────────────────────────────────────────
  {
    id: "championship",
    label: "Championship",
    shortLabel: "🏆",
    startDate: "2026-04-06",
    endDate: "2026-04-06",
    lockDate: "2026-04-06T20:00:00-05:00",
    featured: [
      {
        id: "champ-2026",
        teamA: { name: "TBD", seed: 0 },
        teamB: { name: "TBD", seed: 0 },
        region: "National Championship",
        prompt: "Who wins the 2026 NCAA Championship? Indianapolis, IN. Put your reputation on it.",
        gameDateLabel: "Apr 6",
        site: "Indianapolis, IN",
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// FULL BRACKET REFERENCE — All 64 teams
// Use this to look up any first-round matchup by region.
// ─────────────────────────────────────────────────────────────

export const FULL_BRACKET = {
  firstFour: [
    { region: "Midwest", slot: 16, teamA: "UMBC", teamB: "Howard" },
    { region: "South",   slot: 16, teamA: "Lehigh", teamB: "Prairie View A&M" },
    { region: "West",    slot: 11, teamA: "Texas",  teamB: "NC State" },
    { region: "Midwest", slot: 11, teamA: "SMU",    teamB: "Miami (OH)" },
  ],
  east: [
    { seed1: 1,  team1: "Duke",           seed2: 16, team2: "Siena",           site: "Greenville, SC",  date: "Mar 19" },
    { seed1: 8,  team1: "Ohio St.",        seed2: 9,  team2: "TCU",             site: "Greenville, SC",  date: "Mar 19" },
    { seed1: 5,  team1: "St. John's",      seed2: 12, team2: "Northern Iowa",   site: "San Diego, CA",   date: "Mar 20" },
    { seed1: 4,  team1: "Kansas",          seed2: 13, team2: "Cal Baptist",     site: "San Diego, CA",   date: "Mar 20" },
    { seed1: 6,  team1: "Louisville",      seed2: 11, team2: "South Florida",   site: "Buffalo, NY",     date: "Mar 19" },
    { seed1: 3,  team1: "Michigan St.",    seed2: 14, team2: "North Dakota St.", site: "Buffalo, NY",    date: "Mar 19" },
    { seed1: 7,  team1: "UCLA",            seed2: 10, team2: "UCF",             site: "Philadelphia, PA", date: "Mar 20" },
    { seed1: 2,  team1: "UConn",           seed2: 15, team2: "Furman",          site: "Philadelphia, PA", date: "Mar 20" },
  ],
  south: [
    { seed1: 1,  team1: "Florida",         seed2: 16, team2: "Lehigh/PVAMU",    site: "Tampa, FL",         date: "Mar 20" },
    { seed1: 8,  team1: "Clemson",         seed2: 9,  team2: "Iowa",            site: "Tampa, FL",         date: "Mar 20" },
    { seed1: 5,  team1: "Vanderbilt",      seed2: 12, team2: "McNeese",         site: "Oklahoma City, OK", date: "Mar 19" },
    { seed1: 4,  team1: "Nebraska",        seed2: 13, team2: "Troy",            site: "Oklahoma City, OK", date: "Mar 19" },
    { seed1: 6,  team1: "North Carolina",  seed2: 11, team2: "VCU",             site: "Greenville, SC",    date: "Mar 19" },
    { seed1: 3,  team1: "Illinois",        seed2: 14, team2: "Penn",            site: "Greenville, SC",    date: "Mar 19" },
    { seed1: 7,  team1: "Saint Mary's",    seed2: 10, team2: "Texas A&M",       site: "Oklahoma City, OK", date: "Mar 20" },
    { seed1: 2,  team1: "Houston",         seed2: 15, team2: "Idaho",           site: "Oklahoma City, OK", date: "Mar 20" },
  ],
  west: [
    { seed1: 1,  team1: "Arizona",         seed2: 16, team2: "Long Island",     site: "San Diego, CA",  date: "Mar 20" },
    { seed1: 8,  team1: "Villanova",       seed2: 9,  team2: "Utah St.",        site: "San Diego, CA",  date: "Mar 20" },
    { seed1: 5,  team1: "Wisconsin",       seed2: 12, team2: "High Point",      site: "Portland, OR",   date: "Mar 19" },
    { seed1: 4,  team1: "Arkansas",        seed2: 13, team2: "Hawaii",          site: "Portland, OR",   date: "Mar 19" },
    { seed1: 6,  team1: "BYU",             seed2: 11, team2: "Texas/NC State",  site: "Portland, OR",   date: "Mar 19" },
    { seed1: 3,  team1: "Gonzaga",         seed2: 14, team2: "Kennesaw St.",    site: "Portland, OR",   date: "Mar 19" },
    { seed1: 7,  team1: "Miami (FL)",      seed2: 10, team2: "Missouri",        site: "St. Louis, MO",  date: "Mar 20" },
    { seed1: 2,  team1: "Purdue",          seed2: 15, team2: "Queens (N.C.)",   site: "St. Louis, MO",  date: "Mar 20" },
  ],
  midwest: [
    { seed1: 1,  team1: "Michigan",        seed2: 16, team2: "UMBC/Howard",     site: "Buffalo, NY",       date: "Mar 19" },
    { seed1: 8,  team1: "Georgia",         seed2: 9,  team2: "Saint Louis",     site: "Buffalo, NY",       date: "Mar 19" },
    { seed1: 5,  team1: "Texas Tech",      seed2: 12, team2: "Akron",           site: "Tampa, FL",         date: "Mar 20" },
    { seed1: 4,  team1: "Alabama",         seed2: 13, team2: "Hofstra",         site: "Tampa, FL",         date: "Mar 20" },
    { seed1: 6,  team1: "Tennessee",       seed2: 11, team2: "SMU/Miami (OH)",  site: "Philadelphia, PA",  date: "Mar 20" },
    { seed1: 3,  team1: "Virginia",        seed2: 14, team2: "Wright St.",      site: "Philadelphia, PA",  date: "Mar 20" },
    { seed1: 7,  team1: "Kentucky",        seed2: 10, team2: "Santa Clara",     site: "St. Louis, MO",     date: "Mar 20" },
    { seed1: 2,  team1: "Iowa St.",        seed2: 15, team2: "Tennessee St.",   site: "St. Louis, MO",     date: "Mar 20" },
  ],
};

// ─────────────────────────────────────────────────────────────
// Returns the active round based on today's date.
// ─────────────────────────────────────────────────────────────
export function getCurrentRound(): MMRound {
  const today = new Date().toISOString().split("T")[0];
  let activeRound = MM_ROUNDS[1]; // Default: Round of 64
  for (const round of MM_ROUNDS) {
    if (round.startDate <= today) {
      activeRound = round;
    }
  }
  return activeRound;
}

// Returns featured matchups for the current round, up to `limit`.
export function getFeaturedMatchups(limit = 9): MMMatchup[] {
  const round = getCurrentRound();
  return round.featured.slice(0, limit);
}

// Build create-swayger URL params from a matchup.
export function matchupToCreateParams(matchup: MMMatchup): Record<string, string> {
  const seedA = matchup.teamA.seed > 0 ? `#${matchup.teamA.seed} ` : "";
  const seedB = matchup.teamB.seed > 0 ? `#${matchup.teamB.seed} ` : "";
  return {
    prefillCategory: "March Madness",
    prefillTitle: `${seedA}${matchup.teamA.name} vs. ${seedB}${matchup.teamB.name}`,
    prefillDescription: matchup.prompt,
  };
}
