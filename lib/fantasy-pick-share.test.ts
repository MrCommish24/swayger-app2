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
assert.equal(normal.text.includes("Darius has Alpha scoring big"), true);

const lock = buildFantasyPickSharePackage({ ...input, isMyLock: true });
assert.equal(lock.text.startsWith("🔒 MY LOCK\n\n"), true);
assert.equal(lock.text.includes(input.participationUrl), true);
console.log("Fantasy pick share tests passed");