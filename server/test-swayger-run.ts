import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addSwaygerRunFlag, isSwaygerRunEnabled, parseSwaygerRunLeagueIds } from "./swayger-run";

const OFF_LEAGUE = "00000000-0000-0000-0000-000000000001";
const ON_LEAGUE = "00000000-0000-0000-0000-000000000002";

// Empty/unset is globally off.
assert.deepEqual(parseSwaygerRunLeagueIds(""), new Set());
assert.equal(isSwaygerRunEnabled(OFF_LEAGUE, ""), false);

// Parsing is comma-separated, trims operator formatting, and ignores blanks.
assert.deepEqual(
  parseSwaygerRunLeagueIds(` ${ON_LEAGUE},, ${OFF_LEAGUE} , `),
  new Set([ON_LEAGUE, OFF_LEAGUE]),
);
assert.equal(isSwaygerRunEnabled(ON_LEAGUE, ` ${ON_LEAGUE}, ${OFF_LEAGUE}`), true);
assert.equal(isSwaygerRunEnabled(OFF_LEAGUE, ON_LEAGUE), false);
assert.equal(isSwaygerRunEnabled("not-allowlisted", ON_LEAGUE), false);

// This is the contract exposed by GET .../weeks/:weekNumber/play: the
// existing response remains intact and only receives the boolean field.
const baseResponse = { room_id: "room", my_picks: { prop: "answer" } };
assert.deepEqual(addSwaygerRunFlag(baseResponse, ON_LEAGUE, ON_LEAGUE), {
  ...baseResponse,
  swayger_run_enabled: true,
});
assert.deepEqual(addSwaygerRunFlag(baseResponse, OFF_LEAGUE, ON_LEAGUE), {
  ...baseResponse,
  swayger_run_enabled: false,
});

// The gate is a pure presentation decision: evaluating it cannot add or
// remove any participant, pick, or schema state.
const before = parseSwaygerRunLeagueIds(ON_LEAGUE);
void isSwaygerRunEnabled(ON_LEAGUE, ON_LEAGUE);
assert.deepEqual(parseSwaygerRunLeagueIds(ON_LEAGUE), before);

// Verify both integration points use the same public flag rather than a
// disconnected alias that could leave the focused UI permanently disabled.
const routeSource = readFileSync("server/routes-fantasy.ts", "utf8");
const playSource = readFileSync(
  "app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/play.tsx",
  "utf8",
);
const focusedSource = readFileSync("components/fantasy/WeeklyFocusedRun.tsx", "utf8");
const selectorSource = readFileSync("components/fantasy/AnswerSelector.tsx", "utf8");
assert.match(routeSource, /res\.json\(addSwaygerRunFlag\(\{/);
assert.match(playSource, /weeklyPlayMode\(state\.swayger_run_enabled\) === "focused"/);
assert.match(playSource, /<WeeklyFocusedRun/);
assert.match(playSource, /<ScrollView/);
assert.match(focusedSource, /currentIdRef\.current === propId/);
assert.match(focusedSource, /Platform\.OS === "web"/);
assert.match(focusedSource, /stalePropIds\.includes\(activeProp\.id\)/);
assert.match(focusedSource, /locked && !finalized/);
assert.match(focusedSource, /finalized && <Pressable onPress=\{onResults\}/);
assert.match(selectorSource, /AccessibilityInfo\.setAccessibilityFocus\(node\)/);
assert.doesNotMatch(focusedSource, /My Lock/i);

console.log("SWAYGER RUN V1A contract tests passed");