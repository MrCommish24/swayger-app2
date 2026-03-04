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
  status: string;
  stake_text: string | null;
  created_at: string;
}

export interface SwaygerLeg {
  id: string;
  swayger_id: string;
  created_by: string;
  market_type: string;
  selection: string;
  odds: string | null;
  line: string | null;
  notes: string | null;
  created_at: string;
}

export interface SwaygerResponse {
  id: string;
  swayger_id: string;
  user_id: string;
  response: "accepted" | "declined";
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

export interface LegInput {
  market_type: string;
  selection: string;
  odds: string;
  line: string;
}
