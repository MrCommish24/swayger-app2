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
  keyStat?: string;
  // Optional odds data — populated for later rounds when known
  spread?: number;
  overUnder?: number;
  favoriteTeam?: string;
  underdogTeam?: string;
  underdogMoneyline?: number;
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
  // winner: set after the round concludes (e.g. championship winner name)
  winner?: string;
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
    lockDate: "2026-03-19T11:00:00-05:00",
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
  // All 16 games confirmed from live Odds API (Mar 21-22, 2026).
  // Mar 21 tip times in CDT: 11:10am, 1:45pm, 4:15pm, 5:10pm, 6:10pm, 6:50pm, 7:45pm, 8:45pm
  // Mar 22 tip times in CDT: 11:10am, 1:45pm, 4:15pm, 5:10pm, 6:10pm, 6:50pm, 7:45pm, 8:45pm
  {
    id: "round-32",
    label: "Round of 32",
    shortLabel: "R32",
    startDate: "2026-03-21",
    endDate: "2026-03-22",
    lockDate: "2026-03-21T12:00:00-05:00",
    featured: [
      // ── MARCH 21 — 8 GAMES ──

      // 11:10am CDT — Midwest
      {
        id: "r32-midwest-michigan-stlouis",
        teamA: { name: "Michigan", seed: 1 },
        teamB: { name: "Saint Louis", seed: 9 },
        region: "Midwest",
        prompt: "Michigan opens the day as the nation's #1 program against a Saint Louis squad that dismantled Georgia by 25. The Wolverines are -12.5 favorites but the Billikens bring a suffocating defense that held an SEC team to 58 points last week. O/U 161.5 — someone's scoring a lot.",
        gameDateLabel: "Mar 21",
        site: "Buffalo, NY",
        keyStat: "O/U 161.5 — highest of the morning slate",
      },

      // 1:45pm CDT — East
      {
        id: "r32-east-msu-louisville",
        teamA: { name: "Michigan St.", seed: 3 },
        teamB: { name: "Louisville", seed: 6 },
        region: "East",
        prompt: "Izzo vs. Kenny Payne. The Spartans are -4.5 favorites in a game that looks more like a coin flip on paper. Louisville upset South Florida and Izzo-coached teams cover 71% of tournament games historically. O/U 150.5 suggests a defensive grind — could go either way.",
        gameDateLabel: "Mar 21",
        site: "Raleigh, NC",
        keyStat: "Izzo-coached teams cover in 71% of NCAA tournament games",
      },

      // 4:15pm CDT — East
      {
        id: "r32-east-duke-tcu",
        teamA: { name: "Duke", seed: 1 },
        teamB: { name: "TCU", seed: 9 },
        region: "East",
        prompt: "Duke hasn't lost since January and enters as the tournament's biggest title favorite. TCU dethroned Ohio State to get here — they're not scared of the moment. The Blue Devils are -11.5 but their defense allows just 61 points per game. This could get out of hand fast.",
        gameDateLabel: "Mar 21",
        site: "Raleigh, NC",
        keyStat: "Duke -11.5 | O/U 140.5 — lowest total on today's slate",
      },

      // 5:10pm CDT — South
      {
        id: "r32-south-houston-texasam",
        teamA: { name: "Houston", seed: 2 },
        teamB: { name: "Texas A&M", seed: 10 },
        region: "South",
        prompt: "Houston's defense is the best in the country — opponents shoot 38% against them. Texas A&M pulled a massive upset over #7 Saint Mary's and they're not done. Cougars are -10.5 favorites but A&M wins ugly and this total (141.5) suggests an absolute defensive war.",
        gameDateLabel: "Mar 21",
        site: "Oklahoma City, OK",
        keyStat: "Houston holds opponents to 38% FG — best in the nation",
      },

      // 6:10pm CDT — West
      {
        id: "r32-west-gonzaga-texas",
        teamA: { name: "Gonzaga", seed: 3 },
        teamB: { name: "Texas", seed: 11 },
        region: "West",
        prompt: "Texas survived the First Four, then shocked #6 BYU. Gonzaga is 6.5-point favorites but their title drought despite annual Final Four appearances is real pressure. The Longhorns lost 5 of their last 6 before March — then flipped a switch. Can they make it three in a row?",
        gameDateLabel: "Mar 21",
        site: "Portland, OR",
        keyStat: "Texas won 5 of their last 6 entering tournament — after losing 5 of 6 before it",
      },

      // 6:50pm CDT — South
      {
        id: "r32-south-illinois-vcu",
        teamA: { name: "Illinois", seed: 3 },
        teamB: { name: "VCU", seed: 11 },
        region: "South",
        prompt: "VCU just stunned #6 North Carolina and now faces an Illinois team averaging 9.8 made threes per game. The Rams' full-court chaos disrupts every offense — but Illinois has seen everything this season. O/U 151.5. If VCU can pull another upset, they become the Cinderella of this tournament.",
        gameDateLabel: "Mar 21",
        site: "Greenville, SC",
        keyStat: "VCU upset #6 UNC | Illinois makes 9.8 threes per game",
      },

      // 7:45pm CDT — South
      {
        id: "r32-south-nebraska-vanderbilt",
        teamA: { name: "Nebraska", seed: 4 },
        teamB: { name: "Vanderbilt", seed: 5 },
        region: "South",
        prompt: "This is a coin flip. Vanderbilt is a 1.5-point favorite over Nebraska in a 4v5 matchup where both teams won R64 comfortably. Neither program flinches in big moments. Whoever's guard play clicks tonight wins. O/U 146.5 — expect a 70-point-per-side type game.",
        gameDateLabel: "Mar 21",
        site: "Oklahoma City, OK",
        keyStat: "Spread: Vanderbilt -1.5 — effectively even money",
      },

      // 8:45pm CDT — West
      {
        id: "r32-west-arkansas-highpoint",
        teamA: { name: "Arkansas", seed: 4 },
        teamB: { name: "High Point", seed: 12 },
        region: "West",
        prompt: "High Point shocked Wisconsin 83-82 in R64 — one of the best upsets of the tournament. Arkansas is -11.5 but this total (169.5) is the highest on the ENTIRE weekend slate. The Panthers force turnovers and score in transition. Cinderella is still dancing.",
        gameDateLabel: "Mar 21",
        site: "Portland, OR",
        keyStat: "O/U 169.5 — highest over/under of the entire R32 weekend",
      },

      // ── MARCH 22 — 8 GAMES ──

      // 11:10am CDT — West
      {
        id: "r32-west-purdue-miami",
        teamA: { name: "Purdue", seed: 2 },
        teamB: { name: "Miami (FL)", seed: 7 },
        region: "West",
        prompt: "Purdue and their imposing frontcourt face a Miami (FL) squad that knocked out Missouri. Boilermakers are 7.5-point favorites but the Hurricanes have the athleticism to run with anyone. O/U 147.5 suggests a moderately paced game — can Purdue's size advantage hold?",
        gameDateLabel: "Mar 22",
        site: "San Diego, CA",
      },

      // 1:45pm CDT — Midwest
      {
        id: "r32-midwest-iowast-kentucky",
        teamA: { name: "Iowa State", seed: 2 },
        teamB: { name: "Kentucky", seed: 7 },
        region: "Midwest",
        prompt: "Iowa State has one of the most experienced backcourts in the country and enters as -4.5 favorites. Kentucky's athleticism is undeniable but their consistency this season has been a question mark. The Cyclones are built for March — will Kentucky find their gear at the right time?",
        gameDateLabel: "Mar 22",
        site: "St. Louis, MO",
        keyStat: "Iowa State -4.5 | Big 12 vs SEC pressure game",
      },

      // 4:15pm CDT — East
      {
        id: "r32-east-kansas-stjohns",
        teamA: { name: "Kansas", seed: 4 },
        teamB: { name: "St. John's", seed: 5 },
        region: "East",
        prompt: "Fascinating flip: St. John's is a 3.5-point FAVORITE over #4 Kansas. The Red Storm's guard play has been exceptional and they come in with momentum. Kansas has the brand and the coaching but St. John's wants it more right now. The 4v5 matchup is always volatile.",
        gameDateLabel: "Mar 22",
        site: "San Diego, CA",
        keyStat: "St. John's is -3.5 FAVORITE over Kansas — a rare 5-over-4 flip",
      },

      // 5:10pm CDT — Midwest
      {
        id: "r32-midwest-virginia-tennessee",
        teamA: { name: "Virginia", seed: 3 },
        teamB: { name: "Tennessee", seed: 6 },
        region: "Midwest",
        prompt: "Two elite defensive programs collide. Virginia's pack-line defense against Tennessee's physical SEC style. The Cavaliers are -1.5 favorites — effectively even money. The 137.5 over/under is the lowest of the weekend. Whoever scores first has the edge in this low-possession grind.",
        gameDateLabel: "Mar 22",
        site: "Philadelphia, PA",
        keyStat: "O/U 137.5 — lowest of the entire R32 weekend",
      },

      // 6:10pm CDT — South
      {
        id: "r32-south-florida-iowa",
        teamA: { name: "Florida", seed: 1 },
        teamB: { name: "Iowa", seed: 9 },
        region: "South",
        prompt: "Florida is the nation's #1 team and it shows in every metric. Iowa averages 83 points per game but hasn't seen a defense this elite all year. The Gators are -10.5 and haven't allowed 70+ in weeks. Iowa needs a historic performance to pull the upset.",
        gameDateLabel: "Mar 22",
        site: "Tampa, FL",
        keyStat: "Florida hasn't allowed 70+ points in 3 weeks",
      },

      // 6:50pm CDT — West
      {
        id: "r32-west-arizona-utahst",
        teamA: { name: "Arizona", seed: 1 },
        teamB: { name: "Utah State", seed: 9 },
        region: "West",
        prompt: "Arizona averages 84 points per game — top 5 nationally in offensive efficiency. Utah State knocked out #8 Villanova to earn this shot at the Wildcats. Arizona is -11.5 favorites and a legitimate Final Four contender. O/U 155.5 — Arizona might hit that number alone.",
        gameDateLabel: "Mar 22",
        site: "San Diego, CA",
        keyStat: "Arizona averages 84.2 ppg — top 5 nationally",
      },

      // 7:45pm CDT — East
      {
        id: "r32-east-uconn-ucla",
        teamA: { name: "UConn", seed: 2 },
        teamB: { name: "UCLA", seed: 7 },
        region: "East",
        prompt: "The reigning back-to-back national champions enter as slight underdogs (+4.5) against UCLA. The Huskies' 3-peat run starts here. UCLA's athleticism and pace could be a problem. O/U 137.5 — both defenses are respected. This is a defensive chess match with Final Four stakes.",
        gameDateLabel: "Mar 22",
        site: "Philadelphia, PA",
        keyStat: "UConn is the slight underdog despite being back-to-back champs",
      },

      // 8:45pm CDT — Midwest
      {
        id: "r32-midwest-alabama-texastech",
        teamA: { name: "Alabama", seed: 4 },
        teamB: { name: "Texas Tech", seed: 5 },
        region: "Midwest",
        prompt: "The marquee nightcap of the weekend. Alabama's up-tempo style vs Texas Tech's grind-it-out defense — and the highest over/under of the slate at 164.5. Alabama is -1.5 favorites but this is essentially a pick'em. Whoever imposes their pace controls the game.",
        gameDateLabel: "Mar 22",
        site: "Tampa, FL",
        keyStat: "O/U 164.5 — second-highest of the weekend | Alabama -1.5",
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
    lockDate: "2026-03-26T18:00:00-05:00",  // 6pm CDT Mar 26 — first tip is 6:10pm CDT
    featured: [
      // ── MARCH 26 — 4 GAMES ──

      // 6:10pm CDT — West
      {
        id: "s16-west-purdue-texas",
        teamA: { name: "Purdue", seed: 2 },
        teamB: { name: "Texas", seed: 11 },
        region: "West",
        prompt: "Texas survived the First Four and knocked off two teams to get here as an #11 seed. Purdue's frontline is 4 inches taller on average. The Longhorns thrive in chaos — can they pull off one more miracle?",
        gameDateLabel: "Mar 26",
        site: "San Jose, CA",
        keyStat: "Texas is 3-0 as double-digit underdogs this tournament",
      },

      // 6:30pm CDT — South
      {
        id: "s16-south-nebraska-iowa",
        teamA: { name: "Nebraska", seed: 4 },
        teamB: { name: "Iowa", seed: 9 },
        region: "South",
        prompt: "Iowa just stunned #1 Florida in the Round of 32. Nebraska has been waiting their whole program for a run like this. Big Ten rivals who know each other cold — one of them punches their first-ever Elite 8 ticket.",
        gameDateLabel: "Mar 26",
        site: "Houston, TX",
        keyStat: "Iowa's 9-seed upset of Florida was the biggest of R32",
      },

      // 8:45pm CDT — West
      {
        id: "s16-west-arizona-arkansas",
        teamA: { name: "Arizona", seed: 1 },
        teamB: { name: "Arkansas", seed: 4 },
        region: "West",
        prompt: "Arizona leads the nation in 3-point percentage and is the last #1 seed standing in the West. Arkansas plays a suffocating switch-everything defense that has held opponents 8 points under their average. This could be the best game of the Sweet 16.",
        gameDateLabel: "Mar 26",
        site: "San Jose, CA",
        keyStat: "Arkansas held their last two opponents to under 60 pts",
      },

      // 9:05pm CDT — South
      {
        id: "s16-south-houston-illinois",
        teamA: { name: "Houston", seed: 2 },
        teamB: { name: "Illinois", seed: 3 },
        region: "South",
        prompt: "Houston is playing at Toyota Center — their home arena — for the Sweet 16. The Cougars feed off the crowd. Illinois has the best point guard in the field in Ty Rodgers. Home crowd vs. best ball-handler — who wins?",
        gameDateLabel: "Mar 26",
        site: "Houston, TX",
        keyStat: "Houston is 12-1 all-time at Toyota Center in tournament play",
      },

      // ── MARCH 27 — 4 GAMES ──

      // 6:10pm CDT — East
      {
        id: "s16-east-duke-stjohns",
        teamA: { name: "Duke", seed: 1 },
        teamB: { name: "St. John's", seed: 5 },
        region: "East",
        prompt: "St. John's is in the Sweet 16 for the first time in over 25 years. Duke is the #1 overall seed and still a perfect 2-0 this tournament. The Johnnies have nothing to lose — Duke has everything to prove.",
        gameDateLabel: "Mar 27",
        site: "Washington, DC",
        keyStat: "St. John's first Sweet 16 since 2000 — 26-year drought ends here or continues",
      },

      // 6:35pm CDT — Midwest
      {
        id: "s16-midwest-michigan-alabama",
        teamA: { name: "Michigan", seed: 1 },
        teamB: { name: "Alabama", seed: 4 },
        region: "Midwest",
        prompt: "Michigan's dominant rim-protection defense — 7th nationally in block rate — meets Alabama's fast-break machine averaging 84 ppg. The Wolverines are 32-3 on the year. Alabama loves the open court. One of these styles will break.",
        gameDateLabel: "Mar 27",
        site: "Chicago, IL",
        keyStat: "Alabama scores 20+ fastbreak pts per game — Michigan blocks 7 shots per game",
      },

      // 8:45pm CDT — East
      {
        id: "s16-east-uconn-michiganst",
        teamA: { name: "UConn", seed: 2 },
        teamB: { name: "Michigan St.", seed: 3 },
        region: "East",
        prompt: "UConn won the national championship two years ago and still has five players from that roster. Michigan State's Tom Izzo is a Sweet 16 regular — this is his 15th appearance. Two programs that know how to win in March.",
        gameDateLabel: "Mar 27",
        site: "Washington, DC",
        keyStat: "UConn: 2x champ in 3 years | MSU: 15th Sweet 16 under Izzo",
      },

      // 9:10pm CDT — Midwest
      {
        id: "s16-midwest-iowast-tennessee",
        teamA: { name: "Iowa St.", seed: 2 },
        teamB: { name: "Tennessee", seed: 6 },
        region: "Midwest",
        prompt: "Iowa State's four-deep wing rotation is the most versatile in the field. Tennessee plays suffocating perimeter defense — ranked 3rd nationally in opponent 3P%. The Cyclones will live or die by the three-point line tonight.",
        gameDateLabel: "Mar 27",
        site: "Chicago, IL",
        keyStat: "Tennessee holds opponents to 28% from 3 — Iowa St. shoots 39% from 3",
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
    lockDate: "2026-03-28T17:00:00-05:00",
    featured: [
      {
        id: "e8-east",
        teamA: { name: "Duke", seed: 1 },
        teamB: { name: "UConn", seed: 2 },
        region: "East",
        prompt: "East Regional Final — Capital One Arena, Washington DC. Duke -5.5 vs. the 2-time defending champion.",
        gameDateLabel: "Mar 29",
      },
      {
        id: "e8-south",
        teamA: { name: "Illinois", seed: 3 },
        teamB: { name: "Iowa", seed: 9 },
        region: "South",
        prompt: "South Regional Final — Toyota Center, Houston TX. Illinois -6.5 vs. Iowa's Cinderella run.",
        gameDateLabel: "Mar 28",
      },
      {
        id: "e8-west",
        teamA: { name: "Arizona", seed: 1 },
        teamB: { name: "Purdue", seed: 2 },
        region: "West",
        prompt: "West Regional Final — SAP Center, San Jose CA. Arizona -6.5 vs. Purdue's elite defense.",
        gameDateLabel: "Mar 28",
      },
      {
        id: "e8-midwest",
        teamA: { name: "Michigan", seed: 1 },
        teamB: { name: "Tennessee", seed: 6 },
        region: "Midwest",
        prompt: "Midwest Regional Final — United Center, Chicago IL. Michigan -7.5 vs. #6 Tennessee.",
        gameDateLabel: "Mar 29",
      },
    ],
  },

  // ── FINAL FOUR ────────────────────────────────────────────
  // Teams confirmed from Odds API (Apr 2, 2026).
  // SF1 (South vs East): Illinois (3) vs UConn (2) — Illinois -2.5, O/U 139.5
  // SF2 (Midwest vs West): Michigan (1) vs Arizona (1) — Michigan -1.5, O/U 157.5
  {
    id: "final-four",
    label: "Final Four",
    shortLabel: "FF",
    startDate: "2026-04-04",
    endDate: "2026-04-04",
    lockDate: "2026-04-04T17:00:00-05:00",
    featured: [
      {
        id: "ff-sf1",
        teamA: { name: "Illinois Fighting Illini", seed: 3 },
        teamB: { name: "UConn Huskies", seed: 2 },
        region: "South vs East",
        prompt: "Final Four — Illinois (3) vs UConn (2). Lucas Oil Stadium, Indianapolis. UConn chasing a 3rd title in 3 years — Illinois is the hottest team left. Who plays for the championship?",
        gameDateLabel: "Apr 4 · 6:09 PM ET",
        site: "Lucas Oil Stadium, Indianapolis, IN",
        spread: -2.5,
        overUnder: 139.5,
        favoriteTeam: "Illinois Fighting Illini",
        underdogTeam: "UConn Huskies",
        underdogMoneyline: 108,
      },
      {
        id: "ff-sf2",
        teamA: { name: "Michigan Wolverines", seed: 1 },
        teamB: { name: "Arizona Wildcats", seed: 1 },
        region: "Midwest vs West",
        prompt: "Final Four — Michigan (1) vs Arizona (1). Lucas Oil Stadium, Indianapolis. Two #1 seeds, one title shot. The highest-scoring matchup of the Final Four.",
        gameDateLabel: "Apr 4 · 8:49 PM ET",
        site: "Lucas Oil Stadium, Indianapolis, IN",
        spread: -1.5,
        overUnder: 157.5,
        favoriteTeam: "Michigan Wolverines",
        underdogTeam: "Arizona Wildcats",
        underdogMoneyline: 102,
      },
    ],
  },

  // ── CHAMPIONSHIP ──────────────────────────────────────────
  // FINAL RESULT: Michigan Wolverines def. UConn Huskies — Apr 6, 2026
  {
    id: "championship",
    label: "Championship",
    shortLabel: "🏆",
    startDate: "2026-04-06",
    endDate: "2026-04-06",
    lockDate: "2026-04-06T18:00:00-05:00",
    winner: "Michigan Wolverines",
    featured: [
      {
        id: "champ-2026",
        teamA: { name: "Michigan Wolverines", seed: 1 },
        teamB: { name: "UConn Huskies", seed: 2 },
        region: "National Championship",
        prompt: "2026 NCAA Championship — Michigan (1) vs UConn (2). Lucas Oil Stadium, Indianapolis. Michigan made the title game for the first time in 30+ years. UConn chasing a 3rd title in 3 years. Who is crowned champion?",
        gameDateLabel: "Apr 6 · 9:20 PM ET",
        site: "Lucas Oil Stadium, Indianapolis, IN",
        favoriteTeam: "Michigan Wolverines",
        underdogTeam: "UConn Huskies",
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
// Returns the active round based on today's date in CDT (UTC-5).
// startDate values are CDT calendar dates, so we must compare
// against the CDT date — not the raw UTC date string.
// ─────────────────────────────────────────────────────────────
export function getCurrentRound(): MMRound {
  const cdtDate = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const today = cdtDate.toISOString().split("T")[0];
  let activeRound = MM_ROUNDS[1]; // Default: Round of 64
  for (let i = 0; i < MM_ROUNDS.length; i++) {
    const round = MM_ROUNDS[i];
    if (round.startDate <= today) {
      activeRound = round;
      // If today is past this round's end date, peek at the next round.
      // Show the next round's featured matchups as "coming up" so users
      // see upcoming games instead of completed ones during the gap between rounds.
      if (round.endDate < today && i + 1 < MM_ROUNDS.length) {
        activeRound = MM_ROUNDS[i + 1];
      }
    }
  }
  return activeRound;
}

// Parse a gameDateLabel like "Mar 22" into a comparable "YYYY-MM-DD" string
// using the current year so we can sort by actual date.
function parseDateLabel(label: string | undefined): string {
  if (!label) return "9999-99-99";
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04",
    May: "05", Jun: "06", Jul: "07", Aug: "08",
    Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const parts = label.trim().split(/\s+/);
  const mon = months[parts[0]] ?? "01";
  const day = (parts[1] ?? "1").padStart(2, "0");
  return `2026-${mon}-${day}`;
}

// Returns featured matchups for the current round, up to `limit`.
// Games are sorted: today first, then future dates, then past dates last —
// so when a multi-day round rolls over, the current day's slate rises to the top.
export function getFeaturedMatchups(limit = 9): MMMatchup[] {
  const round = getCurrentRound();
  const cdtDate = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const today = cdtDate.toISOString().split("T")[0]; // "2026-03-22"

  const sorted = [...round.featured].sort((a, b) => {
    const da = parseDateLabel(a.gameDateLabel);
    const db = parseDateLabel(b.gameDateLabel);
    // Today's games first
    if (da === today && db !== today) return -1;
    if (db === today && da !== today) return 1;
    // Past games (before today) go to the bottom
    const aPast = da < today;
    const bPast = db < today;
    if (aPast && !bPast) return 1;
    if (bPast && !aPast) return -1;
    // Otherwise preserve original order within the same tier
    return 0;
  });

  return sorted.slice(0, limit);
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
