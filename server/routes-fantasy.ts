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

// ── Local helpers ─────────────────────────────────────────────────────────────

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

      const { display_name, team_name, league_member_id } = req.body as {
        display_name?: string;
        team_name?: string;
        league_member_id?: string;
      };

      if (!display_name?.trim()) {
        res.status(400).json({ error: "display_name is required" });
        return;
      }
      if (!team_name?.trim()) {
        res.status(400).json({ error: "team_name is required" });
        return;
      }

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
            eligible = false;
          } else if (cardStatus === "open") {
            // Count existing picks for this card's props
            const { data: propRows } = await supabase
              .from("gameday_props")
              .select("id")
              .eq("card_id", (ddCard as any).id);
            const ddPropIds = (propRows ?? []).map((p: any) => p.id as string);
            let pickCount = 0;
            if (ddPropIds.length > 0) {
              const { count } = await supabase
                .from("gameday_picks")
                .select("id", { count: "exact", head: true })
                .in("prop_id", ddPropIds);
              pickCount = count ?? 0;
            }
            if (pickCount === 0) {
              roomIdForSnapshot = ddRoomId; // safe to update snapshots atomically
            } else {
              eligible = false;
            }
          }
        }
      }

      const { data, error } = await supabase.rpc("add_fantasy_season_participant_v2", {
        p_league_id:          leagueId,
        p_league_season_id:   seasonId,
        p_display_name:       display_name.trim(),
        p_team_name:          team_name.trim(),
        p_league_member_id:   league_member_id ?? null,
        p_draft_day_eligible: eligible,
        p_room_id:            roomIdForSnapshot,
      });

      if (error) {
        console.error("[fantasy] add_fantasy_season_participant_v2 error:", error.message);
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
        .select("id, template_prop_id, scoring_scope, point_value, display_order")
        .eq("card_id", (card as any).id)
        .order("display_order", { ascending: true });

      const propList  = props ?? [];
      const propIds   = propList.map((p: any) => p.id as string);
      const competitionCount = propList.filter((p: any) => p.scoring_scope === "competition").length;
      const seasonCount      = propList.filter((p: any) => p.scoring_scope === "season").length;

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
        room_id:        (room as any).id,
        card_id:        (card as any).id,
        room_code:      (room as any).room_code ?? null,
        room_status:    (room as any).status,
        card_status:    (card as any).status,
        prop_counts:    { competition: competitionCount, season: seasonCount },
        pick_count:     pickCount,
        my_pick_count:  myPickCount,
        current_props:  currentProps,
        created_at:     (room as any).created_at,
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
      const { data: card } = await supabase
        .from("gameday_pick_cards")
        .select("id, status")
        .eq("room_id", roomId)
        .eq("phase", "draft_day")
        .maybeSingle();

      if (!card) {
        res.status(404).json({ error: "Draft Day card not found." });
        return;
      }

      const cardStatus = (card as any).status as string;

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
        .select("id, question, scoring_scope, point_value, answer_options, display_order")
        .eq("card_id", (card as any).id)
        .order("display_order", { ascending: true });

      const publishedProps = (rawProps ?? []).map((p: any) => ({
        id:             p.id as string,
        question:       p.question as string,
        scoring_scope:  p.scoring_scope as string,
        point_value:    p.point_value as number,
        // answer_options is the authoritative published snapshot; correct_answer excluded
        answer_options: Array.isArray(p.answer_options) ? p.answer_options : [],
        display_order:  p.display_order as number,
      }));

      const propIds    = publishedProps.map((p) => p.id);
      const totalProps = publishedProps.length;

      // ── Fetch this participant's picks ────────────────────────────────────────
      const { data: rawPicks } = propIds.length > 0
        ? await supabase
            .from("gameday_picks")
            .select("prop_id, selected_answer")
            .in("prop_id", propIds)
            .eq("participant_id", participantId)
        : { data: [] };

      const myPicks: Record<string, string> = {};
      for (const pick of rawPicks ?? []) {
        myPicks[(pick as any).prop_id as string] = (pick as any).selected_answer as string;
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
        room_id:         roomId,
        card_id:         (card as any).id,
        room_code:       (room as any).room_code ?? null,
        card_status:     cardStatus,
        participant_id:  participantId,
        props:           publishedProps,
        my_picks:        myPicks,
        my_pick_count:   myPickCount,
        total_props:     totalProps,
        pick_count:      globalPickCount,
        league_name:     leagueName,
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
      const { data: card } = await supabase
        .from("gameday_pick_cards")
        .select("id, status")
        .eq("room_id", roomId)
        .eq("phase", "draft_day")
        .maybeSingle();

      if (!card) {
        res.status(404).json({ error: "Draft Day card not found." });
        return;
      }

      const cardStatus = (card as any).status as string;

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
      const { data: upserted, error: upsertErr } = await supabase
        .from("gameday_picks")
        .upsert(
          {
            prop_id:          prop_id,
            participant_id:   participantId,
            selected_answer:  selected_answer,
            submitted_at:     new Date().toISOString(),
          },
          { onConflict: "prop_id,participant_id" }
        )
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
}
