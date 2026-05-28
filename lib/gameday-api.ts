import { fetch } from "expo/fetch";
import { Session } from "@supabase/supabase-js";
import { getApiUrl } from "@/lib/query-client";

interface FetchOpts {
  session?: Session | null;
  guestSessionId?: string | null;
}

export async function gamedayFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  auth: FetchOpts = {}
): Promise<T> {
  const url = new URL(path, getApiUrl()).toString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (auth.session?.access_token) {
    headers["Authorization"] = `Bearer ${auth.session.access_token}`;
  }
  if (auth.guestSessionId) {
    headers["X-Guest-Session"] = auth.guestSessionId;
  }
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    let msg = text;
    try {
      const json = JSON.parse(text);
      msg = json.error ?? text;
    } catch { /* not json */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GDRoom {
  id: string;
  room_name: string;
  team_a_name: string;
  team_b_name: string;
  team_a_star: string;
  team_b_star: string;
  game_date: string | null;
  host_user_id: string | null;
  status: "draft" | "active" | "finalized";
  room_code?: string | null;
  is_private?: boolean;
  archived_at?: string | null;
}

export interface GDProp {
  id: string;
  card_id: string;
  question: string;
  answer_options: string[];
  correct_answer: string | null;
  status: "pending" | "settled";
  display_order: number;
}

export interface GDCard {
  id: string;
  room_id: string;
  title: string;
  phase: "pregame" | "halftime" | "fourth";
  status: "closed" | "open" | "locked" | "settled";
  display_order: number;
  lock_label: string | null;
  gameday_props: GDProp[];
}

export interface GDParticipant {
  id: string;
  room_id: string;
  user_id: string | null;
  guest_session_id: string | null;
  display_name: string;
  is_guest: boolean;
}

export interface GDLeaderboardEntry {
  participant_id: string;
  display_name: string;
  is_guest: boolean;
  game_day_sp: number;
  correct_picks: number;
  pending_picks: number;
  total_picks: number;
  rank: number;
}

export interface GDRoomResponse {
  room: GDRoom;
  cards: GDCard[];
  participant: GDParticipant | null;
  my_picks: Record<string, string>;
  revealed_picks: Record<string, Record<string, string[]>>;
  participant_count: number;
}

export interface GDPropTemplate {
  id: string;
  phase: "pregame" | "halftime" | "fourth";
  question: string;
  answers: string[];
  settlement_window?: string;
}
