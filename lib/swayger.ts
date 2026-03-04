import { supabase } from "@/lib/supabase";
import {
  SwaygerData,
  SwaygerWithRole,
  SwaygerParticipantWithProfile,
  SettlementProposal,
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
  category: string,
  stakeUnits: number,
  creatorPick: string,
  userId: string,
  description?: string
): Promise<{ swayger: SwaygerData | null; error: string | null }> {
  const inviteCode = await generateUniqueInviteCode();

  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: title.trim(),
    p_scoring_type: category || "Other",
    p_invite_code: inviteCode,
  });

  if (error) {
    console.error("[swayger] createSwayger RPC error:", error.message, error.code, error.details);
    return { swayger: null, error: error.message };
  }

  const swaygerId = data as string;
  console.log("[swayger] Created swayger:", swaygerId);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: updateErr } = await supabase
    .from("workspaces")
    .update({
      category: category || "Other",
      stake_units: Math.max(1, stakeUnits),
      creator_pick: creatorPick.trim(),
      description: description?.trim() || null,
      status: "pending_invite",
      expires_at: expiresAt,
    })
    .eq("id", swaygerId);

  if (updateErr) {
    console.error("[swayger] Failed to update swayger fields:", updateErr.message, updateErr.code);
    return { swayger: null, error: `Created but failed to set details: ${updateErr.message}` };
  }

  const { data: swayger, error: fetchError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", swaygerId)
    .single();

  if (fetchError) {
    console.error("[swayger] Failed to fetch created swayger:", fetchError.message);
    return { swayger: null, error: fetchError.message };
  }

  return { swayger: swayger as SwaygerData, error: null };
}

export async function fetchMySwaygers(userId: string): Promise<SwaygerWithRole[]> {
  const { data: memberships, error: memError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId);

  if (memError) {
    console.error("[swayger] fetchMySwaygers memberships error:", memError.message);
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
    console.error("[swayger] fetchMySwaygers workspaces error:", wsError.message);
    return [];
  }
  if (!swaygers) return [];

  const roleMap = new Map(memberships.map((m) => [m.workspace_id, m.role]));

  return swaygers.map((s) => ({
    ...(s as SwaygerData),
    role: (roleMap.get(s.id) ?? "viewer") as "owner" | "editor" | "viewer",
  }));
}

export async function fetchSwayger(swaygerId: string): Promise<SwaygerData | null> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", swaygerId)
    .single();

  if (error) {
    console.error("[swayger] fetchSwayger error:", error.message, "id:", swaygerId);
    return null;
  }
  return data as SwaygerData;
}

export async function fetchSwaygerParticipants(swaygerId: string): Promise<SwaygerParticipantWithProfile[]> {
  const { data: members, error: memErr } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", swaygerId)
    .order("created_at", { ascending: true });

  if (memErr) {
    console.error("[swayger] fetchSwaygerParticipants error:", memErr.message);
    return [];
  }
  if (!members || members.length === 0) return [];

  const userIds = members.map((m) => m.user_id);
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", userIds);

  if (profErr) {
    console.error("[swayger] fetchSwaygerParticipants profiles error:", profErr.message);
  }

  const profileMap = new Map(
    (profiles || []).map((p) => [p.id, { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url }])
  );

  return members.map((m) => ({
    ...m,
    profiles: profileMap.get(m.user_id) || null,
  })) as SwaygerParticipantWithProfile[];
}

export async function fetchSettlementProposals(swaygerId: string): Promise<SettlementProposal[]> {
  const { data, error } = await supabase
    .from("settlement_proposals")
    .select("*")
    .eq("swayger_id", swaygerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[swayger] fetchSettlementProposals error:", error.message);
    return [];
  }
  if (!data) return [];
  return data as SettlementProposal[];
}

export async function acceptSwayger(swaygerId: string, opponentPick: string): Promise<{ error: string | null }> {
  console.log("[swayger] Accepting swayger:", swaygerId);
  const { data, error } = await supabase.rpc("accept_swayger", {
    p_swayger_id: swaygerId,
    p_opponent_pick: opponentPick.trim(),
  });

  if (error) {
    console.error("[swayger] accept_swayger RPC error:", error.message, error.code);
    return { error: error.message };
  }
  const result = data as { error: string | null };
  if (result.error) console.error("[swayger] accept_swayger business error:", result.error);
  else console.log("[swayger] Swayger accepted:", swaygerId);
  return { error: result.error };
}

export async function declineSwayger(swaygerId: string): Promise<{ error: string | null }> {
  console.log("[swayger] Declining swayger:", swaygerId);
  const { data, error } = await supabase.rpc("decline_swayger", {
    p_swayger_id: swaygerId,
  });

  if (error) {
    console.error("[swayger] decline_swayger RPC error:", error.message, error.code);
    return { error: error.message };
  }
  const result = data as { error: string | null };
  if (result.error) console.error("[swayger] decline_swayger business error:", result.error);
  return { error: result.error };
}

export async function cancelSwayger(swaygerId: string): Promise<{ error: string | null }> {
  console.log("[swayger] Canceling swayger:", swaygerId);
  const { data, error } = await supabase.rpc("cancel_swayger", {
    p_swayger_id: swaygerId,
  });

  if (error) {
    console.error("[swayger] cancel_swayger RPC error:", error.message, error.code);
    return { error: error.message };
  }
  const result = data as { error: string | null };
  if (result.error) console.error("[swayger] cancel_swayger business error:", result.error);
  return { error: result.error };
}

export async function proposeSettlement(
  swaygerId: string,
  outcome: string
): Promise<{ error: string | null; proposalId: string | null }> {
  console.log("[swayger] Proposing settlement:", swaygerId, outcome);
  const { data, error } = await supabase.rpc("propose_settlement", {
    p_swayger_id: swaygerId,
    p_outcome: outcome,
  });

  if (error) {
    console.error("[swayger] propose_settlement RPC error:", error.message, error.code);
    return { error: error.message, proposalId: null };
  }
  const result = data as { error: string | null; proposal_id: string | null };
  if (result.error) console.error("[swayger] propose_settlement business error:", result.error);
  return { error: result.error, proposalId: result.proposal_id ?? null };
}

export async function confirmSettlement(
  swaygerId: string,
  proposalId: string
): Promise<{ error: string | null; settled: boolean }> {
  console.log("[swayger] Confirming settlement:", swaygerId, proposalId);
  const { data, error } = await supabase.rpc("confirm_settlement", {
    p_swayger_id: swaygerId,
    p_proposal_id: proposalId,
  });

  if (error) {
    console.error("[swayger] confirm_settlement RPC error:", error.message, error.code);
    return { error: error.message, settled: false };
  }
  const result = data as { error: string | null; settled: boolean };
  if (result.error) console.error("[swayger] confirm_settlement business error:", result.error);
  if (result.settled) console.log("[swayger] Swayger settled:", swaygerId);
  return { error: result.error, settled: result.settled ?? false };
}

export async function createRematch(
  swaygerId: string,
  rematchType: "run_it_back" | "double_or_nothing",
  userId: string
): Promise<{ swayger: SwaygerData | null; error: string | null }> {
  const original = await fetchSwayger(swaygerId);
  if (!original) return { swayger: null, error: "Original swayger not found." };

  if (original.status !== "settled") return { swayger: null, error: "Can only rematch a settled Swayger." };

  const newStake = rematchType === "double_or_nothing" ? original.stake_units * 2 : original.stake_units;

  const result = await createSwayger(
    original.name,
    original.category,
    newStake,
    original.creator_pick || "",
    userId,
    original.description || undefined
  );

  if (result.error || !result.swayger) return result;

  const { error: linkErr } = await supabase
    .from("workspaces")
    .update({
      source_swayger_id: swaygerId,
      rematch_type: rematchType,
    })
    .eq("id", result.swayger.id);

  if (linkErr) {
    console.error("[swayger] Failed to link rematch:", linkErr.message);
  }

  return result;
}

export async function joinSwaygerByCode(
  inviteCode: string,
  _userId: string
): Promise<{ swaygerId: string | null; error: string | null; alreadyMember: boolean }> {
  console.log("[swayger] Joining by code:", inviteCode.trim().toUpperCase());
  const { data, error } = await supabase.rpc("join_workspace_by_code", {
    p_invite_code: inviteCode.trim().toUpperCase(),
  });

  if (error) {
    console.error("[swayger] join_workspace_by_code error:", error.message, error.code);
    return { swaygerId: null, error: error.message, alreadyMember: false };
  }

  const result = data as { error: string | null; workspace_id: string | null; already_member: boolean };
  if (result.error) console.error("[swayger] join business error:", result.error);
  return {
    swaygerId: result.workspace_id,
    error: result.error,
    alreadyMember: result.already_member,
  };
}

export function displayRole(dbRole: string): string {
  if (dbRole === "owner") return "Creator";
  return "Opponent";
}

export function displayStatus(status: string): { label: string; color: string } {
  switch (status) {
    case "pending_invite": return { label: "Pending", color: "#F5A623" };
    case "active": return { label: "Active", color: "#22C55E" };
    case "settlement_proposed": return { label: "Settlement Proposed", color: "#3B82F6" };
    case "settled": return { label: "Settled", color: "#8B5CF6" };
    case "declined": return { label: "Declined", color: "#EF4444" };
    case "canceled": return { label: "Canceled", color: "#6B7280" };
    case "expired": return { label: "Expired", color: "#6B7280" };
    case "expired_active": return { label: "Expired (Active)", color: "#F97316" };
    default: return { label: status, color: "#8B95A5" };
  }
}

export function displayOutcome(outcome: string): string {
  switch (outcome) {
    case "creator": return "Creator Wins";
    case "opponent": return "Opponent Wins";
    case "draw": return "Draw";
    case "no_contest": return "No Contest";
    default: return outcome;
  }
}

export const CATEGORIES = [
  { value: "Sports", icon: "american-football-outline" as const },
  { value: "Entertainment", icon: "film-outline" as const },
  { value: "Gaming", icon: "game-controller-outline" as const },
  { value: "Lifestyle", icon: "heart-outline" as const },
  { value: "Politics", icon: "megaphone-outline" as const },
  { value: "Other", icon: "trophy-outline" as const },
];

export function categoryIcon(category: string): string {
  const found = CATEGORIES.find((c) => c.value === category);
  return found?.icon || "trophy-outline";
}
