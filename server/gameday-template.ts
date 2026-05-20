export interface PropTemplate {
  id: string;
  phase: "pregame" | "halftime" | "fourth";
  question: string;
  answers: string[];
}

export const NBA_PLAYOFF_TEMPLATE: PropTemplate[] = [
  // ── Pregame ───────────────────────────────────────────────────────────────
  {
    id: "pg_winner",
    phase: "pregame",
    question: "Who wins the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
  },
  {
    id: "pg_q1",
    phase: "pregame",
    question: "Who wins the 1st quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
  },
  {
    id: "pg_lead10",
    phase: "pregame",
    question: "Will either team lead by 10+ at any point?",
    answers: ["Yes", "No"],
  },
  {
    id: "pg_threes",
    phase: "pregame",
    question: "Which team makes more threes?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
  },
  {
    id: "pg_star_pts",
    phase: "pregame",
    question: "Which star player scores more points?",
    answers: ["{{STAR_A}}", "{{STAR_B}}"],
  },
  {
    id: "pg_clutch",
    phase: "pregame",
    question: "Will the game be within 7 points with 2 minutes left?",
    answers: ["Yes", "No"],
  },
  {
    id: "pg_margin",
    phase: "pregame",
    question: "Final margin?",
    answers: ["1–5", "6–10", "11–15", "16+"],
  },
  {
    id: "pg_tech",
    phase: "pregame",
    question: "Will there be a technical foul?",
    answers: ["Yes", "No"],
  },

  // ── Halftime ─────────────────────────────────────────────────────────────
  {
    id: "ht_winner",
    phase: "halftime",
    question: "Does the halftime leader win the game?",
    answers: ["Yes", "No"],
  },
  {
    id: "ht_q3",
    phase: "halftime",
    question: "Who wins the 3rd quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
  },
  {
    id: "ht_comeback",
    phase: "halftime",
    question: "Will the losing team cut the deficit to one possession?",
    answers: ["Yes", "No"],
  },
  {
    id: "ht_first2h",
    phase: "halftime",
    question: "Which team scores first in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
  },
  {
    id: "ht_star_2h",
    phase: "halftime",
    question: "Which star player scores more in the 2nd half?",
    answers: ["{{STAR_A}}", "{{STAR_B}}"],
  },
  {
    id: "ht_run",
    phase: "halftime",
    question: "Will either team go on a 10–0 run in the 2nd half?",
    answers: ["Yes", "No"],
  },

  // ── 4Q Clutch ────────────────────────────────────────────────────────────
  {
    id: "q4_winner",
    phase: "fourth",
    question: "Who wins the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
  },
  {
    id: "q4_clutch",
    phase: "fourth",
    question: "Will the game be within 5 points in the final 2 minutes?",
    answers: ["Yes", "No"],
  },
  {
    id: "q4_ft",
    phase: "fourth",
    question: "Will either team miss a clutch free throw?",
    answers: ["Yes", "No"],
  },
  {
    id: "q4_first",
    phase: "fourth",
    question: "Which team scores first in the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
  },
  {
    id: "q4_star",
    phase: "fourth",
    question: "Which star player scores more in the 4th quarter?",
    answers: ["{{STAR_A}}", "{{STAR_B}}"],
  },
  {
    id: "q4_lead_change",
    phase: "fourth",
    question: "Will there be a lead change in the 4th quarter?",
    answers: ["Yes", "No"],
  },
  {
    id: "q4_big_play",
    phase: "fourth",
    question: "Who makes the biggest play?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Role player", "Coach"],
  },
];

export const DEFAULT_PROP_IDS: string[] = [
  "pg_winner",
  "pg_q1",
  "pg_star_pts",
  "pg_clutch",
  "ht_winner",
  "ht_q3",
  "ht_star_2h",
  "q4_winner",
  "q4_clutch",
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
