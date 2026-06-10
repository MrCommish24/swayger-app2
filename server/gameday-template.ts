export interface PropTemplate {
  id: string;
  phase: "pregame" | "halftime" | "fourth";
  question: string;
  answers: string[];
  settlement_window: string;
}

export const NBA_PLAYOFF_TEMPLATE: PropTemplate[] = [

  // ── Pregame ───────────────────────────────────────────────────────────────
  // ~20 objective props. Mix of early-settle (Q1), mid-settle (halftime), and
  // full-game props so the leaderboard moves throughout the night.

  {
    id: "pg_scores_first",
    phase: "pregame",
    question: "Which team scores first?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "Early 1Q",
  },
  {
    id: "pg_first_three",
    phase: "pregame",
    question: "Which team makes the first 3-pointer?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No 3-pointer in Q1"],
    settlement_window: "Early 1Q",
  },
  {
    id: "pg_reach10",
    phase: "pregame",
    question: "Which team reaches 10 points first?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "Early 1Q",
  },
  {
    id: "pg_q1",
    phase: "pregame",
    question: "Which team wins the 1st quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End 1Q",
  },
  {
    id: "pg_q1_pts",
    phase: "pregame",
    question: "Which team scores more points in the 1st quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End 1Q",
  },
  {
    id: "pg_star_q1",
    phase: "pregame",
    question: "Which star scores more points in the 1st quarter?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tie"],
    settlement_window: "End 1Q",
  },
  {
    id: "pg_q1_30",
    phase: "pregame",
    question: "Will either team score 30+ points in the 1st quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End 1Q",
  },
  {
    id: "pg_reach20",
    phase: "pregame",
    question: "Which team reaches 20 points first?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Neither team reaches 20 in Q1"],
    settlement_window: "Early 1Q–2Q",
  },
  {
    id: "pg_star_halftime",
    phase: "pregame",
    question: "Which star scores more points in the 1st half?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tie"],
    settlement_window: "Halftime",
  },
  {
    id: "pg_1h_winner",
    phase: "pregame",
    question: "Which team wins the first half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "Halftime",
  },
  {
    id: "pg_lead10_half",
    phase: "pregame",
    question: "Will either team lead by 10+ points in the 1st half?",
    answers: ["Yes", "No"],
    settlement_window: "Halftime",
  },
  {
    id: "pg_star_pts",
    phase: "pregame",
    question: "Which star finishes with more total points?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "pg_star_threes",
    phase: "pregame",
    question: "Which star makes more 3-pointers in the game?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "pg_threes",
    phase: "pregame",
    question: "Which team makes more 3-pointers in the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "pg_turnovers",
    phase: "pregame",
    question: "Which team has more turnovers in the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "pg_oreb",
    phase: "pregame",
    question: "Which team has more offensive rebounds in the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "pg_winner",
    phase: "pregame",
    question: "Which team wins the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game",
  },
  {
    id: "pg_clutch",
    phase: "pregame",
    question: "Will the game be within 7 points with 2 minutes left?",
    answers: ["Yes", "No"],
    settlement_window: "Final 2 Min",
  },
  {
    id: "pg_margin7",
    phase: "pregame",
    question: "Will the final margin be 7 points or fewer?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "pg_total220",
    phase: "pregame",
    question: "Will the game total be 220+ combined points?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  // Additional pregame options
  {
    id: "pg_margin",
    phase: "pregame",
    question: "Final margin?",
    answers: ["1–5", "6–10", "11–15", "16+"],
    settlement_window: "End Game",
  },
  {
    id: "pg_tech",
    phase: "pregame",
    question: "Will there be a technical foul?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },

  // ── Halftime ─────────────────────────────────────────────────────────────
  // ~20 objective props. Focus on 2nd half, Q3, and full-game outcome from
  // halftime. Settle progressively through Q3 and end of game.

  {
    id: "ht_first2h",
    phase: "halftime",
    question: "Which team scores first in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "Early 3Q",
  },
  {
    id: "ht_first_three_2h",
    phase: "halftime",
    question: "Which team makes the first 3-pointer of the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No 3-pointer in Q3"],
    settlement_window: "Early 3Q",
  },
  {
    id: "ht_reach15",
    phase: "halftime",
    question: "Which team reaches 15 second-half points first?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "Mid 3Q",
  },
  {
    id: "ht_q3",
    phase: "halftime",
    question: "Which team wins the 3rd quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End 3Q",
  },
  {
    id: "ht_q3_pts",
    phase: "halftime",
    question: "Which team scores more points in the 3rd quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End 3Q",
  },
  {
    id: "ht_q3_lead_change",
    phase: "halftime",
    question: "Will there be a lead change in the 3rd quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End 3Q",
  },
  {
    id: "ht_q3_threes_both",
    phase: "halftime",
    question: "Will both teams make at least two 3-pointers in the 3rd quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End 3Q",
  },
  {
    id: "ht_within5_4q",
    phase: "halftime",
    question: "Will the game be within 5 points entering the 4th quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End 3Q",
  },
  {
    id: "ht_star_2h",
    phase: "halftime",
    question: "Which star player scores more in the 2nd half?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "ht_star_threes_2h",
    phase: "halftime",
    question: "Which star makes more 3-pointers in the 2nd half?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "ht_star_15",
    phase: "halftime",
    question: "Will either star score 15+ points in the 2nd half?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "ht_2h_pts",
    phase: "halftime",
    question: "Which team scores more points in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "ht_lead15",
    phase: "halftime",
    question: "Will either team lead by 15+ points at any point in the 2nd half?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "ht_winner",
    phase: "halftime",
    question: "Does the halftime leader win the game?",
    answers: ["Yes", "No", "Game was tied at halftime"],
    settlement_window: "End Game",
  },
  {
    id: "ht_trailing_lead",
    phase: "halftime",
    question: "Will the team trailing at halftime come back to take the lead?",
    answers: ["Yes", "No", "Game was tied at halftime"],
    settlement_window: "End Game",
  },
  {
    id: "ht_comeback",
    phase: "halftime",
    question: "Will the losing team cut the deficit to one possession?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "ht_turnovers_2h",
    phase: "halftime",
    question: "Which team commits more turnovers in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "ht_rebounds_2h",
    phase: "halftime",
    question: "Which team gets more rebounds in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "ht_ft_2h",
    phase: "halftime",
    question: "Which team makes more free throws in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "ht_run",
    phase: "halftime",
    question: "Will either team go on a 10–0 run in the 2nd half?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "ht_game_winner",
    phase: "halftime",
    question: "Which team wins the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game",
  },

  // ── 4Q Clutch ────────────────────────────────────────────────────────────
  // ~20 objective props. Late-game urgency, final margin, comeback potential,
  // and final stat outcomes. All settleable from box score.

  {
    id: "q4_first",
    phase: "fourth",
    question: "Which team scores first in the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "Early 4Q",
  },
  {
    id: "q4_first_three",
    phase: "fourth",
    question: "Which team makes the first 3-pointer of the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No 3-pointer in Q4"],
    settlement_window: "Early 4Q",
  },
  {
    id: "q4_winner",
    phase: "fourth",
    question: "Which team wins the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "q4_pts",
    phase: "fourth",
    question: "Which team scores more points in the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "q4_lead_change",
    phase: "fourth",
    question: "Will there be a lead change in the 4th quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "q4_clutch",
    phase: "fourth",
    question: "Will the game be within 5 points in the final 2 minutes?",
    answers: ["Yes", "No"],
    settlement_window: "Final 2 Min",
  },
  {
    id: "q4_margin5",
    phase: "fourth",
    question: "Will the final margin be 5 points or fewer?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "q4_margin10",
    phase: "fourth",
    question: "Will the final margin be 10 points or fewer?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "q4_star",
    phase: "fourth",
    question: "Which star player scores more in the 4th quarter?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "q4_star_10",
    phase: "fourth",
    question: "Will either star score 10+ points in the 4th quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "q4_threes",
    phase: "fourth",
    question: "Which team makes more 3-pointers in the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "q4_fta",
    phase: "fourth",
    question: "Which team attempts more free throws in the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "q4_ftm",
    phase: "fourth",
    question: "Which team makes more free throws in the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "q4_trailing_lead",
    phase: "fourth",
    question: "Will the team trailing entering the 4th quarter take the lead?",
    answers: ["Yes", "No", "Game was tied entering Q4"],
    settlement_window: "End Game",
  },
  {
    id: "q4_leader_wins",
    phase: "fourth",
    question: "Will the team leading entering the 4th quarter win the game?",
    answers: ["Yes", "No", "Game was tied entering Q4"],
    settlement_window: "End Game",
  },
  {
    id: "q4_run8",
    phase: "fourth",
    question: "Will either team go on an 8–0 run or better in the 4th quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "q4_ot",
    phase: "fourth",
    question: "Will the game have overtime?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "q4_game_winner",
    phase: "fourth",
    question: "Who wins the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game",
  },
];

// Default selected props — designed so the leaderboard moves throughout the
// night. Mix of early-settle, mid-game, and end-game props across all 3 phases.
// Pregame: 6  |  Halftime: 4  |  4Q Clutch: 4
export const DEFAULT_PROP_IDS: string[] = [
  // ── Pregame — early / halftime / end-game mix ──
  "pg_scores_first",    // Early 1Q
  "pg_q1",              // End 1Q (Tie option included)
  "pg_first_three",     // Early 1Q
  "pg_star_halftime",   // Halftime (Tie option included)
  "pg_winner",          // End Game
  "pg_clutch",          // Final 2 Min
  // ── Halftime ──
  "ht_first2h",         // Early 3Q
  "ht_q3",              // End 3Q (Tie option included)
  "ht_star_2h",         // End Game (Tie option included)
  "ht_winner",          // End Game (3rd option: tied at halftime)
  // ── 4Q Clutch ──
  "q4_first",           // Early 4Q
  "q4_winner",          // End Game (Tie option included)
  "q4_lead_change",     // End Game
  "q4_clutch",          // Final 2 Min
];

export function resolvePlaceholders(
  text: string,
  vars: { TEAM_A: string; TEAM_B: string; STAR_A: string; STAR_B: string }
): string {
  return text
    .replace(/\{\{TEAM_A\}\}/g, vars.TEAM_A)
    .replace(/\{\{TEAM_B\}\}/g, vars.TEAM_B)
    .replace(/\{\{STAR_A\}\}/g, vars.STAR_A)
    .replace(/\{\{STAR_B\}\}/g, vars.STAR_B);
}
