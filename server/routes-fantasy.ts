/**
 * server/routes-fantasy.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 2+3 — Fantasy League Commissioner Setup + Member Claim
 *
 * Routes:
 *   POST /api/fantasy/leagues/setup
 *     Atomic initial league + first season bootstrap (setup_fantasy_league RPC).
 *
 *   POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/participants
 *     Atomic member + team setup row (add_fantasy_season_participant RPC).
 *
 *   GET  /api/fantasy/leagues
 *     Fantasy leagues the caller belongs to (via claim chain), newest first.
 *
 *   GET  /api/fantasy/leagues/:leagueId/seasons/:seasonId
 *     Complete season detail + viewer identity (role-aware hub data).
 *
 *   GET  /api/fantasy/leagues/:leagueId/seasons/:seasonId/join-info
 *     Public — league info + seat list with claim status.
 *     Used by the member invite/join screen. No auth required.
 *
 *   POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/claim
 *     Member seat claim — requires auth (Bearer) OR guest token.
 *     Calls claim_fantasy_seat RPC (atomic, idempotent).
 *
 * Commissioner authority chain (enforced on every mutating commissioner route):
 *   authenticated user_id
 *   → active fantasy_member_claims
 *   → fantasy_league_members (for this league)
 *   → fantasy_season_members with role IN ('commissioner','co_commissioner')
 */

import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { settlePropCore } from "./gameday-settle-helper";

// ── Local helpers ─────────────────────────────────────────────────────────────

/**
 * SHA-256 of the canonical add-member request.
 * Detects idempotency key reuse with a semantically different body.
 * Components: leagueId, seasonId, operatorUserId, normalized display_name, normalized team_name.
 * draft_day_eligible and room_id are excluded because they are server-determined, not client intent.
 */
function _computeAddMemberHash(
  leagueId: string,
  seasonId: string,
  operatorUserId: string,
  displayName: string,
  teamName: string,
): string {
  const raw = [
    leagueId,
    seasonId,
    operatorUserId,
    displayName.trim().toLowerCase(),
    teamName.trim().toLowerCase(),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

function getServiceSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

/** Fast JWT decode — no signature verification. */
function decodeJwtPayload(token: string): { sub?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "==".slice(0, (4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

/**
 * Extracts user_id from a Bearer JWT.
 * Returns null + sends 401 if missing/invalid.
 */
function requireFantasyAuth(req: Request, res: Response): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const payload = decodeJwtPayload(auth.slice(7));
  if (!payload?.sub) {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }
  return payload.sub;
}

/**
 * Extracts caller identity without requiring auth.
 * Returns { userId } from Bearer, { guestToken } from X-Fantasy-Guest-Token,
 * or {} if neither is present. Does NOT send any response.
 */
function getCallerIdentity(req: Request): { userId?: string; guestToken?: string } {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const payload = decodeJwtPayload(auth.slice(7));
    if (payload?.sub) return { userId: payload.sub };
  }
  const guestToken = req.headers["x-fantasy-guest-token"] as string | undefined;
  if (guestToken?.trim()) return { guestToken: guestToken.trim() };
  return {};
}

/**
 * Verifies the caller is commissioner/co_commissioner for the given season.
 * Returns { userId, leagueMemberId, seasonMemberId } on success.
 * Sends 401/403 and returns null on failure.
 */
async function requireFantasyCommissioner(
  req: Request,
  res: Response,
  supabase: ReturnType<typeof getServiceSupabase>,
  leagueId: string,
  seasonId: string
): Promise<{ userId: string; leagueMemberId: string; seasonMemberId: string } | null> {
  const userId = requireFantasyAuth(req, res);
  if (!userId) return null;

  const { data: claims } = await supabase
    .from("fantasy_member_claims")
    .select("league_member_id")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!claims?.length) {
    res.status(403).json({ error: "No active Fantasy claim found" });
    return null;
  }

  const memberIds = (claims as any[]).map((c) => c.league_member_id);

  const { data: leagueMember } = await supabase
    .from("fantasy_league_members")
    .select("id")
    .eq("league_id", leagueId)
    .eq("is_active", true)
    .in("id", memberIds)
    .maybeSingle();

  if (!leagueMember) {
    res.status(403).json({ error: "Not a member of this Fantasy league" });
    return null;
  }

  const { data: seasonMember } = await supabase
    .from("fantasy_season_members")
    .select("id, role")
    .eq("league_season_id", seasonId)
    .eq("league_member_id", (leagueMember as any).id)
    .eq("is_active", true)
    .in("role", ["commissioner", "co_commissioner"])
    .maybeSingle();

  if (!seasonMember) {
    res.status(403).json({ error: "Commissioner authority required for this season" });
    return null;
  }

  return {
    userId,
    leagueMemberId: (leagueMember as any).id,
    seasonMemberId: (seasonMember as any).id,
  };
}

/**
 * Verifies the caller is commissioner/co_commissioner in ANY active season of the given league.
 * Used for league-level operations (e.g. rename) that don't bind to a specific season.
 * Returns { userId, leagueMemberId } on success, null on failure (response already sent).
 */
async function requireFantasyLeagueCommissioner(
  req: Request,
  res: Response,
  supabase: ReturnType<typeof getServiceSupabase>,
  leagueId: string
): Promise<{ userId: string; leagueMemberId: string } | null> {
  const userId = requireFantasyAuth(req, res);
  if (!userId) return null;

  const { data: claims } = await supabase
    .from("fantasy_member_claims")
    .select("league_member_id")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!claims?.length) {
    res.status(403).json({ error: "No active Fantasy claim found" });
    return null;
  }

  const memberIds = (claims as any[]).map((c) => c.league_member_id);

  const { data: leagueMember } = await supabase
    .from("fantasy_league_members")
    .select("id")
    .eq("league_id", leagueId)
    .eq("is_active", true)
    .in("id", memberIds)
    .maybeSingle();

  if (!leagueMember) {
    res.status(403).json({ error: "Not a member of this Fantasy league" });
    return null;
  }

  // Must be commissioner or co_commissioner in at least one active season
  const { data: seasonMember } = await supabase
    .from("fantasy_season_members")
    .select("id")
    .eq("league_member_id", (leagueMember as any).id)
    .eq("is_active", true)
    .in("role", ["commissioner", "co_commissioner"])
    .maybeSingle();

  if (!seasonMember) {
    res.status(403).json({ error: "Commissioner authority required" });
    return null;
  }

  return { userId, leagueMemberId: (leagueMember as any).id };
}

/**
 * Given a caller identity (user_id or guest_token) and a season_id,
 * returns the viewer's participant info or null if they have no claim.
 */
async function resolveViewer(
  supabase: ReturnType<typeof getServiceSupabase>,
  identity: { userId?: string; guestToken?: string },
  seasonId: string,
  leagueId: string
): Promise<{
  league_member_id: string;
  season_member_id: string;
  display_name: string | null;
  team_name: string | null;
  fantasy_team_id: string | null;
  role: string;
  draft_day_eligible: boolean;
} | null> {
  if (!identity.userId && !identity.guestToken) return null;

  // Find the active claim for this identity
  const claimQuery = supabase
    .from("fantasy_member_claims")
    .select("league_member_id")
    .eq("is_active", true);

  const { data: claim } = identity.userId
    ? await claimQuery.eq("user_id", identity.userId).maybeSingle()
    : await claimQuery.eq("guest_token", identity.guestToken!).maybeSingle();

  if (!claim) return null;

  const lmId = (claim as any).league_member_id;

  // Verify league_member belongs to THIS league
  const { data: lm } = await supabase
    .from("fantasy_league_members")
    .select("id, display_name")
    .eq("id", lmId)
    .eq("league_id", leagueId)
    .eq("is_active", true)
    .maybeSingle();

  if (!lm) return null;

  // Find season_member for this league_member in this season
  const { data: sm } = await supabase
    .from("fantasy_season_members")
    .select("id, role, draft_day_eligible")
    .eq("league_season_id", seasonId)
    .eq("league_member_id", lmId)
    .eq("is_active", true)
    .maybeSingle();

  if (!sm) return null;

  // Find team — include id for fantasy_team_id snapshot in ensureFantasyParticipant
  const { data: mgr } = await supabase
    .from("fantasy_team_managers")
    .select("fantasy_teams(id, team_name)")
    .eq("season_member_id", (sm as any).id)
    .eq("is_active", true)
    .maybeSingle();

  const teamName     = (mgr as any)?.fantasy_teams?.team_name ?? null;
  const fantasyTeamId = (mgr as any)?.fantasy_teams?.id ?? null;

  return {
    league_member_id: lmId,
    season_member_id: (sm as any).id,
    display_name: (lm as any).display_name ?? null,
    team_name: teamName,
    fantasy_team_id: fantasyTeamId,
    role: (sm as any).role,
    draft_day_eligible: (sm as any).draft_day_eligible ?? true,
  };
}

// ── Participant upsert (Fantasy) ──────────────────────────────────────────────
// Creates a gameday_participants row for the season member in this room, or
// returns the existing one. Race-safe via the partial unique index:
//   gameday_participants_room_season_member_uniq (room_id, season_member_id)
//   WHERE season_member_id IS NOT NULL
//
// Must NOT be called from read-only endpoints (e.g. GET /draft-day) so that
// browsing the hub never creates phantom competition participants.
async function ensureFantasyParticipant(
  supabase: ReturnType<typeof getServiceSupabase>,
  roomId: string,
  viewer: NonNullable<Awaited<ReturnType<typeof resolveViewer>>>
): Promise<{ participant_id: string }> {
  // 1. Check for existing participant
  const { data: existing } = await supabase
    .from("gameday_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("season_member_id", viewer.season_member_id)
    .maybeSingle();

  if (existing) return { participant_id: (existing as any).id };

  // 2. Insert — unique index prevents duplicates under concurrency
  const insertPayload: Record<string, unknown> = {
    room_id:          roomId,
    season_member_id: viewer.season_member_id,
    // display_name is NOT NULL in gameday_participants; display_name comes from
    // fantasy_league_members.display_name (NOT NULL), so null is unexpected but
    // we provide a safe fallback to avoid a schema error.
    display_name:     viewer.display_name ?? viewer.team_name ?? "Fantasy Member",
    team_name:        viewer.team_name,
  };
  if (viewer.fantasy_team_id) insertPayload.fantasy_team_id = viewer.fantasy_team_id;

  const { data: inserted, error: insertErr } = await supabase
    .from("gameday_participants")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertErr) {
    // Unique violation (23505) — another request beat us; fetch the existing row
    if ((insertErr as any).code === "23505") {
      const { data: race } = await supabase
        .from("gameday_participants")
        .select("id")
        .eq("room_id", roomId)
        .eq("season_member_id", viewer.season_member_id)
        .maybeSingle();
      if (race) return { participant_id: (race as any).id };
    }
    throw new Error(`Failed to create participant: ${insertErr.message}`);
  }

  return { participant_id: (inserted as any).id };
}

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_SPORTS = ["football", "basketball", "baseball"];

// ── Route registration ────────────────────────────────────────────────────────

export function registerFantasyRoutes(app: Express) {
  app.use("/api/fantasy", (_req: Request, res: Response, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    next();
  });

  // ── POST /api/fantasy/leagues/setup ─────────────────────────────────────────
  app.post("/api/fantasy/leagues/setup", async (req: Request, res: Response) => {
    const userId = requireFantasyAuth(req, res);
    if (!userId) return;

    const {
      league_name,
      sport,
      display_name,
      team_name,
      season_year,
      reward_description,
      reward_amount_display,
    } = req.body as {
      league_name?: string;
      sport?: string;
      display_name?: string;
      team_name?: string;
      season_year?: number;
      reward_description?: string;
      reward_amount_display?: string;
    };

    if (!league_name?.trim()) {
      res.status(400).json({ error: "league_name is required" });
      return;
    }
    if (!sport || !VALID_SPORTS.includes(sport)) {
      res.status(400).json({ error: `sport must be one of: ${VALID_SPORTS.join(", ")}` });
      return;
    }
    if (!display_name?.trim()) {
      res.status(400).json({ error: "display_name is required" });
      return;
    }
    if (!team_name?.trim()) {
      res.status(400).json({ error: "team_name is required" });
      return;
    }
    if (
      season_year === undefined ||
      !Number.isInteger(season_year) ||
      season_year < 1900 ||
      season_year > 2100
    ) {
      res.status(400).json({ error: "season_year must be an integer between 1900 and 2100" });
      return;
    }

    const supabase = getServiceSupabase();
    const { data, error } = await supabase.rpc("setup_fantasy_league", {
      p_user_id:               userId,
      p_league_name:           league_name.trim(),
      p_sport:                 sport,
      p_display_name:          display_name.trim(),
      p_team_name:             team_name.trim(),
      p_season_year:           season_year,
      p_reward_description:    reward_description?.trim() || null,
      p_reward_amount_display: reward_amount_display?.trim() || null,
    });

    if (error) {
      console.error("[fantasy] setup_fantasy_league error:", error.message);
      const isValidationError =
        error.message.includes("Invalid sport") ||
        error.message.includes("cannot be empty") ||
        error.message.includes("year must be");
      res.status(isValidationError ? 400 : 500).json({
        error: isValidationError ? error.message : "Failed to create Fantasy league",
      });
      return;
    }

    const result = data as any;
    console.log(
      `[fantasy] League created: league=${result.league_id?.slice(0, 8)}… season=${result.season_id?.slice(0, 8)}… by user=${userId.slice(0, 8)}…`
    );
    res.status(201).json(result);
  });

  // ── POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/participants ───────
  app.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/participants",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();

      const commissioner = await requireFantasyCommissioner(
        req, res, supabase, leagueId, seasonId
      );
      if (!commissioner) return;

      const { display_name, team_name } = req.body as {
        display_name?: string;
        team_name?: string;
      };

      if (!display_name?.trim()) {
        res.status(400).json({ error: "display_name is required" });
        return;
      }
      if (!team_name?.trim()) {
        res.status(400).json({ error: "team_name is required" });
        return;
      }

      // Idempotency key — required for this mutation.
      // The client generates one UUID per intentional add-member operation and
      // persists it until the server confirms success.  Retries send the same
      // key; a replay returns the original IDs without creating duplicate rows.
      const idempotencyKey = (req.headers["idempotency-key"] as string | undefined)?.trim();
      if (!idempotencyKey) {
        res.status(400).json({
          error: "Idempotency-Key header is required for this operation.",
          code:  "IDEMPOTENCY_KEY_REQUIRED",
        });
        return;
      }

      const requestHash = _computeAddMemberHash(
        leagueId, seasonId, commissioner.userId, display_name, team_name
      );

      const { data: seasonCheck } = await supabase
        .from("fantasy_league_seasons")
        .select("league_id")
        .eq("id", seasonId)
        .maybeSingle();

      if (!seasonCheck || (seasonCheck as any).league_id !== leagueId) {
        res.status(400).json({ error: "Season does not belong to this league" });
        return;
      }

      // ── Determine Draft Day lifecycle to set eligibility and snapshot update ──
      // The server — never the client — decides draft_day_eligible.
      //
      // No Draft Day        → eligible=true,  no snapshot update
      // Draft Day, 0 picks  → eligible=true,  append to answer_options (atomic)
      // picks > 0 OR locked → eligible=false, no snapshot update
      // settled             → eligible=false, no snapshot update

      const { data: ddRoom } = await supabase
        .from("gameday_rooms")
        .select("id")
        .eq("league_season_id", seasonId)
        .eq("competition_type", "draft_day")
        .eq("experience_type", "fantasy")
        .is("archived_at", null)
        .maybeSingle();

      let eligible = true;
      let roomIdForSnapshot: string | null = null;

      if (ddRoom) {
        const ddRoomId = (ddRoom as any).id as string;
        const { data: ddCard } = await supabase
          .from("gameday_pick_cards")
          .select("id, status")
          .eq("room_id", ddRoomId)
          .eq("phase", "draft_day")
          .maybeSingle();

        if (ddCard) {
          const cardStatus = (ddCard as any).status as string;
          if (cardStatus === "locked" || cardStatus === "settled") {
            // Card is frozen — late additions are league-only (no Draft Day picks)
            eligible = false;
          } else if (cardStatus === "open") {
            // Card is open regardless of pick_count — new member is eligible and their
            // name is appended to answer_options atomically inside the RPC.
            // roster_revision is incremented by the RPC to signal existing pickers
            // to review their selections.
            eligible          = true;
            roomIdForSnapshot = ddRoomId;
          }
        }
      }

      const { data, error } = await supabase.rpc("add_fantasy_season_participant_idempotent", {
        p_league_id:          leagueId,
        p_league_season_id:   seasonId,
        p_display_name:       display_name.trim(),
        p_team_name:          team_name.trim(),
        p_draft_day_eligible: eligible,
        p_room_id:            roomIdForSnapshot,
        p_idempotency_key:    idempotencyKey,
        p_operator_user_id:   commissioner.userId,
        p_request_hash:       requestHash,
      });

      if (error) {
        // Idempotency key reused with a semantically different request body
        if (error.message.includes("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST")) {
          res.status(409).json({
            error: "Idempotency key was used with a different request. Generate a new key for a different add-member operation.",
            code:  "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST",
          });
          return;
        }
        console.error("[fantasy] add_fantasy_season_participant_idempotent error:", error.message);
        const isValidationError =
          error.message.includes("not found") ||
          error.message.includes("does not belong") ||
          error.message.includes("cannot be empty");
        res.status(isValidationError ? 400 : 500).json({
          error: isValidationError ? error.message : "Failed to add participant",
        });
        return;
      }

      const result = data as any;
      console.log(
        `[fantasy] Participant added: season=${seasonId.slice(0, 8)}… member=${result.league_member_id?.slice(0, 8)}… team=${result.team_id?.slice(0, 8)}… eligible=${result.draft_day_eligible} already_exists=${result.already_exists}`
      );

      res.status(result.already_exists ? 200 : 201).json(result);
    }
  );

  // ── PATCH /api/fantasy/leagues/:leagueId/seasons/:seasonId/members/:seasonMemberId
  //
  // Atomic rename: updates display_name + team_name for one season member and
  // propagates new labels into any active (unsettled) Draft Day answer_options
  // and gameday_participants snapshot — all in one PL/pgSQL transaction.
  //
  // Auth: commissioner or co-commissioner only.
  // Body: { display_name: string, team_name: string }
  app.patch(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/members/:seasonMemberId",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId, seasonMemberId } = req.params;
      const supabase = getServiceSupabase();

      const commissioner = await requireFantasyCommissioner(req, res, supabase, leagueId, seasonId);
      if (!commissioner) return;

      const { display_name, team_name } = req.body as {
        display_name?: string;
        team_name?: string;
      };

      if (!display_name?.trim()) {
        res.status(400).json({ error: "display_name is required" });
        return;
      }
      if (!team_name?.trim()) {
        res.status(400).json({ error: "team_name is required" });
        return;
      }

      // Verify seasonMemberId belongs to this season
      const { data: smCheck } = await supabase
        .from("fantasy_season_members")
        .select("id")
        .eq("id", seasonMemberId)
        .eq("league_season_id", seasonId)
        .maybeSingle();

      if (!smCheck) {
        res.status(404).json({ error: "Member not found in this season" });
        return;
      }

      const { data, error } = await supabase.rpc("update_fantasy_member", {
        p_season_member_id: seasonMemberId,
        p_display_name:     display_name.trim(),
        p_team_name:        team_name.trim(),
        p_season_id:        seasonId,
      });

      if (error) {
        console.error("[fantasy] update_fantasy_member error:", error.message);
        const isValidation = error.message.includes("cannot be empty") || error.message.includes("not found");
        res.status(isValidation ? 400 : 500).json({
          error: isValidation ? error.message : "Failed to update member",
        });
        return;
      }

      console.log(
        `[fantasy] Member renamed: season=${seasonId.slice(0, 8)}… sm=${seasonMemberId.slice(0, 8)}… ` +
        `props_updated=${(data as any)?.props_updated} participant_updated=${(data as any)?.participant_updated}`
      );

      res.json(data);
    }
  );

  // ── PATCH /api/fantasy/leagues/:leagueId ─────────────────────────────────────
  //
  // Commissioner-only league rename.
  // Does NOT require a specific season — checks commissioner role in any active
  // season of this league (league-level authority).
  //
  // Body: { league_name: string }
  // Returns: { id, league_name }
  app.patch(
    "/api/fantasy/leagues/:leagueId",
    async (req: Request, res: Response) => {
      const { leagueId } = req.params;
      const supabase = getServiceSupabase();

      const commissioner = await requireFantasyLeagueCommissioner(req, res, supabase, leagueId);
      if (!commissioner) return;

      const { league_name } = req.body as { league_name?: string };
      const trimmed = league_name?.trim();

      if (!trimmed) {
        res.status(400).json({ error: "league_name is required and cannot be blank" });
        return;
      }
      if (trimmed.length > 100) {
        res.status(400).json({ error: "league_name too long (max 100 characters)" });
        return;
      }

      const { data, error } = await supabase
        .from("fantasy_leagues")
        .update({ league_name: trimmed, updated_at: new Date().toISOString() })
        .eq("id", leagueId)
        .select("id, league_name")
        .single();

      if (error) {
        console.error("[fantasy] PATCH /leagues/:leagueId error:", error.message);
        res.status(500).json({ error: "Failed to update league name" });
        return;
      }

      console.log(
        `[fantasy] League renamed: id=${leagueId.slice(0, 8)}… new_name="${trimmed}"`
      );

      res.json({ id: (data as any).id, league_name: (data as any).league_name });
    }
  );

  // ── GET /api/fantasy/leagues ─────────────────────────────────────────────────
  //
  // Returns Fantasy leagues the caller belongs to (via claim chain).
  // Works for both commissioners and members — any active claim in any league
  // causes that league to appear here.
  app.get("/api/fantasy/leagues", async (req: Request, res: Response) => {
    const userId = requireFantasyAuth(req, res);
    if (!userId) return;

    const supabase = getServiceSupabase();

    const { data: claims } = await supabase
      .from("fantasy_member_claims")
      .select("league_member_id")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (!claims?.length) {
      res.json({ leagues: [] });
      return;
    }

    const memberIds = (claims as any[]).map((c) => c.league_member_id);

    const { data: leagueMembers } = await supabase
      .from("fantasy_league_members")
      .select("league_id")
      .in("id", memberIds)
      .eq("is_active", true);

    if (!leagueMembers?.length) {
      res.json({ leagues: [] });
      return;
    }

    const leagueIds = [
      ...new Set((leagueMembers as any[]).map((lm) => lm.league_id)),
    ];

    const { data: leagues, error } = await supabase
      .from("fantasy_leagues")
      .select(
        "id, league_name, sport, is_active, created_at, fantasy_league_seasons(id, season_year, status)"
      )
      .in("id", leagueIds)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[fantasy] GET /leagues error:", error.message);
      res.status(500).json({ error: "Failed to fetch leagues" });
      return;
    }

    res.json({ leagues: leagues ?? [] });
  });

  // ── GET /api/fantasy/leagues/:leagueId/seasons/:seasonId ────────────────────
  //
  // Full season detail with role-aware viewer identification.
  //
  // Auth: Bearer JWT OR X-Fantasy-Guest-Token header. Either is accepted.
  // If neither present → 401.
  //
  // Returns:
  //   league, season, participants  (existing)
  //   viewer: { league_member_id, season_member_id, display_name,
  //             team_name, role } | null
  //
  // viewer is null when the caller has no active claim in this league.
  app.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId",
    async (req: Request, res: Response) => {
      const identity = getCallerIdentity(req);
      if (!identity.userId && !identity.guestToken) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();

      const { data: league } = await supabase
        .from("fantasy_leagues")
        .select("id, league_name, sport, is_active")
        .eq("id", leagueId)
        .maybeSingle();

      if (!league) {
        res.status(404).json({ error: "League not found" });
        return;
      }

      const { data: season } = await supabase
        .from("fantasy_league_seasons")
        .select(
          "id, season_year, status, default_reward_description, default_reward_amount_display"
        )
        .eq("id", seasonId)
        .eq("league_id", leagueId)
        .maybeSingle();

      if (!season) {
        res.status(404).json({ error: "Season not found" });
        return;
      }

      const { data: seasonMembers } = await supabase
        .from("fantasy_season_members")
        .select("id, role, is_active, fantasy_league_members(id, display_name)")
        .eq("league_season_id", seasonId)
        .eq("is_active", true);

      const { data: teams } = await supabase
        .from("fantasy_teams")
        .select(
          "id, team_name, is_active, fantasy_team_managers(id, season_member_id, role, is_active)"
        )
        .eq("league_season_id", seasonId)
        .eq("is_active", true);

      const participants = (seasonMembers ?? []).map((sm: any) => {
        const lm = sm.fantasy_league_members;
        const managedTeam = (teams ?? []).find((t: any) =>
          (t.fantasy_team_managers ?? []).some(
            (mgr: any) => mgr.season_member_id === sm.id && mgr.is_active
          )
        );
        const managedMgr = managedTeam
          ? (managedTeam.fantasy_team_managers ?? []).find(
              (mgr: any) => mgr.season_member_id === sm.id && mgr.is_active
            )
          : null;
        return {
          season_member_id: sm.id,
          league_member_id: lm?.id ?? null,
          display_name:     lm?.display_name ?? null,
          role:             sm.role,
          team_id:          managedTeam?.id ?? null,
          team_name:        managedTeam?.team_name ?? null,
          manager_id:       managedMgr?.id ?? null,
          manager_role:     managedMgr?.role ?? null,
        };
      });

      // Resolve viewer — null if caller has no active claim in this league
      const viewer = await resolveViewer(supabase, identity, seasonId, leagueId);

      // Add is_claimed to each participant (one extra query; powers commissioner claim-status view)
      const lmIds = participants.map((p: any) => p.league_member_id).filter(Boolean);
      const { data: activeClaims } = lmIds.length
        ? await supabase
            .from("fantasy_member_claims")
            .select("league_member_id")
            .in("league_member_id", lmIds)
            .eq("is_active", true)
        : { data: [] };
      const claimedMemberIds = new Set(
        (activeClaims ?? []).map((c: any) => c.league_member_id)
      );
      const participantsWithClaims = participants.map((p: any) => ({
        ...p,
        is_claimed: p.league_member_id ? claimedMemberIds.has(p.league_member_id) : false,
      }));

      res.json({ league, season, participants: participantsWithClaims, viewer });
    }
  );

  // ── GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/join-info ───────────
  //
  // PUBLIC — no auth required. Returns league/season summary and the seat list
  // with per-seat claim status (claimed/available). Used by the invite screen.
  //
  // Optionally identifies the caller (Bearer or X-Fantasy-Guest-Token) to:
  //   • mark their seat as "is_mine: true"
  //   • return my_seat so the client can auto-recognize and skip seat selection
  //
  // Seat claim status exposes is_claimed only, never WHO claimed it.
  app.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/join-info",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const identity = getCallerIdentity(req);

      const { data: league } = await supabase
        .from("fantasy_leagues")
        .select("id, league_name, sport, is_active")
        .eq("id", leagueId)
        .maybeSingle();

      if (!league || !(league as any).is_active) {
        res.status(404).json({ error: "League not found" });
        return;
      }

      const { data: season } = await supabase
        .from("fantasy_league_seasons")
        .select(
          "id, season_year, status, default_reward_description, default_reward_amount_display"
        )
        .eq("id", seasonId)
        .eq("league_id", leagueId)
        .maybeSingle();

      if (!season) {
        res.status(404).json({ error: "Season not found" });
        return;
      }

      // Load all active season members with their teams
      const { data: seasonMembers } = await supabase
        .from("fantasy_season_members")
        .select("id, role, fantasy_league_members(id, display_name)")
        .eq("league_season_id", seasonId)
        .eq("is_active", true);

      const { data: teams } = await supabase
        .from("fantasy_teams")
        .select("id, team_name, fantasy_team_managers(season_member_id, is_active)")
        .eq("league_season_id", seasonId)
        .eq("is_active", true);

      // Load all active claims for this season's members (just member IDs, not identities)
      const smIds = (seasonMembers ?? []).map((sm: any) => sm.id);
      const lmIds = (seasonMembers ?? []).map((sm: any) => sm.fantasy_league_members?.id).filter(Boolean);

      const { data: activeClaims } = lmIds.length
        ? await supabase
            .from("fantasy_member_claims")
            .select("league_member_id")
            .in("league_member_id", lmIds)
            .eq("is_active", true)
        : { data: [] };

      const claimedMemberIds = new Set(
        (activeClaims ?? []).map((c: any) => c.league_member_id)
      );

      // Resolve caller's viewer identity (to mark their seat as is_mine)
      const viewer = identity.userId || identity.guestToken
        ? await resolveViewer(supabase, identity, seasonId, leagueId)
        : null;

      // Build seat list
      const seats = (seasonMembers ?? []).map((sm: any) => {
        const lm = sm.fantasy_league_members;
        const memberTeam = (teams ?? []).find((t: any) =>
          (t.fantasy_team_managers ?? []).some(
            (mgr: any) => mgr.season_member_id === sm.id && mgr.is_active
          )
        );
        const lmId = lm?.id ?? null;
        const isClaimed = lmId ? claimedMemberIds.has(lmId) : false;
        const isMine = viewer ? viewer.league_member_id === lmId : false;

        return {
          season_member_id: sm.id,
          league_member_id: lmId,
          display_name:     lm?.display_name ?? null,
          team_name:        memberTeam?.team_name ?? null,
          role:             sm.role,
          is_claimed:       isClaimed,
          is_mine:          isMine,
        };
      });

      // Sort: commissioner first, then alphabetically by display_name
      seats.sort((a: any, b: any) => {
        if (a.role === "commissioner") return -1;
        if (b.role === "commissioner") return 1;
        return (a.display_name ?? "").localeCompare(b.display_name ?? "");
      });

      console.log(
        `[fantasy] join-info: league=${leagueId.slice(0, 8)}… season=${seasonId.slice(0, 8)}… seats=${seats.length} caller=${identity.userId?.slice(0, 8) ?? identity.guestToken?.slice(0, 8) ?? "anon"}`
      );

      res.json({
        league,
        season,
        seats,
        my_seat: viewer ?? null,
      });
    }
  );

  // ── POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/claim ──────────────
  //
  // Member seat claim — creates a fantasy_member_claims row via the
  // claim_fantasy_seat RPC (atomic, idempotent, validated).
  //
  // Auth: Bearer JWT OR X-Fantasy-Guest-Token header (exactly one required).
  //
  // Body:
  //   league_member_id: string  — the seat (fantasy_league_members.id) to claim
  //
  // Safety enforced by RPC:
  //   • Season belongs to league
  //   • Member is active in season AND in this league (cross-league protection)
  //   • No conflicting active claim from another identity
  //   • Commissioner role is preserved (commissioner's seat cannot be claimed
  //     by a different identity — it already has an active claim from setup)
  //
  // Response:
  //   201 — new claim created
  //   200 — already_existed=true (idempotent re-claim by same identity)
  //   409 — seat_already_claimed (by a different identity)
  //   403 — member_not_found or cross-league violation
  //   400 — validation error
  app.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/claim",
    async (req: Request, res: Response) => {
      const identity = getCallerIdentity(req);
      if (!identity.userId && !identity.guestToken) {
        res.status(401).json({ error: "Unauthorized — provide Bearer token or X-Fantasy-Guest-Token" });
        return;
      }

      const { leagueId, seasonId } = req.params;
      const { league_member_id } = req.body as { league_member_id?: string };

      if (!league_member_id?.trim()) {
        res.status(400).json({ error: "league_member_id is required" });
        return;
      }

      const supabase = getServiceSupabase();

      const { data, error } = await supabase.rpc("claim_fantasy_seat", {
        p_league_id:   leagueId,
        p_season_id:   seasonId,
        p_member_id:   league_member_id.trim(),
        p_user_id:     identity.userId ?? null,
        p_guest_token: identity.guestToken ?? null,
      });

      if (error) {
        console.error("[fantasy] claim_fantasy_seat error:", error.message);
        if (error.message.includes("seat_already_claimed")) {
          res.status(409).json({ error: "This seat has already been claimed by someone else." });
          return;
        }
        if (error.message.includes("member_not_found")) {
          res.status(403).json({ error: "Member not found in this league/season." });
          return;
        }
        if (error.message.includes("season_not_found")) {
          res.status(403).json({ error: "Season does not belong to this league." });
          return;
        }
        res.status(500).json({ error: "Failed to claim seat" });
        return;
      }

      const result = data as any;
      console.log(
        `[fantasy] Seat claimed: league=${leagueId.slice(0, 8)}… member=${result.league_member_id?.slice(0, 8)}… by=${identity.userId?.slice(0, 8) ?? "guest"}… already_existed=${result.already_existed}`
      );

      res.status(result.already_existed ? 200 : 201).json(result);
    }
  );

  // ── POST /api/fantasy/claim/upgrade ────────────────────────────────────────
  //
  // Upgrades a specific guest claim to an authenticated claim.
  //
  // SECURITY: Requires explicit intent — both guest_token AND league_member_id
  // must be provided. The server validates that the claim matches BOTH fields
  // before upgrading. This prevents a sign-in on a shared device from silently
  // transferring a different person's seat.
  //
  // Auth: Bearer JWT required.
  // Body: { guest_token: string, league_member_id: string }
  //
  // UPDATE sets user_id = auth user, guest_token = NULL on the matching row.
  // No new row is created — partial unique index never violated.
  //
  // Idempotency: if the token is already cleared (prior upgrade), checks whether
  // the caller already holds an authenticated claim on that seat and returns
  // already_upgraded: true so retries succeed safely.
  //
  // Response:
  //   200 — upgraded: true
  //   200 — already_upgraded: true (same user already holds this seat)
  //   400 — guest_token or league_member_id missing
  //   404 — no active guest claim found matching guest_token + league_member_id
  //   409 — seat already claimed by a different authenticated user
  //   500 — DB error
  app.post(
    "/api/fantasy/claim/upgrade",
    async (req: Request, res: Response) => {
      const userId = requireFantasyAuth(req, res);
      if (!userId) return;

      const { guest_token, league_member_id } = req.body as {
        guest_token?: string;
        league_member_id?: string;
      };

      if (!guest_token?.trim()) {
        res.status(400).json({ error: "guest_token is required" });
        return;
      }
      if (!league_member_id?.trim()) {
        res.status(400).json({ error: "league_member_id is required" });
        return;
      }

      const gt  = guest_token.trim();
      const lmId = league_member_id.trim();
      const supabase = getServiceSupabase();

      // 1. Look up the active guest claim matching BOTH token AND specific seat
      const { data: guestClaim } = await supabase
        .from("fantasy_member_claims")
        .select("id, league_member_id, user_id")
        .eq("guest_token", gt)
        .eq("league_member_id", lmId)
        .eq("is_active", true)
        .maybeSingle();

      if (guestClaim) {
        const claimUserId = (guestClaim as any).user_id;

        // If the claim is somehow already authenticated (shouldn't happen if
        // guest_token is cleared on upgrade, but handle defensively)
        if (claimUserId !== null) {
          if (claimUserId === userId) {
            res.json({ already_upgraded: true, claim_id: (guestClaim as any).id });
            return;
          }
          res.status(409).json({ error: "This seat is already claimed by a different user." });
          return;
        }

        // 2. Upgrade: bind user_id, clear guest_token (same row, no new record)
        const { data: updated, error } = await supabase
          .from("fantasy_member_claims")
          .update({ user_id: userId, guest_token: null })
          .eq("id", (guestClaim as any).id)
          .select("id, league_member_id")
          .maybeSingle();

        if (error) {
          console.error("[fantasy] claim upgrade error:", error.message);
          res.status(500).json({ error: "Failed to upgrade claim" });
          return;
        }

        console.log(
          `[fantasy] Claim upgraded: member=${lmId.slice(0, 8)}… user=${userId.slice(0, 8)}…`
        );

        res.json({
          claim_id:         (updated as any).id,
          league_member_id: (updated as any).league_member_id,
          upgraded:         true,
        });
        return;
      }

      // 3. Guest claim not found by token+seat — check idempotency:
      //    did this user already upgrade (token cleared)?
      const { data: existingAuth } = await supabase
        .from("fantasy_member_claims")
        .select("id, user_id")
        .eq("league_member_id", lmId)
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      if (existingAuth) {
        // Same user already holds an authenticated claim on this seat
        res.json({ already_upgraded: true, claim_id: (existingAuth as any).id });
        return;
      }

      // 4. No guest claim found and caller has no authenticated claim — cannot upgrade
      res.status(404).json({
        error: "No active guest claim found for the provided token and seat.",
      });
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4A — FANTASY DRAFT DAY
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Local helpers ────────────────────────────────────────────────────────
  // Generates a collision-free 6-char room code (uppercase, unambiguous chars).
  async function generateFantasyRoomCode(
    supabase: ReturnType<typeof getServiceSupabase>
  ): Promise<string> {
    const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1
    for (let i = 0; i < 30; i++) {
      const code = Array.from({ length: 6 }, () =>
        CHARS[Math.floor(Math.random() * CHARS.length)]
      ).join("");
      const { data } = await supabase
        .from("gameday_rooms")
        .select("id")
        .eq("room_code", code)
        .maybeSingle();
      if (!data) return code;
    }
    throw new Error("Could not generate unique room code after 30 attempts");
  }

  // Builds structured answer_options for a Fantasy prop based on answer_target_type.
  // Always returns a JSONB-compatible array of {id, label, type} objects.
  // This snapshot is immutable after publish — later name/team edits don't affect it.
  //
  // supportsNoOne: when true and targetType is season_member or fantasy_team,
  // appends the stable synthetic option { id:"no_one", label:"No one", type:"static" }.
  // This is only set on templates where no participant completing the action is valid.
  // The "no_one" id is stable — never use the label string as canonical identity.
  function buildAnswerOptions(
    targetType: string | null,
    seasonMembers: Array<{ id: string; display_name: string | null }>,
    teams: Array<{ id: string; team_name: string | null }>,
    staticOptions?: any[],
    supportsNoOne = false
  ): Array<{ id: string; label: string; type: string }> {
    const NO_ONE = { id: "no_one", label: "No one", type: "static" };

    switch (targetType) {
      case "season_member": {
        const opts = seasonMembers.map((sm) => ({
          id:    sm.id,
          label: sm.display_name ?? "Unknown",
          type:  "season_member",
        }));
        if (supportsNoOne) opts.push(NO_ONE);
        return opts;
      }
      case "fantasy_team": {
        const opts = teams.map((t) => ({
          id:    t.id,
          label: t.team_name ?? "Unknown Team",
          type:  "fantasy_team",
        }));
        if (supportsNoOne) opts.push(NO_ONE);
        return opts;
      }
      case "yes_no":
        return [
          { id: "yes", label: "Yes", type: "yes_no" },
          { id: "no",  label: "No",  type: "yes_no" },
        ];
      case "static":
        // Static templates store existing string options; convert to object shape.
        return (staticOptions ?? []).map((opt: any, i: number) => ({
          id:    typeof opt === "string" ? opt.toLowerCase().replace(/\s+/g, "_") : `opt_${i}`,
          label: typeof opt === "string" ? opt : String(opt),
          type:  "static",
        }));
      default:
        return [];
    }
  }

  // ── GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/templates
  //
  // Returns curated Fantasy Draft Day prop templates filtered by the league's
  // sport, grouped into competition and season buckets.
  //
  // Auth: authenticated session or guest token (templates are read-only).
  app.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/templates",
    async (req: Request, res: Response) => {
      const identity = getCallerIdentity(req);
      if (!identity.userId && !identity.guestToken) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();

      // Get league sport
      const { data: season } = await supabase
        .from("fantasy_league_seasons")
        .select("fantasy_leagues(sport)")
        .eq("id", seasonId)
        .eq("league_id", leagueId)
        .maybeSingle();

      if (!season) {
        res.status(404).json({ error: "Season not found" });
        return;
      }

      const sport = (season as any).fantasy_leagues?.sport ?? "football";

      // Try with supports_no_one; fall back without it if the column doesn't
      // exist yet (migration not yet applied to Supabase).
      let templates: any[] | null = null;
      let templateError: any = null;

      const tmplResult = await supabase
        .from("gameday_prop_library")
        .select(
          "id, question, scoring_scope, point_value, answer_target_type, settlement_window, is_default, display_order, supports_no_one"
        )
        .eq("experience_type", "fantasy")
        .eq("competition_type", "draft_day")
        .eq("sport", sport)
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (tmplResult.error?.message?.includes("supports_no_one")) {
        console.warn("[fantasy] supports_no_one column missing — fetching templates without it");
        const fallback = await supabase
          .from("gameday_prop_library")
          .select(
            "id, question, scoring_scope, point_value, answer_target_type, settlement_window, is_default, display_order"
          )
          .eq("experience_type", "fantasy")
          .eq("competition_type", "draft_day")
          .eq("sport", sport)
          .eq("is_active", true)
          .order("display_order", { ascending: true });
        templates = (fallback.data ?? []).map((t: any) => ({ ...t, supports_no_one: false }));
        templateError = fallback.error;
      } else {
        templates = tmplResult.data ?? [];
        templateError = tmplResult.error;
      }

      if (templateError) {
        console.error("[fantasy] draft-day templates error:", templateError.message);
        res.status(500).json({ error: "Failed to fetch templates" });
        return;
      }

      const rows = templates ?? [];
      res.json({
        sport,
        competition: rows.filter((t: any) => t.scoring_scope === "competition"),
        season:      rows.filter((t: any) => t.scoring_scope === "season"),
      });
    }
  );

  // ── GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day
  //
  // Returns the current Draft Day competition status for this league season,
  // or null if no Draft Day has been published yet.
  //
  // Auth: authenticated session or guest token.
  app.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day",
    async (req: Request, res: Response) => {
      const identity = getCallerIdentity(req);
      if (!identity.userId && !identity.guestToken) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();

      // Find the primary Draft Day room for this season
      const { data: room } = await supabase
        .from("gameday_rooms")
        .select("id, status, room_code, created_at")
        .eq("league_season_id", seasonId)
        .eq("competition_type", "draft_day")
        .eq("experience_type", "fantasy")
        .is("archived_at", null)
        .order("created_at", { ascending: true })
        .maybeSingle();

      if (!room) {
        res.json(null);
        return;
      }

      // Get pick card
      const { data: card } = await supabase
        .from("gameday_pick_cards")
        .select("id, status")
        .eq("room_id", (room as any).id)
        .order("created_at", { ascending: true })
        .maybeSingle();

      if (!card) {
        res.json(null);
        return;
      }

      // Count props by scope AND collect current props with library metadata
      const { data: props } = await supabase
        .from("gameday_props")
        .select("id, template_prop_id, scoring_scope, point_value, display_order, status")
        .eq("card_id", (card as any).id)
        .order("display_order", { ascending: true });

      const propList  = props ?? [];
      const propIds   = propList.map((p: any) => p.id as string);
      const competitionCount = propList.filter((p: any) => p.scoring_scope === "competition").length;
      const seasonCount      = propList.filter((p: any) => p.scoring_scope === "season").length;
      const settledCompetitionCount = propList.filter(
        (p: any) => p.scoring_scope === "competition" && p.status === "settled"
      ).length;

      // Global pick count — total picks by ALL participants across this card's props.
      // gameday_picks has no card_id column; join via prop_id.
      let pickCount = 0;
      if (propIds.length > 0) {
        try {
          const { count } = await supabase
            .from("gameday_picks")
            .select("id", { count: "exact", head: true })
            .in("prop_id", propIds);
          pickCount = count ?? 0;
        } catch { pickCount = 0; }
      }

      // Enrich current_props with live library metadata (is_active, question, supports_no_one).
      // Used by manage mode to reconstruct selection including inactive legacy props.
      const templatePropIds = propList.map((p: any) => p.template_prop_id).filter(Boolean);
      let libraryMap: Record<string, { question: string; is_active: boolean; supports_no_one: boolean }> = {};
      if (templatePropIds.length > 0) {
        const { data: libRows } = await supabase
          .from("gameday_prop_library")
          .select("id, question, is_active, supports_no_one")
          .in("id", templatePropIds);
        for (const row of libRows ?? []) {
          libraryMap[(row as any).id] = {
            question:        (row as any).question ?? "",
            is_active:       (row as any).is_active ?? true,
            supports_no_one: (row as any).supports_no_one ?? false,
          };
        }
      }

      const currentProps = propList.map((p: any) => {
        const lib = libraryMap[p.template_prop_id] ?? { question: "", is_active: true, supports_no_one: false };
        return {
          template_prop_id: p.template_prop_id as string,
          question:         lib.question,
          scoring_scope:    p.scoring_scope as string,
          point_value:      p.point_value as number,
          is_active:        lib.is_active,
          supports_no_one:  lib.supports_no_one,
        };
      });

      // ── Viewer-specific pick count (my_pick_count) ────────────────────────────
      // Read-only — no participant creation. Returns 0 if the caller has no
      // participant row yet (first visit before entering the play screen).
      let myPickCount = 0;
      try {
        const viewerIdentity = getCallerIdentity(req);
        if ((viewerIdentity.userId || viewerIdentity.guestToken) && propIds.length > 0) {
          const viewerData = await resolveViewer(supabase, viewerIdentity, seasonId, leagueId);
          if (viewerData) {
            const { data: vParticipant } = await supabase
              .from("gameday_participants")
              .select("id")
              .eq("room_id", (room as any).id)
              .eq("season_member_id", viewerData.season_member_id)
              .maybeSingle();
            if (vParticipant) {
              const { count: myCount } = await supabase
                .from("gameday_picks")
                .select("id", { count: "exact", head: true })
                .in("prop_id", propIds)
                .eq("participant_id", (vParticipant as any).id);
              myPickCount = myCount ?? 0;
            }
          }
        }
      } catch { myPickCount = 0; }

      res.json({
        room_id:                   (room as any).id,
        card_id:                   (card as any).id,
        room_code:                 (room as any).room_code ?? null,
        room_status:               (room as any).status,
        card_status:               (card as any).status,
        prop_counts:               { competition: competitionCount, season: seasonCount },
        settled_competition_count: settledCompetitionCount,
        pick_count:                pickCount,
        my_pick_count:             myPickCount,
        current_props:             currentProps,
        created_at:                (room as any).created_at,
      });
    }
  );

  // ── POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/publish
  //
  // Atomically publishes a Fantasy Draft Day competition via the
  // publish_fantasy_draft_day RPC (creates room + pick_card + props).
  //
  // Auth: commissioner or co-commissioner only.
  //
  // Body: { selected_prop_ids: string[] }
  //
  // Idempotency: if a Draft Day already exists for this season, returns it
  // with already_existed=true. No duplicate room/props are created.
  //
  // Atomicity: all inserts happen inside the RPC's single PL/pgSQL transaction.
  // If the RPC fails, no partial state is left.
  app.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/publish",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const userId = commissioner.userId;

      const { selected_prop_ids } = req.body as { selected_prop_ids?: string[] };

      if (!Array.isArray(selected_prop_ids) || selected_prop_ids.length === 0) {
        res.status(400).json({ error: "select at least one question" });
        return;
      }

      // Hard cap: 15 questions maximum (enforced server-side; client also enforces)
      const MAX_DRAFT_DAY_QUESTIONS = 15;
      if (selected_prop_ids.length > MAX_DRAFT_DAY_QUESTIONS) {
        res.status(400).json({
          error: `Too many questions selected. Maximum is ${MAX_DRAFT_DAY_QUESTIONS}.`,
          max: MAX_DRAFT_DAY_QUESTIONS,
          selected: selected_prop_ids.length,
        });
        return;
      }

      // ── Gather league + season metadata ──────────────────────────────────
      const { data: season } = await supabase
        .from("fantasy_league_seasons")
        .select("id, season_year, fantasy_leagues(id, league_name, sport)")
        .eq("id", seasonId)
        .eq("league_id", leagueId)
        .maybeSingle();

      if (!season) {
        res.status(404).json({ error: "Season not found" });
        return;
      }

      const league     = (season as any).fantasy_leagues as any;
      const sport      = league.sport as string;
      const leagueName = league.league_name as string;
      const roomName   = `${leagueName} — ${(season as any).season_year} Draft Day`;

      // ── Fetch selected templates ──────────────────────────────────────────
      // Try with supports_no_one; fall back if the column doesn't exist yet.
      let templates: any[] | null = null;
      const tmplFull = await supabase
        .from("gameday_prop_library")
        .select(
          "id, question, scoring_scope, point_value, answer_target_type, answer_options, supports_no_one"
        )
        .in("id", selected_prop_ids)
        .eq("experience_type", "fantasy")
        .eq("competition_type", "draft_day")
        .eq("sport", sport)
        .eq("is_active", true);

      if (tmplFull.error?.message?.includes("supports_no_one")) {
        console.warn("[fantasy] publish: supports_no_one column missing — inserting without it");
        const tmplFallback = await supabase
          .from("gameday_prop_library")
          .select(
            "id, question, scoring_scope, point_value, answer_target_type, answer_options"
          )
          .in("id", selected_prop_ids)
          .eq("experience_type", "fantasy")
          .eq("competition_type", "draft_day")
          .eq("sport", sport)
          .eq("is_active", true);
        templates = (tmplFallback.data ?? []).map((t: any) => ({ ...t, supports_no_one: false }));
        if (tmplFallback.error) {
          res.status(400).json({ error: "No valid templates found for selection" });
          return;
        }
      } else {
        templates = tmplFull.data ?? [];
        if (tmplFull.error) {
          res.status(400).json({ error: "No valid templates found for selection" });
          return;
        }
      }

      if (!templates || templates.length === 0) {
        res.status(400).json({ error: "No valid templates found for selection" });
        return;
      }

      // ── Fetch season members for answer_options snapshot ─────────────────
      // display_name lives on fantasy_league_members (not fantasy_season_members).
      // Join via Supabase embedded select to get it in one round-trip.
      const { data: seasonMembers } = await supabase
        .from("fantasy_season_members")
        .select("id, fantasy_league_members(display_name)")
        .eq("league_season_id", seasonId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      // ── Fetch teams for fantasy_team targets ──────────────────────────────
      const { data: teams } = await supabase
        .from("fantasy_teams")
        .select("id, team_name")
        .eq("league_season_id", seasonId);

      // Flatten the embedded join result into { id, display_name }
      const memberList = (seasonMembers ?? []).map((sm: any) => ({
        id:           sm.id,
        display_name: sm.fantasy_league_members?.display_name ?? null,
      })) as Array<{ id: string; display_name: string | null }>;
      const teamList = (teams ?? []) as Array<{ id: string; team_name: string | null }>;

      // ── Build prop payload for RPC ────────────────────────────────────────
      // Preserve caller's ordering where possible; sort by original display_order.
      const propsPayload = (templates as any[]).map((tmpl, i) => ({
        library_id:         tmpl.id,
        question:           tmpl.question,
        answer_options:     buildAnswerOptions(
          tmpl.answer_target_type,
          memberList,
          teamList,
          tmpl.answer_options,
          tmpl.supports_no_one ?? false
        ),
        scoring_scope:      tmpl.scoring_scope,
        point_value:        tmpl.point_value,
        answer_target_type: tmpl.answer_target_type ?? null,
        display_order:      i,
      }));

      // ── Generate room code ────────────────────────────────────────────────
      let roomCode: string | null = null;
      try {
        roomCode = await generateFantasyRoomCode(supabase);
      } catch (e) {
        console.warn("[fantasy] room_code generation skipped:", (e as Error).message);
      }

      // ── Idempotency check ─────────────────────────────────────────────────
      // If a Draft Day room already exists for this season, return it unchanged.
      const { data: existingRoom } = await supabase
        .from("gameday_rooms")
        .select("id")
        .eq("league_season_id", seasonId)
        .eq("competition_type", "draft_day")
        .eq("experience_type", "fantasy")
        .is("archived_at", null)
        .maybeSingle();

      if (existingRoom) {
        const { data: existingCard } = await supabase
          .from("gameday_pick_cards")
          .select("id")
          .eq("room_id", (existingRoom as any).id)
          .maybeSingle();

        console.log(
          `[fantasy] Draft Day already exists: room=${String((existingRoom as any).id).slice(0, 8)}… (idempotent)`
        );
        res.status(200).json({
          room_id:         (existingRoom as any).id,
          card_id:         (existingCard as any)?.id ?? null,
          room_code:       null,
          already_existed: true,
        });
        return;
      }

      // ── Atomic publish via publish_fantasy_draft_day() RPC ───────────────────
      // All inserts (room + pick_card + props) happen inside a single PL/pgSQL
      // transaction. If anything fails, the DB rolls back automatically — no
      // orphan rows, no partial state.
      //
      // The RPC creates the pick card directly with status='open' (Phase 4A.1
      // atomic lifecycle fix applied). No post-RPC mutation is needed.
      // Lifecycle: open → locked → settled.
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "publish_fantasy_draft_day",
        {
          p_league_season_id: seasonId,
          p_room_name:        roomName,
          p_sport:            sport,
          p_room_code:        roomCode,
          p_host_user_id:     userId,
          p_props:            propsPayload,
        }
      );

      if (rpcError || !rpcResult) {
        console.error("[fantasy] publish_fantasy_draft_day RPC error:", rpcError?.message);
        res.status(500).json({ error: "Failed to publish Draft Day" });
        return;
      }

      const newRoomId      = rpcResult.room_id as string;
      const newCardId      = rpcResult.card_id as string;
      const alreadyExisted = rpcResult.already_existed as boolean;

      if (alreadyExisted) {
        console.log(
          `[fantasy] Draft Day already exists (RPC idempotent): room=${String(newRoomId).slice(0, 8)}…`
        );
        res.status(200).json({
          room_id:         newRoomId,
          card_id:         newCardId,
          room_code:       null,
          already_existed: true,
        });
        return;
      }

      console.log(
        `[fantasy] Draft Day published via RPC: season=${seasonId.slice(0, 8)}… room=${newRoomId.slice(0, 8)}… props=${propsPayload.length}`
      );

      res.status(201).json({
        room_id:         newRoomId,
        card_id:         newCardId,
        room_code:       roomCode,
        already_existed: false,
      });
    }
  );

  // ── PATCH /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/props
  //
  // Commissioner-only. Atomically replaces props on an existing Draft Day
  // when editing is safe: card.status='open' AND pick_count=0.
  //
  // Grandfathering: templates that were already published are allowed even if
  // now inactive. New templates (not in the existing set) must be active.
  //
  // Auth: commissioner or co-commissioner only.
  //
  // Body: { selected_prop_ids: string[] }
  //
  // Errors:
  //   404 — no Draft Day room / card for this season
  //   409 — card is locked/settled (cannot edit) OR picks already exist
  //   400 — 0 or >15 templates, or invalid new template
  //   500 — RPC failure (requires supabase/gameday-fantasy-phase4a2-manage.sql)
  app.patch(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/props",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res, supabase, leagueId, seasonId);
      if (!commissioner) return;

      const { selected_prop_ids } = req.body as { selected_prop_ids?: string[] };
      if (!Array.isArray(selected_prop_ids) || selected_prop_ids.length === 0) {
        res.status(400).json({ error: "select at least one question" });
        return;
      }

      const MAX_DRAFT_DAY_QUESTIONS = 15;
      if (selected_prop_ids.length > MAX_DRAFT_DAY_QUESTIONS) {
        res.status(400).json({
          error:    `Too many questions selected. Maximum is ${MAX_DRAFT_DAY_QUESTIONS}.`,
          max:      MAX_DRAFT_DAY_QUESTIONS,
          selected: selected_prop_ids.length,
        });
        return;
      }

      // ── Find room ───────────────────────────────────────────────────────────
      const { data: room } = await supabase
        .from("gameday_rooms")
        .select("id, status")
        .eq("league_season_id", seasonId)
        .eq("competition_type", "draft_day")
        .eq("experience_type", "fantasy")
        .is("archived_at", null)
        .maybeSingle();

      if (!room) {
        res.status(404).json({ error: "No published Draft Day found for this season" });
        return;
      }

      // ── Find pick card ──────────────────────────────────────────────────────
      const { data: card } = await supabase
        .from("gameday_pick_cards")
        .select("id, status")
        .eq("room_id", (room as any).id)
        .maybeSingle();

      if (!card) {
        res.status(404).json({ error: "Draft Day pick card not found" });
        return;
      }

      const cardStatus = (card as any).status as string;
      const cardId     = (card as any).id as string;

      // ── Lifecycle guard: must be open ───────────────────────────────────────
      if (cardStatus !== "open") {
        res.status(409).json({
          error: cardStatus === "locked"
            ? "Draft Day picks are locked. Unlock picks before making changes."
            : "Draft Day has been finalized and cannot be changed.",
          card_status: cardStatus,
        });
        return;
      }

      // ── Pick count guard (GLOBAL) ────────────────────────────────────────────
      // gameday_picks has no card_id column — join via prop_id.
      // Fetch existing prop IDs for this card first.
      const { data: existingCardPropsForGuard } = await supabase
        .from("gameday_props")
        .select("id")
        .eq("card_id", cardId);
      const guardPropIds = (existingCardPropsForGuard ?? []).map((p: any) => p.id as string);

      let pickCount = 0;
      if (guardPropIds.length > 0) {
        try {
          const { count } = await supabase
            .from("gameday_picks")
            .select("id", { count: "exact", head: true })
            .in("prop_id", guardPropIds);
          pickCount = count ?? 0;
        } catch { pickCount = 0; }
      }

      if (pickCount > 0) {
        res.status(409).json({
          error:      "Members have already submitted picks. Draft Day questions cannot be changed.",
          pick_count: pickCount,
        });
        return;
      }

      // ── Gather league + season metadata ─────────────────────────────────────
      const { data: season } = await supabase
        .from("fantasy_league_seasons")
        .select("id, season_year, fantasy_leagues(id, league_name, sport)")
        .eq("id", seasonId)
        .eq("league_id", leagueId)
        .maybeSingle();

      if (!season) {
        res.status(404).json({ error: "Season not found" });
        return;
      }

      const sport = ((season as any).fantasy_leagues as any).sport as string;

      // ── Template validation (grandfathering rule) ───────────────────────────
      // Templates already in the published set are grandfathered (kept even if
      // now inactive). Only NEW additions must pass the is_active check.
      const { data: existingProps } = await supabase
        .from("gameday_props")
        .select("template_prop_id")
        .eq("card_id", cardId);

      const existingIds      = new Set((existingProps ?? []).map((p: any) => p.template_prop_id as string));
      const grandfatheredIds = selected_prop_ids.filter((id) => existingIds.has(id));
      const newIds           = selected_prop_ids.filter((id) => !existingIds.has(id));

      // Grandfathered: no is_active filter (already published; may be inactive)
      let grandfatheredTemplates: any[] = [];
      if (grandfatheredIds.length > 0) {
        const { data: gfData } = await supabase
          .from("gameday_prop_library")
          .select("id, question, scoring_scope, point_value, answer_target_type, answer_options, supports_no_one")
          .in("id", grandfatheredIds)
          .eq("experience_type", "fantasy")
          .eq("competition_type", "draft_day")
          .eq("sport", sport);
        grandfatheredTemplates = gfData ?? [];

        if (grandfatheredTemplates.length !== grandfatheredIds.length) {
          const found   = new Set(grandfatheredTemplates.map((t: any) => t.id));
          const missing = grandfatheredIds.filter((id) => !found.has(id));
          res.status(400).json({ error: `Existing templates not found in library: ${missing.join(", ")}` });
          return;
        }
      }

      // New: must be active, correct experience/competition/sport
      let newTemplates: any[] = [];
      if (newIds.length > 0) {
        const newFull = await supabase
          .from("gameday_prop_library")
          .select("id, question, scoring_scope, point_value, answer_target_type, answer_options, supports_no_one")
          .in("id", newIds)
          .eq("experience_type", "fantasy")
          .eq("competition_type", "draft_day")
          .eq("sport", sport)
          .eq("is_active", true);

        if (newFull.error?.message?.includes("supports_no_one")) {
          const fb = await supabase
            .from("gameday_prop_library")
            .select("id, question, scoring_scope, point_value, answer_target_type, answer_options")
            .in("id", newIds)
            .eq("experience_type", "fantasy")
            .eq("competition_type", "draft_day")
            .eq("sport", sport)
            .eq("is_active", true);
          newTemplates = (fb.data ?? []).map((t: any) => ({ ...t, supports_no_one: false }));
        } else {
          newTemplates = newFull.data ?? [];
        }

        if (newTemplates.length !== newIds.length) {
          const found   = new Set(newTemplates.map((t: any) => t.id));
          const invalid = newIds.filter((id) => !found.has(id));
          res.status(400).json({
            error:       `Some templates are not available: ${invalid.join(", ")}`,
            invalid_ids: invalid,
          });
          return;
        }
      }

      // Build lookup by id to preserve selected_prop_ids ordering
      const templateById: Record<string, any> = {};
      for (const t of [...grandfatheredTemplates, ...newTemplates]) templateById[t.id] = t;

      // ── Fetch members + teams for answer_options snapshot ───────────────────
      const [membersResult, teamsResult] = await Promise.all([
        supabase
          .from("fantasy_season_members")
          .select("id, fantasy_league_members(display_name)")
          .eq("league_season_id", seasonId)
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        supabase
          .from("fantasy_teams")
          .select("id, team_name")
          .eq("league_season_id", seasonId),
      ]);

      const memberList = (membersResult.data ?? []).map((sm: any) => ({
        id:           sm.id,
        display_name: sm.fantasy_league_members?.display_name ?? null,
      })) as Array<{ id: string; display_name: string | null }>;
      const teamList = (teamsResult.data ?? []) as Array<{ id: string; team_name: string | null }>;

      // ── Build props payload (preserving selection order) ────────────────────
      const propsPayload = selected_prop_ids.map((id, i) => {
        const tmpl = templateById[id];
        return {
          library_id:         tmpl.id,
          question:           tmpl.question,
          answer_options:     buildAnswerOptions(
            tmpl.answer_target_type,
            memberList,
            teamList,
            tmpl.answer_options,
            tmpl.supports_no_one ?? false
          ),
          scoring_scope:      tmpl.scoring_scope,
          point_value:        tmpl.point_value,
          answer_target_type: tmpl.answer_target_type ?? null,
          display_order:      i,
        };
      });

      // ── Atomic replace via update_fantasy_draft_day_props RPC ───────────────
      // Requires: supabase/gameday-fantasy-phase4a2-manage.sql applied.
      const { error: rpcError } = await supabase.rpc(
        "update_fantasy_draft_day_props",
        { p_card_id: cardId, p_props: propsPayload }
      );

      if (rpcError) {
        console.error("[fantasy] update_fantasy_draft_day_props RPC error:", rpcError.message);
        res.status(500).json({ error: "Failed to update Draft Day questions. Is the Phase 4A.2 SQL applied?" });
        return;
      }

      // Fetch updated counts for the response
      const { data: updatedProps } = await supabase
        .from("gameday_props")
        .select("scoring_scope")
        .eq("card_id", cardId);

      const updatedList = updatedProps ?? [];
      const compCount   = updatedList.filter((p: any) => p.scoring_scope === "competition").length;
      const seasCount   = updatedList.filter((p: any) => p.scoring_scope === "season").length;

      console.log(
        `[fantasy] Draft Day props updated: card=${cardId.slice(0, 8)}… props=${propsPayload.length}`
      );

      res.json({
        card_id:     cardId,
        room_id:     (room as any).id,
        prop_counts: { competition: compCount, season: seasCount },
      });
    }
  );

  // ── POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/lock
  //
  // Locks the Draft Day pick card. Once locked, members cannot change picks
  // (Phase 4B). Commissioner taps this when the actual fantasy draft begins.
  //
  // Auth: commissioner or co-commissioner only.
  //
  // Idempotent: if already locked, returns current status.
  app.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/lock",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const userId = commissioner.userId;

      // Find the Draft Day room + card
      const { data: room } = await supabase
        .from("gameday_rooms")
        .select("id")
        .eq("league_season_id", seasonId)
        .eq("competition_type", "draft_day")
        .eq("experience_type", "fantasy")
        .is("archived_at", null)
        .maybeSingle();

      if (!room) {
        res.status(404).json({ error: "No published Draft Day found for this season" });
        return;
      }

      const { data: card } = await supabase
        .from("gameday_pick_cards")
        .select("id, status")
        .eq("room_id", (room as any).id)
        .maybeSingle();

      if (!card) {
        res.status(404).json({ error: "Draft Day pick card not found" });
        return;
      }

      const currentStatus = (card as any).status as string;

      // Idempotent: already locked or settled
      if (currentStatus === "locked" || currentStatus === "settled") {
        res.json({ card_status: currentStatus, already_locked: true });
        return;
      }

      // Lock the card
      const { error } = await supabase
        .from("gameday_pick_cards")
        .update({ status: "locked", updated_at: new Date().toISOString() })
        .eq("id", (card as any).id);

      if (error) {
        console.error("[fantasy] draft-day lock error:", error.message);
        res.status(500).json({ error: "Failed to lock Draft Day" });
        return;
      }

      console.log(
        `[fantasy] Draft Day locked: card=${String((card as any).id).slice(0, 8)}… by=${userId.slice(0, 8)}…`
      );

      res.json({ card_status: "locked", already_locked: false });
    }
  );

  // ── POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/unlock
  //
  // Unlocks the Draft Day pick card, returning it to 'open' status.
  // Permitted only before settlement begins (no props in 'settled' state).
  //
  // Auth: commissioner or co-commissioner only.
  //
  // Lifecycle guard:
  //   • card.status = 'settled'    → 409 (finalized; cannot unlock)
  //   • any prop.status = 'settled' → 409 (settlement started; cannot unlock)
  //   • card.status = 'open'       → 200 already_unlocked=true (idempotent)
  //   • card.status = 'locked'     → 200 card_status='open' (unlocked)
  app.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/unlock",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const userId = commissioner.userId;

      // Find the Draft Day room + card
      const { data: room } = await supabase
        .from("gameday_rooms")
        .select("id")
        .eq("league_season_id", seasonId)
        .eq("competition_type", "draft_day")
        .eq("experience_type", "fantasy")
        .is("archived_at", null)
        .maybeSingle();

      if (!room) {
        res.status(404).json({ error: "No published Draft Day found for this season" });
        return;
      }

      const { data: card } = await supabase
        .from("gameday_pick_cards")
        .select("id, status")
        .eq("room_id", (room as any).id)
        .maybeSingle();

      if (!card) {
        res.status(404).json({ error: "Draft Day pick card not found" });
        return;
      }

      const currentStatus = (card as any).status as string;

      // Hard block: finalized — cannot unlock a settled competition
      if (currentStatus === "settled") {
        res.status(409).json({
          error:       "Cannot unlock a finalized Draft Day competition",
          card_status: currentStatus,
        });
        return;
      }

      // Settlement-started guard: if any prop is settled, settlement has begun
      const { count: settledCount } = await supabase
        .from("gameday_props")
        .select("id", { count: "exact", head: true })
        .eq("card_id", (card as any).id)
        .eq("status", "settled");

      if ((settledCount ?? 0) > 0) {
        res.status(409).json({
          error:          "Cannot unlock after settlement has started",
          settled_props:  settledCount,
        });
        return;
      }

      // Idempotent: already open (or closed — both mean picks not locked)
      if (currentStatus === "open" || currentStatus === "closed") {
        res.json({ card_status: currentStatus, already_unlocked: true });
        return;
      }

      // Unlock: set to 'open'
      const { error } = await supabase
        .from("gameday_pick_cards")
        .update({ status: "open", updated_at: new Date().toISOString() })
        .eq("id", (card as any).id);

      if (error) {
        console.error("[fantasy] draft-day unlock error:", error.message);
        res.status(500).json({ error: "Failed to unlock Draft Day" });
        return;
      }

      console.log(
        `[fantasy] Draft Day unlocked: card=${String((card as any).id).slice(0, 8)}… by=${userId.slice(0, 8)}…`
      );

      res.json({ card_status: "open", already_unlocked: false });
    }
  );

  // ── GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/play ──────
  //
  // Member-facing play state for Draft Day.
  //
  // - Resolves the caller via userId or guestToken.
  // - Creates a gameday_participants row if needed (idempotent via partial
  //   unique index). This is the ONLY endpoint that creates participants — the
  //   hub's GET /draft-day intentionally does NOT.
  // - Returns all published props with answer_options (snapshot).
  //   correct_answer is intentionally stripped.
  // - Returns my_picks: a propId→answerId map for this participant only.
  // - Returns my_pick_count, total_props for progress display.
  //
  // Auth: any resolved viewer (authenticated user OR guest with a claim).
  app.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/play",
    async (req: Request, res: Response) => {
      const supabase  = getServiceSupabase();
      const { leagueId, seasonId } = req.params;
      const identity  = getCallerIdentity(req);

      if (!identity.userId && !identity.guestToken) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // ── Resolve viewer ────────────────────────────────────────────────────────
      const viewer = await resolveViewer(supabase, identity, seasonId, leagueId);
      if (!viewer) {
        res.status(403).json({ error: "You are not a member of this league for this season." });
        return;
      }

      // ── Find Draft Day room for this season ───────────────────────────────────
      const { data: room } = await supabase
        .from("gameday_rooms")
        .select("id, status, room_code")
        .eq("league_season_id", seasonId)
        .eq("experience_type", "fantasy")
        .eq("competition_type", "draft_day")
        .maybeSingle();

      if (!room) {
        res.status(404).json({ error: "No Draft Day competition found for this season." });
        return;
      }

      const roomId = (room as any).id as string;

      // ── Find the pick card ────────────────────────────────────────────────────
      // roster_revision added by Migration 002 — fall back to base select if not yet applied.
      let card: Record<string, any> | null = null;
      let migration002Applied = false;
      {
        const { data: d1, error: e1 } = await supabase
          .from("gameday_pick_cards")
          .select("id, status, roster_revision")
          .eq("room_id", roomId)
          .eq("phase", "draft_day")
          .maybeSingle();
        if (!e1) { card = d1 as any; migration002Applied = true; }
        else {
          const { data: d2 } = await supabase
            .from("gameday_pick_cards")
            .select("id, status")
            .eq("room_id", roomId)
            .eq("phase", "draft_day")
            .maybeSingle();
          card = d2 as any;
        }
      }

      if (!card) {
        res.status(404).json({ error: "Draft Day card not found." });
        return;
      }

      const cardStatus         = card.status as string;
      const cardRosterRevision = card.roster_revision ?? 0;

      // ── Eligibility guard — late "Add to League Only" members cannot play ────────
      if (!viewer.draft_day_eligible) {
        res.status(403).json({
          error: "You are not eligible for this Draft Day competition.",
          draft_day_eligible: false,
        });
        return;
      }

      // ── Ensure participant (participant creation lives here, NOT in GET /draft-day) ──
      const { participant_id: participantId } = await ensureFantasyParticipant(
        supabase,
        roomId,
        viewer
      );

      // ── Fetch published props — strip correct_answer ──────────────────────────
      const { data: rawProps } = await supabase
        .from("gameday_props")
        .select("id, question, scoring_scope, point_value, answer_options, answer_target_type, display_order")
        .eq("card_id", (card as any).id)
        .order("display_order", { ascending: true });

      const publishedProps = (rawProps ?? []).map((p: any) => ({
        id:                  p.id as string,
        question:            p.question as string,
        scoring_scope:       p.scoring_scope as string,
        point_value:         p.point_value as number,
        answer_target_type:  p.answer_target_type as string,
        // answer_options is the authoritative published snapshot; correct_answer excluded
        answer_options: Array.isArray(p.answer_options) ? p.answer_options : [],
        display_order:  p.display_order as number,
      }));

      const propIds    = publishedProps.map((p) => p.id);
      const totalProps = publishedProps.length;

      // Track which props are roster-target (season_member or fantasy_team) for
      // stale-pick detection. Roster changes don't affect yes_no / static / player props.
      const rosterTargetPropIds = new Set(
        publishedProps
          .filter((p) => p.answer_target_type === "season_member" || p.answer_target_type === "fantasy_team")
          .map((p) => p.id)
      );

      // ── Fetch this participant's picks ────────────────────────────────────────
      // answer_universe_revision added by Migration 002 — fall back if not yet applied.
      let rawPicks: any[] = [];
      if (propIds.length > 0) {
        const { data: rp1, error: rpErr } = await supabase
          .from("gameday_picks")
          .select("prop_id, selected_answer, answer_universe_revision")
          .in("prop_id", propIds)
          .eq("participant_id", participantId);
        if (!rpErr) {
          rawPicks = (rp1 ?? []) as any[];
        } else {
          const { data: rp2 } = await supabase
            .from("gameday_picks")
            .select("prop_id, selected_answer")
            .in("prop_id", propIds)
            .eq("participant_id", participantId);
          rawPicks = (rp2 ?? []) as any[];
        }
      }

      const myPicks: Record<string, string> = {};
      const stalePropIds: string[] = [];
      for (const pick of rawPicks ?? []) {
        const propId  = (pick as any).prop_id as string;
        const pickRev = (pick as any).answer_universe_revision ?? 0;
        myPicks[propId] = (pick as any).selected_answer as string;
        // Flag picks made before the latest roster expansion on roster-target props
        if (rosterTargetPropIds.has(propId) && pickRev < cardRosterRevision) {
          stalePropIds.push(propId);
        }
      }
      const myPickCount = Object.keys(myPicks).length;

      // ── Global pick count (for informational use; not used for member UI) ─────
      let globalPickCount = 0;
      if (propIds.length > 0) {
        try {
          const { count } = await supabase
            .from("gameday_picks")
            .select("id", { count: "exact", head: true })
            .in("prop_id", propIds);
          globalPickCount = count ?? 0;
        } catch { globalPickCount = 0; }
      }

      // ── League name (for display) ─────────────────────────────────────────────
      const { data: seasonRow } = await supabase
        .from("fantasy_league_seasons")
        .select("fantasy_leagues(league_name)")
        .eq("id", seasonId)
        .maybeSingle();
      const leagueName = (seasonRow as any)?.fantasy_leagues?.league_name ?? null;

      res.json({
        room_id:              roomId,
        card_id:              (card as any).id,
        room_code:            (room as any).room_code ?? null,
        card_status:          cardStatus,
        roster_revision:      cardRosterRevision,
        stale_pick_prop_ids:  stalePropIds,
        participant_id:       participantId,
        props:                publishedProps,
        my_picks:             myPicks,
        my_pick_count:        myPickCount,
        total_props:          totalProps,
        pick_count:           globalPickCount,
        league_name:          leagueName,
      });
    }
  );

  // ── POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/picks ────
  //
  // Submit (or update) a single pick for a Draft Day prop.
  //
  // Validation:
  //   1. Card must be "open" (not locked / settled). Returns 409 if locked.
  //   2. Prop must belong to this card (cross-season protection).
  //   3. selected_answer must exactly match an answer_options[].id in the
  //      PUBLISHED prop snapshot — not the live template library.
  //   4. "no_one" is only valid if the published prop contains {id:"no_one"}.
  //
  // Upsert: UNIQUE (prop_id, participant_id) means re-submitting the same prop
  // overwrites the previous answer (edit while open).
  //
  // Auth: any resolved viewer.
  app.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/picks",
    async (req: Request, res: Response) => {
      const supabase  = getServiceSupabase();
      const { leagueId, seasonId } = req.params;
      const identity  = getCallerIdentity(req);

      if (!identity.userId && !identity.guestToken) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { prop_id, selected_answer } = req.body ?? {};

      if (!prop_id || typeof prop_id !== "string") {
        res.status(400).json({ error: "prop_id is required" });
        return;
      }
      if (!selected_answer || typeof selected_answer !== "string") {
        res.status(400).json({ error: "selected_answer is required" });
        return;
      }

      // ── Resolve viewer ────────────────────────────────────────────────────────
      const viewer = await resolveViewer(supabase, identity, seasonId, leagueId);
      if (!viewer) {
        res.status(403).json({ error: "You are not a member of this league for this season." });
        return;
      }

      // ── Eligibility guard — late "Add to League Only" members cannot pick ─────
      if (!viewer.draft_day_eligible) {
        res.status(403).json({
          error: "You are not eligible for this Draft Day competition.",
          draft_day_eligible: false,
        });
        return;
      }

      // ── Find Draft Day room for this season ───────────────────────────────────
      const { data: room } = await supabase
        .from("gameday_rooms")
        .select("id, status")
        .eq("league_season_id", seasonId)
        .eq("experience_type", "fantasy")
        .eq("competition_type", "draft_day")
        .maybeSingle();

      if (!room) {
        res.status(404).json({ error: "No Draft Day competition found." });
        return;
      }

      const roomId = (room as any).id as string;

      // ── Find pick card — must be open ─────────────────────────────────────────
      // roster_revision added by Migration 002 — fall back to base select if not yet applied.
      let card: Record<string, any> | null = null;
      let migration002Applied = false;
      {
        const { data: d1, error: e1 } = await supabase
          .from("gameday_pick_cards")
          .select("id, status, roster_revision")
          .eq("room_id", roomId)
          .eq("phase", "draft_day")
          .maybeSingle();
        if (!e1) { card = d1 as any; migration002Applied = true; }
        else {
          const { data: d2 } = await supabase
            .from("gameday_pick_cards")
            .select("id, status")
            .eq("room_id", roomId)
            .eq("phase", "draft_day")
            .maybeSingle();
          card = d2 as any;
        }
      }

      if (!card) {
        res.status(404).json({ error: "Draft Day card not found." });
        return;
      }

      const cardStatus         = card.status as string;
      const cardRosterRevision = card.roster_revision ?? 0;

      if (cardStatus !== "open") {
        res.status(409).json({
          error:       "Picks are locked. No more changes accepted.",
          card_status: cardStatus,
        });
        return;
      }

      // ── Validate prop belongs to THIS card (cross-season protection) ──────────
      const { data: prop } = await supabase
        .from("gameday_props")
        .select("id, answer_options")
        .eq("id", prop_id)
        .eq("card_id", (card as any).id)
        .maybeSingle();

      if (!prop) {
        res.status(400).json({ error: "Prop not found on this Draft Day card." });
        return;
      }

      // ── Validate selected_answer against the PUBLISHED snapshot ───────────────
      // Do NOT check the live prop_library template — the snapshot is authoritative.
      // This preserves historical integrity even if the template is modified later.
      const answerOptions: Array<{ id: string }> = Array.isArray((prop as any).answer_options)
        ? (prop as any).answer_options
        : [];
      const validAnswerIds = new Set(answerOptions.map((o) => o.id));

      if (!validAnswerIds.has(selected_answer)) {
        res.status(400).json({
          error:           "Invalid answer. selected_answer must match a published answer option ID.",
          valid_answer_ids: Array.from(validAnswerIds),
        });
        return;
      }

      // ── Ensure participant (idempotent) ───────────────────────────────────────
      const { participant_id: participantId } = await ensureFantasyParticipant(
        supabase,
        roomId,
        viewer
      );

      // ── Upsert pick via UNIQUE (prop_id, participant_id) ──────────────────────
      // answer_universe_revision captures the card's roster_revision at pick time.
      // The play state uses this to flag picks that pre-date a roster expansion.
      // Only included when Migration 002 is confirmed applied (migration002Applied=true).
      const pickPayload: Record<string, any> = {
        prop_id:         prop_id,
        participant_id:  participantId,
        selected_answer: selected_answer,
        submitted_at:    new Date().toISOString(),
      };
      if (migration002Applied) {
        pickPayload.answer_universe_revision = cardRosterRevision;
      }
      const { data: upserted, error: upsertErr } = await supabase
        .from("gameday_picks")
        .upsert(pickPayload, { onConflict: "prop_id,participant_id" })
        .select("id, prop_id, selected_answer")
        .single();

      if (upsertErr) {
        console.error("[fantasy] pick upsert error:", upsertErr.message);
        res.status(500).json({ error: "Failed to save pick. Please try again." });
        return;
      }

      res.json({
        pick_id:         (upserted as any).id,
        prop_id:         (upserted as any).prop_id,
        selected_answer: (upserted as any).selected_answer,
      });
    }
  );

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  Phase 4C — Draft Day Settlement & Results                             ║
  // ╚══════════════════════════════════════════════════════════════════════════╝

  // ── Internal: shared room + card lookup ────────────────────────────────────
  async function _getDdRoomAndCard(
    supabase: ReturnType<typeof getServiceSupabase>,
    seasonId: string
  ): Promise<{ ok: true; room: any; card: any } | { ok: false; status: number; body: object }> {
    const { data: room } = await supabase
      .from("gameday_rooms")
      .select("id, status")
      .eq("league_season_id", seasonId)
      .eq("competition_type", "draft_day")
      .eq("experience_type", "fantasy")
      .is("archived_at", null)
      .maybeSingle();
    if (!room) return { ok: false, status: 404, body: { error: "No published Draft Day found for this season" } };
    const { data: card } = await supabase
      .from("gameday_pick_cards")
      .select("id, status")
      .eq("room_id", (room as any).id)
      .order("created_at", { ascending: true })
      .maybeSingle();
    if (!card) return { ok: false, status: 404, body: { error: "Draft Day pick card not found" } };
    return { ok: true, room, card };
  }

  // ── Internal: build leaderboard from participants + settled comp picks ──────
  async function _buildLeaderboard(
    supabase: ReturnType<typeof getServiceSupabase>,
    roomId: string,
    competitionProps: any[]
  ): Promise<any[]> {
    const competitionPropIds = competitionProps.map((p: any) => p.id as string);
    const pointValueMap: Record<string, number> = {};
    for (const p of competitionProps) pointValueMap[p.id] = (p.point_value as number) ?? 0;

    const { data: participants } = await supabase
      .from("gameday_participants")
      .select("id, display_name, season_member_id")
      .eq("room_id", roomId);
    const participantList = (participants ?? []) as any[];

    let allPicks: any[] = [];
    if (participantList.length > 0 && competitionPropIds.length > 0) {
      const { data: picks } = await supabase
        .from("gameday_picks")
        .select("participant_id, prop_id, is_correct")
        .in("prop_id", competitionPropIds)
        .in("participant_id", participantList.map((p: any) => p.id as string));
      allPicks = picks ?? [];
    }

    // Resolve team names: season_member_id → fantasy_team_managers → fantasy_teams
    const seasonMemberIds = participantList.map((p: any) => p.season_member_id).filter(Boolean);
    const teamMap: Record<string, string> = {};
    if (seasonMemberIds.length > 0) {
      const { data: managers } = await supabase
        .from("fantasy_team_managers")
        .select("season_member_id, fantasy_teams(team_name)")
        .in("season_member_id", seasonMemberIds);
      for (const m of managers ?? []) {
        if ((m as any).fantasy_teams?.team_name) {
          teamMap[(m as any).season_member_id] = (m as any).fantasy_teams.team_name;
        }
      }
    }

    const scores = participantList.map((p: any) => {
      const correctPicks = allPicks.filter(
        (pk: any) => pk.participant_id === p.id && pk.is_correct === true
      );
      const points = correctPicks.reduce(
        (sum: number, pk: any) => sum + (pointValueMap[pk.prop_id] ?? 0), 0
      );
      return {
        participant_id:  p.id as string,
        season_member_id: p.season_member_id as string | null,
        display_name:    p.display_name as string,
        team_name:       p.season_member_id ? (teamMap[p.season_member_id] ?? null) : null,
        points,
        correct_count:   correctPicks.length,
      };
    });

    // Sort: points DESC, correct_count DESC
    scores.sort((a: any, b: any) => b.points - a.points || b.correct_count - a.correct_count);

    return scores.map((s: any) => {
      const rank = scores.filter((x: any) => x.points > s.points).length + 1;
      const tieCount = scores.filter((x: any) => x.points === s.points).length;
      return { ...s, rank, rank_label: tieCount > 1 ? `T-${rank}` : String(rank) };
    });
  }

  // ── GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/settlement
  //
  // Commissioner-only. Returns all competition props with settlement state,
  // progress, and a preview leaderboard (based on currently-settled props).
  app.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/settlement",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res, supabase, leagueId, seasonId);
      if (!commissioner) return;

      const rc = await _getDdRoomAndCard(supabase, seasonId);
      if (!rc.ok) { res.status(rc.status).json(rc.body); return; }
      const { room, card } = rc;

      const { data: allProps } = await supabase
        .from("gameday_props")
        .select("id, question, answer_options, scoring_scope, point_value, display_order, status, correct_answer")
        .eq("card_id", (card as any).id)
        .order("display_order", { ascending: true });
      const propList = (allProps ?? []) as any[];
      const competitionProps = propList.filter((p: any) => p.scoring_scope === "competition");
      const totalCompCount  = competitionProps.length;
      const settledCount    = competitionProps.filter((p: any) => p.status === "settled").length;

      const previewLeaderboard = settledCount > 0
        ? await _buildLeaderboard(supabase, (room as any).id, competitionProps)
        : [];

      res.json({
        room_id:    (room as any).id,
        card_id:    (card as any).id,
        card_status: (card as any).status,
        room_status: (room as any).status,
        competition_props: competitionProps.map((p: any) => ({
          id:             p.id,
          question:       p.question,
          display_order:  p.display_order,
          point_value:    p.point_value,
          scoring_scope:  p.scoring_scope,
          status:         p.status,
          correct_answer: p.correct_answer ?? null,
          answer_options: Array.isArray(p.answer_options) ? p.answer_options : [],
        })),
        settled_count:          settledCount,
        total_competition_count: totalCompCount,
        all_settled:            totalCompCount > 0 && settledCount === totalCompCount,
        preview_leaderboard:    previewLeaderboard,
      });
    }
  );

  // ── POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/settle
  //
  // Commissioner-only. Settles a single prop using the shared settlePropCore helper.
  //
  // Competition props:
  //   - Card must be locked.
  //   - Blocked if room is already finalized (history is sealed).
  //   - Idempotent: same prop + same answer → 200 ok.
  //   - Conflict: same prop + different answer → 409.
  //
  // Season props:
  //   - Allowed even after Draft Day finalization (for late season settlement).
  //   - Idempotent and conflict rules same as competition.
  //
  // correct_answer must be a valid published answer option ID (JSONB objects).
  app.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/settle",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res, supabase, leagueId, seasonId);
      if (!commissioner) return;

      const { prop_id, correct_answer } = req.body as { prop_id?: string; correct_answer?: string };
      if (!prop_id)       { res.status(400).json({ error: "prop_id is required" }); return; }
      if (!correct_answer) { res.status(400).json({ error: "correct_answer is required" }); return; }

      const rc = await _getDdRoomAndCard(supabase, seasonId);
      if (!rc.ok) { res.status(rc.status).json(rc.body); return; }
      const { room, card } = rc;

      // Card must be locked (regardless of scope)
      if ((card as any).status !== "locked") {
        res.status(409).json({
          error: "Draft Day picks must be locked before settling results",
          card_status: (card as any).status,
        });
        return;
      }

      // Load and validate prop
      const { data: prop } = await supabase
        .from("gameday_props")
        .select("id, card_id, scoring_scope, status, correct_answer, answer_options, question")
        .eq("id", prop_id)
        .eq("card_id", (card as any).id)
        .maybeSingle();
      if (!prop) { res.status(404).json({ error: "Prop not found on this Draft Day card" }); return; }

      // Competition props: blocked when room is already finalized
      if ((prop as any).scoring_scope === "competition" && (room as any).status === "finalized") {
        res.status(409).json({
          error: "Draft Day competition results are finalized and cannot be changed.",
          room_status: "finalized",
        });
        return;
      }

      // Validate correct_answer is a published option ID
      const opts: Array<{ id: string }> = Array.isArray((prop as any).answer_options)
        ? (prop as any).answer_options
        : [];
      const validIds = new Set(opts.map((o) => o.id));
      if (!validIds.has(correct_answer)) {
        res.status(400).json({
          error: "correct_answer must be a valid published answer option ID",
          valid_answer_ids: Array.from(validIds),
        });
        return;
      }

      // Idempotency: same answer on already-settled prop → no-op
      const wasAlreadySettled = (prop as any).status === "settled";
      if (wasAlreadySettled && (prop as any).correct_answer === correct_answer) {
        res.json({ ok: true, idempotent: true, was_correction: false, prop_id, correct_answer });
        return;
      }

      // Mirroring classic Game Day: re-settlement before finalization is allowed.
      // The same PATCH /props/:propId/settle endpoint in classic Game Day has no conflict
      // guard for already-settled props — it simply re-runs settlePropCore which flips
      // the scoring for all existing picks. Fantasy mirrors this behavior.
      const result = await settlePropCore(supabase, {
        propId:       prop_id,
        cardId:       (card as any).id,
        correctAnswer: correct_answer,
      });

      // Phase 4C invariant: finalized rooms keep card_status = 'locked' permanently.
      // settlePropCore auto-settles the card when ALL props (including season props) are
      // settled. If that cascade fires after finalization (e.g. last season prop settles),
      // restore card_status to 'locked' so the hub continues to read from room_status.
      if (result.cardAutoSettled && (room as any).status === "finalized") {
        await supabase
          .from("gameday_pick_cards")
          .update({ status: "locked", updated_at: new Date().toISOString() })
          .eq("id", (card as any).id);
        console.log(
          `[fantasy] settle — card auto-settle suppressed (room finalized), card_status reset to locked`
        );
      }

      console.log(
        `[fantasy] settle prop=${prop_id.slice(0, 8)}… scope=${(prop as any).scoring_scope} ` +
        `answer=${correct_answer} by=${commissioner.userId.slice(0, 8)}… ` +
        `card_auto_settled=${result.cardAutoSettled}`
      );

      res.json({
        ok:               true,
        idempotent:       false,
        was_correction:   wasAlreadySettled,  // true = changed existing result (mirrors Game Day re-settle)
        prop_id,
        correct_answer,
        scoring_scope:    (prop as any).scoring_scope,
        card_auto_settled: result.cardAutoSettled,
      });
    }
  );

  // ── POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/finalize
  //
  // Commissioner-only. Seals the Draft Day competition leaderboard.
  // Requires: card locked, ALL competition-scope props settled.
  // Season props may remain pending — this is by design (settled later).
  // Sets room.status = 'finalized'. Idempotent.
  app.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/finalize",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res, supabase, leagueId, seasonId);
      if (!commissioner) return;

      const rc = await _getDdRoomAndCard(supabase, seasonId);
      if (!rc.ok) { res.status(rc.status).json(rc.body); return; }
      const { room, card } = rc;

      // Idempotent
      if ((room as any).status === "finalized") {
        res.json({ ok: true, already_finalized: true });
        return;
      }

      if ((card as any).status !== "locked") {
        res.status(409).json({
          error: "Draft Day picks must be locked before finalizing",
          card_status: (card as any).status,
        });
        return;
      }

      // All competition props must be settled
      const { data: unsettled } = await supabase
        .from("gameday_props")
        .select("id")
        .eq("card_id", (card as any).id)
        .eq("scoring_scope", "competition")
        .neq("status", "settled");

      if ((unsettled?.length ?? 0) > 0) {
        res.status(409).json({
          error: "All Draft Day competition questions must be resolved before finalizing",
          unsettled_competition_count: unsettled?.length ?? 0,
        });
        return;
      }

      const { error: finalizeErr } = await supabase
        .from("gameday_rooms")
        .update({ status: "finalized" })
        .eq("id", (room as any).id);

      if (finalizeErr) {
        console.error("[fantasy] finalize error:", finalizeErr.message);
        res.status(500).json({ error: "Failed to finalize Draft Day" });
        return;
      }

      console.log(
        `[fantasy] Draft Day finalized: room=${String((room as any).id).slice(0, 8)}… ` +
        `by=${commissioner.userId.slice(0, 8)}…`
      );

      res.json({ ok: true, already_finalized: false });
    }
  );

  // ── GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/results
  //
  // Member-accessible (session or guest token). Returns full Draft Day results
  // once room.status = 'finalized'. Before finalization: { finalized: false }.
  //
  // Response includes: leaderboard, winners (ties = co-winners), viewer's own
  // competition picks with correct answers + points, season receipts summary.
  // Scoring: SUM(point_value) for is_correct = true competition picks.
  // Note: correct_answer is NEVER exposed before finalization.
  app.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/results",
    async (req: Request, res: Response) => {
      const identity = getCallerIdentity(req);
      if (!identity.userId && !identity.guestToken) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();

      const rc = await _getDdRoomAndCard(supabase, seasonId);
      if (!rc.ok) { res.status(rc.status).json(rc.body); return; }
      const { room, card } = rc;

      // Results not ready yet
      if ((room as any).status !== "finalized") {
        res.json({ finalized: false });
        return;
      }

      // Load season metadata
      const { data: season } = await supabase
        .from("fantasy_league_seasons")
        .select("season_year, fantasy_leagues(league_name)")
        .eq("id", seasonId)
        .maybeSingle();

      // Load all props for this card
      const { data: allProps } = await supabase
        .from("gameday_props")
        .select("id, question, scoring_scope, point_value, display_order, status, correct_answer, answer_options")
        .eq("card_id", (card as any).id)
        .order("display_order", { ascending: true });
      const propList = (allProps ?? []) as any[];
      const competitionProps = propList.filter((p: any) => p.scoring_scope === "competition");
      const seasonProps      = propList.filter((p: any) => p.scoring_scope === "season");

      // Build answer-option label lookup
      const answerLabelMap: Record<string, Record<string, string>> = {};
      for (const p of propList) {
        answerLabelMap[p.id] = {};
        for (const opt of (Array.isArray(p.answer_options) ? p.answer_options : [])) {
          if (opt?.id && opt?.label) answerLabelMap[p.id][opt.id] = opt.label;
        }
      }

      const leaderboard = await _buildLeaderboard(supabase, (room as any).id, competitionProps);

      // Winners = all entries sharing the top score
      const topPoints = leaderboard[0]?.points ?? 0;
      const winners   = leaderboard.filter((e: any) => e.points === topPoints);

      // Viewer-specific results
      let myCompPicks: any[]  = [];
      let myTotalPoints       = 0;
      let myCorrectCount      = 0;
      let mySeasonPickCount   = 0;

      try {
        const viewerData = await resolveViewer(supabase, identity, seasonId, leagueId);
        if (viewerData) {
          const { data: vParticipant } = await supabase
            .from("gameday_participants")
            .select("id")
            .eq("room_id", (room as any).id)
            .eq("season_member_id", viewerData.season_member_id)
            .maybeSingle();

          if (vParticipant) {
            const vId = (vParticipant as any).id as string;
            const compPropIds = competitionProps.map((p: any) => p.id as string);
            const pointValueMap: Record<string, number> = {};
            for (const p of competitionProps) pointValueMap[p.id] = (p.point_value as number) ?? 0;

            if (compPropIds.length > 0) {
              const { data: picks } = await supabase
                .from("gameday_picks")
                .select("prop_id, selected_answer, is_correct")
                .eq("participant_id", vId)
                .in("prop_id", compPropIds);
              const pickByProp: Record<string, any> = {};
              for (const pk of picks ?? []) pickByProp[pk.prop_id] = pk;

              myCompPicks = competitionProps.map((prop: any) => {
                const pick          = pickByProp[prop.id] ?? null;
                const myAnswerId    = pick?.selected_answer ?? null;
                const correctId     = prop.correct_answer ?? null;
                const isCorrect     = pick?.is_correct ?? null;
                const pointsEarned  = isCorrect === true ? (pointValueMap[prop.id] ?? 0) : 0;
                if (isCorrect === true) { myTotalPoints += pointsEarned; myCorrectCount++; }
                return {
                  prop_id:              prop.id,
                  question:             prop.question,
                  display_order:        prop.display_order,
                  point_value:          prop.point_value,
                  my_answer_id:         myAnswerId,
                  my_answer_label:      myAnswerId ? (answerLabelMap[prop.id]?.[myAnswerId] ?? myAnswerId) : null,
                  correct_answer_id:    correctId,
                  correct_answer_label: correctId ? (answerLabelMap[prop.id]?.[correctId] ?? correctId) : null,
                  is_correct:           isCorrect,
                  points_earned:        pointsEarned,
                };
              });
            }

            // Season picks count
            const seasonPropIds = seasonProps.map((p: any) => p.id as string);
            if (seasonPropIds.length > 0) {
              const { count } = await supabase
                .from("gameday_picks")
                .select("id", { count: "exact", head: true })
                .eq("participant_id", vId)
                .in("prop_id", seasonPropIds);
              mySeasonPickCount = count ?? 0;
            }
          }
        }
      } catch (e: any) {
        console.warn("[fantasy] results viewer lookup:", e.message);
      }

      res.json({
        finalized:                 true,
        league_name:               (season as any)?.fantasy_leagues?.league_name ?? null,
        season_year:               (season as any)?.season_year ?? null,
        winners:                   winners.map((w: any) => ({
          display_name: w.display_name,
          team_name:    w.team_name,
          points:       w.points,
          rank_label:   w.rank_label,
        })),
        leaderboard,
        my_competition_picks:      myCompPicks,
        my_total_points:           myTotalPoints,
        my_correct_count:          myCorrectCount,
        my_season_pick_count:      mySeasonPickCount,
        season_props_pending_count: seasonProps.filter((p: any) => p.status === "pending").length,
        total_competition_props:   competitionProps.length,
      });
    }
  );

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  Phase 5 — Fantasy Weekly Competitions & Season Standings              ║
  // ╚══════════════════════════════════════════════════════════════════════════╝

  // ── Internal: weekly room + card lookup ──────────────────────────────────────
  async function _getWeeklyRoomAndCard(
    supabase: ReturnType<typeof getServiceSupabase>,
    seasonId: string,
    weekNumber: number
  ): Promise<{ ok: true; room: any; card: any } | { ok: false; status: number; body: object }> {
    const { data: room } = await supabase
      .from("gameday_rooms")
      .select("id, status, week_number, room_code, created_at")
      .eq("league_season_id", seasonId)
      .eq("competition_type", "weekly")
      .eq("week_number", weekNumber)
      .eq("experience_type", "fantasy")
      .is("archived_at", null)
      .maybeSingle();
    if (!room)
      return { ok: false, status: 404, body: { error: `No published Week ${weekNumber} competition found for this season` } };
    const { data: card } = await supabase
      .from("gameday_pick_cards")
      .select("id, status, roster_revision")
      .eq("room_id", (room as any).id)
      .order("created_at", { ascending: true })
      .maybeSingle();
    if (!card)
      return { ok: false, status: 404, body: { error: `Week ${weekNumber} pick card not found` } };
    return { ok: true, room, card };
  }

  // ── Internal: season standings aggregation ───────────────────────────────────
  // Derives cumulative Fantasy Season standings from all FINALIZED fantasy
  // competitions (Draft Day + weekly) for a given season.
  //
  // Scoring: SUM(point_value) for is_correct=true competition-scope picks only.
  // Season-scope props (Season Receipts) are explicitly excluded.
  //
  // competitions_played: count of rooms where member submitted ≥ 1 comp pick.
  // Participant-row existence alone does NOT count (prevents phantom entries).
  //
  // weekly_wins: count of finalized WEEKLY rooms where member's score equals
  // the room's top score. Draft Day does NOT count as a weekly win.
  async function _buildSeasonStandings(
    supabase: ReturnType<typeof getServiceSupabase>,
    seasonId: string
  ): Promise<{ standings: any[]; finalized_competitions: any[] }> {
    // 1. All finalized fantasy rooms for this season
    const { data: rooms } = await supabase
      .from("gameday_rooms")
      .select("id, competition_type, week_number, status")
      .eq("league_season_id", seasonId)
      .eq("experience_type", "fantasy")
      .eq("status", "finalized")
      .is("archived_at", null)
      .order("created_at", { ascending: true });

    const roomList = (rooms ?? []) as any[];
    if (!roomList.length) return { standings: [], finalized_competitions: [] };

    const roomIds = roomList.map((r: any) => r.id as string);

    // 2. Cards for all finalized rooms
    const { data: cards } = await supabase
      .from("gameday_pick_cards")
      .select("id, room_id")
      .in("room_id", roomIds);

    const cardByRoom: Record<string, string> = {};
    const roomByCard: Record<string, string> = {};
    for (const c of (cards ?? []) as any[]) {
      cardByRoom[(c as any).room_id] = (c as any).id;
      roomByCard[(c as any).id]      = (c as any).room_id;
    }
    const cardIds = Object.values(cardByRoom);

    // 3. All competition-scope props for those cards
    let propList: any[] = [];
    if (cardIds.length > 0) {
      const { data: compPropsRaw } = await supabase
        .from("gameday_props")
        .select("id, card_id, point_value")
        .in("card_id", cardIds)
        .eq("scoring_scope", "competition");
      propList = (compPropsRaw ?? []) as any[];
    }

    const propMap: Record<string, { cardId: string; pointValue: number }> = {};
    for (const p of propList)
      propMap[(p as any).id] = { cardId: (p as any).card_id, pointValue: (p as any).point_value ?? 0 };
    const allPropIds = propList.map((p: any) => p.id as string);

    // 4. Season members + display names
    const { data: smRaw } = await supabase
      .from("fantasy_season_members")
      .select("id, fantasy_league_members(display_name)")
      .eq("league_season_id", seasonId)
      .eq("is_active", true);

    const smList = (smRaw ?? []) as any[];
    const smIds  = smList.map((sm: any) => sm.id as string);

    // 5. Teams for season members
    const teamMap: Record<string, { id: string; name: string | null }> = {};
    if (smIds.length > 0) {
      const { data: mgrs } = await supabase
        .from("fantasy_team_managers")
        .select("season_member_id, fantasy_teams(id, team_name)")
        .in("season_member_id", smIds)
        .eq("is_active", true);
      for (const m of (mgrs ?? []) as any[]) {
        const team = (m as any).fantasy_teams;
        if (team) teamMap[(m as any).season_member_id] = { id: team.id, name: team.team_name ?? null };
      }
    }

    // 6. All participants for finalized rooms (with season_member_id)
    const { data: partsRaw } = await supabase
      .from("gameday_participants")
      .select("id, room_id, season_member_id")
      .in("room_id", roomIds)
      .not("season_member_id", "is", null);

    const partList  = (partsRaw ?? []) as any[];
    const partIds   = partList.map((p: any) => p.id as string);
    const partByRoomAndSm: Record<string, string> = {};
    for (const p of partList)
      partByRoomAndSm[`${(p as any).room_id}:${(p as any).season_member_id}`] = (p as any).id;

    // 7. All picks on competition props for these participants
    let allPicks: any[] = [];
    if (partIds.length > 0 && allPropIds.length > 0) {
      const { data: picksRaw } = await supabase
        .from("gameday_picks")
        .select("participant_id, prop_id, is_correct")
        .in("prop_id", allPropIds)
        .in("participant_id", partIds);
      allPicks = (picksRaw ?? []) as any[];
    }

    // Build per-room per-participant stats
    const roomStats: Record<string, Record<string, { points: number; pickCount: number }>> = {};
    for (const r of roomList) roomStats[(r as any).id] = {};

    for (const pick of allPicks) {
      const propInfo = propMap[(pick as any).prop_id];
      if (!propInfo) continue;
      const rId = roomByCard[propInfo.cardId];
      if (!rId || !roomStats[rId]) continue;
      const pId = (pick as any).participant_id as string;
      if (!roomStats[rId][pId]) roomStats[rId][pId] = { points: 0, pickCount: 0 };
      roomStats[rId][pId].pickCount++;
      if ((pick as any).is_correct === true) roomStats[rId][pId].points += propInfo.pointValue;
    }

    // Max points per weekly room (for weekly_wins)
    const weeklyMaxPts: Record<string, number> = {};
    for (const r of roomList) {
      if ((r as any).competition_type !== "weekly") continue;
      let mx = 0;
      for (const ps of Object.values(roomStats[(r as any).id])) {
        if (ps.pickCount > 0 && ps.points > mx) mx = ps.points;
      }
      weeklyMaxPts[(r as any).id] = mx;
    }

    // Aggregate per season member
    type SmEntry = {
      season_member_id: string;
      display_name: string | null;
      fantasy_team_id: string | null;
      team_name: string | null;
      total_points: number;
      draft_day_points: number;
      weekly_points: number;
      competitions_played: number;
      weekly_wins: number;
    };
    const smStatsMap: Record<string, SmEntry> = {};
    for (const sm of smList) {
      smStatsMap[(sm as any).id] = {
        season_member_id:    (sm as any).id,
        display_name:        (sm as any).fantasy_league_members?.display_name ?? null,
        fantasy_team_id:     teamMap[(sm as any).id]?.id ?? null,
        team_name:           teamMap[(sm as any).id]?.name ?? null,
        total_points:        0,
        draft_day_points:    0,
        weekly_points:       0,
        competitions_played: 0,
        weekly_wins:         0,
      };
    }

    for (const r of roomList) {
      const rid    = (r as any).id as string;
      const rStats = roomStats[rid];
      const ctype  = (r as any).competition_type as string;

      for (const sm of smList) {
        const smId  = (sm as any).id as string;
        const pId   = partByRoomAndSm[`${rid}:${smId}`];
        if (!pId) continue;
        const ps = rStats[pId];
        if (!ps || ps.pickCount === 0) continue; // opened but no picks → not "played"

        const entry = smStatsMap[smId];
        if (!entry) continue;

        entry.total_points += ps.points;
        entry.competitions_played++;
        if (ctype === "draft_day")   entry.draft_day_points += ps.points;
        else if (ctype === "weekly") entry.weekly_points    += ps.points;

        // Weekly wins (Draft Day excluded)
        if (ctype === "weekly") {
          const mx = weeklyMaxPts[rid] ?? 0;
          if (mx > 0 && ps.points === mx) entry.weekly_wins++;
        }
      }
    }

    // Only include members who played at least one competition
    const active = Object.values(smStatsMap).filter(s => s.competitions_played > 0);
    active.sort((a, b) => b.total_points - a.total_points);

    const standings = active.map(s => {
      const rank     = active.filter(x => x.total_points > s.total_points).length + 1;
      const tieCount = active.filter(x => x.total_points === s.total_points).length;
      return { ...s, rank, rank_label: tieCount > 1 ? `T-${rank}` : String(rank) };
    });

    const finalized_competitions = roomList.map((r: any) => ({
      room_id:          r.id,
      competition_type: r.competition_type,
      week_number:      r.week_number ?? null,
      label: r.competition_type === "draft_day" ? "Draft Day"
           : r.competition_type === "weekly"    ? `Week ${r.week_number}`
           : r.competition_type,
    }));

    return { standings, finalized_competitions };
  }

  // ── GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/templates
  app.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/templates",
    async (req: Request, res: Response) => {
      const identity = getCallerIdentity(req);
      if (!identity.userId && !identity.guestToken) { res.status(401).json({ error: "Unauthorized" }); return; }

      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) { res.status(400).json({ error: "weekNumber must be a positive integer" }); return; }

      const supabase = getServiceSupabase();
      const { data: season } = await supabase
        .from("fantasy_league_seasons")
        .select("fantasy_leagues(sport)")
        .eq("id", seasonId)
        .eq("league_id", leagueId)
        .maybeSingle();
      if (!season) { res.status(404).json({ error: "Season not found" }); return; }

      const sport = (season as any).fantasy_leagues?.sport ?? "football";

      const { data: templates, error: tmplErr } = await supabase
        .from("gameday_prop_library")
        .select("id, question, point_value, answer_target_type, settlement_window, is_default, display_order, supports_no_one")
        .eq("experience_type", "fantasy")
        .eq("competition_type", "weekly")
        .eq("sport", sport)
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (tmplErr) {
        console.error("[fantasy/weekly] templates error:", tmplErr.message);
        res.status(500).json({ error: "Failed to fetch weekly templates" });
        return;
      }

      res.json({
        sport,
        week_number: wn,
        // Weekly props are all competition-scope
        templates: (templates ?? []).map((t: any) => ({ ...t, scoring_scope: "competition" })),
      });
    }
  );

  // ── POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/publish
  app.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/publish",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) { res.status(400).json({ error: "weekNumber must be a positive integer" }); return; }

      const supabase     = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res, supabase, leagueId, seasonId);
      if (!commissioner) return;

      // ── Sequencing guard: week N requires week N-1 to exist and be finalized ─
      // Skip if this week already exists — idempotent re-publish is always safe.
      if (wn > 1) {
        const { data: existingThisWeekRoom } = await supabase
          .from("gameday_rooms")
          .select("id")
          .eq("league_season_id", seasonId)
          .eq("competition_type", "weekly")
          .eq("week_number", wn)
          .is("archived_at", null)
          .maybeSingle();

        if (!existingThisWeekRoom) {
          const { data: latestRoom } = await supabase
            .from("gameday_rooms")
            .select("week_number, status")
            .eq("league_season_id", seasonId)
            .eq("competition_type", "weekly")
            .is("archived_at", null)
            .order("week_number", { ascending: false })
            .limit(1)
            .maybeSingle();

          const maxExisting  = (latestRoom as any)?.week_number ?? 0;
          const latestStatus = (latestRoom as any)?.status ?? null;

          if (wn > maxExisting + 1) {
            res.status(409).json({ error: `Week ${wn - 1} must be created first.` }); return;
          }
          if (maxExisting < wn - 1) {
            res.status(409).json({ error: `Week ${wn - 1} must be created first.` }); return;
          }
          if (latestStatus !== "finalized") {
            res.status(409).json({ error: `Finalize Week ${maxExisting} before creating Week ${wn}.` }); return;
          }
        }
      }

      const { selected_prop_ids } = req.body as { selected_prop_ids?: string[] };
      if (!Array.isArray(selected_prop_ids) || selected_prop_ids.length === 0) {
        res.status(400).json({ error: "Select at least one question" });
        return;
      }
      const MAX_WEEKLY_QUESTIONS = 8;
      if (selected_prop_ids.length > MAX_WEEKLY_QUESTIONS) {
        res.status(400).json({
          error: `Too many questions. Maximum is ${MAX_WEEKLY_QUESTIONS}.`,
          max: MAX_WEEKLY_QUESTIONS,
          selected: selected_prop_ids.length,
        });
        return;
      }

      const { data: season } = await supabase
        .from("fantasy_league_seasons")
        .select("id, season_year, fantasy_leagues(id, league_name, sport)")
        .eq("id", seasonId)
        .eq("league_id", leagueId)
        .maybeSingle();
      if (!season) { res.status(404).json({ error: "Season not found" }); return; }

      const league     = (season as any).fantasy_leagues as any;
      const sport      = league.sport as string;
      const leagueName = league.league_name as string;
      const roomName   = `${leagueName} — Week ${wn} Swayger`;

      // Fetch selected templates (weekly only, active)
      const { data: templates, error: tmplErr } = await supabase
        .from("gameday_prop_library")
        .select("id, question, point_value, answer_target_type, answer_options, supports_no_one")
        .in("id", selected_prop_ids)
        .eq("experience_type", "fantasy")
        .eq("competition_type", "weekly")
        .eq("sport", sport)
        .eq("is_active", true);

      if (tmplErr || !templates?.length) {
        res.status(400).json({ error: "No valid weekly templates found for selection" });
        return;
      }

      // Answer-options snapshot: fetch current season members + teams
      const [{ data: smRaw }, { data: teamsRaw }] = await Promise.all([
        supabase
          .from("fantasy_season_members")
          .select("id, fantasy_league_members(display_name)")
          .eq("league_season_id", seasonId)
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        supabase
          .from("fantasy_teams")
          .select("id, team_name")
          .eq("league_season_id", seasonId),
      ]);

      const memberList = ((smRaw ?? []) as any[]).map((sm: any) => ({
        id: sm.id,
        display_name: sm.fantasy_league_members?.display_name ?? null,
      }));
      const teamList = (teamsRaw ?? []) as Array<{ id: string; team_name: string | null }>;

      // Build props payload preserving selection order
      const propsPayload = (templates as any[]).map((tmpl, i) => ({
        library_id:         tmpl.id,
        question:           tmpl.question,
        answer_options:     buildAnswerOptions(
          tmpl.answer_target_type,
          memberList,
          teamList,
          tmpl.answer_options,
          tmpl.supports_no_one ?? false
        ),
        scoring_scope:      "competition", // weekly always competition-scope
        point_value:        tmpl.point_value,
        answer_target_type: tmpl.answer_target_type ?? null,
        display_order:      i,
      }));

      let roomCode: string | null = null;
      try { roomCode = await generateFantasyRoomCode(supabase); } catch { /* skip */ }

      // Application-level idempotency check before RPC
      const { data: existingRoom } = await supabase
        .from("gameday_rooms")
        .select("id")
        .eq("league_season_id", seasonId)
        .eq("competition_type", "weekly")
        .eq("week_number", wn)
        .eq("experience_type", "fantasy")
        .is("archived_at", null)
        .maybeSingle();

      if (existingRoom) {
        const { data: existingCard } = await supabase
          .from("gameday_pick_cards")
          .select("id")
          .eq("room_id", (existingRoom as any).id)
          .maybeSingle();
        console.log(`[fantasy/weekly] Week ${wn} already exists (idempotent)`);
        res.status(200).json({
          room_id: (existingRoom as any).id,
          card_id: (existingCard as any)?.id ?? null,
          room_code: null,
          already_existed: true,
          week_number: wn,
        });
        return;
      }

      // Atomic create via publish_fantasy_weekly RPC
      const { data: rpcResult, error: rpcError } = await supabase.rpc("publish_fantasy_weekly", {
        p_league_season_id: seasonId,
        p_week_number:      wn,
        p_room_name:        roomName,
        p_sport:            sport,
        p_room_code:        roomCode,
        p_host_user_id:     commissioner.userId,
        p_props:            propsPayload,
      });

      if (rpcError || !rpcResult) {
        console.error(`[fantasy/weekly] publish_fantasy_weekly RPC error:`, rpcError?.message);
        if (rpcError?.message?.includes("unique") || rpcError?.message?.includes("idx_gameday_rooms_weekly")) {
          res.status(409).json({ error: `Week ${wn} already exists for this season`, already_existed: true });
          return;
        }
        res.status(500).json({ error: `Failed to publish Week ${wn} competition` });
        return;
      }

      console.log(
        `[fantasy/weekly] Week ${wn} published: season=${seasonId.slice(0, 8)}… ` +
        `room=${String(rpcResult.room_id).slice(0, 8)}… props=${propsPayload.length}`
      );

      res.status(201).json({
        room_id:         rpcResult.room_id,
        card_id:         rpcResult.card_id,
        room_code:       roomCode,
        already_existed: rpcResult.already_existed ?? false,
        week_number:     wn,
      });
    }
  );

  // ── GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/weekly-summary
  // Returns all weekly rooms for a season in ONE request.
  // Eliminates N+1 fetching as weeks accumulate.
  // current_week = latest published week (with full participation data).
  // past_weeks   = all finalized weeks before current (compact).
  app.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weekly-summary",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId } = req.params;
      const supabase  = getServiceSupabase();
      const identity  = getCallerIdentity(req);
      if (!identity.userId && !identity.guestToken) { res.status(401).json({ error: "Unauthorized" }); return; }

      // 1. All weekly rooms for this season (one query)
      const { data: rooms } = await supabase
        .from("gameday_rooms")
        .select("id, status, week_number, room_code, created_at")
        .eq("league_season_id", seasonId)
        .eq("competition_type", "weekly")
        .is("archived_at", null)
        .order("week_number", { ascending: true });
      const roomList = (rooms ?? []) as any[];

      if (roomList.length === 0) {
        res.json({
          current_week:     null,
          past_weeks:       [],
          next_week_number: 1,
          can_create_next:  true,
        });
        return;
      }

      // 2. All pick cards for those rooms (one query)
      const roomIds = roomList.map((r) => r.id as string);
      const { data: cards } = await supabase
        .from("gameday_pick_cards")
        .select("id, status, room_id")
        .in("room_id", roomIds);
      const cardByRoom: Record<string, any> = {};
      for (const c of (cards ?? []) as any[]) cardByRoom[c.room_id] = c;

      // 3. All props for those cards (one query) — only competition scope
      const cardIds = Object.values(cardByRoom).map((c: any) => c.id as string);
      const propCountsByCard: Record<string, { total: number; settled: number; ids: string[] }> = {};
      if (cardIds.length > 0) {
        const { data: props } = await supabase
          .from("gameday_props")
          .select("id, card_id, status, scoring_scope")
          .in("card_id", cardIds);
        for (const p of (props ?? []) as any[]) {
          if (!propCountsByCard[p.card_id]) propCountsByCard[p.card_id] = { total: 0, settled: 0, ids: [] };
          propCountsByCard[p.card_id].total++;
          propCountsByCard[p.card_id].ids.push(p.id);
          if (p.status === "settled") propCountsByCard[p.card_id].settled++;
        }
      }

      // 4. All pick counts across all rooms (one query per scope, not per room)
      const allPropIds = Object.values(propCountsByCard).flatMap((c) => c.ids);
      const pickCountByProp: Record<string, number> = {};
      if (allPropIds.length > 0) {
        const { data: allPicks } = await supabase
          .from("gameday_picks")
          .select("prop_id")
          .in("prop_id", allPropIds);
        for (const pk of (allPicks ?? []) as any[]) {
          pickCountByProp[pk.prop_id] = (pickCountByProp[pk.prop_id] ?? 0) + 1;
        }
      }

      // 5. Resolve viewer (role + my_pick_count + commissioner gate)
      const viewer        = await resolveViewer(supabase, identity, seasonId, leagueId).catch(() => null);
      const isCommissioner = viewer && (viewer.role === "commissioner" || viewer.role === "co_commissioner");

      // 6. Season members (eligible for all weeks)
      const { data: smRows } = await supabase
        .from("fantasy_season_members")
        .select("id, fantasy_league_members(display_name)")
        .eq("league_season_id", seasonId)
        .eq("is_active", true);
      const smList        = (smRows ?? []) as any[];
      const eligibleCount = smList.length;

      // 7. Participation data for the latest (current) week
      const latestRoom   = roomList[roomList.length - 1];
      const latestCard   = cardByRoom[latestRoom.id];
      const latestProps  = latestCard ? (propCountsByCard[latestCard.id] ?? { total: 0, settled: 0, ids: [] }) : { total: 0, settled: 0, ids: [] };
      const latestPropIds = latestProps.ids;

      const playedSmIds = new Set<string>();
      let myPickCount   = 0;

      if (latestPropIds.length > 0) {
        const { data: latestParts } = await supabase
          .from("gameday_participants")
          .select("id, season_member_id")
          .eq("room_id", latestRoom.id);
        const latestPartList = (latestParts ?? []) as any[];

        if (latestPartList.length > 0) {
          const partIds  = latestPartList.map((p: any) => p.id as string);
          const { data: latestPicks } = await supabase
            .from("gameday_picks")
            .select("participant_id")
            .in("participant_id", partIds)
            .in("prop_id", latestPropIds);
          const playedPartIds = new Set(((latestPicks ?? []) as any[]).map((p: any) => p.participant_id as string));
          for (const part of latestPartList) {
            if (playedPartIds.has(part.id)) playedSmIds.add(part.season_member_id);
          }
        }

        if (viewer) {
          const { data: vPart } = await supabase
            .from("gameday_participants")
            .select("id")
            .eq("room_id", latestRoom.id)
            .eq("season_member_id", viewer.season_member_id)
            .maybeSingle();
          if (vPart) {
            const { count } = await supabase
              .from("gameday_picks")
              .select("id", { count: "exact", head: true })
              .in("prop_id", latestPropIds)
              .eq("participant_id", (vPart as any).id);
            myPickCount = count ?? 0;
          }
        }
      }

      // 8. Total pick_count for latest room (all prop picks)
      const latestPickCount = latestPropIds.reduce((sum, id) => sum + (pickCountByProp[id] ?? 0), 0);

      // 9. Build summary items
      const buildItem = (room: any, isCurrent: boolean) => {
        const card      = cardByRoom[room.id];
        const cardStatus = card?.status ?? "closed";
        const pc        = card ? (propCountsByCard[card.id] ?? { total: 0, settled: 0, ids: [] }) : { total: 0, settled: 0, ids: [] };
        const allSettled = pc.total > 0 && pc.settled === pc.total;

        const item: any = {
          room_id:       room.id,
          card_id:       card?.id ?? null,
          room_code:     room.room_code ?? null,
          room_status:   room.status,
          card_status:   cardStatus,
          week_number:   room.week_number,
          prop_count:    pc.total,
          settled_count: pc.settled,
          all_settled:   allSettled,
          pick_count:    pc.ids.reduce((s: number, id: string) => s + (pickCountByProp[id] ?? 0), 0),
          created_at:    room.created_at,
        };

        if (isCurrent) {
          item.my_pick_count   = myPickCount;
          item.eligible_count  = eligibleCount;
          item.played_count    = playedSmIds.size;
          item.waiting_count   = eligibleCount - playedSmIds.size;
          if (isCommissioner) {
            item.participants_status = smList.map((sm: any) => ({
              season_member_id: sm.id,
              display_name:     (sm as any).fantasy_league_members?.display_name ?? null,
              has_played:       playedSmIds.has(sm.id),
            }));
          }
        }

        return item;
      };

      const allItems = roomList.map((room, idx) => buildItem(room, idx === roomList.length - 1));
      const currentWeek = allItems[allItems.length - 1];
      const pastWeeks   = allItems.slice(0, -1); // everything before the latest

      const canCreateNext = latestRoom.status === "finalized";
      const nextWeekNumber = latestRoom.week_number + 1;

      res.json({
        current_week:     currentWeek,
        past_weeks:       pastWeeks,
        next_week_number: nextWeekNumber,
        can_create_next:  canCreateNext,
      });
    }
  );

  // ── GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber
  // Hub state for a weekly competition. Does NOT create participants.
  app.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber",
    async (req: Request, res: Response) => {
      const identity = getCallerIdentity(req);
      if (!identity.userId && !identity.guestToken) { res.status(401).json({ error: "Unauthorized" }); return; }

      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) { res.status(400).json({ error: "weekNumber must be a positive integer" }); return; }

      const supabase = getServiceSupabase();

      const { data: room } = await supabase
        .from("gameday_rooms")
        .select("id, status, room_code, created_at")
        .eq("league_season_id", seasonId)
        .eq("competition_type", "weekly")
        .eq("week_number", wn)
        .eq("experience_type", "fantasy")
        .is("archived_at", null)
        .maybeSingle();

      if (!room) { res.json(null); return; }

      const { data: card } = await supabase
        .from("gameday_pick_cards")
        .select("id, status")
        .eq("room_id", (room as any).id)
        .maybeSingle();

      if (!card) { res.json(null); return; }

      const { data: props } = await supabase
        .from("gameday_props")
        .select("id, scoring_scope, status")
        .eq("card_id", (card as any).id);

      const propList     = ((props ?? []) as any[]).filter((p: any) => p.scoring_scope === "competition");
      const propIds      = ((props ?? []) as any[]).map((p: any) => p.id as string);
      const settledCount = propList.filter((p: any) => p.status === "settled").length;

      let pickCount = 0;
      if (propIds.length > 0) {
        try {
          const { count } = await supabase
            .from("gameday_picks")
            .select("id", { count: "exact", head: true })
            .in("prop_id", propIds);
          pickCount = count ?? 0;
        } catch { pickCount = 0; }
      }

      // ── Resolve viewer once — used for myPickCount + commissioner check ──────
      const viewer = await resolveViewer(supabase, identity, seasonId, leagueId).catch(() => null);
      const isCallerCommissioner = viewer &&
        (viewer.role === "commissioner" || viewer.role === "co_commissioner");

      let myPickCount = 0;
      if (viewer && propIds.length > 0) {
        try {
          const { data: vPart } = await supabase
            .from("gameday_participants")
            .select("id")
            .eq("room_id", (room as any).id)
            .eq("season_member_id", viewer.season_member_id)
            .maybeSingle();
          if (vPart) {
            const { count } = await supabase
              .from("gameday_picks")
              .select("id", { count: "exact", head: true })
              .in("prop_id", propIds)
              .eq("participant_id", (vPart as any).id);
            myPickCount = count ?? 0;
          }
        } catch { myPickCount = 0; }
      }

      // ── Participation data ─────────────────────────────────────────────────────
      // eligible = all active season members (commissioner sees per-member status)
      const { data: smRows } = await supabase
        .from("fantasy_season_members")
        .select("id, fantasy_league_members(display_name)")
        .eq("league_season_id", seasonId)
        .eq("is_active", true);
      const smList        = (smRows ?? []) as any[];
      const eligibleCount = smList.length;

      // played = distinct season_member_ids with ≥1 competition pick in this room
      const compPropIds = propList.map((p: any) => p.id as string);
      const playedSmIds = new Set<string>();

      if (compPropIds.length > 0 && smList.length > 0) {
        const { data: parts } = await supabase
          .from("gameday_participants")
          .select("id, season_member_id")
          .eq("room_id", (room as any).id);
        const partList = (parts ?? []) as any[];

        if (partList.length > 0) {
          const partIds = partList.map((p: any) => p.id as string);
          const { data: picksRows } = await supabase
            .from("gameday_picks")
            .select("participant_id")
            .in("participant_id", partIds)
            .in("prop_id", compPropIds);
          const playedPartIds = new Set(
            ((picksRows ?? []) as any[]).map((p: any) => p.participant_id as string)
          );
          for (const part of partList) {
            if (playedPartIds.has(part.id)) playedSmIds.add(part.season_member_id);
          }
        }
      }

      const playedCount  = playedSmIds.size;
      const waitingCount = eligibleCount - playedCount;

      // Commissioner-only: per-member participation breakdown
      let participantsStatus: any[] | undefined;
      if (isCallerCommissioner) {
        participantsStatus = smList.map((sm: any) => ({
          season_member_id: sm.id,
          display_name:     (sm as any).fantasy_league_members?.display_name ?? null,
          has_played:       playedSmIds.has(sm.id),
        }));
      }

      res.json({
        room_id:       (room as any).id,
        card_id:       (card as any).id,
        room_code:     (room as any).room_code ?? null,
        room_status:   (room as any).status,
        card_status:   (card as any).status,
        week_number:   wn,
        prop_count:    propList.length,
        settled_count: settledCount,
        all_settled:   propList.length > 0 && settledCount === propList.length,
        pick_count:    pickCount,
        my_pick_count: myPickCount,
        eligible_count: eligibleCount,
        played_count:  playedCount,
        waiting_count: waitingCount,
        ...(participantsStatus !== undefined && { participants_status: participantsStatus }),
        created_at:    (room as any).created_at,
      });
    }
  );

  // ── POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/lock
  app.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/lock",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) { res.status(400).json({ error: "weekNumber must be a positive integer" }); return; }

      const supabase     = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res, supabase, leagueId, seasonId);
      if (!commissioner) return;

      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) { res.status(rc.status).json(rc.body); return; }
      const { card } = rc;

      const cs = (card as any).status as string;
      if (cs === "locked" || cs === "settled") { res.json({ card_status: cs, already_locked: true }); return; }

      const { error } = await supabase
        .from("gameday_pick_cards")
        .update({ status: "locked", updated_at: new Date().toISOString() })
        .eq("id", (card as any).id);

      if (error) {
        console.error(`[fantasy/weekly] Week ${wn} lock error:`, error.message);
        res.status(500).json({ error: `Failed to lock Week ${wn}` });
        return;
      }
      console.log(`[fantasy/weekly] Week ${wn} locked by ${commissioner.userId.slice(0, 8)}…`);
      res.json({ card_status: "locked", already_locked: false });
    }
  );

  // ── POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/unlock
  app.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/unlock",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) { res.status(400).json({ error: "weekNumber must be a positive integer" }); return; }

      const supabase     = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res, supabase, leagueId, seasonId);
      if (!commissioner) return;

      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) { res.status(rc.status).json(rc.body); return; }
      const { card } = rc;

      const cs = (card as any).status as string;
      if (cs === "settled") {
        res.status(409).json({ error: "Cannot unlock a finalized competition", card_status: cs });
        return;
      }

      const { count: settledCnt } = await supabase
        .from("gameday_props")
        .select("id", { count: "exact", head: true })
        .eq("card_id", (card as any).id)
        .eq("status", "settled");

      if ((settledCnt ?? 0) > 0) {
        res.status(409).json({ error: "Cannot unlock after settlement has started", settled_props: settledCnt });
        return;
      }

      if (cs === "open" || cs === "closed") { res.json({ card_status: cs, already_unlocked: true }); return; }

      const { error } = await supabase
        .from("gameday_pick_cards")
        .update({ status: "open", updated_at: new Date().toISOString() })
        .eq("id", (card as any).id);

      if (error) {
        console.error(`[fantasy/weekly] Week ${wn} unlock error:`, error.message);
        res.status(500).json({ error: `Failed to unlock Week ${wn}` });
        return;
      }
      res.json({ card_status: "open", already_unlocked: false });
    }
  );

  // ── GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/play
  // Creates participant (idempotent). Returns props + my picks.
  // All current season members are eligible — no draft_day_eligible guard.
  app.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/play",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) { res.status(400).json({ error: "weekNumber must be a positive integer" }); return; }

      const supabase = getServiceSupabase();
      const identity = getCallerIdentity(req);
      if (!identity.userId && !identity.guestToken) { res.status(401).json({ error: "Unauthorized" }); return; }

      const viewer = await resolveViewer(supabase, identity, seasonId, leagueId);
      if (!viewer) { res.status(403).json({ error: "You are not a member of this league for this season." }); return; }

      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) { res.status(rc.status).json(rc.body); return; }
      const { room, card } = rc;

      const roomId             = (room as any).id as string;
      const cardStatus         = (card as any).status as string;
      const cardRosterRevision = (card as any).roster_revision ?? 0;

      // Create/reuse participant (first write endpoint)
      const { participant_id: participantId } = await ensureFantasyParticipant(supabase, roomId, viewer);

      // Fetch props (no correct_answer)
      const { data: rawProps } = await supabase
        .from("gameday_props")
        .select("id, question, scoring_scope, point_value, answer_options, answer_target_type, display_order")
        .eq("card_id", (card as any).id)
        .order("display_order", { ascending: true });

      const publishedProps = ((rawProps ?? []) as any[]).map((p: any) => ({
        id:                 p.id as string,
        question:           p.question as string,
        scoring_scope:      p.scoring_scope as string,
        point_value:        p.point_value as number,
        answer_target_type: p.answer_target_type as string,
        answer_options:     Array.isArray(p.answer_options) ? p.answer_options : [],
        display_order:      p.display_order as number,
      }));

      const propIds = publishedProps.map((p) => p.id);
      const rosterTargetPropIds = new Set(
        publishedProps
          .filter((p) => p.answer_target_type === "season_member" || p.answer_target_type === "fantasy_team")
          .map((p) => p.id)
      );

      let rawPicks: any[] = [];
      if (propIds.length > 0) {
        const { data: rp } = await supabase
          .from("gameday_picks")
          .select("prop_id, selected_answer, answer_universe_revision")
          .in("prop_id", propIds)
          .eq("participant_id", participantId);
        rawPicks = (rp ?? []) as any[];
      }

      const myPicks: Record<string, string> = {};
      const stalePropIds: string[]          = [];
      for (const pick of rawPicks) {
        const propId  = (pick as any).prop_id as string;
        const pickRev = (pick as any).answer_universe_revision ?? 0;
        myPicks[propId] = (pick as any).selected_answer as string;
        if (rosterTargetPropIds.has(propId) && pickRev < cardRosterRevision) stalePropIds.push(propId);
      }

      const { data: seasonRow } = await supabase
        .from("fantasy_league_seasons")
        .select("fantasy_leagues(league_name)")
        .eq("id", seasonId)
        .maybeSingle();
      const leagueName = (seasonRow as any)?.fantasy_leagues?.league_name ?? null;

      res.json({
        room_id:             roomId,
        card_id:             (card as any).id,
        room_code:           (room as any).room_code ?? null,
        room_status:         (room as any).status,
        card_status:         cardStatus,
        week_number:         wn,
        roster_revision:     cardRosterRevision,
        stale_pick_prop_ids: stalePropIds,
        participant_id:      participantId,
        props:               publishedProps,
        my_picks:            myPicks,
        my_pick_count:       Object.keys(myPicks).length,
        total_props:         publishedProps.length,
        league_name:         leagueName,
      });
    }
  );

  // ── POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/picks
  app.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/picks",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) { res.status(400).json({ error: "weekNumber must be a positive integer" }); return; }

      const supabase = getServiceSupabase();
      const identity = getCallerIdentity(req);
      if (!identity.userId && !identity.guestToken) { res.status(401).json({ error: "Unauthorized" }); return; }

      const { prop_id, selected_answer } = req.body ?? {};
      if (!prop_id || typeof prop_id !== "string") { res.status(400).json({ error: "prop_id is required" }); return; }
      if (!selected_answer || typeof selected_answer !== "string") { res.status(400).json({ error: "selected_answer is required" }); return; }

      const viewer = await resolveViewer(supabase, identity, seasonId, leagueId);
      if (!viewer) { res.status(403).json({ error: "You are not a member of this league for this season." }); return; }

      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) { res.status(rc.status).json(rc.body); return; }
      const { room, card } = rc;

      const cardRosterRevision = (card as any).roster_revision ?? 0;

      if ((card as any).status !== "open") {
        res.status(409).json({ error: "Picks are locked. No more changes accepted.", card_status: (card as any).status });
        return;
      }

      const { data: prop } = await supabase
        .from("gameday_props")
        .select("id, answer_options")
        .eq("id", prop_id)
        .eq("card_id", (card as any).id)
        .maybeSingle();
      if (!prop) { res.status(400).json({ error: `Prop not found on this Week ${wn} card.` }); return; }

      const validIds = new Set(
        (Array.isArray((prop as any).answer_options) ? (prop as any).answer_options : []).map((o: any) => o.id)
      );
      if (!validIds.has(selected_answer)) {
        res.status(400).json({
          error: "Invalid answer. selected_answer must match a published answer option ID.",
          valid_answer_ids: Array.from(validIds),
        });
        return;
      }

      const { participant_id: participantId } = await ensureFantasyParticipant(supabase, (room as any).id, viewer);

      const { data: upserted, error: upsertErr } = await supabase
        .from("gameday_picks")
        .upsert({
          prop_id,
          participant_id:           participantId,
          selected_answer,
          submitted_at:             new Date().toISOString(),
          answer_universe_revision: cardRosterRevision,
        }, { onConflict: "prop_id,participant_id" })
        .select("id, prop_id, selected_answer")
        .single();

      if (upsertErr) {
        console.error(`[fantasy/weekly] Week ${wn} pick upsert error:`, upsertErr.message);
        res.status(500).json({ error: "Failed to save pick. Please try again." });
        return;
      }

      res.json({
        pick_id:         (upserted as any).id,
        prop_id:         (upserted as any).prop_id,
        selected_answer: (upserted as any).selected_answer,
      });
    }
  );

  // ── GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/settlement
  app.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/settlement",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) { res.status(400).json({ error: "weekNumber must be a positive integer" }); return; }

      const supabase     = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res, supabase, leagueId, seasonId);
      if (!commissioner) return;

      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) { res.status(rc.status).json(rc.body); return; }
      const { room, card } = rc;

      const { data: allProps } = await supabase
        .from("gameday_props")
        .select("id, question, answer_options, scoring_scope, point_value, display_order, status, correct_answer")
        .eq("card_id", (card as any).id)
        .eq("scoring_scope", "competition")
        .order("display_order", { ascending: true });

      const propList     = (allProps ?? []) as any[];
      const settledCount = propList.filter((p: any) => p.status === "settled").length;

      const previewLeaderboard = settledCount > 0
        ? await _buildLeaderboard(supabase, (room as any).id, propList)
        : [];

      res.json({
        room_id:                 (room as any).id,
        card_id:                 (card as any).id,
        card_status:             (card as any).status,
        room_status:             (room as any).status,
        week_number:             wn,
        competition_props:       propList.map((p: any) => ({
          id:             p.id,
          question:       p.question,
          display_order:  p.display_order,
          point_value:    p.point_value,
          scoring_scope:  p.scoring_scope,
          status:         p.status,
          correct_answer: p.correct_answer ?? null,
          answer_options: Array.isArray(p.answer_options) ? p.answer_options : [],
        })),
        settled_count:           settledCount,
        total_competition_count: propList.length,
        all_settled:             propList.length > 0 && settledCount === propList.length,
        preview_leaderboard:     previewLeaderboard,
      });
    }
  );

  // ── POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/settle
  // Mirrors Phase 4C Draft Day settle: allows result correction before finalization.
  app.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/settle",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) { res.status(400).json({ error: "weekNumber must be a positive integer" }); return; }

      const supabase     = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res, supabase, leagueId, seasonId);
      if (!commissioner) return;

      const { prop_id, correct_answer } = req.body as { prop_id?: string; correct_answer?: string };
      if (!prop_id)        { res.status(400).json({ error: "prop_id is required" }); return; }
      if (!correct_answer) { res.status(400).json({ error: "correct_answer is required" }); return; }

      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) { res.status(rc.status).json(rc.body); return; }
      const { room, card } = rc;

      // Card auto-settles to "settled" once all props are resolved; allow re-settle for corrections.
      if (!["locked", "settled"].includes((card as any).status)) {
        res.status(409).json({ error: "Week picks must be locked before settling results", card_status: (card as any).status });
        return;
      }

      if ((room as any).status === "finalized") {
        res.status(409).json({ error: "Week results are finalized and cannot be changed.", room_status: "finalized" });
        return;
      }

      const { data: prop } = await supabase
        .from("gameday_props")
        .select("id, card_id, scoring_scope, status, correct_answer, answer_options")
        .eq("id", prop_id)
        .eq("card_id", (card as any).id)
        .maybeSingle();
      if (!prop) { res.status(404).json({ error: "Prop not found on this Week competition card" }); return; }

      const opts     = Array.isArray((prop as any).answer_options) ? (prop as any).answer_options : [];
      const validIds = new Set(opts.map((o: any) => o.id as string));
      if (!validIds.has(correct_answer)) {
        res.status(400).json({ error: "correct_answer must be a valid published answer option ID", valid_answer_ids: Array.from(validIds) });
        return;
      }

      const wasAlreadySettled = (prop as any).status === "settled";
      if (wasAlreadySettled && (prop as any).correct_answer === correct_answer) {
        res.json({ ok: true, idempotent: true, was_correction: false, prop_id, correct_answer });
        return;
      }

      const result = await settlePropCore(supabase, {
        propId:        prop_id,
        cardId:        (card as any).id,
        correctAnswer: correct_answer,
      });

      console.log(
        `[fantasy/weekly] settle prop=${prop_id.slice(0, 8)}… week=${wn} answer=${correct_answer} ` +
        `correction=${wasAlreadySettled} by=${commissioner.userId.slice(0, 8)}…`
      );

      res.json({
        ok:               true,
        idempotent:       false,
        was_correction:   wasAlreadySettled,
        prop_id,
        correct_answer,
        card_auto_settled: result.cardAutoSettled,
      });
    }
  );

  // ── POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/finalize
  // Seals Week N results. Idempotent. Requires card locked + all comp props settled.
  app.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/finalize",
    async (req: Request, res: Response) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) { res.status(400).json({ error: "weekNumber must be a positive integer" }); return; }

      const supabase     = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res, supabase, leagueId, seasonId);
      if (!commissioner) return;

      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) { res.status(rc.status).json(rc.body); return; }
      const { room, card } = rc;

      if ((room as any).status === "finalized") {
        res.json({ ok: true, already_finalized: true });
        return;
      }

      // Card auto-settles to "settled" once all props are resolved — allow finalizing from either state.
      if (!["locked", "settled"].includes((card as any).status)) {
        res.status(409).json({ error: `Week ${wn} picks must be locked before finalizing`, card_status: (card as any).status });
        return;
      }

      const { data: unsettled } = await supabase
        .from("gameday_props")
        .select("id")
        .eq("card_id", (card as any).id)
        .eq("scoring_scope", "competition")
        .neq("status", "settled");

      if ((unsettled?.length ?? 0) > 0) {
        res.status(409).json({
          error: `All Week ${wn} questions must be resolved before finalizing`,
          unsettled_competition_count: unsettled?.length ?? 0,
        });
        return;
      }

      const { error: finalizeErr } = await supabase
        .from("gameday_rooms")
        .update({ status: "finalized" })
        .eq("id", (room as any).id);

      if (finalizeErr) {
        console.error(`[fantasy/weekly] Week ${wn} finalize error:`, finalizeErr.message);
        res.status(500).json({ error: `Failed to finalize Week ${wn}` });
        return;
      }

      console.log(`[fantasy/weekly] Week ${wn} finalized: room=${String((room as any).id).slice(0, 8)}… by=${commissioner.userId.slice(0, 8)}…`);
      res.json({ ok: true, already_finalized: false });
    }
  );

  // ── GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/results
  // Member-accessible after finalization. Reveals correct answers.
  // Before finalization: { finalized: false }.
  app.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/results",
    async (req: Request, res: Response) => {
      const identity = getCallerIdentity(req);
      if (!identity.userId && !identity.guestToken) { res.status(401).json({ error: "Unauthorized" }); return; }

      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) { res.status(400).json({ error: "weekNumber must be a positive integer" }); return; }

      const supabase = getServiceSupabase();
      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) { res.status(rc.status).json(rc.body); return; }
      const { room, card } = rc;

      if ((room as any).status !== "finalized") { res.json({ finalized: false }); return; }

      const { data: season } = await supabase
        .from("fantasy_league_seasons")
        .select("season_year, fantasy_leagues(league_name)")
        .eq("id", seasonId)
        .maybeSingle();

      const { data: allProps } = await supabase
        .from("gameday_props")
        .select("id, question, scoring_scope, point_value, display_order, status, correct_answer, answer_options")
        .eq("card_id", (card as any).id)
        .eq("scoring_scope", "competition")
        .order("display_order", { ascending: true });

      const competitionProps = (allProps ?? []) as any[];

      const answerLabelMap: Record<string, Record<string, string>> = {};
      for (const p of competitionProps) {
        answerLabelMap[p.id] = {};
        for (const opt of (Array.isArray(p.answer_options) ? p.answer_options : [])) {
          if (opt?.id && opt?.label) answerLabelMap[p.id][opt.id] = opt.label;
        }
      }

      const leaderboard = await _buildLeaderboard(supabase, (room as any).id, competitionProps);
      const topPoints   = leaderboard[0]?.points ?? 0;
      const winners     = leaderboard.filter((e: any) => e.points === topPoints);

      let myCompPicks: any[] = [];
      let myTotalPoints = 0;
      let myCorrectCount = 0;

      try {
        const viewerData = await resolveViewer(supabase, identity, seasonId, leagueId);
        if (viewerData) {
          const { data: vPart } = await supabase
            .from("gameday_participants")
            .select("id")
            .eq("room_id", (room as any).id)
            .eq("season_member_id", viewerData.season_member_id)
            .maybeSingle();

          if (vPart) {
            const vId = (vPart as any).id as string;
            const cpIds = competitionProps.map((p: any) => p.id as string);
            const pvMap: Record<string, number> = {};
            for (const p of competitionProps) pvMap[p.id] = (p.point_value as number) ?? 0;

            if (cpIds.length > 0) {
              const { data: picks } = await supabase
                .from("gameday_picks")
                .select("prop_id, selected_answer, is_correct")
                .eq("participant_id", vId)
                .in("prop_id", cpIds);
              const pickByProp: Record<string, any> = {};
              for (const pk of picks ?? []) pickByProp[pk.prop_id] = pk;

              myCompPicks = competitionProps.map((prop: any) => {
                const pick         = pickByProp[prop.id] ?? null;
                const myAnswerId   = pick?.selected_answer ?? null;
                const correctId    = prop.correct_answer ?? null;
                const isCorrect    = pick?.is_correct ?? null;
                const pointsEarned = isCorrect === true ? (pvMap[prop.id] ?? 0) : 0;
                if (isCorrect === true) { myTotalPoints += pointsEarned; myCorrectCount++; }
                return {
                  prop_id:              prop.id,
                  question:             prop.question,
                  display_order:        prop.display_order,
                  point_value:          prop.point_value,
                  my_answer_id:         myAnswerId,
                  my_answer_label:      myAnswerId ? (answerLabelMap[prop.id]?.[myAnswerId] ?? myAnswerId) : null,
                  correct_answer_id:    correctId,
                  correct_answer_label: correctId ? (answerLabelMap[prop.id]?.[correctId] ?? correctId) : null,
                  is_correct:           isCorrect,
                  points_earned:        pointsEarned,
                };
              });
            }
          }
        }
      } catch (e: any) {
        console.warn("[fantasy/weekly] results viewer lookup:", e.message);
      }

      res.json({
        finalized:               true,
        week_number:             wn,
        league_name:             (season as any)?.fantasy_leagues?.league_name ?? null,
        season_year:             (season as any)?.season_year ?? null,
        winners:                 winners.map((w: any) => ({
          display_name: w.display_name,
          team_name:    w.team_name,
          points:       w.points,
          rank_label:   w.rank_label,
        })),
        leaderboard,
        my_competition_picks:    myCompPicks,
        my_total_points:         myTotalPoints,
        my_correct_count:        myCorrectCount,
        total_competition_props: competitionProps.length,
      });
    }
  );

  // ── GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/standings
  // Season-cumulative standings across all finalized fantasy competitions.
  // Guests with a valid league claim may view. Read-only.
  app.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/standings",
    async (req: Request, res: Response) => {
      const identity = getCallerIdentity(req);
      if (!identity.userId && !identity.guestToken) { res.status(401).json({ error: "Unauthorized" }); return; }

      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();

      const { data: season } = await supabase
        .from("fantasy_league_seasons")
        .select("season_year, fantasy_leagues(league_name)")
        .eq("id", seasonId)
        .eq("league_id", leagueId)
        .maybeSingle();
      if (!season) { res.status(404).json({ error: "Season not found" }); return; }

      const { standings, finalized_competitions } = await _buildSeasonStandings(supabase, seasonId);

      res.json({
        league_name:            (season as any)?.fantasy_leagues?.league_name ?? null,
        season_year:            (season as any)?.season_year ?? null,
        finalized_competitions,
        standings,
      });
    }
  );
}
