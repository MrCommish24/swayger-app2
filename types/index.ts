export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface SwaygerData {
  id: string;
  owner_id: string;
  name: string;
  scoring_type: string;
  invite_code: string;
  created_at: string;
}

export interface SwaygerParticipant {
  id: string;
  workspace_id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
}

export interface SwaygerParticipantWithProfile extends SwaygerParticipant {
  profiles: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface SwaygerWithRole extends SwaygerData {
  role: "owner" | "editor" | "viewer";
}
