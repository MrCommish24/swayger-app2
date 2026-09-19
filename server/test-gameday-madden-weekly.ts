/**
 * Focused regression coverage for the Madden Weekly Pick Card foundation.
 *
 * Run with: npx tsx server/test-gameday-madden-weekly.ts
 */

import { readFileSync } from "node:fs";
import {
  applyPickCardWinnerSemantics,
  buildWeeklyPickCardParticipantScores,
  normalizeWeeklyPickCardConfig,
  normalizeWeeklyPickCardMatchups,
} from "./routes-gameday.js";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}`);
  }
}

const baseConfig = {
  week_label: "Franchise Week 4",
  reward_text: "Superstar trait upgrade",
  deadline_display_text: " Sunday 1 PM CST ",
  minimum_matchups: 2,
  scoring_mode: "all_correct",
  bonus: { enabled: false, label: null, answer_options: [] },
};

const validMatchups = [
  { team_a: " Ravens ", team_b: " Bengals ", line_text: "Ravens -3" },
  { team_a: " Chiefs", team_b: " Raiders", line_text: "" },
  { team_a: " Eagles", team_b: " Cowboys", line_text: "Eagles +2.5" },
];

const config = normalizeWeeklyPickCardConfig(baseConfig, validMatchups.length);
check("valid weekly config is accepted", config !== null);
check("week label is trimmed", config?.week_label === "Franchise Week 4");
check("reward text is retained", config?.reward_text === "Superstar trait upgrade");
check("free-form deadline display text is trimmed and retained", config?.deadline_display_text === "Sunday 1 PM CST");
check("minimum matchup count is retained", config?.minimum_matchups === 2);
check("all-correct scoring mode is retained", config?.scoring_mode === "all_correct");
check("disabled bonus remains disabled", config?.bonus.enabled === false);
check("disabled bonus has no answer options", config?.bonus.answer_options.length === 0);

const bonusConfig = normalizeWeeklyPickCardConfig({
  ...baseConfig,
  bonus: {
    enabled: true,
    label: "Who wins the bonus game?",
    answer_options: [" Home ", "Away", "Home"],
  },
}, validMatchups.length);
check("valid manual bonus config is accepted", bonusConfig !== null);
check("bonus label is trimmed", bonusConfig?.bonus.label === "Who wins the bonus game?");
check("bonus options are trimmed and deduplicated", JSON.stringify(bonusConfig?.bonus.answer_options) === JSON.stringify(["Home", "Away"]));
const structuredBonusConfig = normalizeWeeklyPickCardConfig({
  ...baseConfig,
  bonus: {
    enabled: true,
    game: {
      team_a: " Packers ",
      team_b: " Lions ",
      line_text: "Packers +1.5",
    },
    total_prediction: {
      enabled: true,
      prompt: " Exact total points? ",
      rule: "exact",
    },
  },
}, validMatchups.length);
check("structured bonus game and total are accepted", structuredBonusConfig !== null);
check(
  "structured bonus teams and line are normalized",
  structuredBonusConfig?.bonus.game?.team_a === "Packers" &&
    structuredBonusConfig?.bonus.game?.team_b === "Lions" &&
    structuredBonusConfig?.bonus.game?.line_text === "Packers +1.5",
);
check(
  "exact total config is normalized to the shared 0-200 range",
  structuredBonusConfig?.bonus.total_prediction.enabled === true &&
    structuredBonusConfig?.bonus.total_prediction.prompt === "Exact total points?" &&
    structuredBonusConfig?.bonus.total_prediction.rule === "exact" &&
    structuredBonusConfig?.bonus.total_prediction.min === 0 &&
    structuredBonusConfig?.bonus.total_prediction.max === 200,
);
check(
  "total prediction without a structured bonus game is rejected",
  normalizeWeeklyPickCardConfig({
    ...baseConfig,
    bonus: {
      enabled: true,
      label: "Legacy bonus",
      answer_options: ["A", "B"],
      total_prediction: { enabled: true, rule: "exact" },
    },
  }, validMatchups.length) === null,
);
check(
  "unsupported total prediction rule is rejected",
  normalizeWeeklyPickCardConfig({
    ...baseConfig,
    bonus: {
      enabled: true,
      game: { team_a: "Packers", team_b: "Lions" },
      total_prediction: { enabled: true, rule: "closest" },
    },
  }, validMatchups.length) === null,
);
check("missing week label is rejected", normalizeWeeklyPickCardConfig({ ...baseConfig, week_label: "" }, 2) === null);
check("zero minimum is rejected", normalizeWeeklyPickCardConfig({ ...baseConfig, minimum_matchups: 0 }, 2) === null);
check("minimum above matchup count is rejected", normalizeWeeklyPickCardConfig({ ...baseConfig, minimum_matchups: 3 }, 2) === null);
check("most-correct scoring mode is accepted", normalizeWeeklyPickCardConfig({ ...baseConfig, scoring_mode: "most_correct" }, 2)?.scoring_mode === "most_correct");
check("unsupported scoring mode is rejected", normalizeWeeklyPickCardConfig({ ...baseConfig, scoring_mode: "highest_score" }, 2) === null);
check(
  "missing scoring mode defaults to legacy all-correct",
  normalizeWeeklyPickCardConfig({ ...baseConfig, scoring_mode: undefined }, 2)?.scoring_mode === "all_correct",
);
check("blank supplied deadline display text is rejected", normalizeWeeklyPickCardConfig({ ...baseConfig, deadline_display_text: " " }, 2) === null);
check("bonus without a label is rejected", normalizeWeeklyPickCardConfig({
  ...baseConfig,
  bonus: { enabled: true, label: "", answer_options: ["A", "B"] },
}, 2) === null);
check("bonus with one option is rejected", normalizeWeeklyPickCardConfig({
  ...baseConfig,
  bonus: { enabled: true, label: "Bonus", answer_options: ["A"] },
}, 2) === null);

const matchups = normalizeWeeklyPickCardMatchups(validMatchups);
check("valid matchup list is accepted", matchups !== null);
check("matchup team names are trimmed", matchups?.[0]?.team_a === "Ravens" && matchups?.[0]?.team_b === "Bengals");
check("line text is retained", matchups?.[0]?.line_text === "Ravens -3");
check("blank line text becomes null", matchups?.[1]?.line_text === null);
check("missing matchup team is rejected", normalizeWeeklyPickCardMatchups([
  { team_a: "Ravens", team_b: "", line_text: "" },
] ) === null);
check("same matchup teams are rejected", normalizeWeeklyPickCardMatchups([
  { team_a: "Ravens", team_b: "ravens", line_text: "" },
]) === null);
check("non-array matchups are rejected", normalizeWeeklyPickCardMatchups(null) === null);
check("empty matchup list is rejected", normalizeWeeklyPickCardMatchups([]) === null);
check("one matchup is accepted", normalizeWeeklyPickCardMatchups([
  { team_a: "Ravens", team_b: "Bengals", line_text: "" },
])?.length === 1);
check("two matchups are accepted", normalizeWeeklyPickCardMatchups([
  { team_a: "Ravens", team_b: "Bengals", line_text: "" },
  { team_a: "Chiefs", team_b: "Raiders", line_text: "" },
])?.length === 2);
check("seven matchups are accepted", normalizeWeeklyPickCardMatchups(
  Array.from({ length: 7 }, (_, i) => ({ team_a: `A${i}`, team_b: `B${i}`, line_text: "" })),
)?.length === 7);
check("more than 7 matchups are rejected", normalizeWeeklyPickCardMatchups(
  Array.from({ length: 8 }, (_, i) => ({ team_a: `A${i}`, team_b: `B${i}`, line_text: "" })),
) === null);

const migration = readFileSync("supabase/gameday-madden-weekly-pick-card-v1.sql", "utf8");
const bonusMigration = readFileSync("supabase/gameday-madden-pick-card-v2-bonus.sql", "utf8");
const atomicSettlementMigration = readFileSync("supabase/gameday-atomic-prop-settlement.sql", "utf8");
const routes = readFileSync("server/routes-gameday.ts", "utf8");
const participantUi = readFileSync("app/gameday/[roomId]/index.tsx", "utf8");
check("room route admits Madden before format branching", routes.includes('["nba", "soccer", "nfl", "madden"]'));
check("room route keeps Madden limited to weekly cards", routes.includes('Madden rooms must use template_type=weekly_pick_card'));
check("Discord Madden may omit the timestamp only with display text", routes.includes("isDiscordManualLock") && routes.includes("format_config.deadline_display_text is required"));
check("migration adds validated format_config storage", migration.includes("ADD COLUMN IF NOT EXISTS format_config JSONB"));
check("migration permits Madden rooms", migration.includes("'madden'"));
check("migration permits weekly_pick_card", migration.includes("'weekly_pick_card'"));
check("migration makes representative teams nullable", migration.includes("ALTER COLUMN team_a_name DROP NOT NULL"));
check("migration adds optional line text", migration.includes("ADD COLUMN IF NOT EXISTS line_text TEXT"));
check("V2 migration adds explicit prop roles", bonusMigration.includes("ADD COLUMN IF NOT EXISTS prop_role TEXT"));
check("V2 migration stores typed numeric picks", bonusMigration.includes("ADD COLUMN IF NOT EXISTS numeric_answer INTEGER"));
check("V2 migration stores typed numeric results", bonusMigration.includes("ADD COLUMN IF NOT EXISTS correct_numeric_answer INTEGER"));
check("V2 public-pick snapshots expose prop role and numeric prediction", bonusMigration.includes("'prop_role', p.prop_role") && bonusMigration.includes("'numeric_prediction', gp.numeric_answer"));
check("settlement uses one atomic database function", atomicSettlementMigration.includes("CREATE FUNCTION public.settle_gameday_prop_atomic"));
check("atomic settlement tightens exact-total bounds", atomicSettlementMigration.includes("numeric_min = 0") && atomicSettlementMigration.includes("numeric_max = 200"));
check("typed pick trigger rejects shape mismatches", atomicSettlementMigration.includes("CREATE TRIGGER gameday_picks_validate_answer_shape"));
check("same-result settlement retries re-assert scores", routes.includes("Always run the atomic settlement on retries"));
check("pick writes enforce the shared scheduled deadline", routes.includes('res.status(409).json({ error: "Picks are closed for this card." })'));
check("Madden weekly cards remain manual reveal instead of auto-locking", routes.includes("isManualRevealMaddenCard"));
check("room payload exposes server-authoritative editability", routes.includes("can_edit_picks: card.status === \"open\" && !deadlinePassed"));
check("participant UI displays free-form lock time without parsing it", participantUi.includes("Pick Deadline / Lock Time:") && participantUi.includes("room.format_config?.deadline_display_text"));
check("manual-lock confirmation copy remains editable until commissioner lock", participantUi.includes("Picks confirmed. You can update until the commissioner locks the card."));
check(
  "closed Madden copy explains incremental settlement",
  participantUi.includes("Picks are closed. Matchups settle as results become available."),
);
check("closed Madden cards hide the pick submission control", participantUi.includes("{canEdit ? <TouchableOpacity"));
check("room Back control routes directly to the Game Day hub", participantUi.includes('router.replace("/gameday")'));

const allCorrectScores = [
  { participant_id: "perfect", correct_picks: 3, total_picks: 3 },
  { participant_id: "partial", correct_picks: 2, total_picks: 3 },
  { participant_id: "wrong", correct_picks: 1, total_picks: 3 },
];
const allCorrectStandings = applyPickCardWinnerSemantics(allCorrectScores, "all_correct", true);
check("all-correct 3/3 wins", allCorrectStandings.find((s) => s.participant_id === "perfect")?.is_winner === true);
check("all-correct 2/3 does not win", allCorrectStandings.find((s) => s.participant_id === "partial")?.is_winner === false);
check("all-correct lower participant does not win", allCorrectStandings.find((s) => s.participant_id === "wrong")?.is_winner === false);
check(
  "all-correct nobody perfect has no winner",
  applyPickCardWinnerSemantics(
    [
      { participant_id: "a", correct_picks: 2, total_picks: 3 },
      { participant_id: "b", correct_picks: 1, total_picks: 3 },
    ],
    "all_correct",
    true,
  ).every((s) => !s.is_winner),
);
check(
  "all-correct multiple perfect participants tie",
  applyPickCardWinnerSemantics(
    [
      { participant_id: "a", correct_picks: 3, total_picks: 3 },
      { participant_id: "b", correct_picks: 3, total_picks: 3 },
    ],
    "all_correct",
    true,
  ).filter((s) => s.is_winner).length === 2,
);

const mostCorrectStandings = applyPickCardWinnerSemantics(
  [
    { participant_id: "darius", correct_picks: 2, total_picks: 3 },
    { participant_id: "mike", correct_picks: 1, total_picks: 3 },
    { participant_id: "chris", correct_picks: 1, total_picks: 3 },
  ],
  "most_correct",
  true,
);
check("most-correct highest count wins", mostCorrectStandings.find((s) => s.participant_id === "darius")?.is_winner === true);
check("most-correct lower participant does not win", mostCorrectStandings.find((s) => s.participant_id === "mike")?.is_winner === false);
check(
  "most-correct tied highest count produces tied winners",
  applyPickCardWinnerSemantics(
    [
      { participant_id: "a", correct_picks: 2, total_picks: 3 },
      { participant_id: "b", correct_picks: 2, total_picks: 3 },
      { participant_id: "c", correct_picks: 1, total_picks: 3 },
    ],
    "most_correct",
    true,
  ).filter((s) => s.is_winner).length === 2,
);
check(
  "winner is withheld until all required props settle",
  applyPickCardWinnerSemantics(allCorrectScores, "most_correct", false).every((s) => !s.is_winner),
);

const separatedScores = buildWeeklyPickCardParticipantScores(
  [
    { id: "main-perfect-bonus-wrong", display_name: "One" },
    { id: "main-wrong-bonus-perfect", display_name: "Two" },
  ],
  [
    { participant_id: "main-perfect-bonus-wrong", prop_id: "main-1", selected_answer: "A", is_correct: true },
    { participant_id: "main-perfect-bonus-wrong", prop_id: "main-2", selected_answer: "D", is_correct: true },
    { participant_id: "main-perfect-bonus-wrong", prop_id: "bonus-game", selected_answer: "E", is_correct: false },
    { participant_id: "main-perfect-bonus-wrong", prop_id: "bonus-total", selected_answer: "51", numeric_answer: 51, is_correct: false },
    { participant_id: "main-wrong-bonus-perfect", prop_id: "main-1", selected_answer: "B", is_correct: false },
    { participant_id: "main-wrong-bonus-perfect", prop_id: "main-2", selected_answer: "D", is_correct: true },
    { participant_id: "main-wrong-bonus-perfect", prop_id: "bonus-game", selected_answer: "F", is_correct: true },
    { participant_id: "main-wrong-bonus-perfect", prop_id: "bonus-total", selected_answer: "52", numeric_answer: 52, is_correct: true },
  ],
  [
    { id: "main-1", prop_role: "main_matchup", answer_type: "choice", answer_options: ["A", "B"], status: "settled" },
    { id: "main-2", prop_role: "main_matchup", answer_type: "choice", answer_options: ["C", "D"], status: "settled" },
    { id: "bonus-game", prop_role: "bonus_game", answer_type: "choice", answer_options: ["E", "F"], status: "settled" },
    { id: "bonus-total", prop_role: "bonus_total", answer_type: "integer", answer_options: [], status: "settled", correct_numeric_answer: 52 },
  ],
);
const separatedStandings = applyPickCardWinnerSemantics(
  separatedScores,
  "all_correct",
  true,
);
check(
  "bonus correctness does not change main correct-pick counts",
  separatedScores[0].correct_picks === 2 &&
    separatedScores[1].correct_picks === 1,
);
check(
  "main-perfect participant wins even when both bonus outcomes are wrong",
  separatedStandings.find((row) => row.participant_id === "main-perfect-bonus-wrong")?.is_winner === true,
);
check(
  "bonus-perfect participant does not win with a wrong main pick",
  separatedStandings.find((row) => row.participant_id === "main-wrong-bonus-perfect")?.is_winner === false,
);
check(
  "typed bonus totals remain available separately from main scores",
  separatedScores[1].predicted_total === 52 &&
    separatedScores[1].actual_total === 52 &&
    separatedScores[1].exact_total_hit === true,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);