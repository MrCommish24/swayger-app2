import { supabase } from "@/lib/supabase";
import {
  SwaygerData,
  SwaygerInvite,
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
      .from("swayger_invites")
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

  const { data, error } = await supabase.rpc("create_swayger", {
    p_title: title.trim(),
    p_description: description?.trim() || null,
    p_category: category || "Other",
    p_stake_units: Math.max(1, stakeUnits),
    p_creator_pick: creatorPick.trim(),
    p_invite_code: inviteCode,
  });

  if (error) {
    console.error("[swayger] create_swayger RPC error:", error.message, error.code, error.details);
    return { swayger: null, error: error.message };
  }

  const swaygerId = data as string;
  console.log("[swayger] Created swayger:", swaygerId);

  const { data: swayger, error: fetchError } = await supabase
    .from("swaygers")
    .select("*")
    .eq("id", swaygerId)
    .single();

  if (fetchError) {
    console.error("[swayger] Failed to fetch created swayger:", fetchError.message);
    return { swayger: null, error: fetchError.message };
  }

  return { swayger: swayger as SwaygerData, error: null };
}

export async function fetchMySwaygers(userId: string): Promise<SwaygerData[]> {
  const { data, error } = await supabase
    .from("swaygers")
    .select("*")
    .or(`creator_id.eq.${userId},opponent_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[swayger] fetchMySwaygers error:", error.message);
    return [];
  }
  return (data || []) as SwaygerData[];
}

export async function fetchSwayger(swaygerId: string): Promise<SwaygerData | null> {
  const { data, error } = await supabase
    .from("swaygers")
    .select("*")
    .eq("id", swaygerId)
    .single();

  if (error) {
    console.error("[swayger] fetchSwayger error:", error.message, "id:", swaygerId);
    return null;
  }
  return data as SwaygerData;
}

export async function fetchSwaygerInvite(swaygerId: string): Promise<SwaygerInvite | null> {
  const { data, error } = await supabase
    .from("swayger_invites")
    .select("*")
    .eq("swayger_id", swaygerId)
    .maybeSingle();

  if (error) {
    console.error("[swayger] fetchSwaygerInvite error:", error.message);
    return null;
  }
  return data as SwaygerInvite | null;
}

export async function fetchParticipantProfiles(
  creatorId: string,
  opponentId: string | null
): Promise<{ creator: { username: string; display_name: string | null; avatar_url: string | null } | null; opponent: { username: string; display_name: string | null; avatar_url: string | null } | null }> {
  const ids = [creatorId];
  if (opponentId) ids.push(opponentId);

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", ids);

  if (error) {
    console.error("[swayger] fetchParticipantProfiles error:", error.message);
    return { creator: null, opponent: null };
  }

  const profileMap = new Map(
    (profiles || []).map((p) => [p.id, { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url }])
  );

  return {
    creator: profileMap.get(creatorId) || null,
    opponent: opponentId ? profileMap.get(opponentId) || null : null,
  };
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

export async function withdrawProposal(
  swaygerId: string,
  proposalId: string
): Promise<{ error: string | null }> {
  console.log("[swayger] Withdrawing proposal:", proposalId, "from swayger:", swaygerId);
  const { data, error } = await supabase.rpc("withdraw_settlement_proposal", {
    p_swayger_id: swaygerId,
    p_proposal_id: proposalId,
  });

  if (error) {
    console.error("[swayger] withdraw_settlement_proposal RPC error:", error.message);
    return { error: error.message };
  }
  const result = data as { error: string | null };
  if (result.error) console.error("[swayger] withdraw_settlement_proposal business error:", result.error);
  return { error: result.error };
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

  const isOriginalCreator = userId === original.creator_id;
  const newCreatorPick = isOriginalCreator
    ? (original.creator_pick || "")
    : (original.opponent_pick || "");
  const newOpponentId = isOriginalCreator ? original.opponent_id : original.creator_id;

  const result = await createSwayger(
    original.title,
    original.category,
    newStake,
    newCreatorPick,
    userId,
    original.description || undefined
  );

  if (result.error || !result.swayger) return result;

  const updates: Record<string, unknown> = {
    source_swayger_id: swaygerId,
    rematch_type: rematchType,
  };

  if (newOpponentId) {
    updates.opponent_id = newOpponentId;
  }

  const { error: linkErr } = await supabase
    .from("swaygers")
    .update(updates)
    .eq("id", result.swayger.id);

  if (linkErr) {
    console.error("[swayger] Failed to link rematch:", linkErr.message);
  }

  if (!result.swayger) return result;
  const { data: updated } = await supabase
    .from("swaygers")
    .select("*")
    .eq("id", result.swayger.id)
    .single();

  return { swayger: (updated as SwaygerData) || result.swayger, error: null };
}

export async function joinSwaygerByCode(
  inviteCode: string,
  _userId: string
): Promise<{ swaygerId: string | null; error: string | null }> {
  console.log("[swayger] Joining by code:", inviteCode.trim().toUpperCase());
  const { data, error } = await supabase.rpc("join_swayger_by_code", {
    p_invite_code: inviteCode.trim().toUpperCase(),
  });

  if (error) {
    console.error("[swayger] join_swayger_by_code error:", error.message, error.code);
    return { swaygerId: null, error: error.message };
  }

  const result = data as { error: string | null; swayger_id: string | null };
  if (result.error) console.error("[swayger] join business error:", result.error);
  return {
    swaygerId: result.swayger_id,
    error: result.error,
  };
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
