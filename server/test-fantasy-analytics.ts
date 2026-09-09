import { readFile } from "node:fs/promises";

const requiredEvents = [
  "fantasy_league_created",
  "fantasy_members_imported",
  "fantasy_invite_shared",
  "fantasy_seat_claimed",
  "fantasy_week_created",
  "fantasy_week_published",
  "fantasy_week_link_shared",
  "fantasy_week_viewed",
  "fantasy_week_pick_started",
  "fantasy_week_pick_submitted",
  "fantasy_week_pick_completed",
  "fantasy_week_locked",
  "fantasy_league_picks_viewed",
  "fantasy_week_settlement_started",
  "fantasy_week_finalized",
  "fantasy_week_results_viewed",
  "fantasy_receipt_viewed",
  "fantasy_receipt_shared",
  "fantasy_receipt_link_copied",
] as const;

const instrumentedFiles = [
  "app/fantasy/setup.tsx",
  "app/fantasy/bulk-import/[leagueId]/[seasonId].tsx",
  "app/fantasy/join/[leagueId]/[seasonId].tsx",
  "app/fantasy/[leagueId]/[seasonId].tsx",
  "app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/setup.tsx",
  "app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/play.tsx",
  "app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/league-picks.tsx",
  "app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/results.tsx",
  "app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/settle.tsx",
  "app/fantasy/draft-day/[leagueId]/[seasonId]/receipt.tsx",
] as const;

let assertions = 0;
function expect(label: string, condition: boolean): void {
  if (!condition) throw new Error(`FAILED: ${label}`);
  assertions += 1;
  console.log(`  ✓ ${label}`);
}

function analyticsCalls(source: string): string[] {
  const calls: string[] = [];
  const marker = "Analytics.fantasy";
  let cursor = 0;
  while ((cursor = source.indexOf(marker, cursor)) >= 0) {
    const start = cursor;
    const open = source.indexOf("(", start);
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      if (source[end] === "(") depth += 1;
      if (source[end] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    calls.push(source.slice(start, end + 1));
    cursor = end + 1;
  }
  return calls;
}

async function main(): Promise<void> {
  const contract = await readFile("lib/posthog.ts", "utf8");
  for (const event of requiredEvents) {
    expect(`declares ${event}`, contract.includes(`capture("${event}"`));
  }
  for (const property of ["league_id", "season_id", "experience_type", "competition_type"]) {
    expect(`shared context includes ${property}`, contract.includes(`${property}: ctx.${property}`));
  }
  expect(
    "shared context carries explicit week_number",
    contract.includes("ctx.week_number !== undefined"),
  );

  const joinSource = await readFile("app/fantasy/join/[leagueId]/[seasonId].tsx", "utf8");
  expect("seat claim suppresses idempotent replay", joinSource.includes("!claimResult.already_existed"));
  const weekSetupSource = await readFile(
    "app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/setup.tsx",
    "utf8",
  );
  expect("week publish suppresses existing week replay", weekSetupSource.includes("!result.already_existed"));
  const settleSource = await readFile(
    "app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/settle.tsx",
    "utf8",
  );
  expect("settlement milestone excludes idempotent saves", settleSource.includes("!response.idempotent"));
  expect("settlement milestone excludes corrections", settleSource.includes("!response.was_correction"));
  expect("finalization suppresses finalized replay", settleSource.includes("!finalizeResult.already_finalized"));
  const hubSource = await readFile("app/fantasy/[leagueId]/[seasonId].tsx", "utf8");
  expect(
    "system shares exclude dismissal",
    hubSource.includes("shareResult.action !== Share.dismissedAction"),
  );
  const layoutSource = await readFile("app/_layout.tsx", "utf8");
  const postHogIdentityBlock = layoutSource.slice(
    layoutSource.indexOf("identifyUser(session.user.id);"),
    layoutSource.indexOf("if (Platform.OS === \"web\")", layoutSource.indexOf("identifyUser(session.user.id, {")),
  );
  expect("PostHog identity excludes email properties", !postHogIdentityBlock.includes("email:"));

  const forbidden = ["access_token", "guestToken", "claim_id", "short_code", "email"];
  let callCount = 0;
  for (const file of instrumentedFiles) {
    const source = await readFile(file, "utf8");
    for (const call of analyticsCalls(source)) {
      callCount += 1;
      for (const key of forbidden) {
        expect(`${file} analytics call excludes ${key}`, !call.includes(key));
      }
    }
  }
  expect("Fantasy screens contain analytics call sites", callCount >= requiredEvents.length - 1);
  console.log(`\n${assertions}/${assertions} assertions passed across ${callCount} call sites`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});