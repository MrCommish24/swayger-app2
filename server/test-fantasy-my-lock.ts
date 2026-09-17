import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routeSource = readFileSync("server/routes-fantasy.ts", "utf8");
const apiSource = readFileSync("lib/fantasy-api.ts", "utf8");
const migrationSource = readFileSync(
  "supabase/gameday-fantasy-weekly-my-lock.sql",
  "utf8",
);

// The schema must enforce the one-lock invariant and keep the row additive.
assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS fantasy_weekly_my_locks/);
assert.match(
  migrationSource,
  /UNIQUE \(room_id, participant_id\)/,
);
assert.match(
  migrationSource,
  /REFERENCES gameday_rooms\(id\) ON DELETE CASCADE/,
);
assert.match(
  migrationSource,
  /REFERENCES gameday_participants\(id\) ON DELETE CASCADE/,
);
assert.match(
  migrationSource,
  /REFERENCES gameday_props\(id\) ON DELETE CASCADE/,
);
assert.doesNotMatch(migrationSource, /selected_answer|answer_label/i);

// GET Weekly play exposes only the selected Moment association. It must
// resolve through a current pick and never expose the stored answer itself.
assert.match(
  routeSource,
  /from\("fantasy_weekly_my_locks"\)[\s\S]{0,500}\.select\("prop_id"\)/,
);
assert.match(routeSource, /rawPicks\.some\(\(pick\) => .*prop_id/);
assert.match(routeSource, /my_lock:\s+myLock/);

// Mutation is the member/guest Weekly route and validates every domain
// boundary before upserting the sole room+participant row.
assert.match(
  routeSource,
  /app\.put\(\s*["']\/api\/fantasy\/leagues\/:leagueId\/seasons\/:seasonId\/weeks\/:weekNumber\/my-lock/,
);
assert.match(routeSource, /identity = await getVerifiedCallerIdentity\(req, supabase\)/);
assert.match(routeSource, /supabase\.auth\.getUser\(token\)/);
assert.match(routeSource, /My Lock is not enabled for this league/);
assert.match(routeSource, /resolveViewer\(supabase, identity, seasonId, leagueId\)/);
assert.match(routeSource, /_getWeeklyRoomAndCard\(supabase, seasonId, wn\)/);
assert.match(routeSource, /cardStatus !== "open" \|\| roomStatus === "finalized"/);
assert.match(routeSource, /\.eq\("card_id", cardId\)/);
assert.match(routeSource, /My Lock requires a confirmed pick for this Moment/);
assert.match(routeSource, /from\("gameday_picks"\)/);
assert.match(routeSource, /\.eq\("participant_id", participantId\)/);
assert.match(routeSource, /\.upsert\([\s\S]{0,500}onConflict: "room_id,participant_id"/);
assert.doesNotMatch(routeSource, /fantasy_weekly_my_locks[\s\S]{0,600}selected_answer/);
assert.match(
  routeSource,
  /if \(isSwaygerRunEnabled\(String\(leagueId\)\)\) \{[\s\S]{0,300}from\("fantasy_weekly_my_locks"\)/,
);

// Typed client contract mirrors the response and PUT body.
assert.match(apiSource, /my_lock: \{ prop_id: string \} \| null/);
assert.match(apiSource, /export interface WeeklyMyLock/);
assert.match(apiSource, /export async function setWeeklyMyLock/);
assert.match(apiSource, /weeks\/\$\{weekNumber\}\/my-lock/);

console.log("Fantasy Weekly My Lock server contract tests passed");