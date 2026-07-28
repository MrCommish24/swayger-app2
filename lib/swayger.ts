import { supabase } from "@/lib/supabase";
import {
  SwaygerData,
  SwaygerInvite,
  SettlementProposal,
  UserBalance,
} from "@/types";
import { getApiUrl } from "@/lib/query-client";

type NotifyEvent =
  | "invite_created"
  | "swayger_accepted"
  | "settlement_proposed"
  | "swayger_settled";

async function notifyEvent(
  event: NotifyEvent,
  swayger: SwaygerData,
  callerId: string,
  outcome?: string
): Promise<void> {
  try {
    const ids = [swayger.creator_id, ...(swayger.opponent_id ? [swayger.opponent_id] : [])];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, username, email")
      .in("id", ids);

    if (!profiles || profiles.length === 0) return;

    const pm = new Map(profiles.map((p) => [p.id, p]));
    const name = (id: string) =>
      pm.get(id)?.display_name || pm.get(id)?.username || "Someone";
    const email = (id: string): string | null =>
      (pm.get(id) as { email?: string | null } | undefined)?.email ?? null;

    let recipientIds: string[] = [];
    if (event === "invite_created" && swayger.opponent_id) {
      recipientIds = [swayger.opponent_id];
    } else if (event === "swayger_accepted") {
      recipientIds = [swayger.creator_id];
    } else if (event === "settlement_proposed") {
      const other =
        callerId === swayger.creator_id
          ? swayger.opponent_id
          : swayger.creator_id;
      if (other) recipientIds = [other];
    } else if (event === "swayger_settled") {
      recipientIds = ids;
    }

    const recipients = recipientIds
      .map((id) => ({ email: email(id), name: name(id) }))
      .filter((r): r is { email: string; name: string } => !!r.email);

    if (recipients.length === 0) return;

    let winnerName: string | undefined;
    if (outcome === "creator") winnerName = name(swayger.creator_id);
    else if (outcome === "opponent" && swayger.opponent_id) winnerName = name(swayger.opponent_id);

    await fetch(`${getApiUrl()}api/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        swayger: {
          id: swayger.id,
          title: swayger.title,
          category: swayger.category,
          stakeUnits: swayger.stake_units,
          stakeNote: swayger.stake_note ?? undefined,
        },
        sender: { name: name(callerId) },
        recipients,
        outcome,
        winnerName,
      }),
    });
  } catch (err) {
    console.error("[notify] notifyEvent failed:", err);
  }
}

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
  description?: string,
  stakeNote?: string
): Promise<{ swayger: SwaygerData | null; error: string | null }> {
  const inviteCode = await generateUniqueInviteCode();

  const { data, error } = await supabase.rpc("create_swayger", {
    p_title: title.trim(),
    p_description: description?.trim() || null,
    p_category: category || "Other",
    p_stake_units: Math.max(5, stakeUnits),
    p_creator_pick: creatorPick.trim(),
    p_invite_code: inviteCode,
    p_stake_note: stakeNote?.trim() || null,
  });

  if (error) {
    console.error("[swayger] create_swayger RPC error:", error.message, error.code, error.details);
    return { swayger: null, error: error.message };
  }

  const swaygerId = data as string;
  console.log("[swayger] Created swayger:", swaygerId);

  const { data: swaygerRows, error: fetchError } = await supabase
    .from("swaygers")
    .select("*")
    .eq("id", swaygerId)
    .limit(1);

  if (fetchError) {
    console.error("[swayger] Failed to fetch created swayger:", fetchError.message);
    return { swayger: null, error: fetchError.message };
  }

  return { swayger: (swaygerRows?.[0] ?? null) as SwaygerData | null, error: null };
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
    .limit(1);

  if (error) {
    console.error("[swayger] fetchSwayger error:", error.message, error.code, "id:", swaygerId);
    return null;
  }

  if (data && data.length > 0) {
    return data[0] as SwaygerData;
  }

  // RLS may be blocking the direct read (e.g. opponent just joined and opponent_id is still null).
  // Fall back to the SECURITY DEFINER RPC which checks creator/opponent/invite existence.
  const { data: rpcData, error: rpcError } = await supabase
    .rpc("get_swayger_by_id", { p_swayger_id: swaygerId });

  if (rpcError) {
    console.error("[swayger] get_swayger_by_id RPC error:", rpcError.message);
    return null;
  }

  const rows = rpcData as SwaygerData[] | null;
  return (rows && rows.length > 0) ? rows[0] : null;
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

export async function acceptSwayger(swaygerId: string, opponentPick: string, callerId?: string): Promise<{ error: string | null }> {
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
  if (result.error) {
    console.error("[swayger] accept_swayger business error:", result.error);
  } else {
    console.log("[swayger] Swayger accepted:", swaygerId);
    if (callerId) {
      const swayger = await fetchSwayger(swaygerId);
      if (swayger) {
        notifyEvent("swayger_accepted", swayger, callerId);

        // If this is a March Madness featured matchup Swayger, attempt to unlock
        // the referral reward for whoever referred the accepting user.
        // Fire-and-forget — the backend RPC silently no-ops if:
        //   • the user has no referrer (referred_by IS NULL)
        //   • the reward was already granted (referral_reward_claimed = true)
        if (swayger.category === "March Madness") {
          fetch(new URL("/api/mm/unlock-referral-reward", getApiUrl()).toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: callerId }),
          }).catch(() => {});
        }
      }
    }
  }
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
  outcome: string,
  callerId?: string
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
  if (result.error) {
    console.error("[swayger] propose_settlement business error:", result.error);
  } else if (callerId) {
    const swayger = await fetchSwayger(swaygerId);
    if (swayger) notifyEvent("settlement_proposed", swayger, callerId, outcome);
  }
  return { error: result.error, proposalId: result.proposal_id ?? null };
}

export async function confirmSettlement(
  swaygerId: string,
  proposalId: string,
  callerId?: string
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
  const result = data as { error: string | null; settled: boolean; outcome?: string };
  if (result.error) {
    console.error("[swayger] confirm_settlement business error:", result.error);
  } else if (result.settled) {
    console.log("[swayger] Swayger settled:", swaygerId);
    if (callerId) {
      const swayger = await fetchSwayger(swaygerId);
      if (swayger) notifyEvent("swayger_settled", swayger, callerId, swayger.settled_outcome ?? undefined);
    }
  }
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
    original.description || undefined,
    undefined
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
  const { data: updatedRows } = await supabase
    .from("swaygers")
    .select("*")
    .eq("id", result.swayger.id)
    .limit(1);

  const finalSwayger = (updatedRows?.[0] as SwaygerData) || result.swayger;
  if (finalSwayger.opponent_id) {
    notifyEvent("invite_created", finalSwayger, userId);
  }
  return { swayger: finalSwayger, error: null };
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
    console.error("[swayger] join_swayger_by_code rpc error:", error.message, error.code);
    return { swaygerId: null, error: error.message };
  }

  // RPC may return null if code not found or swayger is unavailable
  if (!data) {
    return { swaygerId: null, error: "Invite code not found or no longer available." };
  }

  const result = data as { error: string | null; swayger_id: string | null };

  if (!result.swayger_id && !result.error) {
    return { swaygerId: null, error: "Could not join this Swayger. It may already be taken, expired, or belong to you." };
  }

  return {
    swaygerId: result.swayger_id,
    error: result.error,
  };
}

export function displayStatus(status: string): { label: string; color: string } {
  switch (status) {
    case "pending_invite": return { label: "Pending", color: "#F5A623" };
    case "active": return { label: "Active", color: "#22C55E" };
    case "settlement_proposed": return { label: "Settling", color: "#3B82F6" };
    case "settled": return { label: "Settled", color: "#8B5CF6" };
    case "declined": return { label: "Declined", color: "#EF4444" };
    case "canceled": return { label: "Canceled", color: "#6B7280" };
    case "expired": return { label: "Expired", color: "#6B7280" };
    case "expired_active": return { label: "Expired (Active)", color: "#F97316" };
    case "invite_expired": return { label: "Invite Expired", color: "#6B7280" };
    case "settlement_expired": return { label: "Time Expired", color: "#EF4444" };
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

export function displayOutcomeForViewer(
  outcome: string,
  isCreator: boolean,
  isOpponent: boolean
): string {
  switch (outcome) {
    case "creator":
      if (isCreator) return "You Win";
      if (isOpponent) return "Opponent Wins";
      return "Creator Wins";
    case "opponent":
      if (isOpponent) return "You Win";
      if (isCreator) return "Opponent Wins";
      return "Opponent Wins";
    case "draw": return "Draw";
    case "no_contest": return "No Contest";
    default: return outcome;
  }
}

// ─── Swayger Points ──────────────────────────────────────────────────────────

export async function fetchMyBalance(userId: string): Promise<{ balance: number; bankruptcyUsed: boolean } | null> {
  const { data, error } = await supabase
    .from("user_balances")
    .select("swayger_points, bankruptcy_used")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[swayger] fetchMyBalance error:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    balance: (data as { swayger_points: number; bankruptcy_used: boolean }).swayger_points,
    bankruptcyUsed: (data as { swayger_points: number; bankruptcy_used: boolean }).bankruptcy_used,
  };
}

export async function fetchAllBalances(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("user_balances")
    .select("user_id, swayger_points");

  if (error) {
    console.error("[swayger] fetchAllBalances error:", error.message);
    return new Map();
  }
  const map = new Map<string, number>();
  (data || []).forEach((row: { user_id: string; swayger_points: number }) => {
    map.set(row.user_id, row.swayger_points);
  });
  return map;
}

export async function claimBankruptcy(): Promise<{ error: string | null; newBalance: number | null }> {
  const { data, error } = await supabase.rpc("claim_bankruptcy");
  if (error) {
    console.error("[swayger] claim_bankruptcy RPC error:", error.message);
    return { error: error.message, newBalance: null };
  }
  const result = data as { error: string | null; new_balance?: number };
  return { error: result.error, newBalance: result.new_balance ?? null };
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
  // Special categories not in the picker but present in settled data
  if (category === "March Madness") return "basketball-outline";
  if (category === "NBA Playoffs") return "basketball-outline";
  const found = CATEGORIES.find((c) => c.value === category);
  return found?.icon || "trophy-outline";
}

export interface H2HOpponent {
  opponentId: string;
  username: string;
  displayName: string | null;
  myWins: number;
  theirWins: number;
  draws: number;
  total: number;
  lastPlayed: string;
}

export async function fetchAllH2HOpponents(myId: string): Promise<H2HOpponent[]> {
  const { data, error } = await supabase
    .from("swaygers")
    .select("creator_id, opponent_id, settled_outcome, updated_at")
    .eq("status", "settled")
    .or(`creator_id.eq.${myId},opponent_id.eq.${myId}`)
    .not("settled_outcome", "is", null);

  if (error || !data) return [];

  const opponentMap = new Map<string, { myWins: number; theirWins: number; draws: number; lastPlayed: string }>();

  for (const s of data) {
    const otherId = s.creator_id === myId ? s.opponent_id : s.creator_id;
    if (!otherId || otherId === myId) continue;
    if (!opponentMap.has(otherId)) {
      opponentMap.set(otherId, { myWins: 0, theirWins: 0, draws: 0, lastPlayed: s.updated_at });
    }
    const entry = opponentMap.get(otherId)!;
    if (s.updated_at > entry.lastPlayed) entry.lastPlayed = s.updated_at;
    if (s.settled_outcome === "draw" || s.settled_outcome === "no_contest") {
      entry.draws++;
    } else if (
      (s.creator_id === myId && s.settled_outcome === "creator") ||
      (s.opponent_id === myId && s.settled_outcome === "opponent")
    ) {
      entry.myWins++;
    } else {
      entry.theirWins++;
    }
  }

  const opponentIds = Array.from(opponentMap.keys());
  if (opponentIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .in("id", opponentIds);

  const profileMap = new Map<string, { username: string; display_name: string | null }>();
  (profiles || []).forEach((p) => profileMap.set(p.id, { username: p.username, display_name: p.display_name }));

  const results: H2HOpponent[] = [];
  opponentMap.forEach((stats, opponentId) => {
    const p = profileMap.get(opponentId);
    if (!p) return;
    results.push({
      opponentId,
      username: p.username,
      displayName: p.display_name,
      myWins: stats.myWins,
      theirWins: stats.theirWins,
      draws: stats.draws,
      total: stats.myWins + stats.theirWins + stats.draws,
      lastPlayed: stats.lastPlayed,
    });
  });

  return results.sort((a, b) => new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime());
}

export interface H2HSwaygerLog {
  id: string;
  title: string;
  category: string;
  date: string;
  myWon: boolean;
  isDraw: boolean;
  stake_units: number;
}

export interface CategoryH2HRecord {
  category: string;
  myWins: number;
  theirWins: number;
  draws: number;
}

export interface DetailedH2HResult {
  overall: { myWins: number; theirWins: number; draws: number; total: number };
  byCategory: CategoryH2HRecord[];
  log: H2HSwaygerLog[];
  opponentUsername: string;
  opponentDisplayName: string | null;
}

export async function fetchDetailedH2H(myId: string, opponentId: string): Promise<DetailedH2HResult> {
  const [swaygerResult, profileResult] = await Promise.all([
    supabase
      .from("swaygers")
      .select("id, title, category, settled_outcome, creator_id, opponent_id, stake_units, updated_at")
      .eq("status", "settled")
      .not("settled_outcome", "is", null)
      .or(
        `and(creator_id.eq.${myId},opponent_id.eq.${opponentId}),and(creator_id.eq.${opponentId},opponent_id.eq.${myId})`,
      )
      .order("updated_at", { ascending: false }),
    supabase.from("profiles").select("username, display_name").eq("id", opponentId).single(),
  ]);

  const data = swaygerResult.data || [];
  const profile = profileResult.data;

  let myWins = 0,
    theirWins = 0,
    draws = 0;
  const categoryMap = new Map<string, { myWins: number; theirWins: number; draws: number }>();
  const log: H2HSwaygerLog[] = [];

  for (const s of data) {
    const cat = s.category || "Other";
    if (!categoryMap.has(cat)) categoryMap.set(cat, { myWins: 0, theirWins: 0, draws: 0 });
    const catEntry = categoryMap.get(cat)!;
    const isDraw = s.settled_outcome === "draw" || s.settled_outcome === "no_contest";
    const myWon =
      !isDraw &&
      ((s.creator_id === myId && s.settled_outcome === "creator") ||
        (s.opponent_id === myId && s.settled_outcome === "opponent"));

    if (isDraw) {
      draws++;
      catEntry.draws++;
    } else if (myWon) {
      myWins++;
      catEntry.myWins++;
    } else {
      theirWins++;
      catEntry.theirWins++;
    }

    log.push({
      id: s.id,
      title: s.title,
      category: cat,
      date: s.updated_at,
      myWon,
      isDraw,
      stake_units: s.stake_units || 1,
    });
  }

  const byCategory: CategoryH2HRecord[] = Array.from(categoryMap.entries())
    .map(([category, stats]) => ({ category, ...stats }))
    .sort((a, b) => b.myWins + b.theirWins + b.draws - (a.myWins + a.theirWins + a.draws));

  return {
    overall: { myWins, theirWins, draws, total: myWins + theirWins + draws },
    byCategory,
    log,
    opponentUsername: profile?.username || "unknown",
    opponentDisplayName: profile?.display_name || null,
  };
}

export async function fetchHeadToHead(
  userId: string,
  opponentId: string,
): Promise<{ myWins: number; theirWins: number; draws: number }> {
  const { data, error } = await supabase
    .from("swaygers")
    .select("creator_id, opponent_id, settled_outcome")
    .eq("status", "settled")
    .or(
      `and(creator_id.eq.${userId},opponent_id.eq.${opponentId}),and(creator_id.eq.${opponentId},opponent_id.eq.${userId})`,
    );

  if (error || !data) return { myWins: 0, theirWins: 0, draws: 0 };

  let myWins = 0,
    theirWins = 0,
    draws = 0;
  for (const s of data) {
    if (s.settled_outcome === "draw" || s.settled_outcome === "no_contest") {
      draws++;
    } else if (
      (s.creator_id === userId && s.settled_outcome === "creator") ||
      (s.opponent_id === userId && s.settled_outcome === "opponent")
    ) {
      myWins++;
    } else {
      theirWins++;
    }
  }
  return { myWins, theirWins, draws };
}
