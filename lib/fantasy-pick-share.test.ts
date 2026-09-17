import assert from "node:assert/strict";
import { buildFantasyPickSharePackage } from "./fantasy-pick-share";

const input = {
  templatePropId: "fantasy_weekly_nfl_bad_beat",
  selectedAnswerLabel: "Alpha",
  participantDisplayName: "Darius",
  leagueName: "Test League",
  weekNumber: 1,
  participationUrl: "https://swayger.app/fantasy/weeks/league/season/1/play?source=pick_share",
};

const normal = buildFantasyPickSharePackage(input);
assert.equal(normal.text.includes("MY LOCK"), false);
assert.equal(normal.text.startsWith("🏆 BAD BEAT OF THE WEEK\n\n"), true);
assert.equal(normal.text.includes("Darius has Alpha scoring big"), true);
assert.equal(normal.text.includes("Swayger Fantasy • Test League • Week 1"), false);
assert.equal(normal.text.endsWith("swayger.app/fantasy/weeks/league/season/1/play?source=pick_share"), true);

const lock = buildFantasyPickSharePackage({ ...input, isMyLock: true });
assert.equal(lock.text.startsWith("🔒 MY LOCK\nBAD BEAT OF THE WEEK\n\n"), true);
assert.equal(lock.text.includes("swayger.app/fantasy/weeks/league/season/1/play?source=pick_share"), true);

const short = buildFantasyPickSharePackage({
  ...input,
  participationUrl: "https://www.swayger.app/p/abcdefghijklmnop",
});
assert.equal(short.text.endsWith("swayger.app/p/abcdefghijklmnop"), true);
assert.equal(short.text.includes("league/season"), false);

const identityFree = buildFantasyPickSharePackage({
  ...input,
  participantDisplayName: null,
});
assert.equal(identityFree.sentence, "My pick: Alpha for BAD BEAT OF THE WEEK.");
console.log("Fantasy pick share tests passed");