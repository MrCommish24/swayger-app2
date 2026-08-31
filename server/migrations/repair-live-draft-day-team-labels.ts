/**
 * One-time data repair for active Fantasy Draft Day answer labels.
 *
 * This uses the Supabase API, so it works even when the database host is not
 * reachable from the Replit shell. It changes only answer_options.label for
 * season_member options on non-settled, non-archived Fantasy Draft Days.
 * Answer IDs and gameday_picks are not touched.
 */

import * as dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

async function repairLiveDraftDayLabels() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !serviceKey) {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rooms, error: roomsError } = await supabase
    .from("gameday_rooms")
    .select("id, league_season_id")
    .eq("competition_type", "draft_day")
    .eq("experience_type", "fantasy")
    .is("archived_at", null);
  if (roomsError) throw roomsError;
  if (!rooms?.length) {
    console.log("No active Fantasy Draft Day rooms found.");
    return;
  }

  const roomIds = (rooms as any[]).map((room) => room.id as string);
  const seasonIds = [...new Set((rooms as any[]).map((room) => room.league_season_id as string))];

  const { data: cards, error: cardsError } = await supabase
    .from("gameday_pick_cards")
    .select("id, room_id, status")
    .in("room_id", roomIds)
    .eq("phase", "draft_day")
    .neq("status", "settled");
  if (cardsError) throw cardsError;
  if (!cards?.length) {
    console.log("No active, non-settled Fantasy Draft Day cards found.");
    return;
  }

  const { data: teams, error: teamsError } = await supabase
    .from("fantasy_teams")
    .select("id, league_season_id, team_name, fantasy_team_managers(season_member_id)")
    .in("league_season_id", seasonIds);
  if (teamsError) throw teamsError;

  const teamNameBySeasonMemberId = new Map<string, string>();
  for (const team of (teams ?? []) as any[]) {
    if (!team.team_name) continue;
    for (const manager of (team.fantasy_team_managers ?? []) as any[]) {
      if (manager.season_member_id) {
        teamNameBySeasonMemberId.set(manager.season_member_id, team.team_name);
      }
    }
  }

  const cardIds = (cards as any[]).map((card) => card.id as string);
  const { data: props, error: propsError } = await supabase
    .from("gameday_props")
    .select("id, card_id, answer_options")
    .in("card_id", cardIds)
    .eq("answer_target_type", "season_member");
  if (propsError) throw propsError;

  let updatedProps = 0;
  let updatedOptions = 0;
  for (const prop of (props ?? []) as any[]) {
    const options = Array.isArray(prop.answer_options) ? prop.answer_options : [];
    let changed = false;
    const nextOptions = options.map((option: any) => {
      const teamName = teamNameBySeasonMemberId.get(option?.id);
      if (!teamName || option.label === teamName) return option;
      changed = true;
      updatedOptions++;
      return { ...option, label: teamName };
    });

    if (changed) {
      const { error: updateError } = await supabase
        .from("gameday_props")
        .update({ answer_options: nextOptions })
        .eq("id", prop.id);
      if (updateError) throw updateError;
      updatedProps++;
    }
  }

  console.log(
    `Updated ${updatedOptions} Draft Day option label(s) across ${updatedProps} prop(s). ` +
      "Stable answer IDs and submitted picks were not changed.",
  );
}

repairLiveDraftDayLabels().catch((error) => {
  console.error("Live Draft Day label repair failed:", error?.message ?? error);
  process.exit(1);
});