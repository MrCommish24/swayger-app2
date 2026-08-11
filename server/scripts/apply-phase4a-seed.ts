/**
 * server/scripts/apply-phase4a-seed.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Seeds Phase 4A prop library templates into Supabase.
 * Also verifies that gameday_props.answer_target_type column exists.
 *
 * Usage:
 *   npx tsx server/scripts/apply-phase4a-seed.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUP_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUP_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUP_URL || !SUP_KEY) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUP_URL, SUP_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Prop library seeds ───────────────────────────────────────────────────────

const FOOTBALL_PROPS = [
  // Competition (Draft Day Picks)
  { id: "fdd_fb_qb_first",       sport: "football", phase: "draft_day", question: "Who drafts a quarterback first?",                  answer_options: [], settlement_window: "At draft end",  experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "competition", point_value: 10, answer_target_type: "season_member", is_active: true, is_default: true,  display_order: 0 },
  { id: "fdd_fb_rookie_first",   sport: "football", phase: "draft_day", question: "Who drafts the first rookie?",                     answer_options: [], settlement_window: "At draft end",  experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "competition", point_value: 10, answer_target_type: "season_member", is_active: true, is_default: true,  display_order: 1 },
  { id: "fdd_fb_defense_first",  sport: "football", phase: "draft_day", question: "Who takes a defense first?",                       answer_options: [], settlement_window: "At draft end",  experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "competition", point_value: 10, answer_target_type: "season_member", is_active: true, is_default: true,  display_order: 2 },
  { id: "fdd_fb_biggest_reach",  sport: "football", phase: "draft_day", question: "Who makes the biggest reach of the draft?",        answer_options: [], settlement_window: "At draft end",  experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "competition", point_value: 10, answer_target_type: "season_member", is_active: true, is_default: true,  display_order: 3 },
  { id: "fdd_fb_kicker_first",   sport: "football", phase: "draft_day", question: "Who takes a kicker first?",                       answer_options: [], settlement_window: "At draft end",  experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "competition", point_value: 10, answer_target_type: "season_member", is_active: true, is_default: false, display_order: 4 },
  { id: "fdd_fb_qb_last",        sport: "football", phase: "draft_day", question: "Who waits the longest to draft a quarterback?",    answer_options: [], settlement_window: "At draft end",  experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "competition", point_value: 10, answer_target_type: "season_member", is_active: true, is_default: false, display_order: 5 },
  { id: "fdd_fb_clock_longest",  sport: "football", phase: "draft_day", question: "Who takes the most total time on the clock?",      answer_options: [], settlement_window: "At draft end",  experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "competition", point_value: 10, answer_target_type: "season_member", is_active: true, is_default: false, display_order: 6 },
  // Season Receipts
  { id: "fsr_fb_finish_first",   sport: "football", phase: "draft_day", question: "Who finishes first in the league?",                answer_options: [], settlement_window: "End of season", experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "season",      point_value: 10, answer_target_type: "season_member", is_active: true, is_default: true,  display_order: 7 },
  { id: "fsr_fb_finish_last",    sport: "football", phase: "draft_day", question: "Who finishes last in the league?",                 answer_options: [], settlement_window: "End of season", experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "season",      point_value: 10, answer_target_type: "season_member", is_active: true, is_default: true,  display_order: 8 },
  { id: "fsr_fb_most_points",    sport: "football", phase: "draft_day", question: "Who scores the most total fantasy points?",        answer_options: [], settlement_window: "End of season", experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "season",      point_value: 10, answer_target_type: "season_member", is_active: true, is_default: true,  display_order: 9 },
  { id: "fsr_fb_best_record",    sport: "football", phase: "draft_day", question: "Who has the best regular-season record?",          answer_options: [], settlement_window: "End of season", experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "season",      point_value: 10, answer_target_type: "season_member", is_active: true, is_default: false, display_order: 10 },
];

const BASKETBALL_PROPS = [
  { id: "fdd_bb_star_first",     sport: "basketball", phase: "draft_day", question: "Who grabs the top-ranked player first?",         answer_options: [], settlement_window: "At draft end",  experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "competition", point_value: 10, answer_target_type: "season_member", is_active: true, is_default: true,  display_order: 0 },
  { id: "fdd_bb_biggest_reach",  sport: "basketball", phase: "draft_day", question: "Who makes the biggest reach of the draft?",      answer_options: [], settlement_window: "At draft end",  experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "competition", point_value: 10, answer_target_type: "season_member", is_active: true, is_default: true,  display_order: 1 },
  { id: "fdd_bb_clock_longest",  sport: "basketball", phase: "draft_day", question: "Who takes the most total time on the clock?",    answer_options: [], settlement_window: "At draft end",  experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "competition", point_value: 10, answer_target_type: "season_member", is_active: true, is_default: false, display_order: 2 },
  { id: "fsr_bb_finish_first",   sport: "basketball", phase: "draft_day", question: "Who finishes first in the league?",              answer_options: [], settlement_window: "End of season", experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "season",      point_value: 10, answer_target_type: "season_member", is_active: true, is_default: true,  display_order: 3 },
  { id: "fsr_bb_finish_last",    sport: "basketball", phase: "draft_day", question: "Who finishes last in the league?",               answer_options: [], settlement_window: "End of season", experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "season",      point_value: 10, answer_target_type: "season_member", is_active: true, is_default: true,  display_order: 4 },
];

const BASEBALL_PROPS = [
  { id: "fdd_ba_star_first",     sport: "baseball",    phase: "draft_day", question: "Who grabs the top-ranked player first?",        answer_options: [], settlement_window: "At draft end",  experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "competition", point_value: 10, answer_target_type: "season_member", is_active: true, is_default: true,  display_order: 0 },
  { id: "fdd_ba_biggest_reach",  sport: "baseball",    phase: "draft_day", question: "Who makes the biggest reach of the draft?",     answer_options: [], settlement_window: "At draft end",  experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "competition", point_value: 10, answer_target_type: "season_member", is_active: true, is_default: true,  display_order: 1 },
  { id: "fdd_ba_clock_longest",  sport: "baseball",    phase: "draft_day", question: "Who takes the most total time on the clock?",   answer_options: [], settlement_window: "At draft end",  experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "competition", point_value: 10, answer_target_type: "season_member", is_active: true, is_default: false, display_order: 2 },
  { id: "fsr_ba_finish_first",   sport: "baseball",    phase: "draft_day", question: "Who finishes first in the league?",             answer_options: [], settlement_window: "End of season", experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "season",      point_value: 10, answer_target_type: "season_member", is_active: true, is_default: true,  display_order: 3 },
  { id: "fsr_ba_finish_last",    sport: "baseball",    phase: "draft_day", question: "Who finishes last in the league?",              answer_options: [], settlement_window: "End of season", experience_type: "fantasy", competition_type: "draft_day", scoring_scope: "season",      point_value: 10, answer_target_type: "season_member", is_active: true, is_default: true,  display_order: 4 },
];

async function seed() {
  console.log("🌱  Seeding Phase 4A prop library templates…\n");

  const allProps = [...FOOTBALL_PROPS, ...BASKETBALL_PROPS, ...BASEBALL_PROPS];

  const { error: libErr, count } = await supabase
    .from("gameday_prop_library")
    .upsert(allProps, { onConflict: "id", count: "exact" });

  if (libErr) {
    console.error("❌  gameday_prop_library upsert failed:", libErr.message);
    console.error("    Hint:", libErr.hint ?? "(no hint)");
    process.exit(1);
  }
  console.log(`✅  Seeded ${allProps.length} prop library rows (${count} affected)`);

  // Verify
  const { data: rows } = await supabase
    .from("gameday_prop_library")
    .select("id, sport, scoring_scope")
    .eq("experience_type", "fantasy")
    .eq("competition_type", "draft_day");

  const byScope = { competition: 0, season: 0 };
  for (const r of rows ?? []) {
    if (r.scoring_scope === "competition") byScope.competition++;
    else byScope.season++;
  }
  console.log(`✅  Verification: ${rows?.length ?? 0} total (competition=${byScope.competition} season=${byScope.season})`);

  // Check answer_target_type column on gameday_props
  const { error: colErr } = await supabase
    .from("gameday_props")
    .select("answer_target_type")
    .limit(1);

  if (colErr?.message?.includes("answer_target_type")) {
    console.log("⚠️   gameday_props.answer_target_type column missing — ALTER TABLE required");
    console.log("     Apply via Supabase SQL Editor:");
    console.log("     ALTER TABLE gameday_props ADD COLUMN IF NOT EXISTS answer_target_type TEXT;");
    console.log("     ALTER TABLE gameday_props ADD CONSTRAINT gameday_props_answer_target_type_check");
    console.log("       CHECK (answer_target_type IS NULL OR answer_target_type IN ('season_member','fantasy_team','player','yes_no','static'));");
  } else {
    console.log("✅  gameday_props.answer_target_type column: OK");
  }

  // Check publish_fantasy_draft_day RPC
  const { error: rpcErr } = await supabase.rpc("publish_fantasy_draft_day", {
    p_league_season_id: "00000000-0000-0000-0000-000000000000",
    p_room_name:        "test",
    p_sport:            "football",
    p_room_code:        "TEST00",
    p_host_user_id:     "00000000-0000-0000-0000-000000000000",
    p_props:            [],
  });

  if (rpcErr?.message?.includes("does not exist") || rpcErr?.message?.includes("Could not find")) {
    console.log("⚠️   publish_fantasy_draft_day RPC not found — must be created in Supabase SQL Editor");
    console.log("     See supabase/gameday-fantasy-phase4a-draft-day.sql lines 279–376");
  } else if (rpcErr && !rpcErr.message?.includes("uuid")) {
    console.log("⚠️   RPC check error (may be benign):", rpcErr.message);
  } else {
    console.log("✅  publish_fantasy_draft_day RPC: callable");
  }

  console.log("\n🎉  Phase 4A seed complete.");
}

seed().catch((e) => { console.error("Unexpected:", e); process.exit(1); });
