/**
 * Focused regression coverage for the Madden Weekly Pick Card foundation.
 *
 * Run with: npx tsx server/test-gameday-madden-weekly.ts
 */

import { readFileSync } from "node:fs";
import {
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
check("missing week label is rejected", normalizeWeeklyPickCardConfig({ ...baseConfig, week_label: "" }, 2) === null);
check("zero minimum is rejected", normalizeWeeklyPickCardConfig({ ...baseConfig, minimum_matchups: 0 }, 2) === null);
check("minimum above matchup count is rejected", normalizeWeeklyPickCardConfig({ ...baseConfig, minimum_matchups: 3 }, 2) === null);
check("unsupported scoring mode is rejected", normalizeWeeklyPickCardConfig({ ...baseConfig, scoring_mode: "most_correct" }, 2) === null);
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
check("fewer than 3 matchups are rejected", normalizeWeeklyPickCardMatchups([
  { team_a: "Ravens", team_b: "Bengals", line_text: "" },
  { team_a: "Chiefs", team_b: "Raiders", line_text: "" },
]) === null);
check("more than 7 matchups are rejected", normalizeWeeklyPickCardMatchups(
  Array.from({ length: 8 }, (_, i) => ({ team_a: `A${i}`, team_b: `B${i}`, line_text: "" })),
) === null);

const migration = readFileSync("supabase/gameday-madden-weekly-pick-card-v1.sql", "utf8");
const routes = readFileSync("server/routes-gameday.ts", "utf8");
const participantUi = readFileSync("app/gameday/[roomId]/index.tsx", "utf8");
check("room route admits Madden before format branching", routes.includes('["nba", "soccer", "nfl", "madden"]'));
check("room route keeps Madden limited to weekly cards", routes.includes('Madden rooms must use template_type=weekly_pick_card'));
check("migration adds validated format_config storage", migration.includes("ADD COLUMN IF NOT EXISTS format_config JSONB"));
check("migration permits Madden rooms", migration.includes("'madden'"));
check("migration permits weekly_pick_card", migration.includes("'weekly_pick_card'"));
check("migration makes representative teams nullable", migration.includes("ALTER COLUMN team_a_name DROP NOT NULL"));
check("migration adds optional line text", migration.includes("ADD COLUMN IF NOT EXISTS line_text TEXT"));
check("pick writes enforce the shared scheduled deadline", routes.includes('res.status(409).json({ error: "Picks are closed for this card." })'));
check("Madden weekly cards remain manual reveal instead of auto-locking", routes.includes("isManualRevealMaddenCard"));
check("room payload exposes server-authoritative editability", routes.includes("can_edit_picks: card.status === \"open\" && !deadlinePassed"));
check("participant confirmation copy promises edits only until the deadline", participantUi.includes("Picks confirmed. You can update until the deadline."));
check("closed Madden copy waits for commissioner reveal", participantUi.includes("Picks are closed. Waiting for the commissioner to reveal receipts."));
check("closed Madden cards hide the pick submission control", participantUi.includes("{canEdit ? <TouchableOpacity"));
check("room Back control routes directly to the Game Day hub", participantUi.includes('router.replace("/gameday")'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);