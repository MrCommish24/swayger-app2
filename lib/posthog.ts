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

// Helper: only include room_code key if a value is present.
function rc(roomCode?: string | null): Record<string, string> {
  return roomCode ? { room_code: roomCode } : {};
}

export const Analytics = {
  // ── Auth funnel ─────────────────────────────────────────────────────────────
  // These events form the acquisition funnel: view → intent → action → success
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
  swaygerViewed: (id: string, status: string) => capture("swayger_viewed", { swayger_id: id, status }),
  swaygerCreated: (category: string, stakeUnits: number) =>
    capture("swayger_created", { category, stake_units: stakeUnits }),
  swaygerAccepted: (id: string) => capture("swayger_accepted", { swayger_id: id }),
  swaygerDeclined: (id: string) => capture("swayger_declined", { swayger_id: id }),
  swaygerCanceled: (id: string) => capture("swayger_canceled", { swayger_id: id }),
  settlementProposed: (id: string, outcome: string) =>
    capture("settlement_proposed", { swayger_id: id, outcome }),
  settlementConfirmed: (id: string, outcome: string) =>
    capture("settlement_confirmed", { swayger_id: id, outcome }),
  rematched: (id: string, type: string) => capture("rematch_created", { swayger_id: id, rematch_type: type }),

  // ── Invite / sharing ────────────────────────────────────────────────────────
  inviteCodeCopied: (id: string) => capture("invite_code_copied", { swayger_id: id }),
  inviteShared: (id: string, method: string) => capture("invite_shared", { swayger_id: id, method }),
  inviteLinkViewed: (code: string) => capture("invite_link_viewed", { invite_code: code }),

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
  h2hViewed: (opponentId?: string) => capture("h2h_viewed", opponentId ? { opponent_id: opponentId } : {}),
  joinScreenViewed: () => capture("join_screen_viewed"),
  qrScanned: () => capture("qr_scanned"),

  // ── Game Day ─────────────────────────────────────────────────────────────────
  // All room-scoped events carry room_id (always) and room_code (when available).
  gamedayHubViewed: () =>
    capture("gameday_hub_viewed"),

  // Fires once per session — guarded by hasTrackedView ref in the room screen.
  gamedayRoomViewed: (roomId: string, roomName: string, roomCode?: string | null) =>
    capture("gameday_room_viewed", { room_id: roomId, room_name: roomName, ...rc(roomCode) }),

  gamedayJoined: (roomId: string, method: "user" | "guest", roomCode?: string | null) =>
    capture("gameday_joined", { room_id: roomId, method, ...rc(roomCode) }),

  gamedayPickSubmitted: (
    roomId: string,
    phase: string,
    propCount: number,
    isUpdate: boolean,
    roomCode?: string | null
  ) =>
    capture("gameday_pick_submitted", {
      room_id: roomId,
      phase,
      prop_count: propCount,
      is_update: isUpdate,
      ...rc(roomCode),
    }),

  gamedayStandingsShared: (roomId: string, roomCode?: string | null) =>
    capture("gameday_standings_shared", { room_id: roomId, ...rc(roomCode) }),

  gamedayRoomCreated: (roomId: string, propCount: number, roomCode?: string | null) =>
    capture("gameday_room_created", { room_id: roomId, prop_count: propCount, ...rc(roomCode) }),

  gamedayCardOpened: (roomId: string, cardId: string, phase: string, roomCode?: string | null) =>
    capture("gameday_card_opened", { room_id: roomId, card_id: cardId, phase, ...rc(roomCode) }),

  gamedayCardLocked: (roomId: string, cardId: string, phase: string, roomCode?: string | null) =>
    capture("gameday_card_locked", { room_id: roomId, card_id: cardId, phase, ...rc(roomCode) }),

  gamedayRoomFinalized: (roomId: string, roomCode?: string | null) =>
    capture("gameday_room_finalized", { room_id: roomId, ...rc(roomCode) }),

  // Fires once per session when a user first views the final standings screen.
  gamedayFinalStandingsViewed: (roomId: string, roomCode?: string | null) =>
    capture("gameday_final_standings_viewed", { room_id: roomId, ...rc(roomCode) }),
};
