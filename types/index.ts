export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type SwaygerStatus =
  | "pending_invite"
  | "active"
  | "settlement_proposed"
  | "settled"
  | "declined"
  | "canceled"
  | "expired"
  | "expired_active";

export interface SwaygerData {
  id: string;
  owner_id: string;
  opponent_id: string | null;
  name: string;
  description: string | null;
  category: string;
  stake_units: number;
  creator_pick: string | null;
  opponent_pick: string | null;
  status: SwaygerStatus;
  invite_code: string;
  expires_at: string | null;
  source_swayger_id: string | null;
  rematch_type: string | null;
  settled_outcome: string | null;
  scoring_type: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface SwaygerWithRole extends SwaygerData {
  role: "owner" | "editor" | "viewer";
}

export interface SettlementProposal {
  id: string;
  swayger_id: string;
  proposed_by: string;
  outcome: "creator" | "opponent" | "draw" | "no_contest";
  creator_confirmed: boolean;
  opponent_confirmed: boolean;
  created_at: string;
  updated_at: string | null;
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
