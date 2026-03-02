export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
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
