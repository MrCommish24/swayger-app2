import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { sendNBALaunchBlast } from "./email";

// ─── Supabase admin client ────────────────────────────────────

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

// ─── Admin token guard ────────────────────────────────────────

function requireAdmin(req: Request, res: Response): boolean {
  const token =
    req.headers["x-admin-token"] ||
    req.query["token"];
  if (token !== process.env.MM_ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

// ─── Scoring constants (mirror lib/nba-playoffs.ts) ──────────

const ROUND_POINTS: Record<string, number> = {
  round1:      100,
  round2:      300,
  conf_finals: 1000,
  finals:      3000,
};

const GAMES_BONUS_POINTS: Record<string, number> = {
  round1:      50,
  round2:      75,
  conf_finals: 150,
  finals:      250,
};

// ─── Live games cache (30-min TTL) ───────────────────────────

interface CachedGames {
  data: NBAGame[];
  fetchedAt: number;
}

let gamesCache: CachedGames | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

interface NBAGame {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  h2h_home: number | null;
  h2h_away: number | null;
  spread_home: number | null;
  spread_away: number | null;
  spread_home_odds: number | null;
  spread_away_odds: number | null;
  total: number | null;
  favorite_team: string | null;
}

interface OddsOutcome {
  name: string;
  price?: number;
  point?: number;
}

interface OddsMarket {
  key: string;
  outcomes: OddsOutcome[];
}

interface OddsBookmaker {
  key: string;
  markets: OddsMarket[];
}

interface OddsEvent {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: OddsBookmaker[];
}

async function fetchOddsGames(): Promise<NBAGame[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return [];

  const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error("[nba] Odds API error:", res.status);
    return [];
  }

  const events: OddsEvent[] = await res.json();

  return events.map((e) => {
    const fanduel = e.bookmakers.find((b) => b.key === "fanduel") ?? e.bookmakers[0];
    const h2hMkt = fanduel?.markets.find((m) => m.key === "h2h");
    const spreadMkt = fanduel?.markets.find((m) => m.key === "spreads");
    const totalsMkt = fanduel?.markets.find((m) => m.key === "totals");

    const homeH2H = h2hMkt?.outcomes.find((o) => o.name === e.home_team)?.price ?? null;
    const awayH2H = h2hMkt?.outcomes.find((o) => o.name === e.away_team)?.price ?? null;

    const homeSpread = spreadMkt?.outcomes.find((o) => o.name === e.home_team);
    const awaySpread = spreadMkt?.outcomes.find((o) => o.name === e.away_team);

    const overOutcome = totalsMkt?.outcomes.find((o) => o.name === "Over");

    // Determine favorite from h2h odds (lower american = bigger favorite)
    let favTeam: string | null = null;
    if (homeH2H !== null && awayH2H !== null) {
      favTeam = homeH2H < awayH2H ? e.home_team : e.away_team;
    }

    return {
      id: e.id,
      home_team: e.home_team,
      away_team: e.away_team,
      commence_time: e.commence_time,
      h2h_home: homeH2H,
      h2h_away: awayH2H,
      spread_home: homeSpread?.point ?? null,
      spread_away: awaySpread?.point ?? null,
      spread_home_odds: homeSpread?.price ?? null,
      spread_away_odds: awaySpread?.price ?? null,
      total: overOutcome?.point ?? null,
      favorite_team: favTeam,
    };
  });
}

// ─── Score recomputation ──────────────────────────────────────

async function recomputeScores(supabase: ReturnType<typeof getSupabase>): Promise<void> {
  // Fetch all resolved series
  const { data: series } = await supabase
    .from("nba_playoff_series")
    .select("id, round, winner, games")
    .eq("season", "2026")
    .not("winner", "is", null);

  if (!series || series.length === 0) return;

  // Fetch all picks for this season
  const { data: allPicks } = await supabase
    .from("nba_playoff_bracket_picks")
    .select("user_id, series_id, picked_team, games_guess")
    .eq("season", "2026");

  if (!allPicks || allPicks.length === 0) return;

  // Build series lookup
  const seriesMap = new Map<string, { round: string; winner: string; games: number }>();
  for (const s of series) {
    if (s.winner && s.games) {
      seriesMap.set(s.id, { round: s.round, winner: s.winner, games: s.games });
    }
  }

  // Compute per-user scores
  const userScores = new Map<
    string,
    { total_pts: number; round1_pts: number; round2_pts: number; conf_finals_pts: number; finals_pts: number; correct_picks: number; correct_games: number }
  >();

  for (const pick of allPicks) {
    const resolved = seriesMap.get(pick.series_id);
    if (!resolved) continue;

    const { round, winner, games } = resolved;
    const isCorrect = pick.picked_team === winner;
    const isGamesCorrect = pick.games_guess !== null && pick.games_guess === games;

    if (!userScores.has(pick.user_id)) {
      userScores.set(pick.user_id, {
        total_pts: 0,
        round1_pts: 0,
        round2_pts: 0,
        conf_finals_pts: 0,
        finals_pts: 0,
        correct_picks: 0,
        correct_games: 0,
      });
    }

    const score = userScores.get(pick.user_id)!;
    const roundPts = isCorrect ? (ROUND_POINTS[round] ?? 0) : 0;
    const bonusPts = isCorrect && isGamesCorrect ? (GAMES_BONUS_POINTS[round] ?? 0) : 0;
    const earned = roundPts + bonusPts;

    score.total_pts += earned;
    score.correct_picks += isCorrect ? 1 : 0;
    score.correct_games += isCorrect && isGamesCorrect ? 1 : 0;

    if (round === "round1") score.round1_pts += earned;
    else if (round === "round2") score.round2_pts += earned;
    else if (round === "conf_finals") score.conf_finals_pts += earned;
    else if (round === "finals") score.finals_pts += earned;
  }

  // Upsert scores
  const upsertRows = Array.from(userScores.entries()).map(([userId, s]) => ({
    user_id: userId,
    season: "2026",
    ...s,
    updated_at: new Date().toISOString(),
  }));

  if (upsertRows.length > 0) {
    await supabase
      .from("nba_playoff_scores")
      .upsert(upsertRows, { onConflict: "user_id" });
  }
}

// ─── Route registration ───────────────────────────────────────

export function registerNBARoutes(app: Express): void {
  // ── GET /api/nba/games — live game odds (30-min cache) ────────
  app.get("/api/nba/games", async (_req: Request, res: Response) => {
    try {
      const now = Date.now();
      if (gamesCache && now - gamesCache.fetchedAt < CACHE_TTL_MS) {
        res.json(gamesCache.data);
        return;
      }

      const games = await fetchOddsGames();
      gamesCache = { data: games, fetchedAt: now };
      res.json(games);
    } catch (err) {
      console.error("[nba/games]", err);
      res.status(500).json({ error: "Failed to fetch games" });
    }
  });

  // ── GET /api/nba/series — all series from DB ──────────────────
  app.get("/api/nba/series", async (_req: Request, res: Response) => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("nba_playoff_series")
        .select("*")
        .eq("season", "2026")
        .order("sort_order");
      if (error) throw error;
      res.json(data ?? []);
    } catch (err) {
      console.error("[nba/series]", err);
      res.status(500).json({ error: "Failed to fetch series" });
    }
  });

  // ── GET /api/nba/leaderboard — points race with profile join ──
  app.get("/api/nba/leaderboard", async (_req: Request, res: Response) => {
    try {
      const supabase = getSupabase();

      const { data: scores, error } = await supabase
        .from("nba_playoff_scores")
        .select("*")
        .eq("season", "2026")
        .order("total_pts", { ascending: false })
        .order("correct_picks", { ascending: false });

      if (error) throw error;
      if (!scores || scores.length === 0) {
        res.json([]);
        return;
      }

      // Join profile info
      const userIds = scores.map((s: { user_id: string }) => s.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", userIds);

      const profileMap = new Map<string, { username: string; display_name: string }>();
      for (const p of profiles ?? []) {
        profileMap.set(p.id, { username: p.username, display_name: p.display_name });
      }

      const result = scores.map((s: { user_id: string; [key: string]: unknown }) => ({
        ...s,
        username: profileMap.get(s.user_id)?.username ?? null,
        display_name: profileMap.get(s.user_id)?.display_name ?? null,
      }));

      res.json(result);
    } catch (err) {
      console.error("[nba/leaderboard]", err);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  // ── POST /api/nba/admin/series — seed/update a series ────────
  app.post("/api/nba/admin/series", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const supabase = getSupabase();
      const body = req.body as {
        id: string;
        round: string;
        conference?: string;
        seed1?: number;
        seed2?: number;
        team1: string;
        team2: string;
        starts_at?: string;
        sort_order?: number;
      };

      if (!body.id || !body.round || !body.team1 || !body.team2) {
        res.status(400).json({ ok: false, error: "id, round, team1, team2 required" });
        return;
      }

      const { error } = await supabase
        .from("nba_playoff_series")
        .upsert({
          ...body,
          season: "2026",
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });

      if (error) throw error;
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? (err as { message: string }).message
        : String(err);
      console.error("[nba/admin/series]", err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // ── PATCH /api/nba/admin/series/:id/resolve ───────────────────
  // Marks a series winner, triggers full score recompute
  app.patch("/api/nba/admin/series/:id/resolve", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const supabase = getSupabase();
      const { id } = req.params;
      const { winner, games } = req.body as { winner: string; games: number };

      if (!winner || !games) {
        res.status(400).json({ ok: false, error: "winner and games (4-7) required" });
        return;
      }

      if (games < 4 || games > 7) {
        res.status(400).json({ ok: false, error: "games must be 4–7" });
        return;
      }

      const { data: updateData, error: updateError } = await supabase
        .from("nba_playoff_series")
        .update({ winner, games, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("season", "2026")
        .select();

      if (updateError) throw updateError;
      if (!updateData || updateData.length === 0) {
        res.status(403).json({ ok: false, error: `Series '${id}' not found or write blocked by DB policy. Run the RLS fix SQL in Supabase.` });
        return;
      }

      // Recompute all scores
      await recomputeScores(supabase);

      res.json({ ok: true, message: `Resolved: ${winner} in ${games} games. Scores updated.` });
    } catch (err) {
      console.error("[nba/admin/resolve]", err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // ── GET /api/nba/admin/scores/recompute — manual recompute ────
  app.get("/api/nba/admin/scores/recompute", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const supabase = getSupabase();
      await recomputeScores(supabase);
      res.json({ ok: true, message: "Scores recomputed" });
    } catch (err) {
      console.error("[nba/admin/recompute]", err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // ── POST /api/nba/admin/seed-from-odds ────────────────────────
  // Calls The Odds API, deduplicates R1 matchups, upserts into nba_playoff_series.
  // Safe to call multiple times — uses onConflict upsert.
  app.post("/api/nba/admin/seed-from-odds", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      res.status(400).json({ ok: false, error: "ODDS_API_KEY not configured" });
      return;
    }

    // NBA team → conference lookup (all 30 teams)
    const EAST_TEAMS = new Set([
      "Boston Celtics", "Brooklyn Nets", "New York Knicks",
      "Philadelphia 76ers", "Toronto Raptors",
      "Chicago Bulls", "Cleveland Cavaliers", "Detroit Pistons",
      "Indiana Pacers", "Milwaukee Bucks",
      "Atlanta Hawks", "Charlotte Hornets", "Miami Heat",
      "Orlando Magic", "Washington Wizards",
    ]);

    function slugify(name: string): string {
      return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    }

    try {
      const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american`;
      const oddsRes = await fetch(url);
      if (!oddsRes.ok) {
        const body = await oddsRes.text();
        res.status(502).json({ ok: false, error: `Odds API error ${oddsRes.status}`, detail: body });
        return;
      }

      const events: OddsEvent[] = await oddsRes.json();

      // Deduplicate matchups by canonical team pair (alphabetical key)
      const seen = new Map<string, {
        team1: string; team2: string;
        team1Odds: number | null; team2Odds: number | null;
        startsAt: string;
      }>();

      for (const ev of events) {
        const fanduel = ev.bookmakers.find((b) => b.key === "fanduel") ?? ev.bookmakers[0];
        const h2h = fanduel?.markets.find((m) => m.key === "h2h");
        const homeOdds = h2h?.outcomes.find((o) => o.name === ev.home_team)?.price ?? null;
        const awayOdds = h2h?.outcomes.find((o) => o.name === ev.away_team)?.price ?? null;

        // Canonical key: sort team names alphabetically so (A vs B) == (B vs A)
        const teams = [ev.home_team, ev.away_team].sort();
        const key = teams.join("|");

        if (!seen.has(key)) {
          seen.set(key, {
            team1: teams[0],
            team2: teams[1],
            team1Odds: teams[0] === ev.home_team ? homeOdds : awayOdds,
            team2Odds: teams[1] === ev.home_team ? homeOdds : awayOdds,
            startsAt: ev.commence_time,
          });
        } else {
          // Keep earliest game date
          const existing = seen.get(key)!;
          if (ev.commence_time < existing.startsAt) {
            existing.startsAt = ev.commence_time;
          }
        }
      }

      if (seen.size === 0) {
        res.json({ ok: true, message: "No NBA games found from Odds API", upserted: 0 });
        return;
      }

      const supabase = getSupabase();

      // Build upsert rows
      const rows: {
        id: string; season: string; round: string;
        conference: string | null; seed1: number | null; seed2: number | null;
        team1: string; team2: string; starts_at: string; sort_order: number;
        updated_at: string;
      }[] = [];

      let eastOrder = 0;
      let westOrder = 100;

      for (const matchup of seen.values()) {
        const { team1, team2, team1Odds, team2Odds, startsAt } = matchup;

        const isEast1 = EAST_TEAMS.has(team1);
        const isEast2 = EAST_TEAMS.has(team2);
        const conf = (isEast1 || isEast2) ? "east" : "west";

        // Determine seed order: lower (more negative) odds = bigger favorite = seed1
        let orderedTeam1 = team1;
        let orderedTeam2 = team2;
        let seed1: number | null = null;
        let seed2: number | null = null;

        if (team1Odds !== null && team2Odds !== null) {
          // More negative american odds = bigger favorite
          if (team2Odds < team1Odds) {
            orderedTeam1 = team2;
            orderedTeam2 = team1;
          }
        }

        const seriesId = `r1-${conf}-${slugify(orderedTeam1)}-vs-${slugify(orderedTeam2)}`;
        const sortOrder = conf === "east" ? eastOrder++ : westOrder++;

        rows.push({
          id: seriesId,
          season: "2026",
          round: "round1",
          conference: conf,
          seed1,
          seed2,
          team1: orderedTeam1,
          team2: orderedTeam2,
          starts_at: startsAt,
          sort_order: sortOrder,
          updated_at: new Date().toISOString(),
        });
      }

      const { error } = await supabase
        .from("nba_playoff_series")
        .upsert(rows, { onConflict: "id" });

      if (error) throw error;

      console.log(`[nba/seed-from-odds] Upserted ${rows.length} series`);
      res.json({
        ok: true,
        upserted: rows.length,
        series: rows.map((r) => ({ id: r.id, team1: r.team1, team2: r.team2, conf: r.conference, starts_at: r.starts_at })),
      });
    } catch (err) {
      console.error("[nba/seed-from-odds]", err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // ── POST /api/nba/admin/blast-launch ──────────────────────────
  // Manual trigger: send NBA Playoffs launch email to all subscribed users.
  // Call this when ready — does NOT fire automatically.
  app.post("/api/nba/admin/blast-launch", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const supabase = getSupabase();
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");

      type ProfileRow = {
        id: string;
        notification_email?: string | null;
        email_unsubscribed?: boolean;
      };

      const eligible = ((allProfiles ?? []) as ProfileRow[]).filter(
        (p) => p.notification_email && !p.email_unsubscribed
      );

      console.log(`[nba/blast-launch] Sending to ${eligible.length} users`);

      let sent = 0;
      const errors: string[] = [];

      for (const profile of eligible) {
        try {
          await sendNBALaunchBlast({
            to: profile.notification_email as string,
            userId: profile.id,
          });
          sent++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[nba/blast-launch] Failed for ${profile.id}:`, msg);
          errors.push(`${profile.id}: ${msg}`);
        }
      }

      console.log(`[nba/blast-launch] Done — sent: ${sent}, errors: ${errors.length}`);
      res.json({ ok: true, sent, errors: errors.length > 0 ? errors : undefined });
    } catch (err) {
      console.error("[nba/blast-launch]", err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
}
