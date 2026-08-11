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
  role: string;
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
    .select("id, role")
    .eq("league_season_id", seasonId)
    .eq("league_member_id", lmId)
    .eq("is_active", true)
    .maybeSingle();

  if (!sm) return null;

  // Find team
  const { data: mgr } = await supabase
    .from("fantasy_team_managers")
    .select("fantasy_teams(team_name)")
    .eq("season_member_id", (sm as any).id)
    .eq("is_active", true)
    .maybeSingle();

  const teamName = (mgr as any)?.fantasy_teams?.team_name ?? null;

  return {
    league_member_id: lmId,
    season_member_id: (sm as any).id,
    display_name: (lm as any).display_name ?? null,
    team_name: teamName,
    role: (sm as any).role,
  };
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

      const { data, error } = await supabase.rpc("add_fantasy_season_participant", {
        p_league_id:        leagueId,
        p_league_season_id: seasonId,
        p_display_name:     display_name.trim(),
        p_team_name:        team_name.trim(),
        p_league_member_id: league_member_id ?? null,
      });

      if (error) {
        console.error("[fantasy] add_fantasy_season_participant error:", error.message);
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
        `[fantasy] Participant added: season=${seasonId.slice(0, 8)}… member=${result.league_member_id?.slice(0, 8)}… team=${result.team_id?.slice(0, 8)}… already_exists=${result.already_exists}`
      );

      res.status(result.already_exists ? 200 : 201).json(result);
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

      // Count props by scope
      const { data: props } = await supabase
        .from("gameday_props")
        .select("scoring_scope")
        .eq("card_id", (card as any).id);

      const propList = props ?? [];
      const competitionCount = propList.filter((p: any) => p.scoring_scope === "competition").length;
      const seasonCount      = propList.filter((p: any) => p.scoring_scope === "season").length;

      res.json({
        room_id:     (room as any).id,
        card_id:     (card as any).id,
        room_code:   (room as any).room_code ?? null,
        room_status: (room as any).status,
        card_status: (card as any).status,
        prop_counts: { competition: competitionCount, season: seasonCount },
        created_at:  (room as any).created_at,
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

      // ── Inline publish (room → pick_card → props) ─────────────────────────
      // Simulates the atomic PL/pgSQL RPC. On any failure we attempt rollback.
      // NOTE: True DB-level atomicity requires the publish_fantasy_draft_day()
      // PL/pgSQL function to be applied to Supabase (see gameday-fantasy-phase4a-draft-day.sql).

      let newRoomId: string | null = null;
      let newCardId: string | null = null;

      try {
        // 1. Create room
        const { data: roomRow, error: roomErr } = await supabase
          .from("gameday_rooms")
          .insert({
            room_name:        roomName,
            experience_type:  "fantasy",
            competition_type: "draft_day",
            league_season_id: seasonId,
            sport,
            room_code:        roomCode,
            host_user_id:     userId,
            status:           "active",
            is_private:       true,
          })
          .select("id")
          .single();

        if (roomErr || !roomRow) {
          throw new Error(`Failed to create room: ${roomErr?.message}`);
        }
        newRoomId = (roomRow as any).id as string;

        // 2. Create pick card
        // status='open': Phase 4B member pick submission uses 'open' as the
        // "picks available" gate. Using 'open' from publish forward makes the
        // lifecycle unambiguous: open → locked → settled.
        const { data: cardRow, error: cardErr } = await supabase
          .from("gameday_pick_cards")
          .insert({
            room_id:       newRoomId,
            title:         "Draft Day",
            phase:         "draft_day",
            status:        "open",
            display_order: 0,
          })
          .select("id")
          .single();

        if (cardErr || !cardRow) {
          throw new Error(`Failed to create pick card: ${cardErr?.message}`);
        }
        newCardId = (cardRow as any).id as string;

        // 3. Insert props — try with answer_target_type, fall back without if column missing
        const propRows = propsPayload.map((p) => ({
          card_id:            newCardId,
          template_prop_id:   p.library_id,
          question:           p.question,
          answer_options:     p.answer_options,
          scoring_scope:      p.scoring_scope,
          point_value:        p.point_value,
          answer_target_type: p.answer_target_type,
          display_order:      p.display_order,
          status:             "pending",
        }));

        const { error: propErr } = await supabase.from("gameday_props").insert(propRows);

        if (propErr) {
          // If the column doesn't exist yet, retry without it
          if (propErr.message?.includes("answer_target_type")) {
            console.warn("[fantasy] answer_target_type column missing — inserting without it");
            const propRowsFallback = propRows.map(({ answer_target_type: _drop, ...rest }) => rest);
            const { error: propErr2 } = await supabase.from("gameday_props").insert(propRowsFallback);
            if (propErr2) throw new Error(`Failed to insert props (fallback): ${propErr2.message}`);
          } else {
            throw new Error(`Failed to insert props: ${propErr.message}`);
          }
        }

        console.log(
          `[fantasy] Draft Day published: season=${seasonId.slice(0, 8)}… room=${newRoomId.slice(0, 8)}… props=${propsPayload.length}`
        );

        res.status(201).json({
          room_id:         newRoomId,
          card_id:         newCardId,
          room_code:       roomCode,
          already_existed: false,
        });
      } catch (publishErr: any) {
        // Attempt partial rollback to avoid orphan rows
        if (newCardId) {
          await supabase.from("gameday_props").delete().eq("card_id", newCardId).then(() =>
            supabase.from("gameday_pick_cards").delete().eq("id", newCardId)
          );
        }
        if (newRoomId) {
          await supabase.from("gameday_rooms").delete().eq("id", newRoomId);
        }
        console.error("[fantasy] publish Draft Day failed (rolled back):", publishErr.message);
        res.status(500).json({ error: "Failed to publish Draft Day" });
      }
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
}
