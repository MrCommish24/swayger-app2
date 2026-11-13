import { gamedayFetch } from "@/lib/gameday-api";
import type { Session } from "@supabase/supabase-js";

export type HistoryState = "final" | "results_pending";

export interface GameDayHistoryRoom {
  room_id: string;
  room_code: string | null;
  room_name: string;
  team_a_name: string | null;
  team_b_name: string | null;
  game_date: string | null;
  created_at: string;
  source: string;
  community_context: string | null;
  sport: string | null;
  template_type: string | null;
  status: string;
  archived: boolean;
  is_private: boolean;
}

export interface GameDayHistoryParticipant {
  participant_id: string;
  display_name: string;
  game_day_sp: number | null;
  correct_picks: number;
  pending_picks: number;
  total_picks: number;
  submitted_picks: number;
  rank: number | null;
  is_winner: boolean;
}

export interface GameDayHistoryScoring {
  format: "standard_game_day" | "madden_weekly_pick_card" | "unsupported_custom";
  win_condition: "all_correct" | "most_correct" | "most_correct_ties_share_first" | null;
  unit: "SP" | null;
  points_per_correct_main_pick: number | null;
  scored_prop_count: number;
  all_scoring_props_settled: boolean;
}

export interface GameDayHistoryStanding {
  participant_id: string;
  display_name: string;
  game_day_sp: number;
  correct_picks: number;
  pending_picks: number;
  total_picks: number;
  submitted_picks: number;
  rank: number;
  is_winner: boolean;
}

export interface GameDayHistoryProp {
  prop_id: string;
  question: string;
  answer_options: string[];
  line_text: string | null;
  prop_role: "main_matchup" | "bonus_game" | "bonus_total" | string;
  answer_type: "choice" | "integer" | string;
  status: string;
  correct_answers: {
    answer_ids: string[];
    numeric_answer: number | null;
  } | null;
  own_pick: {
    selected_answer: string | null;
    numeric_answer: number | null;
    outcome: "correct" | "incorrect" | "pending";
  } | null;
}

export interface GameDayHistoryCard {
  card_id: string;
  title: string;
  phase: string;
  status: string;
  display_order: number;
  props: GameDayHistoryProp[];
}

export interface GameDayHistoryRecord {
  room: GameDayHistoryRoom;
  state: HistoryState;
  participant_count: number;
  participant: GameDayHistoryParticipant;
  scoring: GameDayHistoryScoring;
  final_standings: GameDayHistoryStanding[] | null;
  cards: GameDayHistoryCard[];
}

export async function getMyGameDayHistory(session: Session) {
  return gamedayFetch<{ records: GameDayHistoryRecord[] }>(
    "/api/gameday/my-history",
    {},
    { session },
  );
}

export async function getMyGameDayHistoryRecord(session: Session, roomRef: string) {
  const safeRef = encodeURIComponent(roomRef);
  return gamedayFetch<{ record: GameDayHistoryRecord }>(
    `/api/gameday/my-history/${safeRef}`,
    {},
    { session },
  );
}

export function formatHistoryDate(value: string | null | undefined) {
  if (!value) return "Date unavailable";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function historyContext(room: GameDayHistoryRoom) {
  const matchup = room.team_a_name && room.team_b_name
    ? `${room.team_a_name} vs ${room.team_b_name}`
    : null;
  const date = formatHistoryDate(room.game_date || room.created_at);
  return [matchup, date, room.community_context, room.room_code]
    .filter(Boolean)
    .join(" · ");
}
