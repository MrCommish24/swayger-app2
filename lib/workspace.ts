import { supabase } from "@/lib/supabase";
import {
  Workspace,
  WorkspaceMemberWithProfile,
  WorkspaceWithRole,
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

export async function createWorkspace(
  name: string,
  scoringType: string,
  _userId: string
): Promise<{ workspace: Workspace | null; error: string | null }> {
  const inviteCode = await generateUniqueInviteCode();

  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: name.trim(),
    p_scoring_type: scoringType,
    p_invite_code: inviteCode,
  });

  if (error) return { workspace: null, error: error.message };

  const workspaceId = data as string;

  const { data: workspace, error: fetchError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single();

  if (fetchError) return { workspace: null, error: fetchError.message };

  return { workspace: workspace as Workspace, error: null };
}

export async function fetchMyWorkspaces(
  userId: string
): Promise<WorkspaceWithRole[]> {
  const { data: memberships, error: memError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId);

  if (memError || !memberships || memberships.length === 0) return [];

  const workspaceIds = memberships.map((m) => m.workspace_id);

  const { data: workspaces, error: wsError } = await supabase
    .from("workspaces")
    .select("*")
    .in("id", workspaceIds)
    .order("created_at", { ascending: false });

  if (wsError || !workspaces) return [];

  const roleMap = new Map(memberships.map((m) => [m.workspace_id, m.role]));

  return workspaces.map((ws) => ({
    ...(ws as Workspace),
    role: (roleMap.get(ws.id) ?? "viewer") as "owner" | "editor" | "viewer",
  }));
}

export async function fetchWorkspace(
  workspaceId: string
): Promise<Workspace | null> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single();

  if (error) return null;
  return data as Workspace;
}

export async function fetchWorkspaceMembers(
  workspaceId: string
): Promise<WorkspaceMemberWithProfile[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("*, profiles(username, display_name, avatar_url)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as WorkspaceMemberWithProfile[];
}

export async function joinWorkspaceByCode(
  inviteCode: string,
  _userId: string
): Promise<{ workspaceId: string | null; error: string | null; alreadyMember: boolean }> {
  const { data, error } = await supabase.rpc("join_workspace_by_code", {
    p_invite_code: inviteCode.trim().toUpperCase(),
  });

  if (error) return { workspaceId: null, error: error.message, alreadyMember: false };

  const result = data as { error: string | null; workspace_id: string | null; already_member: boolean };

  return {
    workspaceId: result.workspace_id,
    error: result.error,
    alreadyMember: result.already_member,
  };
}
