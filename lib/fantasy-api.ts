import { fetch } from "expo/fetch";
import { Session } from "@supabase/supabase-js";
import { getApiUrl } from "@/lib/query-client";

// ── Fetch helper ───────────────────────────────────────────────────────────────

export async function fantasyFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  auth: { session?: Session | null; guestToken?: string | null } = {}
): Promise<T> {
  const url = new URL(path, getApiUrl()).toString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (auth.session?.access_token) {
    headers["Authorization"] = `Bearer ${auth.session.access_token}`;
  } else if (auth.guestToken) {
    headers["X-Fantasy-Guest-Token"] = auth.guestToken;
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

// ── Types ──────────────────────────────────────────────────────────────────────

export type FantasySport = "football" | "basketball" | "baseball";

export const FANTASY_SPORTS: { value: FantasySport; label: string; emoji: string }[] = [
  { value: "football",   label: "Football",   emoji: "🏈" },
  { value: "basketball", label: "Basketball", emoji: "🏀" },
  { value: "baseball",   label: "Baseball",   emoji: "⚾" },
];

// POST /api/fantasy/leagues/setup
export interface SetupLeaguePayload {
  league_name: string;
  sport: FantasySport;
  display_name: string;
  season_year: number;
  reward_description?: string;
  reward_amount_display?: string;
}

export interface SetupLeagueResponse {
  league_id: string;
  league_member_id: string;
  claim_id: string;
  season_id: string;
  season_member_id: string;
  /** Commissioner's team — created atomically in setup_fantasy_league v2 */
  team_id: string;
  manager_id: string;
}

// POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/participants
//
// Requires the Idempotency-Key header — one UUID per intentional add-member
// operation, persisted by the client until success is confirmed.  The server
// replays the original result (same IDs) for retries with the same key.
export interface AddParticipantPayload {
  display_name: string;
  team_name: string;
  // league_member_id intentionally omitted: identity is established by the
  // idempotency key, not by a pre-existing league_member row.
}

export interface AddParticipantResponse {
  already_exists: boolean;
  league_member_id: string;
  season_member_id: string;
  team_id: string;
  manager_id: string | null;
  /** False when member was added as "League Only" after Draft Day picks exist. */
  draft_day_eligible: boolean;
}

// GET /api/fantasy/leagues
export interface FantasyLeagueSeason {
  id: string;
  season_year: number;
  status: "upcoming" | "active" | "completed" | "archived";
}

export interface FantasyLeague {
  id: string;
  league_name: string;
  sport: FantasySport;
  is_active: boolean;
  created_at: string;
  fantasy_league_seasons: FantasyLeagueSeason[];
}

// GET /api/fantasy/leagues/:leagueId/seasons/:seasonId
export interface FantasyParticipant {
  season_member_id: string;
  league_member_id: string | null;
  display_name: string | null;
  role: "commissioner" | "co_commissioner" | "member";
  team_id: string | null;
  team_name: string | null;
  manager_id: string | null;
  manager_role: string | null;
  /** Whether this seat has an active claim. Populated by GET /seasons/:id. */
  is_claimed: boolean;
}

/** The authenticated/guest caller's identity within this league. Null if no claim. */
export interface FantasyViewer {
  league_member_id: string;
  season_member_id: string;
  display_name: string | null;
  team_name: string | null;
  role: "commissioner" | "co_commissioner" | "member";
}

export interface FantasySeasonDetail {
  league: {
    id: string;
    league_name: string;
    sport: FantasySport;
    is_active: boolean;
  };
  season: {
    id: string;
    season_year: number;
    status: string;
    default_reward_description: string | null;
    default_reward_amount_display: string | null;
  };
  participants: FantasyParticipant[];
  /** Caller's role and team in this league. Null if they have no active claim. */
  viewer: FantasyViewer | null;
}

// GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/join-info
export interface JoinInfoSeat {
  season_member_id: string;
  league_member_id: string | null;
  display_name: string | null;
  team_name: string | null;
  role: "commissioner" | "co_commissioner" | "member";
  /** True if any identity holds an active claim on this seat. */
  is_claimed: boolean;
  /** True if the current caller holds the claim on this seat. */
  is_mine: boolean;
}

export interface JoinInfo {
  league: {
    id: string;
    league_name: string;
    sport: FantasySport;
    is_active: boolean;
  };
  season: {
    id: string;
    season_year: number;
    status: string;
    default_reward_description: string | null;
    default_reward_amount_display: string | null;
  };
  seats: JoinInfoSeat[];
  /** Pre-identified caller seat. Non-null → skip seat selection in UI. */
  my_seat: FantasyViewer | null;
}

// AsyncStorage key for explicit upgrade intent.
// Written when the guest taps "Create Account / Sign In" from the welcome banner;
// read once when session appears on the hub; cleared immediately after firing.
// Only the specific claim the user consented to upgrade is transferred.
export const FANTASY_PENDING_UPGRADE_KEY = "fantasy_pending_claim_upgrade";
export interface FantasyPendingUpgrade {
  guest_token: string;
  league_member_id: string;
}

// PATCH /api/fantasy/leagues/:leagueId/seasons/:seasonId/members/:seasonMemberId
export interface UpdateMemberPayload {
  display_name: string;
  team_name: string;
}

export interface UpdateMemberResponse {
  league_member_id: string;
  team_id: string | null;
  props_updated: number;
  participant_updated: boolean;
}

export async function updateMember(
  leagueId: string,
  seasonId: string,
  seasonMemberId: string,
  payload: UpdateMemberPayload,
  auth: { session?: Session | null; guestToken?: string | null }
): Promise<UpdateMemberResponse> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/members/${seasonMemberId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    auth
  );
}

// POST /api/fantasy/claim/upgrade
export async function upgradeGuestClaim(
  guestToken: string,
  leagueMemberId: string,
  auth: { session: NonNullable<Parameters<typeof fantasyFetch>[2]["session"]> }
): Promise<{ claim_id: string; league_member_id: string; upgraded: boolean; already_upgraded?: boolean }> {
  return fantasyFetch(
    "/api/fantasy/claim/upgrade",
    {
      method: "POST",
      body: JSON.stringify({ guest_token: guestToken, league_member_id: leagueMemberId }),
    },
    auth
  );
}

// ── Draft Day ─────────────────────────────────────────────────────────────────

export interface DraftDayTemplate {
  id: string;
  question: string;
  scoring_scope: "competition" | "season";
  point_value: number;
  answer_target_type: "season_member" | "fantasy_team" | "yes_no" | "static" | null;
  settlement_window: string;
  is_default: boolean;
  display_order: number;
  /** When true, publish appends { id:"no_one", label:"No one", type:"static" } to answer_options */
  supports_no_one: boolean;
}

export interface DraftDayTemplates {
  sport: string;
  competition: DraftDayTemplate[];
  season: DraftDayTemplate[];
}

// One entry in the current_props list returned by GET /draft-day.
// Represents a snapshot of a currently-selected template with its library
// metadata. is_active reflects the template's current state in the library —
// false means the template was deactivated after this Draft Day was published.
export interface DraftDayCurrentProp {
  template_prop_id: string;
  question: string;
  scoring_scope: string;
  point_value: number;
  is_active: boolean;
  supports_no_one: boolean;
}

export interface DraftDayStatus {
  room_id: string;
  card_id: string;
  room_code: string | null;
  room_status: "draft" | "active" | "finalized";
  card_status: "closed" | "open" | "locked" | "settled";
  prop_counts: { competition: number; season: number };
  // How many competition-scope props have been settled so far.
  // Used by the hub to drive settlement CTAs and progress display.
  settled_competition_count: number;
  // Global: total picks submitted by ALL members for this card's props.
  // Used for the fairness invariant — commissioner cannot edit when > 0.
  pick_count: number;
  // Viewer-specific: picks belonging to the current caller's participant only.
  // Used for the member hub CTA label (Make My Picks vs View / Update My Picks).
  // 0 when the caller has no participant row yet (first visit, pre-play).
  my_pick_count: number;
  // Number of times the open roster has been expanded (member added while open).
  // Incremented atomically by the RPC; used to detect stale picks.
  roster_revision?: number;
  // Currently selected props with library metadata. Used by manage mode to
  // reconstruct the commissioner's selection, including inactive legacy props.
  current_props: DraftDayCurrentProp[];
  created_at: string;
}

export interface DraftDayPublishResult {
  room_id: string;
  card_id: string;
  room_code: string | null;
  already_existed: boolean;
}

// GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/templates
export async function getDraftDayTemplates(
  leagueId: string,
  seasonId: string,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<DraftDayTemplates> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/draft-day/templates`,
    {},
    auth
  );
}

// GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day
export async function getDraftDay(
  leagueId: string,
  seasonId: string,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<DraftDayStatus | null> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/draft-day`,
    {},
    auth
  );
}

// POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/publish
export async function publishDraftDay(
  leagueId: string,
  seasonId: string,
  selectedPropIds: string[],
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<DraftDayPublishResult> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/draft-day/publish`,
    { method: "POST", body: JSON.stringify({ selected_prop_ids: selectedPropIds }) },
    auth
  );
}

// PATCH /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/props
// Commissioner-only. Atomically replaces props when card is 'open' + zero picks.
export async function updateDraftDayProps(
  leagueId: string,
  seasonId: string,
  selectedPropIds: string[],
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<{ prop_counts: { competition: number; season: number } }> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/draft-day/props`,
    { method: "PATCH", body: JSON.stringify({ selected_prop_ids: selectedPropIds }) },
    auth
  );
}

// POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/lock
export async function lockDraftDay(
  leagueId: string,
  seasonId: string,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<{ card_status: string; already_locked: boolean }> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/draft-day/lock`,
    { method: "POST" },
    auth
  );
}

// POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/unlock
export async function unlockDraftDay(
  leagueId: string,
  seasonId: string,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<{ card_status: string; already_unlocked: boolean }> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/draft-day/unlock`,
    { method: "POST" },
    auth
  );
}

// ── Draft Day Play (Phase 4B) ─────────────────────────────────────────────────

/** A single published answer choice for a Draft Day prop. */
export interface DraftDayAnswerOption {
  id: string;
  label: string;
  type: "season_member" | "fantasy_team" | "player" | "yes_no" | "static";
}

/** A published prop returned in the play state. */
export interface DraftDayProp {
  id: string;
  question: string;
  answer_options: DraftDayAnswerOption[];
  scoring_scope: "competition" | "season";
  point_value: number;
}

/**
 * Member-specific play state returned by GET /draft-day/play.
 * correct_answer is never included — server strips it.
 */
export interface DraftDayPlayState {
  room_id: string;
  card_id: string;
  room_code: string | null;
  card_status: "open" | "locked" | "settled";
  // How many times the open roster has expanded since the card was published.
  // A value > 0 means new members were added while picks were already in flight.
  roster_revision: number;
  // Prop IDs of roster-target questions where this viewer's saved pick
  // pre-dates the latest roster expansion (answer_universe_revision < roster_revision).
  // Empty when roster_revision === 0 or the viewer has no stale picks.
  stale_pick_prop_ids: string[];
  participant_id: string;
  props: DraftDayProp[];
  /** propId → selected answerId for this viewer's picks */
  my_picks: Record<string, string>;
  my_pick_count: number;
  total_props: number;
  pick_count: number; // global, for informational use
  league_name?: string | null;
}

// GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/play
export async function getDraftDayPlay(
  leagueId: string,
  seasonId: string,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<DraftDayPlayState> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/draft-day/play`,
    { method: "GET" },
    auth
  );
}

// POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/picks
export async function submitDraftDayPick(
  leagueId: string,
  seasonId: string,
  propId: string,
  selectedAnswer: string,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<{ pick_id: string; prop_id: string; selected_answer: string }> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/draft-day/picks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prop_id: propId, selected_answer: selectedAnswer }),
    },
    auth
  );
}

// ── Phase 4C: Draft Day Settlement & Results ──────────────────────────────────

/** A competition prop returned by GET /draft-day/settlement. */
export interface DraftDaySettlementProp {
  id: string;
  question: string;
  display_order: number;
  point_value: number;
  scoring_scope: "competition" | "season";
  status: "pending" | "settled";
  correct_answer: string | null;
  answer_options: DraftDayAnswerOption[];
}

export interface DraftDaySettlementLeaderboardEntry {
  participant_id: string;
  season_member_id: string | null;
  display_name: string;
  team_name: string | null;
  points: number;
  correct_count: number;
  rank: number;
  rank_label: string;
}

export interface DraftDaySettlementState {
  room_id: string;
  card_id: string;
  card_status: string;
  room_status: string;
  competition_props: DraftDaySettlementProp[];
  settled_count: number;
  total_competition_count: number;
  all_settled: boolean;
  preview_leaderboard: DraftDaySettlementLeaderboardEntry[];
}

export interface DraftDayResultsPickEntry {
  prop_id: string;
  question: string;
  display_order: number;
  point_value: number;
  my_answer_id: string | null;
  my_answer_label: string | null;
  correct_answer_id: string | null;
  correct_answer_label: string | null;
  is_correct: boolean | null;
  points_earned: number;
}

export interface DraftDayResultsLeaderboardEntry {
  participant_id: string;
  season_member_id: string | null;
  display_name: string;
  team_name: string | null;
  points: number;
  correct_count: number;
  rank: number;
  rank_label: string;
}

export interface DraftDayResults {
  finalized: boolean;
  league_name?: string | null;
  season_year?: number | null;
  winners?: Array<{
    display_name: string;
    team_name: string | null;
    points: number;
    rank_label: string;
  }>;
  leaderboard?: DraftDayResultsLeaderboardEntry[];
  my_competition_picks?: DraftDayResultsPickEntry[];
  my_total_points?: number;
  my_correct_count?: number;
  my_season_pick_count?: number;
  season_props_pending_count?: number;
  total_competition_props?: number;
}

// GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/settlement
export async function getDraftDaySettlement(
  leagueId: string,
  seasonId: string,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<DraftDaySettlementState> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/draft-day/settlement`,
    {},
    auth
  );
}

// POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/settle
export async function settleDraftDayProp(
  leagueId: string,
  seasonId: string,
  propId: string,
  correctAnswer: string,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<{ ok: boolean; idempotent: boolean; was_correction: boolean; prop_id: string; correct_answer: string; scoring_scope: string; card_auto_settled: boolean }> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/draft-day/settle`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prop_id: propId, correct_answer: correctAnswer }),
    },
    auth
  );
}

// POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/finalize
export async function finalizeDraftDay(
  leagueId: string,
  seasonId: string,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<{ ok: boolean; already_finalized: boolean }> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/draft-day/finalize`,
    { method: "POST" },
    auth
  );
}

// GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/results
export async function getDraftDayResults(
  leagueId: string,
  seasonId: string,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<DraftDayResults> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/draft-day/results`,
    {},
    auth
  );
}

// PATCH /api/fantasy/leagues/:leagueId — commissioner-only league rename
export async function updateLeagueName(
  leagueId: string,
  leagueName: string,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<{ id: string; league_name: string }> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league_name: leagueName }),
    },
    auth
  );
}

// ── Phase 5: Weekly Competitions ──────────────────────────────────────────────

/** A weekly prop template returned by GET /weeks/:weekNumber/templates */
export interface WeeklyTemplate {
  id: string;
  question: string;
  scoring_scope: "competition";
  point_value: number;
  answer_target_type: "season_member" | "fantasy_team" | "yes_no" | "static" | null;
  settlement_window: string;
  is_default: boolean;
  display_order: number;
  supports_no_one: boolean;
}

export interface WeeklyTemplates {
  sport: string;
  week_number: number;
  templates: WeeklyTemplate[];
}

// GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/templates
export async function getWeeklyTemplates(
  leagueId: string,
  seasonId: string,
  weekNumber: number,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<WeeklyTemplates> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/${weekNumber}/templates`,
    {},
    auth
  );
}

export interface WeeklyPublishResult {
  room_id: string;
  card_id: string;
  room_code: string | null;
  already_existed: boolean;
  week_number: number;
}

// POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/publish
export async function publishWeekly(
  leagueId: string,
  seasonId: string,
  weekNumber: number,
  selectedPropIds: string[],
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<WeeklyPublishResult> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/${weekNumber}/publish`,
    { method: "POST", body: JSON.stringify({ selected_prop_ids: selectedPropIds }) },
    auth
  );
}

/** Hub state for a weekly competition. Null when not yet published. */
export interface WeeklyParticipantStatus {
  season_member_id: string;
  display_name: string | null;
  has_played: boolean;
}

export interface WeeklyStatus {
  room_id: string;
  card_id: string;
  room_code: string | null;
  room_status: "draft" | "active" | "finalized";
  card_status: "closed" | "open" | "locked" | "settled";
  week_number: number;
  prop_count: number;
  settled_count: number;
  all_settled: boolean;
  pick_count: number;
  my_pick_count: number;
  // Phase 5.1: participation data
  eligible_count: number;
  played_count: number;
  waiting_count: number;
  participants_status?: WeeklyParticipantStatus[]; // commissioner-only
  created_at: string;
}

/** Compact summary row for a finalized past week (no participation detail needed). */
export interface PastWeekSummary {
  week_number:   number;
  room_id:       string;
  card_id:       string | null;
  room_status:   "draft" | "active" | "finalized";
  card_status:   "closed" | "open" | "locked" | "settled";
  prop_count:    number;
  settled_count: number;
  all_settled:   boolean;
  pick_count:    number;
  created_at:    string;
}

/** Season-level weekly summary — one request serves all weeks. */
export interface WeeklySummaryResponse {
  /** Latest published weekly room (with full participation data). null if no weeks published yet. */
  current_week:     WeeklyStatus | null;
  /** All finalized weekly rooms before the current week (compact — no participation detail). */
  past_weeks:       PastWeekSummary[];
  /** The week number the commissioner should create next. */
  next_week_number: number;
  /** True when the current week is finalized (previous week finalized gate satisfied). */
  can_create_next:  boolean;
}

// GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/weekly-summary
export async function getWeeklySummary(
  leagueId: string,
  seasonId: string,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<WeeklySummaryResponse> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weekly-summary`,
    {},
    auth
  );
}

// GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber
export async function getWeekStatus(
  leagueId: string,
  seasonId: string,
  weekNumber: number,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<WeeklyStatus | null> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/${weekNumber}`,
    {},
    auth
  );
}

// POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/lock
export async function lockWeekly(
  leagueId: string,
  seasonId: string,
  weekNumber: number,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<{ card_status: string; already_locked: boolean }> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/${weekNumber}/lock`,
    { method: "POST" },
    auth
  );
}

// POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/unlock
export async function unlockWeekly(
  leagueId: string,
  seasonId: string,
  weekNumber: number,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<{ card_status: string; already_unlocked: boolean }> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/${weekNumber}/unlock`,
    { method: "POST" },
    auth
  );
}

// POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/finalize
export async function finalizeWeekly(
  leagueId: string,
  seasonId: string,
  weekNumber: number,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<{ ok: boolean; already_finalized: boolean }> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/${weekNumber}/finalize`,
    { method: "POST" },
    auth
  );
}

/** Member play state returned by GET /weeks/:weekNumber/play */
export interface WeeklyPlayState {
  room_id: string;
  card_id: string;
  room_code: string | null;
  room_status: "draft" | "active" | "finalized";
  card_status: "open" | "locked" | "settled";
  week_number: number;
  roster_revision: number;
  stale_pick_prop_ids: string[];
  participant_id: string;
  props: DraftDayProp[];
  my_picks: Record<string, string>;
  my_pick_count: number;
  total_props: number;
  league_name?: string | null;
}

/** Build a direct shareable URL to the weekly pick screen */
export function buildWeekUrl(
  leagueId: string,
  seasonId: string,
  weekNumber: number,
  domainOverride?: string
): string {
  const path = `/fantasy/weeks/${leagueId}/${seasonId}/${weekNumber}/play`;
  // Web
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  // Native: use injected env var (set by expo start script to REPLIT_DEV_DOMAIN, prod uses www.swayger.app)
  const domain = domainOverride ?? (typeof process !== "undefined" ? (process.env.EXPO_PUBLIC_DOMAIN ?? "") : "");
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  return `${base}${path}`;
}

// GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/play
export async function getWeeklyPlay(
  leagueId: string,
  seasonId: string,
  weekNumber: number,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<WeeklyPlayState> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/${weekNumber}/play`,
    {},
    auth
  );
}

// POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/picks
export async function submitWeeklyPick(
  leagueId: string,
  seasonId: string,
  weekNumber: number,
  propId: string,
  selectedAnswer: string,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<{ pick_id: string; prop_id: string; selected_answer: string }> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/${weekNumber}/picks`,
    { method: "POST", body: JSON.stringify({ prop_id: propId, selected_answer: selectedAnswer }) },
    auth
  );
}

/** A competition prop returned by GET /weeks/:weekNumber/settlement */
export interface WeeklySettlementProp {
  id: string;
  question: string;
  display_order: number;
  point_value: number;
  scoring_scope: "competition";
  status: "pending" | "settled";
  correct_answer: string | null;
  answer_options: DraftDayAnswerOption[];
}

export interface WeeklySettlementState {
  room_id: string;
  card_id: string;
  card_status: string;
  room_status: string;
  week_number: number;
  competition_props: WeeklySettlementProp[];
  settled_count: number;
  total_competition_count: number;
  all_settled: boolean;
  preview_leaderboard: DraftDaySettlementLeaderboardEntry[];
}

// GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/settlement
export async function getWeeklySettlement(
  leagueId: string,
  seasonId: string,
  weekNumber: number,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<WeeklySettlementState> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/${weekNumber}/settlement`,
    {},
    auth
  );
}

// POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/settle
export async function settleWeeklyProp(
  leagueId: string,
  seasonId: string,
  weekNumber: number,
  propId: string,
  correctAnswer: string,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<{ ok: boolean; idempotent: boolean; was_correction: boolean; prop_id: string; correct_answer: string; card_auto_settled: boolean }> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/${weekNumber}/settle`,
    { method: "POST", body: JSON.stringify({ prop_id: propId, correct_answer: correctAnswer }) },
    auth
  );
}

export interface WeeklyResultsPickEntry {
  prop_id: string;
  question: string;
  display_order: number;
  point_value: number;
  my_answer_id: string | null;
  my_answer_label: string | null;
  correct_answer_id: string | null;
  correct_answer_label: string | null;
  is_correct: boolean | null;
  points_earned: number;
}

export interface WeeklyResults {
  finalized: boolean;
  week_number?: number;
  league_name?: string | null;
  season_year?: number | null;
  winners?: Array<{ display_name: string; team_name: string | null; points: number; rank_label: string }>;
  leaderboard?: DraftDayResultsLeaderboardEntry[];
  my_competition_picks?: WeeklyResultsPickEntry[];
  my_total_points?: number;
  my_correct_count?: number;
  total_competition_props?: number;
}

// GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/results
export async function getWeeklyResults(
  leagueId: string,
  seasonId: string,
  weekNumber: number,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<WeeklyResults> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/${weekNumber}/results`,
    {},
    auth
  );
}

// ── Phase 5: Season Standings ──────────────────────────────────────────────────

export interface SeasonStandingEntry {
  rank: number;
  rank_label: string;
  season_member_id: string;
  display_name: string | null;
  fantasy_team_id: string | null;
  team_name: string | null;
  total_points: number;
  draft_day_points: number;
  weekly_points: number;
  competitions_played: number;
  weekly_wins: number;
}

export interface FinalizedCompetition {
  room_id: string;
  competition_type: "draft_day" | "weekly";
  week_number: number | null;
  label: string;
}

export interface SeasonStandings {
  league_name: string | null;
  season_year: number | null;
  finalized_competitions: FinalizedCompetition[];
  standings: SeasonStandingEntry[];
}

// GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/standings
export async function getSeasonStandings(
  leagueId: string,
  seasonId: string,
  auth: Parameters<typeof fantasyFetch>[2]
): Promise<SeasonStandings> {
  return fantasyFetch(
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/standings`,
    {},
    auth
  );
}

// POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/claim
export interface ClaimSeatPayload {
  league_member_id: string;
}

export interface ClaimSeatResponse {
  claim_id: string;
  league_member_id: string;
  season_member_id: string;
  display_name: string | null;
  team_name: string | null;
  role: "commissioner" | "co_commissioner" | "member";
  already_existed: boolean;
}
