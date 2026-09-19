/**
 * Focused regression coverage for the canonical NFL team catalog and the
 * Discord-ready matchup selection contract.
 *
 * Run with: npx tsx server/test-gameday-nfl-catalog.ts
 */

import {
  buildNflMatchupPayload,
  findNflTeamByCode,
  getNflTeamCatalog,
} from "./gameday-nfl-catalog.js";
import { normalizeWeeklyPickCardMatchups } from "./routes-gameday.js";

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

const teams = getNflTeamCatalog();
const codes = teams.map((team) => team.team_code);

check("NFL catalog returns exactly 32 active teams", teams.length === 32 && teams.every((team) => team.active));
check("every team has a unique team code", new Set(codes).size === teams.length);
check("every team has a display name", teams.every((team) => team.display_name.length > 0));
check("every team has a full name", teams.every((team) => team.full_name.length > 0));
check("every team has AFC or NFC conference metadata", teams.every((team) => team.conference === "AFC" || team.conference === "NFC"));
check("AFC has 16 teams", teams.filter((team) => team.conference === "AFC").length === 16);
check("NFC has 16 teams", teams.filter((team) => team.conference === "NFC").length === 16);
check("catalog ordering is deterministic", JSON.stringify(getNflTeamCatalog()) === JSON.stringify(teams));
check("Packers resolves to GB / Packers", findNflTeamByCode("gb")?.display_name === "Packers");
check("Lions resolves to DET / Lions", findNflTeamByCode("DET")?.display_name === "Lions");
check("unknown team code is rejected", findNflTeamByCode("NOT_A_TEAM") === null);
check("duplicate matchup teams are rejected", buildNflMatchupPayload("GB", "gb") === null);

const selectedMatchup = buildNflMatchupPayload("GB", "DET", " -3 ");
check(
  "team selection produces the existing matchup payload",
  JSON.stringify(selectedMatchup) === JSON.stringify({
    team_a: "Packers",
    team_b: "Lions",
    line_text: "-3",
  }),
);
check("optional line remains separate from team identity", selectedMatchup?.team_a === "Packers" && selectedMatchup?.team_b === "Lions");
check(
  "existing Madden matchup normalizer accepts catalog display names",
  JSON.stringify(normalizeWeeklyPickCardMatchups([selectedMatchup!])) === JSON.stringify([selectedMatchup]),
);
check(
  "manual matchup creation remains valid",
  normalizeWeeklyPickCardMatchups([{ team_a: "Custom Home", team_b: "Custom Away", line_text: "PK" }]) !== null,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);