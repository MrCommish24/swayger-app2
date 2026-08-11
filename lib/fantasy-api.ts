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
export interface AddParticipantPayload {
  display_name: string;
  team_name: string;
  league_member_id?: string; // omit for new participants; supply for commissioner's own row
}

export interface AddParticipantResponse {
  already_exists: boolean;
  league_member_id: string;
  season_member_id: string;
  team_id: string;
  manager_id: string;
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
