/**
 * gameday-normalize.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fixture-based validation report for the normalization and grouping utilities.
 *
 * Run with:   npx tsx server/gameday-normalize.test.ts
 *
 * Produces a full pass/fail report covering:
 *   1.  Team name normalization — conservative rules, no identity stripping
 *   2.  Team name collision tests — identity terms kept distinct
 *   3.  Team pair normalization — order reversal produces same key
 *   4.  Date normalization — formats, ISO slicing, null handling
 *   5.  Question normalization — punctuation drift collapsed
 *   6.  Event key — same game, different entry order → same key
 *   7.  Event key — different games same date → different key
 *   8.  Event key — missing fields → null (legacy)
 *   9.  Group key — same question, multi-room → same key
 *   10. Group key — different player matchup → different key
 *   11. Group key — reversed options → same key
 *   12. Group key — different phase → different key
 *   13. mapNormalizedToStored — exact stored match
 *   14. mapNormalizedToStored — exact normalized match (case/punctuation)
 *   15. mapNormalizedToStored — prefix BLOCKED (no longer a valid match)
 *   16. mapNormalizedToStored — substring BLOCKED (no longer a valid match)
 *   17. mapNormalizedToStored — ambiguous prefix scenario: correct null return
 *   18. detectAmbiguousOptions — clean options (no collision)
 *   19. detectAmbiguousOptions — punctuation-only collision detected
 *   20. detectAmbiguousOptions — options differing only in case detected
 */

import {
  normalizeTeamName,
  normalizeTeamPair,
  normalizeDate,
  normalizeQuestion,
  normalizeAnswerOption,
  buildEventKey,
  buildGroupKey,
  mapNormalizedToStored,
  detectAmbiguousOptions,
} from "./gameday-normalize.js";

// ─── Test infrastructure ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: { label: string; expected: unknown; actual: unknown }[] = [];

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✅  ${label}`);
  } else {
    failed++;
    failures.push({ label, expected, actual });
    console.log(`  ❌  ${label}`);
    console.log(`       expected → ${JSON.stringify(expected)}`);
    console.log(`       actual   → ${JSON.stringify(actual)}`);
  }
}

function section(title: string): void {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(70));
}

// ─── 1. Team name normalization — conservative rules ─────────────────────────
section("1 · Team name normalization — conservative rules");

check("lowercase only",
  normalizeTeamName("Boston Celtics"),
  "boston celtics");

check("leading 'The' stripped",
  normalizeTeamName("The Golden State Warriors"),
  "golden state warriors");

check("leading 'the' stripped (lowercase input)",
  normalizeTeamName("the lakers"),
  "lakers");

check("leading 'A ' stripped",
  normalizeTeamName("A Team"),
  "team");

check("leading 'An ' stripped",
  normalizeTeamName("An United"),
  "united");  // 'An' article is stripped, 'United' (identity) is kept

check("trailing ' FC' stripped",
  normalizeTeamName("Manchester United FC"),
  "manchester united");

check("trailing ' fc' stripped (lowercase)",
  normalizeTeamName("chelsea fc"),
  "chelsea");

check("trailing ' SC' stripped",
  normalizeTeamName("Borussia Dortmund SC"),
  "borussia dortmund");

check("trailing ' CF' stripped",
  normalizeTeamName("Real Madrid CF"),
  "real madrid");

check("trailing ' AFC' stripped",
  normalizeTeamName("Arsenal AFC"),
  "arsenal");

check("'FC' in middle NOT stripped",
  normalizeTeamName("FC Barcelona"),
  "fc barcelona");

check("punctuation removed — 'St.' becomes 'st'",
  normalizeTeamName("St. Louis Blues"),
  "st louis blues");

check("'state' kept — not stripped",
  normalizeTeamName("Oklahoma State"),
  "oklahoma state");

check("'united' kept — not stripped",
  normalizeTeamName("Manchester United"),
  "manchester united");

check("'city' kept — not stripped",
  normalizeTeamName("Manchester City"),
  "manchester city");

check("'athletic' kept — not stripped",
  normalizeTeamName("Athletic Bilbao"),
  "athletic bilbao");

check("extra whitespace collapsed",
  normalizeTeamName("Los   Angeles   Lakers"),
  "los angeles lakers");

// ─── 2. Team name collision tests — identity terms must stay distinct ─────────
section("2 · Team name collision tests — identity terms must remain distinct");

const unitedNorm = normalizeTeamName("Manchester United FC");
const cityNorm   = normalizeTeamName("Manchester City FC");
check("Manchester United FC ≠ Manchester City FC (no collision)",
  unitedNorm === cityNorm,
  false);
check("Manchester United FC normalizes to 'manchester united'",
  unitedNorm,
  "manchester united");
check("Manchester City FC normalizes to 'manchester city'",
  cityNorm,
  "manchester city");

const oklaStateNorm = normalizeTeamName("Oklahoma State");
const oklaBaseNorm  = normalizeTeamName("Oklahoma");
check("Oklahoma State ≠ Oklahoma (no collision)",
  oklaStateNorm === oklaBaseNorm,
  false);
check("Oklahoma State normalizes to 'oklahoma state'",
  oklaStateNorm,
  "oklahoma state");

const fcBarcelonaNorm = normalizeTeamName("FC Barcelona");
const atleticoBarcNorm = normalizeTeamName("Atletico Barcelona");
check("FC Barcelona ≠ Atletico Barcelona (no collision)",
  fcBarcelonaNorm === atleticoBarcNorm,
  false);

const kansasCityNorm  = normalizeTeamName("Kansas City Chiefs");
const kansasBaseNorm  = normalizeTeamName("Kansas");
check("Kansas City Chiefs ≠ Kansas (no collision)",
  kansasCityNorm === kansasBaseNorm,
  false);

// ─── 3. Team pair — order reversal produces same key ─────────────────────────
section("3 · Team pair normalization — order reversal produces same key");

const pair1 = normalizeTeamPair("New York Knicks", "Boston Celtics");
const pair2 = normalizeTeamPair("Boston Celtics", "New York Knicks");
check("(Knicks, Celtics) === (Celtics, Knicks)",
  pair1 === pair2,
  true);
check("sorted pair value",
  pair1,
  "boston celtics|new york knicks");

const pair3 = normalizeTeamPair("Manchester United FC", "Chelsea FC");
const pair4 = normalizeTeamPair("Chelsea FC", "Manchester United FC");
check("(Manchester United FC, Chelsea FC) === reversed",
  pair3 === pair4,
  true);

// ─── 4. Date normalization ────────────────────────────────────────────────────
section("4 · Date normalization");

check("YYYY-MM-DD string returned as-is",
  normalizeDate("2025-06-13"),
  "2025-06-13");

check("ISO timestamp sliced to date",
  normalizeDate("2025-06-13T22:00:00.000Z"),
  "2025-06-13");

check("Date object",
  normalizeDate(new Date("2025-06-13T12:00:00.000Z")),
  "2025-06-13");

check("null returns null",
  normalizeDate(null),
  null);

check("undefined returns null",
  normalizeDate(undefined),
  null);

check("empty string returns null",
  normalizeDate(""),
  null);

// ─── 5. Question normalization — punctuation drift collapsed ──────────────────
section("5 · Question normalization — punctuation drift collapsed");

const q1 = normalizeQuestion("Will LeBron James score 25+ points?");
const q2 = normalizeQuestion("Will LeBron James score 25+ points");   // no trailing ?
const q3 = normalizeQuestion("Will  LeBron  James  score  25+  points?"); // extra spaces
check("trailing punctuation collapsed",
  q1 === q2,
  true);
check("extra whitespace collapsed",
  q1 === q3,
  true);

check("question with em-dash",
  normalizeQuestion("Final score — who wins?"),
  "final score who wins");

check("question with quotes",
  normalizeQuestion(`Which team "wins" the quarter?`),
  "which team wins the quarter");

// ─── 6. Event key — same game, different entry order → same key ───────────────
section("6 · Event key — same game, reversed team entry order → same key");

const ek1 = buildEventKey("NBA", "New York Knicks", "Boston Celtics", "2025-06-13");
const ek2 = buildEventKey("NBA", "Boston Celtics", "New York Knicks", "2025-06-13");
check("Knicks host / Celtics host → same event key",
  ek1 === ek2,
  true);
check("event key value",
  ek1,
  "nba|boston celtics|new york knicks|2025-06-13");

// ─── 7. Event key — different games same date → different key ─────────────────
section("7 · Event key — different games same date → different keys");

const ek_unitedVsChelsea = buildEventKey("Soccer", "Manchester United", "Chelsea", "2025-06-13");
const ek_cityVsChelsea   = buildEventKey("Soccer", "Manchester City",   "Chelsea", "2025-06-13");
check("Manchester United vs Chelsea ≠ Manchester City vs Chelsea",
  ek_unitedVsChelsea !== ek_cityVsChelsea,
  true);

const ek_sameGameDiffDate1 = buildEventKey("NBA", "Knicks", "Celtics", "2025-06-13");
const ek_sameGameDiffDate2 = buildEventKey("NBA", "Knicks", "Celtics", "2025-06-14");
check("Same matchup, different date → different event key",
  ek_sameGameDiffDate1 !== ek_sameGameDiffDate2,
  true);

const ek_nba = buildEventKey("NBA",    "Knicks", "Celtics", "2025-06-13");
const ek_soc = buildEventKey("Soccer", "Knicks", "Celtics", "2025-06-13");
check("Same teams+date, different sport → different event key",
  ek_nba !== ek_soc,
  true);

// ─── 8. Event key — missing fields → null (legacy room) ───────────────────────
section("8 · Event key — missing fields produce null (legacy room indicator)");

check("null sport → null",
  buildEventKey(null, "Knicks", "Celtics", "2025-06-13"),
  null);

check("null game_date → null",
  buildEventKey("NBA", "Knicks", "Celtics", null),
  null);

check("null teamA → null",
  buildEventKey("NBA", null, "Celtics", "2025-06-13"),
  null);

check("empty sport → null",
  buildEventKey("", "Knicks", "Celtics", "2025-06-13"),
  null);

// ─── 9. Group key — same question, multi-room → same key ─────────────────────
section("9 · Group key — same question across rooms → same group key");

const eventKey = "nba|boston celtics|new york knicks|2025-06-13";

const gk_room1 = buildGroupKey(
  eventKey, "pregame",
  "Which team wins the first quarter?",
  ["New York Knicks", "Boston Celtics"]
);
const gk_room2 = buildGroupKey(
  eventKey, "pregame",
  "Which team wins the first quarter?",
  ["Boston Celtics", "New York Knicks"]  // reversed options
);
check("Same question, same options reversed → same group key",
  gk_room1 === gk_room2,
  true);

const gk_room3 = buildGroupKey(
  eventKey, "pregame",
  "Which team wins the first quarter?",  // identical question
  ["New York Knicks", "Boston Celtics"]
);
check("Identical props from two rooms → same group key",
  gk_room1 === gk_room3,
  true);

// ─── 10. Group key — different player matchup → different key ─────────────────
section("10 · Group key — different player matchup → different group key");

// Same template, but {{STAR_A}} resolved to different players
const gk_jalen = buildGroupKey(
  eventKey, "pregame",
  "Will Jalen Brunson score 25+ points?",
  ["Yes", "No"]
);
const gk_lebron = buildGroupKey(
  eventKey, "pregame",
  "Will LeBron James score 25+ points?",
  ["Yes", "No"]
);
check("Different star player → different group key",
  gk_jalen !== gk_lebron,
  true);

// ─── 11. Group key — reversed options → same key ─────────────────────────────
section("11 · Group key — reversed answer options → same group key");

const gk_optA = buildGroupKey(eventKey, "halftime", "Which team wins?", ["Knicks", "Celtics"]);
const gk_optB = buildGroupKey(eventKey, "halftime", "Which team wins?", ["Celtics", "Knicks"]);
check("Options in different order → same group key",
  gk_optA === gk_optB,
  true);

// ─── 12. Group key — different phase → different key ─────────────────────────
section("12 · Group key — different phase → different group key");

const gk_pre   = buildGroupKey(eventKey, "pregame",  "Which team wins?", ["Knicks", "Celtics"]);
const gk_half  = buildGroupKey(eventKey, "halftime", "Which team wins?", ["Knicks", "Celtics"]);
const gk_four  = buildGroupKey(eventKey, "fourth",   "Which team wins?", ["Knicks", "Celtics"]);
check("pregame ≠ halftime for same question",
  gk_pre !== gk_half,
  true);
check("halftime ≠ fourth for same question",
  gk_half !== gk_four,
  true);

// ─── 13. mapNormalizedToStored — exact stored match ──────────────────────────
section("13 · mapNormalizedToStored — exact stored match (pass 1)");

const opts = ["Boston Celtics", "New York Knicks"];
check("Exact stored string → returns it",
  mapNormalizedToStored("Boston Celtics", opts),
  "Boston Celtics");

check("Other exact stored string → returns it",
  mapNormalizedToStored("New York Knicks", opts),
  "New York Knicks");

// ─── 14. mapNormalizedToStored — exact normalized match ──────────────────────
section("14 · mapNormalizedToStored — exact normalized match (pass 2)");

check("Lowercase variant → matched via normalization",
  mapNormalizedToStored("boston celtics", opts),
  "Boston Celtics");

check("Trailing punctuation variant → matched via normalization",
  mapNormalizedToStored("Boston Celtics.", opts),
  "Boston Celtics");

check("All caps → matched via normalization",
  mapNormalizedToStored("BOSTON CELTICS", opts),
  "Boston Celtics");

check("Extra inner space → matched via normalization",
  mapNormalizedToStored("Boston  Celtics", opts),
  "Boston Celtics");

// ─── 15. mapNormalizedToStored — prefix BLOCKED ───────────────────────────────
section("15 · mapNormalizedToStored — prefix match BLOCKED (no longer a valid match)");

check("'Boston' does NOT match 'Boston Celtics' (prefix blocked)",
  mapNormalizedToStored("Boston", opts),
  null);

check("'New York' does NOT match 'New York Knicks' (prefix blocked)",
  mapNormalizedToStored("New York", opts),
  null);

check("'boston' does NOT match 'Boston Celtics' (normalized prefix blocked)",
  mapNormalizedToStored("boston", opts),
  null);

// ─── 16. mapNormalizedToStored — substring BLOCKED ────────────────────────────
section("16 · mapNormalizedToStored — substring match BLOCKED (no longer a valid match)");

check("'Celtics' does NOT match 'Boston Celtics' (substring blocked)",
  mapNormalizedToStored("Celtics", opts),
  null);

check("'Knicks' does NOT match 'New York Knicks' (substring blocked)",
  mapNormalizedToStored("Knicks", opts),
  null);

check("'celtics' does NOT match 'Boston Celtics' (normalized substring blocked)",
  mapNormalizedToStored("celtics", opts),
  null);

// ─── 17. mapNormalizedToStored — ambiguous scenario null return ───────────────
section("17 · mapNormalizedToStored — scenario where old prefix logic was ambiguous");

// If we allowed prefix: "Yes" would match BOTH "Yes - First Half" and
// "Yes - Second Half". Exact-only correctly returns null for both.
const yesOpts = ["Yes - First Half", "Yes - Second Half", "No"];
check("'Yes' does NOT match 'Yes - First Half' (prefix blocked, ambiguous scenario)",
  mapNormalizedToStored("Yes", yesOpts),
  null);
check("'yes' does NOT match 'Yes - First Half' (normalized prefix blocked)",
  mapNormalizedToStored("yes", yesOpts),
  null);
check("Exact 'Yes - First Half' → matched correctly",
  mapNormalizedToStored("Yes - First Half", yesOpts),
  "Yes - First Half");
check("Normalized 'yes first half' → matched to 'Yes - First Half'",
  mapNormalizedToStored("yes first half", yesOpts),
  "Yes - First Half");

// ─── 18. detectAmbiguousOptions — clean options ───────────────────────────────
section("18 · detectAmbiguousOptions — clean options produce no collisions");

check("Standard binary options — no collision",
  detectAmbiguousOptions(["Yes", "No"]),
  []);

check("Team names — no collision",
  detectAmbiguousOptions(["Boston Celtics", "New York Knicks"]),
  []);

check("Suffixed options — no collision",
  detectAmbiguousOptions(["Yes - First Half", "Yes - Second Half", "No"]),
  []);

// ─── 19. detectAmbiguousOptions — punctuation-only collision ──────────────────
section("19 · detectAmbiguousOptions — punctuation-only collision detected");

const ambig1 = detectAmbiguousOptions(["Yes.", "Yes!"]);
check("'Yes.' and 'Yes!' both normalize to 'yes' — collision detected",
  ambig1.length,
  1);
check("Collision message is descriptive",
  ambig1[0].includes("Yes.") && ambig1[0].includes("Yes!") && ambig1[0].includes('"yes"'),
  true);

// ─── 20. detectAmbiguousOptions — case collision ─────────────────────────────
section("20 · detectAmbiguousOptions — case-only collision detected");

const ambig2 = detectAmbiguousOptions(["YES", "yes"]);
check("'YES' and 'yes' both normalize to 'yes' — collision detected",
  ambig2.length,
  1);

check("All-distinct options — no collision",
  detectAmbiguousOptions(["Over", "Under", "Push"]).length,
  0);

// ─── Final report ─────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(70)}`);
console.log(`  VALIDATION REPORT`);
console.log("═".repeat(70));
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);

if (failures.length > 0) {
  console.log(`\n  FAILURES:`);
  for (const f of failures) {
    console.log(`    ❌  ${f.label}`);
    console.log(`         expected → ${JSON.stringify(f.expected)}`);
    console.log(`         actual   → ${JSON.stringify(f.actual)}`);
  }
  console.log();
  process.exit(1);
} else {
  console.log(`\n  All tests passed. Normalization rules are safe.\n`);
  process.exit(0);
}
