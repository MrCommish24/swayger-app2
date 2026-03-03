export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  owner_id: string;
  name: string;
  scoring_type: string;
  invite_code: string;
  created_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
}

export interface WorkspaceMemberWithProfile extends WorkspaceMember {
  profiles: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface WorkspaceWithRole extends Workspace {
  role: "owner" | "editor" | "viewer";
}

export interface Swayger {
  id: string;
  title: string;
  description: string | null;
  creator_id: string;
  opponent_id: string | null;
  category_id: string | null;
  status: string;
  stake_units: number | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string | null;
  created_at: string;
}
