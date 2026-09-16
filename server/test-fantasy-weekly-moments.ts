import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { WEEKLY_MOMENTS } from "../lib/fantasy-weekly-moments";

const existingIds = [
  "fantasy_weekly_nfl_highest_scoring_team",
  "fantasy_weekly_nfl_lowest_scoring_team",
  "fantasy_weekly_nfl_largest_margin_winner",
  "fantasy_weekly_nfl_smallest_margin_winner",
  "fantasy_weekly_nfl_highest_player_team",
  "fantasy_weekly_nfl_score_150_plus",
  "fantasy_weekly_nfl_matchup_under_5",
];
const newIds = [
  "fantasy_weekly_nfl_bad_beat",
  "fantasy_weekly_nfl_got_away_with_one",
  "fantasy_weekly_nfl_win_under_100",
  "fantasy_weekly_nfl_130_plus_loss",
  "fantasy_weekly_nfl_30_plus_blowout",
];
const yesNoIds = [
  "fantasy_weekly_nfl_score_150_plus",
  "fantasy_weekly_nfl_matchup_under_5",
  "fantasy_weekly_nfl_win_under_100",
  "fantasy_weekly_nfl_130_plus_loss",
  "fantasy_weekly_nfl_30_plus_blowout",
];
const uiSurfaces = [
  "app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/play.tsx",
  "app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/settle.tsx",
  "app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/results.tsx",
  "components/fantasy/CompetitionReceipt.tsx",
  "components/fantasy/LeaguePicks.tsx",
];

let passed = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  passed++;
  console.log(`PASS ${name}`);
}

check("weekly library registry contains exactly 12 Moments", Object.keys(WEEKLY_MOMENTS).length === 12);
check("all seven existing stable template IDs remain", existingIds.every((id) => !!WEEKLY_MOMENTS[id]));
check("all five new stable template IDs exist", newIds.every((id) => !!WEEKLY_MOMENTS[id]));
check("every Moment has a distinct display title", new Set(Object.values(WEEKLY_MOMENTS).map((m) => m.title)).size === 12);
check("every Moment has a clear prompt", Object.values(WEEKLY_MOMENTS).every((m) => m.prompt.trim().endsWith("?")));
check("every Moment has an objective settlement definition", Object.values(WEEKLY_MOMENTS).every((m) => m.settlementNote.trim().length > 20));
check("Bad Beat definition selects the highest-scoring losing team", WEEKLY_MOMENTS.fantasy_weekly_nfl_bad_beat.settlementNote.includes("losing fantasy teams") && WEEKLY_MOMENTS.fantasy_weekly_nfl_bad_beat.settlementNote.includes("highest final fantasy score"));
check("Got Away With One selects the lowest-scoring winning team", WEEKLY_MOMENTS.fantasy_weekly_nfl_got_away_with_one.settlementNote.includes("winning fantasy teams") && WEEKLY_MOMENTS.fantasy_weekly_nfl_got_away_with_one.settlementNote.includes("lowest final fantasy score"));
check("five templates use the existing yes/no target", yesNoIds.every((id) => WEEKLY_MOMENTS[id].answerTargetType === "yes_no"));
check("seven templates use the existing fantasy-team target", Object.values(WEEKLY_MOMENTS).filter((m) => m.answerTargetType === "fantasy_team").length === 7);
check("no unsupported matchup target was introduced", Object.values(WEEKLY_MOMENTS).every((m) => m.answerTargetType !== ("matchup" as any)));
check("all participant, settlement, results, receipt, and League Picks surfaces render Moment labels", uiSurfaces.every((file) => fs.readFileSync(path.resolve(file), "utf8").includes("WeeklyMomentLabel")));

const setupSource = fs.readFileSync(path.resolve("app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/setup.tsx"), "utf8");
check("commissioner setup derives Moment presentation from stable IDs", setupSource.includes("WeeklyMomentLabel") && setupSource.includes("templatePropId={t.id}"));
check("commissioner library shows the short Moment definition", setupSource.includes("<WeeklyMomentLabel templatePropId={t.id} />"));

const changedSources = [
  "lib/fantasy-weekly-moments.ts",
  "components/fantasy/WeeklyMomentLabel.tsx",
  ...uiSurfaces,
  "app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/setup.tsx",
].map((file) => fs.readFileSync(path.resolve(file), "utf8")).join("\n");
check("no Share My Pick feature was introduced", !changedSources.includes("Share My Pick"));
check("no Call Your Shot feature was introduced", !changedSources.includes("Call Your Shot"));

const migration = fs.readFileSync(path.resolve("supabase/gameday-fantasy-swayger-moments.sql"), "utf8");
check("migration covers all 12 stable IDs", [...existingIds, ...newIds].every((id) => migration.includes(`'${id}'`)));
check("migration uses the existing multi-correct-compatible target model", !migration.includes("'matchup'"));
check("migration preserves standard point values for new Moments", newIds.every((id) => migration.slice(migration.indexOf(`'${id}'`)).split("\n  ),", 1)[0].includes("'competition', 10")));
check("migration is transactional and idempotent", migration.includes("BEGIN;") && migration.includes("ON CONFLICT (id) DO UPDATE") && migration.includes("COMMIT;"));

console.log(`SWAYGER MOMENTS: ${passed}/${passed} assertions passed`);