export type NflConference = "AFC" | "NFC";
export type NflDivision =
  | "AFC East"
  | "AFC North"
  | "AFC South"
  | "AFC West"
  | "NFC East"
  | "NFC North"
  | "NFC South"
  | "NFC West";

export type NflTeamCatalogEntry = {
  sport: "football";
  league: "nfl";
  team_code: string;
  display_name: string;
  full_name: string;
  conference: NflConference;
  division: NflDivision;
  active: true;
};

const NFL_TEAM_CATALOG: readonly NflTeamCatalogEntry[] = Object.freeze([
  {
    sport: "football",
    league: "nfl",
    team_code: "BUF",
    display_name: "Bills",
    full_name: "Buffalo Bills",
    conference: "AFC",
    division: "AFC East",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "MIA",
    display_name: "Dolphins",
    full_name: "Miami Dolphins",
    conference: "AFC",
    division: "AFC East",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "NE",
    display_name: "Patriots",
    full_name: "New England Patriots",
    conference: "AFC",
    division: "AFC East",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "NYJ",
    display_name: "Jets",
    full_name: "New York Jets",
    conference: "AFC",
    division: "AFC East",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "BAL",
    display_name: "Ravens",
    full_name: "Baltimore Ravens",
    conference: "AFC",
    division: "AFC North",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "CIN",
    display_name: "Bengals",
    full_name: "Cincinnati Bengals",
    conference: "AFC",
    division: "AFC North",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "CLE",
    display_name: "Browns",
    full_name: "Cleveland Browns",
    conference: "AFC",
    division: "AFC North",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "PIT",
    display_name: "Steelers",
    full_name: "Pittsburgh Steelers",
    conference: "AFC",
    division: "AFC North",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "HOU",
    display_name: "Texans",
    full_name: "Houston Texans",
    conference: "AFC",
    division: "AFC South",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "IND",
    display_name: "Colts",
    full_name: "Indianapolis Colts",
    conference: "AFC",
    division: "AFC South",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "JAX",
    display_name: "Jaguars",
    full_name: "Jacksonville Jaguars",
    conference: "AFC",
    division: "AFC South",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "TEN",
    display_name: "Titans",
    full_name: "Tennessee Titans",
    conference: "AFC",
    division: "AFC South",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "DEN",
    display_name: "Broncos",
    full_name: "Denver Broncos",
    conference: "AFC",
    division: "AFC West",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "KC",
    display_name: "Chiefs",
    full_name: "Kansas City Chiefs",
    conference: "AFC",
    division: "AFC West",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "LV",
    display_name: "Raiders",
    full_name: "Las Vegas Raiders",
    conference: "AFC",
    division: "AFC West",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "LAC",
    display_name: "Chargers",
    full_name: "Los Angeles Chargers",
    conference: "AFC",
    division: "AFC West",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "DAL",
    display_name: "Cowboys",
    full_name: "Dallas Cowboys",
    conference: "NFC",
    division: "NFC East",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "NYG",
    display_name: "Giants",
    full_name: "New York Giants",
    conference: "NFC",
    division: "NFC East",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "PHI",
    display_name: "Eagles",
    full_name: "Philadelphia Eagles",
    conference: "NFC",
    division: "NFC East",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "WAS",
    display_name: "Commanders",
    full_name: "Washington Commanders",
    conference: "NFC",
    division: "NFC East",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "CHI",
    display_name: "Bears",
    full_name: "Chicago Bears",
    conference: "NFC",
    division: "NFC North",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "DET",
    display_name: "Lions",
    full_name: "Detroit Lions",
    conference: "NFC",
    division: "NFC North",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "GB",
    display_name: "Packers",
    full_name: "Green Bay Packers",
    conference: "NFC",
    division: "NFC North",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "MIN",
    display_name: "Vikings",
    full_name: "Minnesota Vikings",
    conference: "NFC",
    division: "NFC North",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "ATL",
    display_name: "Falcons",
    full_name: "Atlanta Falcons",
    conference: "NFC",
    division: "NFC South",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "CAR",
    display_name: "Panthers",
    full_name: "Carolina Panthers",
    conference: "NFC",
    division: "NFC South",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "NO",
    display_name: "Saints",
    full_name: "New Orleans Saints",
    conference: "NFC",
    division: "NFC South",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "TB",
    display_name: "Buccaneers",
    full_name: "Tampa Bay Buccaneers",
    conference: "NFC",
    division: "NFC South",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "ARI",
    display_name: "Cardinals",
    full_name: "Arizona Cardinals",
    conference: "NFC",
    division: "NFC West",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "LAR",
    display_name: "Rams",
    full_name: "Los Angeles Rams",
    conference: "NFC",
    division: "NFC West",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "SF",
    display_name: "49ers",
    full_name: "San Francisco 49ers",
    conference: "NFC",
    division: "NFC West",
    active: true,
  },
  {
    sport: "football",
    league: "nfl",
    team_code: "SEA",
    display_name: "Seahawks",
    full_name: "Seattle Seahawks",
    conference: "NFC",
    division: "NFC West",
    active: true,
  },
] as const);

export function getNflTeamCatalog(): NflTeamCatalogEntry[] {
  return NFL_TEAM_CATALOG.map((team) => ({ ...team }));
}

export function findNflTeamByCode(teamCode: unknown): NflTeamCatalogEntry | null {
  if (typeof teamCode !== "string") return null;
  const normalized = teamCode.trim().toUpperCase();
  return getNflTeamCatalog().find((team) => team.team_code === normalized) ?? null;
}

export function buildNflMatchupPayload(
  teamACode: unknown,
  teamBCode: unknown,
  lineText?: unknown,
): { team_a: string; team_b: string; line_text: string | null } | null {
  const teamA = findNflTeamByCode(teamACode);
  const teamB = findNflTeamByCode(teamBCode);
  if (!teamA || !teamB || teamA.team_code === teamB.team_code) return null;

  const line = typeof lineText === "string" ? lineText.trim() : "";
  return {
    team_a: teamA.display_name,
    team_b: teamB.display_name,
    line_text: line || null,
  };
}