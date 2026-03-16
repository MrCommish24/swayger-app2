export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
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
  creator_id: string;
  opponent_id: string | null;
  title: string;
  description: string | null;
  category: string;
  stake_units: number;
  stake_note: string | null;
  creator_pick: string;
  opponent_pick: string | null;
  status: SwaygerStatus;
  expires_at: string;
  source_swayger_id: string | null;
  rematch_type: string | null;
  settled_outcome: string | null;
  accepted_at: string | null;
  settled_at: string | null;
  cancelled_by: string | null;
  points_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserBalance {
  user_id: string;
  swayger_points: number;
  bankruptcy_used: boolean;
  created_at: string;
  updated_at: string;
}

export interface SwaygerInvite {
  id: string;
  swayger_id: string;
  invite_code: string;
  created_at: string;
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
