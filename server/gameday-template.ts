export interface PropTemplate {
  id: string;
  phase: "pregame" | "halftime" | "fourth" | "final_push" | "penalties";
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

// ─────────────────────────────────────────────────────────────────────────────
// FIFA / Soccer template — 4 phases: pregame, halftime, final_push, penalties
// Designed for a 90-min match with possible extra time + shootout.
// Pregame: settle progressively through 1H, halftime, full game.
// Halftime: settle through 2H and end of 90 min.
// Final Push: opens ~70th min, covers last 20 min + ET question.
// Penalties: host opens ONLY if match goes to a shootout.
// ─────────────────────────────────────────────────────────────────────────────
export const FIFA_TEMPLATE: PropTemplate[] = [

  // ── Pregame ───────────────────────────────────────────────────────────────

  {
    id: "fifa_pg_scores_first",
    phase: "pregame",
    question: "Which team scores first?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No goals in first 20 min"],
    settlement_window: "First 20 Min",
  },
  {
    id: "fifa_pg_1h_goals",
    phase: "pregame",
    question: "How many goals in the first half?",
    answers: ["0", "1", "2+"],
    settlement_window: "Halftime",
  },
  {
    id: "fifa_pg_1h_winner",
    phase: "pregame",
    question: "Who leads at halftime?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Level / 0-0"],
    settlement_window: "Halftime",
  },
  {
    id: "fifa_pg_star_goal_1h",
    phase: "pregame",
    question: "Does either star score in the first half?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Both", "Neither"],
    settlement_window: "Halftime",
  },
  {
    id: "fifa_pg_corner_1h",
    phase: "pregame",
    question: "Which team wins more corners in the first half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Equal"],
    settlement_window: "Halftime",
  },
  {
    id: "fifa_pg_winner",
    phase: "pregame",
    question: "Who wins after 90 minutes?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Draw"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_pg_total_goals",
    phase: "pregame",
    question: "Total goals in the match (90 min)?",
    answers: ["0–1", "2", "3", "4+"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_pg_star_goal",
    phase: "pregame",
    question: "Which star scores in the match?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Both", "Neither"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_pg_red_card",
    phase: "pregame",
    question: "Will there be a red card?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "fifa_pg_extra_time",
    phase: "pregame",
    question: "Will the match go to extra time?",
    answers: ["Yes", "No"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_pg_penalties",
    phase: "pregame",
    question: "Will there be a penalty shootout?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "fifa_pg_clean_sheet",
    phase: "pregame",
    question: "Does either team keep a clean sheet (90 min)?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Neither"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_pg_margin",
    phase: "pregame",
    question: "Winning margin after 90 min?",
    answers: ["1 goal", "2 goals", "3+ goals", "Draw"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_pg_comeback",
    phase: "pregame",
    question: "Will the team that concedes first come back to equalize or win?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "fifa_pg_trophy",
    phase: "pregame",
    question: "Who lifts the trophy?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game",
  },

  // ── Halftime ─────────────────────────────────────────────────────────────

  {
    id: "fifa_ht_next_goal",
    phase: "halftime",
    question: "Who scores next?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No more goals"],
    settlement_window: "Early 2H",
  },
  {
    id: "fifa_ht_first_goal_2h",
    phase: "halftime",
    question: "Which team scores first in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No 2nd half goals"],
    settlement_window: "Early 2H",
  },
  {
    id: "fifa_ht_2h_goals",
    phase: "halftime",
    question: "How many goals in the 2nd half?",
    answers: ["0", "1", "2+"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_ht_2h_winner",
    phase: "halftime",
    question: "Which team wins the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Draw"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_ht_result_holds",
    phase: "halftime",
    question: "Does the halftime result hold at full time?",
    answers: ["Yes", "No"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_ht_comeback",
    phase: "halftime",
    question: "Will the team trailing at halftime equalize or win?",
    answers: ["Yes", "No", "Teams are level at halftime"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_ht_star_goal_2h",
    phase: "halftime",
    question: "Does either star score in the 2nd half?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Both", "Neither"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_ht_extra_time",
    phase: "halftime",
    question: "Will the match go to extra time?",
    answers: ["Yes", "No"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_ht_red_card_2h",
    phase: "halftime",
    question: "Will there be a red card in the 2nd half?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "fifa_ht_sub_goal",
    phase: "halftime",
    question: "Will a substitute score in the 2nd half?",
    answers: ["Yes", "No"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_ht_injury_goal",
    phase: "halftime",
    question: "Will there be a goal in injury time?",
    answers: ["Yes", "No"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_ht_winner",
    phase: "halftime",
    question: "Who wins the match (90 min)?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Draw"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_ht_corner_2h",
    phase: "halftime",
    question: "Which team wins more corners in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Equal"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_ht_trophy",
    phase: "halftime",
    question: "Who lifts the trophy?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game",
  },

  // ── Final Push (opens ~70th min) ──────────────────────────────────────────

  {
    id: "fifa_fp_next_goal",
    phase: "final_push",
    question: "Next goal goes to?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No more goals in 90 min"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_fp_goal_last20",
    phase: "final_push",
    question: "Will there be a goal in the final 20 minutes?",
    answers: ["Yes", "No"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_fp_injury_time",
    phase: "final_push",
    question: "How many minutes of injury time?",
    answers: ["1–4 min", "5–7 min", "8+ min"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_fp_extra_time",
    phase: "final_push",
    question: "Will the match go to extra time?",
    answers: ["Yes", "No"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_fp_penalties",
    phase: "final_push",
    question: "Will there be a penalty shootout?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "fifa_fp_star_goal",
    phase: "final_push",
    question: "Does either star score in the final 20 minutes?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Neither"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_fp_comeback",
    phase: "final_push",
    question: "Will the trailing team equalize or win from here?",
    answers: ["Yes", "No", "Teams are level"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_fp_winner_90",
    phase: "final_push",
    question: "Who wins after 90 minutes?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Draw / Extra Time"],
    settlement_window: "End 90 Min",
  },
  {
    id: "fifa_fp_trophy",
    phase: "final_push",
    question: "Who lifts the trophy?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game",
  },
  {
    id: "fifa_fp_clean_sheet",
    phase: "final_push",
    question: "Does either team keep a clean sheet (90 min)?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Neither"],
    settlement_window: "End 90 Min",
  },

  // ── Penalties (host opens ONLY if shootout happens) ───────────────────────

  {
    id: "fifa_pen_winner",
    phase: "penalties",
    question: "Who wins the penalty shootout?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Shootout",
  },
  {
    id: "fifa_pen_first_miss",
    phase: "penalties",
    question: "Which team misses first?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No misses"],
    settlement_window: "End Shootout",
  },
  {
    id: "fifa_pen_total_kicks",
    phase: "penalties",
    question: "Total penalty kicks taken?",
    answers: ["5–6", "7–8", "9–10", "11+"],
    settlement_window: "End Shootout",
  },
  {
    id: "fifa_pen_sudden_death",
    phase: "penalties",
    question: "Does it go beyond the first 5 kicks per side?",
    answers: ["Yes — sudden death!", "No"],
    settlement_window: "End Shootout",
  },
  {
    id: "fifa_pen_star_scores",
    phase: "penalties",
    question: "Does either star take and score a penalty?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Both", "Neither"],
    settlement_window: "End Shootout",
  },
  {
    id: "fifa_pen_clean_sweep",
    phase: "penalties",
    question: "Does any team score all their kicks perfectly?",
    answers: ["Yes", "No"],
    settlement_window: "End Shootout",
  },
];

// Default FIFA props — good mix that keeps the leaderboard moving all match.
// Pregame: 6  |  Halftime: 4  |  Final Push: 4  |  Penalties: all 6
export const FIFA_DEFAULT_PROP_IDS: string[] = [
  // ── Pregame ──
  "fifa_pg_scores_first",     // First 20 Min
  "fifa_pg_1h_winner",        // Halftime
  "fifa_pg_star_goal_1h",     // Halftime
  "fifa_pg_winner",           // End 90 Min
  "fifa_pg_extra_time",       // End 90 Min
  "fifa_pg_trophy",           // End Game
  // ── Halftime ──
  "fifa_ht_next_goal",        // Early 2H
  "fifa_ht_2h_winner",        // End 90 Min
  "fifa_ht_comeback",         // End 90 Min
  "fifa_ht_extra_time",       // End 90 Min
  // ── Final Push ──
  "fifa_fp_goal_last20",      // End 90 Min
  "fifa_fp_extra_time",       // End 90 Min
  "fifa_fp_winner_90",        // End 90 Min
  "fifa_fp_trophy",           // End Game
  // ── Penalties (all — only matters if shootout happens) ──
  "fifa_pen_winner",
  "fifa_pen_first_miss",
  "fifa_pen_total_kicks",
  "fifa_pen_sudden_death",
  "fifa_pen_star_scores",
  "fifa_pen_clean_sweep",
];

// ─────────────────────────────────────────────────────────────────────────────
// NFL template — 3 phases: pregame, halftime, 4Q / clutch.
// All picks are objective and settle from the game result; no betting language.
// ─────────────────────────────────────────────────────────────────────────────
export const NFL_TEMPLATE: PropTemplate[] = [
  {
    id: "nfl_pre_winner",
    phase: "pregame",
    question: "Who wins the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game",
  },
  {
    id: "nfl_pre_first_score",
    phase: "pregame",
    question: "Which team scores first?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "Opening Drive",
  },
  {
    id: "nfl_pre_halftime_leader",
    phase: "pregame",
    question: "Who leads at halftime?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tied"],
    settlement_window: "Halftime",
  },
  {
    id: "nfl_pre_qb_td_passes",
    phase: "pregame",
    question: "Which QB throws more touchdown passes?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tied"],
    settlement_window: "End Game",
  },
  {
    id: "nfl_pre_qb_interception",
    phase: "pregame",
    question: "Will either starting QB throw an interception?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "nfl_pre_total_touchdowns",
    phase: "pregame",
    question: "How many total touchdowns are scored?",
    answers: ["0–3", "4–5", "6+"],
    settlement_window: "End Game",
  },
  {
    id: "nfl_ht_winner",
    phase: "halftime",
    question: "Who wins the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game",
  },
  {
    id: "nfl_ht_first_second_half_score",
    phase: "halftime",
    question: "Which team scores first in the second half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No second-half score"],
    settlement_window: "Third Quarter",
  },
  {
    id: "nfl_ht_second_half_points",
    phase: "halftime",
    question: "Which team scores more points in the second half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tied"],
    settlement_window: "End Game",
  },
  {
    id: "nfl_ht_fourth_lead_change",
    phase: "halftime",
    question: "Will the lead change in the fourth quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
  {
    id: "nfl_4q_winner",
    phase: "fourth",
    question: "Who wins the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game",
  },
  {
    id: "nfl_4q_next_score",
    phase: "fourth",
    question: "Which team scores next?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No more scores"],
    settlement_window: "End Game",
  },
  {
    id: "nfl_4q_another_touchdown",
    phase: "fourth",
    question: "Will there be another touchdown?",
    answers: ["Yes", "No"],
    settlement_window: "End Game",
  },
];

// Pregame: 6 | Halftime: 4 | 4Q / Clutch: 3
export const NFL_DEFAULT_PROP_IDS: string[] = [
  "nfl_pre_winner",
  "nfl_pre_first_score",
  "nfl_pre_halftime_leader",
  "nfl_pre_qb_td_passes",
  "nfl_pre_qb_interception",
  "nfl_pre_total_touchdowns",
  "nfl_ht_winner",
  "nfl_ht_first_second_half_score",
  "nfl_ht_second_half_points",
  "nfl_ht_fourth_lead_change",
  "nfl_4q_winner",
  "nfl_4q_next_score",
  "nfl_4q_another_touchdown",
];

// ─────────────────────────────────────────────────────────────────────────────
// NFL Sunday Slate — a separate format from NFL Single Game.
// Candidate tokens are expanded from room.slate_config when a host creates the
// room. The "Other" option keeps leader props settleable when a surprise player
// or team wins a category.
// ─────────────────────────────────────────────────────────────────────────────
export const NFL_SUNDAY_SLATE_TEMPLATE: PropTemplate[] = [
  { id: "nfl_slate_early_qb_passing_yards", phase: "pregame", question: "Which Early Slate QB has the most passing yards?", answers: ["{{SLATE_QBS}}"], settlement_window: "End Early Slate" },
  { id: "nfl_slate_early_rushing_yards", phase: "pregame", question: "Which Early Slate RB has the most rushing yards?", answers: ["{{SLATE_RBS}}"], settlement_window: "End Early Slate" },
  { id: "nfl_slate_early_receiving_yards", phase: "pregame", question: "Which Early Slate WR/TE has the most receiving yards?", answers: ["{{SLATE_RECEIVERS}}"], settlement_window: "End Early Slate" },
  { id: "nfl_slate_early_team_points", phase: "pregame", question: "Which Early Slate team scores the most points?", answers: ["{{SLATE_TEAMS}}"], settlement_window: "End Early Slate" },
  { id: "nfl_slate_early_fewest_points_allowed", phase: "pregame", question: "Which Early Slate team allows the fewest points?", answers: ["{{SLATE_TEAMS}}"], settlement_window: "End Early Slate" },
  { id: "nfl_slate_early_highest_total_game", phase: "pregame", question: "Which Early Slate game has the highest combined score?", answers: ["{{SLATE_EARLY_GAMES}}"], settlement_window: "End Early Slate" },
  { id: "nfl_slate_early_closest_game", phase: "pregame", question: "Which Early Slate game has the closest final margin?", answers: ["{{SLATE_EARLY_GAMES}}"], settlement_window: "End Early Slate" },
  { id: "nfl_slate_early_close_games_count", phase: "pregame", question: "How many Early Slate games finish within 7 points?", answers: ["0–2", "3–5", "6+", "Tie / Multiple tied"], settlement_window: "End Early Slate" },

  { id: "nfl_slate_late_qb_passing_yards", phase: "halftime", question: "Which Late Slate QB has the most passing yards?", answers: ["{{SLATE_QBS}}"], settlement_window: "End Late Slate" },
  { id: "nfl_slate_late_team_points", phase: "halftime", question: "Which Late Slate team scores the most points?", answers: ["{{SLATE_TEAMS}}"], settlement_window: "End Late Slate" },
  { id: "nfl_slate_late_highest_total_game", phase: "halftime", question: "Which Late Slate game has the highest combined score?", answers: ["{{SLATE_LATE_GAMES}}"], settlement_window: "End Late Slate" },
  { id: "nfl_slate_late_overtime", phase: "halftime", question: "Will any Late Slate game go to overtime?", answers: ["Yes", "No"], settlement_window: "End Late Slate" },
  { id: "nfl_slate_late_fewest_points_allowed", phase: "halftime", question: "Which Late Slate team allows the fewest points?", answers: ["{{SLATE_TEAMS}}"], settlement_window: "End Late Slate" },

  { id: "nfl_slate_snf_winner", phase: "fourth", question: "Who wins Sunday Night Football?", answers: ["{{TEAM_A}}", "{{TEAM_B}}"], settlement_window: "End Game" },
  { id: "nfl_slate_snf_first_score", phase: "fourth", question: "Which team scores first on Sunday Night?", answers: ["{{TEAM_A}}", "{{TEAM_B}}"], settlement_window: "Opening Drive" },
  { id: "nfl_slate_snf_margin", phase: "fourth", question: "What is the Sunday Night final margin?", answers: ["1–7", "8–14", "15+", "Tie / Multiple tied"], settlement_window: "End Game" },
];

// Early Slate: 8 | Late Slate: 5 | Sunday Night: 3
export const NFL_SUNDAY_SLATE_DEFAULT_PROP_IDS = NFL_SUNDAY_SLATE_TEMPLATE.map((prop) => prop.id);

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
