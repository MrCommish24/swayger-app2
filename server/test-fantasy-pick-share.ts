import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { addPickShareSource, buildFantasyPickSharePackage } from "../lib/fantasy-pick-share";
import { WEEKLY_MOMENTS } from "../lib/fantasy-weekly-moments";

let passed = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  passed++;
  console.log(`PASS ${name}`);
}

const teamAnswers: Record<string, string> = {
  fantasy_weekly_nfl_highest_scoring_team: "Team Jasand Shootaw",
  fantasy_weekly_nfl_lowest_scoring_team: "All Eyez On Me",
  fantasy_weekly_nfl_largest_margin_winner: "Dispimpin",
  fantasy_weekly_nfl_smallest_margin_winner: "Mr Roarke",
  fantasy_weekly_nfl_highest_player_team: "Team Jasand Shootaw",
  fantasy_weekly_nfl_bad_beat: "Mr Roarke",
  fantasy_weekly_nfl_got_away_with_one: "Dispimpin",
};

const url = "https://www.swayger.app/fantasy/weeks/league-safe/season-safe/2/play?source=pick_share";
const build = (templatePropId: string, answer: string, participantDisplayName: string | null = "Darius") =>
  buildFantasyPickSharePackage({
    templatePropId,
    selectedAnswerLabel: answer,
    participantDisplayName,
    leagueName: "Food Pyramid XX",
    weekNumber: 2,
    participationUrl: url,
  });

for (const [id, answer] of Object.entries(teamAnswers)) {
  const pkg = build(id, answer);
  check(`${WEEKLY_MOMENTS[id].title} has Moment-specific named copy`, pkg.sentence.startsWith("Darius ") && pkg.sentence.includes(answer));
}

const yesNoIds = [
  "fantasy_weekly_nfl_score_150_plus",
  "fantasy_weekly_nfl_matchup_under_5",
  "fantasy_weekly_nfl_win_under_100",
  "fantasy_weekly_nfl_130_plus_loss",
  "fantasy_weekly_nfl_30_plus_blowout",
];
for (const id of yesNoIds) {
  const yes = build(id, "Yes");
  const no = build(id, "No");
  check(`${WEEKLY_MOMENTS[id].title} has answer-aware Yes/No copy`, yes.sentence !== no.sentence && !yes.sentence.includes(" Yes ") && !no.sentence.includes(" No "));
}

const onePick = build("fantasy_weekly_nfl_lowest_scoring_team", "All Eyez On Me");
check("share package contains the Moment title", onePick.text.startsWith("BASEMENT WATCH"));
check("share package contains exactly the selected pick", onePick.text.includes("All Eyez On Me") && !onePick.text.includes("Mr Roarke"));
check("share package includes readable week context", onePick.text.includes("Swayger Fantasy • Food Pyramid XX • Week 2"));
check("share package includes the canonical participation URL", onePick.text.endsWith(url));
check("share package contains no private identity fields", !/(participant_id|member_id|user_id|claim_id|guest_token|recovery_token|access_token|email|phone)/i.test(onePick.text));
check("identity-safe fallback does not invent a participant name", build("fantasy_weekly_nfl_lowest_scoring_team", "All Eyez On Me", null).sentence === "My pick: All Eyez On Me for BASEMENT WATCH.");
check("unsafe control characters are removed from runtime labels", !build("fantasy_weekly_nfl_bad_beat", "Mr\nRoarke", "Da\u0000rius").text.includes("\u0000"));
check("unknown templates cannot create an unbranded package", (() => { try { build("unknown", "Team"); return false; } catch { return true; } })());
check("blank selected answers cannot be shared", (() => { try { build("fantasy_weekly_nfl_bad_beat", " "); return false; } catch { return true; } })());

const canonical = addPickShareSource("https://www.swayger.app/fantasy/weeks/league-safe/season-safe/2/play");
check("canonical link targets the existing Weekly play route", canonical === "https://www.swayger.app/fantasy/weeks/league-safe/season-safe/2/play?source=pick_share");
check("attribution query contains no sharer, answer, team, or template data", new URL(canonical).searchParams.toString() === "source=pick_share");

const analytics = fs.readFileSync(path.resolve("lib/posthog.ts"), "utf8");
for (const event of [
  "fantasy_pick_share_opened",
  "fantasy_pick_shared",
  "fantasy_pick_link_copied",
  "fantasy_week_opened_from_pick_share",
]) {
  check(`analytics declares ${event}`, analytics.includes(`capture("${event}"`));
}
check("entry-source allowlist recognizes pick_share", analytics.includes('if (src === "pick_share") return "pick_share"'));

const server = fs.readFileSync(path.resolve("server/routes-fantasy.ts"), "utf8");
check("authorized play response includes stable template ID", server.includes("template_prop_id:   (p.template_prop_id"));
check("authorized play response includes only league-safe viewer display name", server.includes("viewer_display_name: viewer.display_name ?? null"));
check("Weekly private picks require verified bearer credentials", /weeks\/:weekNumber\/play"[\s\S]{0,800}getVerifiedCallerIdentity\(req, supabase\)/.test(server));
check("no public pick-share API was introduced", !server.includes("/pick-share"));

const play = fs.readFileSync(path.resolve("app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/play.tsx"), "utf8");
const sheet = fs.readFileSync(path.resolve("components/fantasy/CallYourShotSheet.tsx"), "utf8");
check("unanswered questions do not show Share Pick", play.includes("!!myPick && status !== \"saving\""));
check("Share Pick is hidden after lock", play.includes("&& !isLocked &&"));
check("completion CTA requires every pick to be saved", play.includes("state.props.every((prop) =>") && play.includes('pickStatus[prop.id] !== "saving"'));
check("completion state offers Call Your Shot without replacing league navigation", play.includes("CALL YOUR SHOT") && play.includes("Back to League"));
check("share copy reads the latest server-confirmed answer after an edit", play.includes("const answerId = confirmedPicksRef.current[prop.id]"));
check("overlapping pick saves are serialized per question", play.includes("pickSaveChainRef.current[propId]") && play.includes("pickSaveVersionRef.current[propId] !== version"));
check("composer receives only the narrowed current-pick list", play.includes("picks={shareablePicks}") && sheet.includes("picks.find((pick) => pick.propId === selectedId)"));
check("share flow never calls the League Picks API", !play.includes("getWeeklyLeaguePicks") && !sheet.includes("getWeeklyLeaguePicks"));
check("Web Share API is used when available", sheet.includes("navigator.share({"));
check("native share analytics require a confirmed shared action", sheet.includes("result.action === Share.sharedAction"));
check("copy fallback copies the complete one-pick package", sheet.includes("Clipboard.setStringAsync(selected.shareText)"));
check("failed platform share falls back without duplicating the URL", sheet.includes('error?.name !== "AbortError"') && !sheet.includes("url: selected.shareUrl"));
check("pick sharing does not import or modify receipt-share helpers", !play.includes("fantasy-receipt-share") && !sheet.includes("fantasy-receipt-share"));

const join = fs.readFileSync(path.resolve("app/fantasy/join/[leagueId]/[seasonId].tsx"), "utf8");
check("credential-less shared links preserve Week and attribution through join", join.includes('&source=pick_share') && join.includes("play${pickShareSuffix}"));

const migrationFiles = fs.readdirSync(path.resolve("supabase")).filter((name) => name.includes("pick-share") || name.includes("call-your-shot"));
check("Call Your Shot adds no database migration", migrationFiles.length === 0);

console.log(`CALL YOUR SHOT V1: ${passed}/${passed} assertions passed`);