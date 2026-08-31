/**
 * Regression coverage for Phase 6G answer-set behavior.
 *
 * Run with: npx tsx server/gameday-correct-answers.test.ts
 */

import {
  correctAnswerWriteFields,
  normalizeCorrectAnswers,
  parseSettlementCorrectAnswers,
  sameCorrectAnswerSet,
} from "./correct-answers.js";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}`);
    console.error(`        expected: ${JSON.stringify(expected)}`);
    console.error(`        actual:   ${JSON.stringify(actual)}`);
  }
}

check("legacy scalar normalizes to a one-item set", normalizeCorrectAnswers(undefined, "home"), ["home"]);
check("new array is preserved in order", normalizeCorrectAnswers(["home", "away"]), ["home", "away"]);
check("blank IDs are removed", normalizeCorrectAnswers(["home", "", "  ", "away"]), ["home", "away"]);
check("scalar and array compare equal for legacy compatibility", sameCorrectAnswerSet("home", ["home"]), true);
check("different answer sets are not idempotent", sameCorrectAnswerSet(["home"], ["home", "away"]), false);
check("answer order does not change set identity", sameCorrectAnswerSet(["away", "home"], ["home", "away"]), true);
check("legacy settlement request remains accepted", parseSettlementCorrectAnswers({ correct_answer: "home" }), {
  ok: true,
  answers: ["home"],
  usedLegacyField: true,
});
check("array settlement request is accepted", parseSettlementCorrectAnswers({ correct_answers: ["home", "away"] }), {
  ok: true,
  answers: ["home", "away"],
  usedLegacyField: false,
});
check("empty answer set is rejected", (parseSettlementCorrectAnswers({ correct_answers: [] }) as any).ok, false);
check("duplicate answer IDs are rejected", (parseSettlementCorrectAnswers({ correct_answers: ["home", "home"] }) as any).ok, false);
check("legacy scalar is retained as first answer", correctAnswerWriteFields(["home", "away"]), {
  correct_answer: "home",
  correct_answer_ids: ["home", "away"],
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
