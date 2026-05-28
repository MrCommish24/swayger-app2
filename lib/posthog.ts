import PostHog from "posthog-react-native";

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST = "https://us.i.posthog.com";

let _client: PostHog | null = null;

export function getPostHog(): PostHog | null {
  if (!POSTHOG_KEY) return null;
  if (!_client) {
    _client = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      flushAt: 10,
      flushInterval: 5000,
    });
  }
  return _client;
}

// ─── Identity ────────────────────────────────────────────────────────────────

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  getPostHog()?.identify(userId, properties);
}

export function resetUser() {
  getPostHog()?.reset();
}

// ─── Event helpers ────────────────────────────────────────────────────────────

export function capture(event: string, properties?: Record<string, unknown>) {
  getPostHog()?.capture(event, properties);
}

// ─── Screen tracking ─────────────────────────────────────────────────────────

export function trackScreen(screenName: string, properties?: Record<string, unknown>) {
  getPostHog()?.screen(screenName, properties);
}

// ─── Named events ────────────────────────────────────────────────────────────
// Centralised so event names stay consistent across the codebase.

// ── Game Day context types ────────────────────────────────────────────────────

/** Properties derived from the room record (how the room was created). */
export interface GDRoomCtx {
  room_id: string;
  room_code?: string | null;
  /** "app" | "discord" | "unknown" — how the room was created */
  room_source?: string;
  room_status?: string;
}

/** Properties derived from the participant record + auth session. */
export interface GDParticipantCtx {
  participant_id?: string | null;
  /** "guest" | "user" | "unknown" */
  participant_type?: string;
  is_guest?: boolean;
  is_logged_in?: boolean;
  user_id?: string | null;
}

/**
 * Detect how the current user arrived at the room, from URL query params and
 * document.referrer.  Call ONCE on mount and cache in a ref — URL params and
 * referrer are only meaningful at first navigation.
 *
 * Supported query params (any of):
 *   ?src=qr | ?src=discord | ?source=qr | ?source=discord
 *   ?utm_source=discord | ?utm_source=qr
 */
export function detectEntrySource(): string {
  if (typeof window === "undefined") return "unknown";
  try {
    const params = new URLSearchParams(window.location.search);
    const src =
      params.get("src") ??
      params.get("source") ??
      params.get("utm_source");
    if (src === "qr") return "qr";
    if (src === "discord") return "discord";
    const ref = document.referrer ?? "";
    if (ref.includes("discord.com") || ref.includes("discord.gg")) return "discord";
    if (ref && !ref.includes(window.location.hostname)) return "direct_link";
  } catch { /* noop — Platform.OS !== "web" */ }
  return "unknown";
}

// Private helpers — spread into event properties.

function rCtx(ctx: GDRoomCtx): Record<string, unknown> {
  return {
    room_id: ctx.room_id,
    room_source: ctx.room_source ?? "unknown",
    ...(ctx.room_code ? { room_code: ctx.room_code } : {}),
    ...(ctx.room_status ? { room_status: ctx.room_status } : {}),
  };
}

function pCtx(ctx?: GDParticipantCtx | null): Record<string, unknown> {
  if (!ctx) return {};
  return {
    participant_type: ctx.participant_type ?? "unknown",
    is_guest: ctx.is_guest ?? false,
    is_logged_in: ctx.is_logged_in ?? false,
    ...(ctx.participant_id ? { participant_id: ctx.participant_id } : {}),
    ...(ctx.user_id ? { user_id: ctx.user_id } : {}),
  };
}

export const Analytics = {
  // ── Auth funnel ─────────────────────────────────────────────────────────────
  authScreenViewed: (platform: string) =>
    capture("auth_screen_viewed", { platform }),
  authGoogleTapped: () =>
    capture("auth_google_tapped"),
  authEmailSubmitted: () =>
    capture("auth_email_submitted"),
  authCodeScreenViewed: () =>
    capture("auth_code_screen_viewed"),
  authVerifyAttempted: () =>
    capture("auth_verify_attempted"),
  authFailed: (reason: string) =>
    capture("auth_failed", { reason }),

  // ── Auth outcomes ───────────────────────────────────────────────────────────
  signedUp: (method: string) => capture("signed_up", { method }),
  signedIn: (method: string) => capture("signed_in", { method }),
  signedOut: () => capture("signed_out"),

  // ── Onboarding ──────────────────────────────────────────────────────────────
  usernameSetupViewed: () => capture("username_setup_viewed"),

  // ── Swayger core ────────────────────────────────────────────────────────────
  swaygerViewed: (id: string, status: string) =>
    capture("swayger_viewed", { swayger_id: id, status }),
  swaygerCreated: (category: string, stakeUnits: number) =>
    capture("swayger_created", { category, stake_units: stakeUnits }),
  swaygerAccepted: (id: string) => capture("swayger_accepted", { swayger_id: id }),
  swaygerDeclined: (id: string) => capture("swayger_declined", { swayger_id: id }),
  swaygerCanceled: (id: string) => capture("swayger_canceled", { swayger_id: id }),
  settlementProposed: (id: string, outcome: string) =>
    capture("settlement_proposed", { swayger_id: id, outcome }),
  settlementConfirmed: (id: string, outcome: string) =>
    capture("settlement_confirmed", { swayger_id: id, outcome }),
  rematched: (id: string, type: string) =>
    capture("rematch_created", { swayger_id: id, rematch_type: type }),

  // ── Invite / sharing ────────────────────────────────────────────────────────
  inviteCodeCopied: (id: string) => capture("invite_code_copied", { swayger_id: id }),
  inviteShared: (id: string, method: string) =>
    capture("invite_shared", { swayger_id: id, method }),
  inviteLinkViewed: (code: string) =>
    capture("invite_link_viewed", { invite_code: code }),

  // ── Daily picks ─────────────────────────────────────────────────────────────
  picksScreenViewed: () => capture("picks_screen_viewed"),
  pickSubmitted: (nightId: string, propCount: number) =>
    capture("pick_submitted", { night_id: nightId, prop_count: propCount }),
  picksResultsViewed: (nightId: string, score: number) =>
    capture("picks_results_viewed", { night_id: nightId, score }),

  // ── Leaderboard ─────────────────────────────────────────────────────────────
  leaderboardViewed: (tab: string) => capture("leaderboard_viewed", { tab }),

  // ── Playoffs ────────────────────────────────────────────────────────────────
  bracketViewed: () => capture("bracket_viewed"),
  bracketPickMade: (round: number, series: string, pick: string) =>
    capture("bracket_pick_made", { round, series, pick }),
  playoffsHubViewed: () => capture("playoffs_hub_viewed"),

  // ── Profile ─────────────────────────────────────────────────────────────────
  profileViewed: () => capture("profile_viewed"),
  passwordSet: () => capture("password_set"),
  bankruptcyClaimed: () => capture("bankruptcy_claimed"),

  // ── Navigation / engagement ─────────────────────────────────────────────────
  dashboardViewed: () => capture("dashboard_viewed"),
  h2hViewed: (opponentId?: string) =>
    capture("h2h_viewed", opponentId ? { opponent_id: opponentId } : {}),
  joinScreenViewed: () => capture("join_screen_viewed"),
  qrScanned: () => capture("qr_scanned"),

  // ── Game Day ─────────────────────────────────────────────────────────────────
  //
  // Every room-scoped event includes:
  //   room_id       — always
  //   room_source   — "app" | "discord" | "unknown" (how the room was created)
  //   room_code     — when available
  //   room_status   — when available
  //
  // Participant-scoped events also include participant_id, participant_type,
  // is_guest, is_logged_in.
  //
  // entry_source — "qr" | "discord" | "direct_link" | "app" | "unknown"
  //   Detected once per session via detectEntrySource() and cached in a ref.
  //
  // Duplicate-firing is prevented by hasTracked* refs in each component.

  gamedayHubViewed: () =>
    capture("gameday_hub_viewed"),

  // Fires once per session — guarded by hasTrackedView ref in the room screen.
  gamedayRoomViewed: (
    ctx: GDRoomCtx,
    roomName: string,
    entrySource: string,
    participant?: GDParticipantCtx | null
  ) =>
    capture("gameday_room_viewed", {
      ...rCtx(ctx),
      room_name: roomName,
      entry_source: entrySource,
      ...pCtx(participant),
    }),

  gamedayJoined: (
    ctx: GDRoomCtx,
    method: "user" | "guest",
    entrySource: string,
    participant?: GDParticipantCtx | null
  ) =>
    capture("gameday_joined", {
      ...rCtx(ctx),
      method,
      entry_source: entrySource,
      ...pCtx(participant),
    }),

  // phase + participant_id are the cross-window retention keys.
  // To calculate retention: group gameday_pick_submitted by (participant_id, room_id, phase).
  gamedayPickSubmitted: (
    ctx: GDRoomCtx,
    phase: string,
    propCount: number,
    isUpdate: boolean,
    entrySource: string,
    participant?: GDParticipantCtx | null
  ) =>
    capture("gameday_pick_submitted", {
      ...rCtx(ctx),
      phase,
      prop_count: propCount,
      is_update: isUpdate,
      entry_source: entrySource,
      ...pCtx(participant),
    }),

  gamedayStandingsShared: (
    ctx: GDRoomCtx,
    entrySource: string,
    shareMethod: string,
    participant?: GDParticipantCtx | null,
    isHost?: boolean
  ) =>
    capture("gameday_standings_shared", {
      ...rCtx(ctx),
      entry_source: entrySource,
      share_method: shareMethod,
      is_host: isHost ?? false,
      ...pCtx(participant),
    }),

  gamedayRoomCreated: (
    ctx: GDRoomCtx,
    opts: {
      created_from?: string;
      team_a_name?: string;
      team_b_name?: string;
      room_name?: string;
      prop_count_total?: number;
      pregame_prop_count?: number;
      halftime_prop_count?: number;
      fourth_prop_count?: number;
      creator_user_id?: string;
    }
  ) =>
    capture("gameday_room_created", {
      ...rCtx(ctx),
      created_from: opts.created_from ?? "app",
      ...opts,
    }),

  gamedayCardOpened: (ctx: GDRoomCtx, cardId: string, phase: string) =>
    capture("gameday_card_opened", { ...rCtx(ctx), card_id: cardId, phase }),

  gamedayCardLocked: (ctx: GDRoomCtx, cardId: string, phase: string) =>
    capture("gameday_card_locked", { ...rCtx(ctx), card_id: cardId, phase }),

  gamedayRoomFinalized: (ctx: GDRoomCtx) =>
    capture("gameday_room_finalized", rCtx(ctx)),

  // Fires once per session when the user first views the final standings screen.
  gamedayFinalStandingsViewed: (
    ctx: GDRoomCtx,
    entrySource: string,
    participant?: GDParticipantCtx | null
  ) =>
    capture("gameday_final_standings_viewed", {
      ...rCtx(ctx),
      entry_source: entrySource,
      ...pCtx(participant),
    }),

  // New: fires in host.tsx after a prop is successfully settled.
  // Measures host settlement cadence and correct-answer distribution.
  gamedayPropSettled: (
    ctx: GDRoomCtx,
    propId: string,
    phase: string,
    opts?: {
      card_id?: string;
      correct_answer?: string;
      total_picks?: number;
      correct_pick_count?: number;
      incorrect_pick_count?: number;
    }
  ) =>
    capture("gameday_prop_settled", {
      ...rCtx(ctx),
      prop_id: propId,
      phase,
      ...(opts ?? {}),
    }),

  // New: fires once per session when the leaderboard first loads with data.
  // Guarded by hasTrackedLeaderboard ref in the room screen.
  gamedayLeaderboardViewed: (
    ctx: GDRoomCtx,
    entrySource: string,
    opts?: {
      participant_id?: string;
      participant_type?: string;
      leaderboard_available?: boolean;
      participant_count?: number;
      settled_prop_count?: number;
      current_open_card_phase?: string;
    }
  ) =>
    capture("gameday_leaderboard_viewed", {
      ...rCtx(ctx),
      entry_source: entrySource,
      ...(opts ?? {}),
    }),

  // ── Captain Center ───────────────────────────────────────────────────────────

  // Fires once per session/page load when the Captain Center opens.
  // Guarded by hasTrackedView ref in captain.tsx.
  gamedayCaptainCenterViewed: (
    ctx: GDRoomCtx,
    opts?: {
      current_open_card_phase?: string | null;
      participant_count?: number | null;
      captain_link_source?: "host_panel" | "direct_link" | "unknown";
      is_admin_viewer?: boolean | "unknown";
    }
  ) =>
    capture("gameday_captain_center_viewed", {
      ...rCtx(ctx),
      current_open_card_phase: opts?.current_open_card_phase ?? null,
      participant_count: opts?.participant_count ?? null,
      captain_link_source: opts?.captain_link_source ?? "unknown",
      is_admin_viewer: opts?.is_admin_viewer ?? "unknown",
    }),

  // Fires on every message copy (and QR view) from the Captain Center.
  gamedayCaptainMessageCopied: (
    ctx: GDRoomCtx,
    messageType: string,
    opts: {
      message_category: string;
      current_open_card_phase?: string | null;
      participant_count?: number | null;
      leaderboard_available: boolean;
      leader_name?: string | null;
      leader_sp?: number | null;
    }
  ) =>
    capture("gameday_captain_message_copied", {
      ...rCtx(ctx),
      message_type: messageType,
      message_category: opts.message_category,
      current_open_card_phase: opts.current_open_card_phase ?? null,
      participant_count: opts.participant_count ?? null,
      leaderboard_available: opts.leaderboard_available,
      leader_name: opts.leader_name ?? null,
      leader_sp: opts.leader_sp ?? null,
    }),
};
