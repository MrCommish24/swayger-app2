/**
 * server/routes-fantasy.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 2 — Fantasy League Commissioner Setup
 *
 * Routes:
 *   POST /api/fantasy/leagues/setup
 *     Atomic initial league + first season bootstrap (setup_fantasy_league RPC).
 *
 *   POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/participants
 *     Atomic member + team setup row (add_fantasy_season_participant RPC).
 *
 *   GET  /api/fantasy/leagues
 *     Commissioner's Fantasy leagues with nested season stubs.
 *
 *   GET  /api/fantasy/leagues/:leagueId/seasons/:seasonId
 *     Complete setup state for review / display.
 *
 * Commissioner authority chain (enforced on every mutating season route):
 *   authenticated user_id
 *   → active fantasy_member_claims
 *   → fantasy_league_members (for this league)
 *   → fantasy_season_members with role IN ('commissioner','co_commissioner')
 *   Season status (upcoming / active / completed) is NOT a gate on authority.
 */

import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

// ── Local helpers (pattern from routes-gameday.ts) ───────────────────────────

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
 * No email allow-list — any authenticated Supabase user can access Fantasy.
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
 * Verifies the caller is commissioner/co_commissioner for the given season.
 *
 * Authority chain:
 *   user_id → active fantasy_member_claims → fantasy_league_members (leagueId)
 *   → fantasy_season_members (seasonId) with role IN ('commissioner','co_commissioner')
 *
 * Season status is NOT checked — upcoming, active, and completed seasons all
 * grant the same setup authority. Status is only used for product behavior
 * guards (e.g. "cannot modify a completed season"), which are separate.
 *
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

  // 1. Find all active claims for this user
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

  // 2. Find the league_member for this specific league
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

  // 3. Find season_member with commissioner authority (season status not checked)
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

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_SPORTS = ["football", "basketball", "baseball"];

// ── Route registration ────────────────────────────────────────────────────────

export function registerFantasyRoutes(app: Express) {
  // Prevent caching on all Fantasy API responses
  app.use("/api/fantasy", (_req: Request, res: Response, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    next();
  });

  // ── POST /api/fantasy/leagues/setup ─────────────────────────────────────────
  //
  // Atomic initial league + first season bootstrap.
  // Any authenticated user can create a Fantasy league.
  //
  // Calls setup_fantasy_league RPC which atomically creates:
  //   fantasy_leagues + fantasy_league_members + fantasy_member_claims
  //   + fantasy_league_seasons + fantasy_season_members (role='commissioner')
  //
  // Body:
  //   league_name:           string   — league display name
  //   sport:                 string   — "football" | "basketball" | "baseball"
  //   display_name:          string   — commissioner's name inside this league
  //   season_year:           number   — calendar year season begins
  //   reward_description?:   string   — optional reward label
  //   reward_amount_display?: string  — optional reward amount display string
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
      // Surface RPC validation errors as 400
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
  //
  // Atomic commissioner action: add one participant + team to a season.
  // Auth: commissioner/co_commissioner for this season (any season status).
  //
  // Calls add_fantasy_season_participant RPC.
  // Duplicate submissions: RPC returns already_exists=true with existing IDs.
  //
  // Body:
  //   display_name:     string   — participant's display name
  //   team_name:        string   — their fantasy team name
  //   league_member_id?: string  — omit for new participants; pass for commissioner's own row
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

      // Fast context check: season must belong to the route's league
      // (also enforced atomically inside the RPC — fail fast here)
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

      // 201 for new, 200 for already_exists
      res.status(result.already_exists ? 200 : 201).json(result);
    }
  );

  // ── GET /api/fantasy/leagues ─────────────────────────────────────────────────
  //
  // Returns the authenticated user's Fantasy leagues (via claim chain)
  // with nested season stubs, newest first.
  app.get("/api/fantasy/leagues", async (req: Request, res: Response) => {
    const userId = requireFantasyAuth(req, res);
    if (!userId) return;

    const supabase = getServiceSupabase();

    // 1. All active claims for this user
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

    // 2. Which leagues those members belong to
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

    // 3. Fetch leagues with nested seasons
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
  // Full setup state for a season — used by the commissioner review screen
  // and any future read-only participant view.
  //
  // Returns:
  //   league:       { id, league_name, sport, is_active }
  //   season:       { id, season_year, status, reward fields }
  //   participants: merged list — display_name, role, team_name, manager info
  app.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId",
    async (req: Request, res: Response) => {
      const userId = requireFantasyAuth(req, res);
      if (!userId) return;

      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();

      // League
      const { data: league } = await supabase
        .from("fantasy_leagues")
        .select("id, league_name, sport, is_active")
        .eq("id", leagueId)
        .maybeSingle();

      if (!league) {
        res.status(404).json({ error: "League not found" });
        return;
      }

      // Season — must belong to this league
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

      // Active season members with their league_member display_name
      const { data: seasonMembers } = await supabase
        .from("fantasy_season_members")
        .select("id, role, is_active, fantasy_league_members(id, display_name)")
        .eq("league_season_id", seasonId)
        .eq("is_active", true);

      // Active teams with their manager assignments
      const { data: teams } = await supabase
        .from("fantasy_teams")
        .select(
          "id, team_name, is_active, fantasy_team_managers(id, season_member_id, role, is_active)"
        )
        .eq("league_season_id", seasonId)
        .eq("is_active", true);

      // Merge: one row per season_member, annotated with their team
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

      res.json({ league, season, participants });
    }
  );
}
