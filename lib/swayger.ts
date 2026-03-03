import { supabase } from "@/lib/supabase";
import {
  SwaygerData,
  SwaygerParticipantWithProfile,
  SwaygerWithRole,
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
  _userId: string
): Promise<{ swayger: SwaygerData | null; error: string | null }> {
  const inviteCode = await generateUniqueInviteCode();

  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: title.trim(),
    p_scoring_type: sport || "NFL",
    p_invite_code: inviteCode,
  });

  if (error) return { swayger: null, error: error.message };

  const swaygerId = data as string;

  const { data: swayger, error: fetchError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", swaygerId)
    .single();

  if (fetchError) return { swayger: null, error: fetchError.message };

  return { swayger: swayger as SwaygerData, error: null };
}

export async function fetchMySwaygers(
  userId: string
): Promise<SwaygerWithRole[]> {
  const { data: memberships, error: memError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId);

  if (memError || !memberships || memberships.length === 0) return [];

  const ids = memberships.map((m) => m.workspace_id);

  const { data: swaygers, error: wsError } = await supabase
    .from("workspaces")
    .select("*")
    .in("id", ids)
    .order("created_at", { ascending: false });

  if (wsError || !swaygers) return [];

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

  if (error) return null;
  return data as SwaygerData;
}

export async function fetchSwaygerParticipants(
  swaygerId: string
): Promise<SwaygerParticipantWithProfile[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("*, profiles(username, display_name, avatar_url)")
    .eq("workspace_id", swaygerId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as SwaygerParticipantWithProfile[];
}

export async function joinSwaygerByCode(
  inviteCode: string,
  _userId: string
): Promise<{ swaygerId: string | null; error: string | null; alreadyMember: boolean }> {
  const { data, error } = await supabase.rpc("join_workspace_by_code", {
    p_invite_code: inviteCode.trim().toUpperCase(),
  });

  if (error) return { swaygerId: null, error: error.message, alreadyMember: false };

  const result = data as { error: string | null; workspace_id: string | null; already_member: boolean };

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
