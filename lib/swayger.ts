import { supabase } from "@/lib/supabase";
import {
  SwaygerData,
  SwaygerLeg,
  SwaygerResponse,
  SwaygerParticipantWithProfile,
  SwaygerWithRole,
  LegInput,
} from "@/types";

const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  }
  return code;
}

async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateInviteCode();
    const { data } = await supabase
      .from("workspaces")
      .select("id")
      .eq("invite_code", code)
      .maybeSingle();

    if (!data) return code;
  }
  return generateInviteCode(8);
}

export async function createSwayger(
  title: string,
  sport: string,
  userId: string,
  stakeText?: string,
  legs?: LegInput[]
): Promise<{ swayger: SwaygerData | null; error: string | null }> {
  const inviteCode = await generateUniqueInviteCode();

  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: title.trim(),
    p_scoring_type: sport || "NFL",
    p_invite_code: inviteCode,
  });

  if (error) {
    console.error("[swayger] createSwayger RPC error:", error.message, error.code, error.details);
    return { swayger: null, error: error.message };
  }

  const swaygerId = data as string;
  console.log("[swayger] Created swayger:", swaygerId);

  if (stakeText?.trim()) {
    const { error: stakeErr } = await supabase
      .from("workspaces")
      .update({ stake_text: stakeText.trim() })
      .eq("id", swaygerId);

    if (stakeErr) {
      console.error("[swayger] Failed to set stake_text:", stakeErr.message, stakeErr.code, stakeErr.details);
    }
  }

  if (legs && legs.length > 0) {
    const legRows = legs
      .filter((l) => l.selection.trim())
      .map((l) => ({
        swayger_id: swaygerId,
        created_by: userId,
        market_type: l.market_type || "custom",
        selection: l.selection.trim(),
        odds: l.odds.trim() || null,
        line: l.line.trim() || null,
      }));

    if (legRows.length > 0) {
      const { error: legError } = await supabase
        .from("swayger_legs")
        .insert(legRows);

      if (legError) {
        console.error("[swayger] Failed to insert legs:", legError.message, legError.code, legError.details);
        return { swayger: null, error: `Created swayger but failed to add legs: ${legError.message}` };
      }
      console.log("[swayger] Inserted", legRows.length, "leg(s) for swayger:", swaygerId);
    }
  }

  const { data: swayger, error: fetchError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", swaygerId)
    .single();

  if (fetchError) {
    console.error("[swayger] Failed to fetch created swayger:", fetchError.message, fetchError.code);
    return { swayger: null, error: fetchError.message };
  }

  return { swayger: swayger as SwaygerData, error: null };
}

export async function fetchMySwaygers(
  userId: string
): Promise<SwaygerWithRole[]> {
  const { data: memberships, error: memError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId);

  if (memError) {
    console.error("[swayger] fetchMySwaygers memberships error:", memError.message, memError.code);
    return [];
  }
  if (!memberships || memberships.length === 0) return [];

  const ids = memberships.map((m) => m.workspace_id);

  const { data: swaygers, error: wsError } = await supabase
    .from("workspaces")
    .select("*")
    .in("id", ids)
    .order("created_at", { ascending: false });

  if (wsError) {
    console.error("[swayger] fetchMySwaygers workspaces error:", wsError.message, wsError.code);
    return [];
  }
  if (!swaygers) return [];

  const roleMap = new Map(memberships.map((m) => [m.workspace_id, m.role]));

  return swaygers.map((s) => ({
    ...(s as SwaygerData),
    role: (roleMap.get(s.id) ?? "viewer") as "owner" | "editor" | "viewer",
  }));
}

export async function fetchSwayger(
  swaygerId: string
): Promise<SwaygerData | null> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", swaygerId)
    .single();

  if (error) {
    console.error("[swayger] fetchSwayger error:", error.message, error.code, "id:", swaygerId);
    return null;
  }
  return data as SwaygerData;
}

export async function fetchSwaygerLegs(
  swaygerId: string
): Promise<SwaygerLeg[]> {
  const { data, error } = await supabase
    .from("swayger_legs")
    .select("*")
    .eq("swayger_id", swaygerId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[swayger] fetchSwaygerLegs error:", error.message, error.code, "swayger:", swaygerId);
    return [];
  }
  if (!data) return [];
  return data as SwaygerLeg[];
}

export async function fetchSwaygerResponses(
  swaygerId: string
): Promise<SwaygerResponse[]> {
  const { data, error } = await supabase
    .from("swayger_responses")
    .select("*")
    .eq("swayger_id", swaygerId);

  if (error) {
    console.error("[swayger] fetchSwaygerResponses error:", error.message, error.code, "swayger:", swaygerId);
    return [];
  }
  if (!data) return [];
  return data as SwaygerResponse[];
}

export async function fetchSwaygerParticipants(
  swaygerId: string
): Promise<SwaygerParticipantWithProfile[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("*, profiles(username, display_name, avatar_url)")
    .eq("workspace_id", swaygerId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[swayger] fetchSwaygerParticipants error:", error.message, error.code, "swayger:", swaygerId);
    return [];
  }
  if (!data) return [];
  return data as SwaygerParticipantWithProfile[];
}

export async function acceptSwayger(
  swaygerId: string
): Promise<{ error: string | null }> {
  console.log("[swayger] Calling accept_swayger RPC for:", swaygerId);
  const { data, error } = await supabase.rpc("accept_swayger", {
    p_swayger_id: swaygerId,
  });

  if (error) {
    console.error("[swayger] accept_swayger RPC error:", error.message, error.code, error.details);
    return { error: error.message };
  }
  const result = data as { error: string | null };
  if (result.error) {
    console.error("[swayger] accept_swayger business error:", result.error);
  } else {
    console.log("[swayger] Swayger accepted successfully:", swaygerId);
  }
  return { error: result.error };
}

export async function declineSwayger(
  swaygerId: string
): Promise<{ error: string | null }> {
  console.log("[swayger] Calling decline_swayger RPC for:", swaygerId);
  const { data, error } = await supabase.rpc("decline_swayger", {
    p_swayger_id: swaygerId,
  });

  if (error) {
    console.error("[swayger] decline_swayger RPC error:", error.message, error.code, error.details);
    return { error: error.message };
  }
  const result = data as { error: string | null };
  if (result.error) {
    console.error("[swayger] decline_swayger business error:", result.error);
  } else {
    console.log("[swayger] Swayger declined successfully:", swaygerId);
  }
  return { error: result.error };
}

export async function cancelSwayger(
  swaygerId: string
): Promise<{ error: string | null }> {
  console.log("[swayger] Calling cancel_swayger RPC for:", swaygerId);
  const { data, error } = await supabase.rpc("cancel_swayger", {
    p_swayger_id: swaygerId,
  });

  if (error) {
    console.error("[swayger] cancel_swayger RPC error:", error.message, error.code, error.details);
    return { error: error.message };
  }
  const result = data as { error: string | null };
  if (result.error) {
    console.error("[swayger] cancel_swayger business error:", result.error);
  } else {
    console.log("[swayger] Swayger canceled successfully:", swaygerId);
  }
  return { error: result.error };
}

export async function joinSwaygerByCode(
  inviteCode: string,
  _userId: string
): Promise<{ swaygerId: string | null; error: string | null; alreadyMember: boolean }> {
  console.log("[swayger] Calling join_workspace_by_code RPC with code:", inviteCode.trim().toUpperCase());
  const { data, error } = await supabase.rpc("join_workspace_by_code", {
    p_invite_code: inviteCode.trim().toUpperCase(),
  });

  if (error) {
    console.error("[swayger] join_workspace_by_code RPC error:", error.message, error.code, error.details);
    return { swaygerId: null, error: error.message, alreadyMember: false };
  }

  const result = data as { error: string | null; workspace_id: string | null; already_member: boolean };

  if (result.error) {
    console.error("[swayger] join_workspace_by_code business error:", result.error);
  } else {
    console.log("[swayger] Joined swayger:", result.workspace_id, "already_member:", result.already_member);
  }

  return {
    swaygerId: result.workspace_id,
    error: result.error,
    alreadyMember: result.already_member,
  };
}

export function displayRole(dbRole: string): string {
  if (dbRole === "owner") return "Creator";
  return "Participant";
}

export function displayStatus(status: string): { label: string; color: string } {
  switch (status) {
    case "open":
      return { label: "Open", color: "#22C55E" };
    case "accepted":
      return { label: "Accepted", color: "#3B82F6" };
    case "declined":
      return { label: "Declined", color: "#EF4444" };
    case "canceled":
      return { label: "Canceled", color: "#6B7280" };
    default:
      return { label: status, color: "#8B95A5" };
  }
}

export function displayMarketType(mt: string): string {
  switch (mt) {
    case "player_prop": return "Player Prop";
    case "spread": return "Spread";
    case "moneyline": return "Moneyline";
    case "team_total": return "Team Total";
    case "over_under": return "Over/Under";
    case "custom": return "Custom";
    default: return mt;
  }
}
