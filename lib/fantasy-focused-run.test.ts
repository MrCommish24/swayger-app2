import assert from "node:assert/strict";
import { firstUnanswered, nextUnanswered, progressState, shouldAutoAdvance, weeklyPlayMode } from "./fantasy-focused-run";

assert.equal(weeklyPlayMode(false), "legacy");
assert.equal(weeklyPlayMode(true), "focused");
for (const count of [3, 5, 7, 12]) {
  const ids = Array.from({ length: count }, (_, i) => `p${i}`);
  assert.equal(firstUnanswered(ids, { p0: "a", p2: "b" }), 1);
  assert.equal(nextUnanswered(ids, { p0: "a", p2: "b" }, 0), 1);
  assert.equal(progressState("p2", { p2: "b" }, undefined, false).completed, true);
}
assert.equal(firstUnanswered(["a", "b", "c"], { a: "optimistic" }), 1);
assert.equal(progressState("a", {}, "saving", true).completed, false);
assert.equal(progressState("a", { a: "confirmed" }, "saving", true).completed, true);
assert.equal(progressState("a", { a: "confirmed" }, "error", true).completed, true);
assert.equal(shouldAutoAdvance({ newlyConfirmed: true, wasAnswered: false, activeId: "b", confirmedId: "b", reducedMotion: false, failed: false, manuallyNavigated: false, final: false }), true);
assert.equal(shouldAutoAdvance({ newlyConfirmed: true, wasAnswered: true, activeId: "b", confirmedId: "b", reducedMotion: false, failed: false, manuallyNavigated: false, final: false }), false);
assert.equal(shouldAutoAdvance({ newlyConfirmed: true, wasAnswered: false, activeId: "a", confirmedId: "b", reducedMotion: false, failed: false, manuallyNavigated: false, final: false }), false);
assert.equal(shouldAutoAdvance({ newlyConfirmed: true, wasAnswered: false, activeId: "b", confirmedId: "b", reducedMotion: true, failed: false, manuallyNavigated: false, final: false }), false);
assert.equal(shouldAutoAdvance({ newlyConfirmed: true, wasAnswered: false, activeId: "b", confirmedId: "b", reducedMotion: false, failed: true, manuallyNavigated: false, final: false }), false);
assert.equal(shouldAutoAdvance({ newlyConfirmed: true, wasAnswered: false, activeId: "b", confirmedId: "b", reducedMotion: false, failed: false, manuallyNavigated: true, final: false }), false);
assert.equal(shouldAutoAdvance({ newlyConfirmed: true, wasAnswered: false, activeId: "b", confirmedId: "b", reducedMotion: false, failed: false, manuallyNavigated: false, final: true }), false);
console.log("focused run navigation/progress tests passed");