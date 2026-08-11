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
  // Upgrades a guest claim to an authenticated claim.
  // Called after a guest signs in / creates an account.
  //
  // Auth: Bearer JWT required.
  // Body: { guest_token: string }
  //
  // Finds the active claim held by guest_token, sets user_id = auth user,
  // clears guest_token. No new row is created — the partial unique index
  // (one active claim per seat) is never violated.
  //
  // Response:
  //   200 — upgraded: true (or already_upgraded: true if user already holds it)
  //   400 — guest_token missing
  //   404 — no active guest claim found for this token
  //   500 — DB error
  app.post(
    "/api/fantasy/claim/upgrade",
    async (req: Request, res: Response) => {
      const userId = requireFantasyAuth(req, res);
      if (!userId) return;

      const { guest_token } = req.body as { guest_token?: string };
      if (!guest_token?.trim()) {
        res.status(400).json({ error: "guest_token is required" });
        return;
      }

      const supabase = getServiceSupabase();

      // Find the active guest claim
      const { data: claim } = await supabase
        .from("fantasy_member_claims")
        .select("id, league_member_id")
        .eq("guest_token", guest_token.trim())
        .eq("is_active", true)
        .maybeSingle();

      if (!claim) {
        res.status(404).json({ error: "No active guest claim found for this token" });
        return;
      }

      // Check if this user already has an active claim on the same seat
      const { data: existing } = await supabase
        .from("fantasy_member_claims")
        .select("id")
        .eq("user_id", userId)
        .eq("league_member_id", (claim as any).league_member_id)
        .eq("is_active", true)
        .maybeSingle();

      if (existing) {
        // Idempotent: user already holds an authenticated claim on this seat
        res.json({ already_upgraded: true, claim_id: (existing as any).id });
        return;
      }

      // Upgrade: bind user_id, clear guest_token (same row, no new record)
      const { data: updated, error } = await supabase
        .from("fantasy_member_claims")
        .update({ user_id: userId, guest_token: null })
        .eq("id", (claim as any).id)
        .select("id, league_member_id")
        .maybeSingle();

      if (error) {
        console.error("[fantasy] claim upgrade error:", error.message);
        res.status(500).json({ error: "Failed to upgrade claim" });
        return;
      }

      console.log(
        `[fantasy] Claim upgraded: member=${(claim as any).league_member_id?.slice(0, 8)}… user=${userId.slice(0, 8)}…`
      );

      res.json({
        claim_id:         (updated as any).id,
        league_member_id: (updated as any).league_member_id,
        upgraded:         true,
      });
    }
  );
}
