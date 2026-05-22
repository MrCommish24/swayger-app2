export interface PropTemplate {
  id: string;
  phase: "pregame" | "halftime" | "fourth";
  question: string;
  answers: string[];
  settlement_window: string;
}

export const NBA_PLAYOFF_TEMPLATE: PropTemplate[] = [
  // ── Pregame ───────────────────────────────────────────────────────────────
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
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "Early 1Q",
  },
  {
    id: "pg_q1",
    phase: "pregame",
    question: "Who wins the 1st quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End 1Q",
  },
  {
    id: "pg_star_halftime",
    phase: "pregame",
    question: "Which star has more points at halftime?",
    answers: ["{{STAR_A}}", "{{STAR_B}}"],
    settlement_window: "Halftime",
  },
  {
    id: "pg_lead10",
    phase: "pregame",
    question: "Will either team lead by 10+ at any point?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "pg_winner",
    phase: "pregame",
    question: "Who wins the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game",
  },
  {
    id: "pg_threes",
    phase: "pregame",
    question: "Which team makes more threes?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game",
  },
  {
    id: "pg_star_pts",
    phase: "pregame",
    question: "Which star player scores more points?",
    answers: ["{{STAR_A}}", "{{STAR_B}}"],
    settlement_window: "End Game",
  },
  {
    id: "pg_clutch",
    phase: "pregame",
    question: "Will the game be within 7 points with 2 minutes left?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
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
  {
    id: "ht_first2h",
    phase: "halftime",
    question: "Which team scores first in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "Early 3Q",
  },
  {
    id: "ht_q3",
    phase: "halftime",
    question: "Who wins the 3rd quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End 3Q",
  },
  {
    id: "ht_star_2h",
    phase: "halftime",
    question: "Which star player scores more in the 2nd half?",
    answers: ["{{STAR_A}}", "{{STAR_B}}"],
    settlement_window: "End Game",
  },
  {
    id: "ht_winner",
    phase: "halftime",
    question: "Does the halftime leader win the game?",
    answers: ["Yes", "No"],
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
    id: "ht_run",
    phase: "halftime",
    question: "Will either team go on a 10–0 run in the 2nd half?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },

  // ── 4Q Clutch ────────────────────────────────────────────────────────────
  {
    id: "q4_first",
    phase: "fourth",
    question: "Which team scores first in the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "Early 4Q",
  },
  {
    id: "q4_winner",
    phase: "fourth",
    question: "Who wins the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
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
    id: "q4_ft",
    phase: "fourth",
    question: "Will either team miss a clutch free throw?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "q4_star",
    phase: "fourth",
    question: "Which star player scores more in the 4th quarter?",
    answers: ["{{STAR_A}}", "{{STAR_B}}"],
    settlement_window: "End Game",
  },
  {
    id: "q4_big_play",
    phase: "fourth",
    question: "Who makes the biggest play?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Role player", "Coach"],
    settlement_window: "End Game",
  },
];

// 13-prop recommended default: 6 pregame (early → halftime → end-game mix),
// 4 halftime, 3 fourth — designed so the leaderboard moves throughout the night.
export const DEFAULT_PROP_IDS: string[] = [
  // Pregame — early / mid / late mix
  "pg_scores_first",   // Early 1Q
  "pg_q1",             // End 1Q
  "pg_first_three",    // Early 1Q
  "pg_star_halftime",  // Halftime
  "pg_lead10",         // End Game
  "pg_winner",         // End Game
  // Halftime
  "ht_q3",             // End 3Q
  "ht_first2h",        // Early 3Q
  "ht_star_2h",        // End Game
  "ht_winner",         // End Game
  // 4Q Clutch
  "q4_winner",         // End Game
  "q4_lead_change",    // End Game
  "q4_clutch",         // Final 2 Min
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
