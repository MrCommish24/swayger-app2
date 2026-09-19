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
  team_a_name: string | null;
  team_b_name: string | null;
  team_a_star: string | null;
  team_b_star: string | null;
  game_date: string | null;
  /** Present on authenticated host-data responses; intentionally omitted from public room data. */
  host_user_id?: string | null;
  status: "draft" | "active" | "finalized";
  room_code?: string | null;
  is_private?: boolean;
  archived_at?: string | null;
  /** "app" | "discord" — how the room was originally created */
  source?: string | null;
  /** "nba" | "soccer" | "nfl" | "madden"; absent on rooms created before sport support. */
  sport?: "nba" | "soccer" | "nfl" | "madden" | null;
  /** Explicit Game Day format. */
  template_type?: "nfl_single_game" | "nfl_sunday_slate" | "weekly_pick_card" | null;
  format_config?: {
    week_label?: string;
    reward_text?: string;
    deadline_display_text?: string | null;
    minimum_matchups?: number;
    scoring_mode?: "all_correct" | "most_correct";
    bonus?: {
      enabled?: boolean;
      label?: string;
      answer_options?: string[];
    };
  } | null;
  /** Public Slate candidate context; resolved options are always stored on each prop. */
  slate_config?: {
    early_matchups?: string[];
    late_matchups?: string[];
    sunday_night_teams?: [string, string];
    qb_candidates?: string[];
    rb_candidates?: string[];
    receiver_candidates?: string[];
    team_candidates?: string[];
    game_candidates?: string[];
  } | null;
  countdown_phase?: string | null;
  countdown_type?: "opens_soon" | "locks_soon" | null;
  countdown_ends_at?: string | null;
  countdown_started_at?: string | null;
}

export interface GDProp {
  id: string;
  card_id: string;
  question: string;
  answer_options: string[];
  line_text?: string | null;
  correct_answer: string | null;
  status: "pending" | "settled";
  display_order: number;
}

export interface GDCard {
  id: string;
  room_id: string;
  title: string;
  phase: string;
  status: "closed" | "open" | "locked" | "settled";
  display_order: number;
  lock_label: string | null;
  scheduled_open_at?: string | null;
  scheduled_lock_at?: string | null;
  /** Server-authoritative write state. False after the deadline even if the card remains open for manual reveal. */
  can_edit_picks?: boolean;
  deadline_passed?: boolean;
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
  submitted_picks?: number;
  rank: number;
  is_winner?: boolean;
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
  phase: "pregame" | "halftime" | "fourth" | "final_push" | "penalties";
  question: string;
  answers: string[];
  settlement_window?: string;
}
