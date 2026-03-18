import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// ─── Supabase client ──────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key);
}

// ─── Admin token check ────────────────────────────────────────────────────────

function isAdminToken(token: string | undefined): boolean {
  const adminToken = process.env.MM_ADMIN_TOKEN;
  if (!adminToken) return false;
  return token === adminToken;
}

// ─── Scoring constants (mirrored from lib/mm-picks.ts) ───────────────────────

const TAKE_POINTS: Record<string, number> = {
  sweet_sixteen: 2,
  elite_eight: 3,
  final_four: 5,
  champion: 10,
};

// Map take_type to the round_id that determines which teams advanced
const TAKE_ROUND_MAP: Record<string, string> = {
  sweet_sixteen: "round-64",   // won in R64 → reached Sweet 16
  elite_eight:   "round-32",   // won in R32 → reached Elite 8
  final_four:    "sweet-16",   // won in S16 → reached Final Four
  champion:      "championship", // won the championship
};

const UPSET_POINTS = 3;
const BLOWOUT_POINTS = 3;
const HIGH_SCORER_POINTS = 3;

// ─── Scoring computation ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeAndSaveScores(
  supabase: any,
): Promise<{ scored: number; error: string | null }> {
  type GameResultRow = { round_id: string; matchup_id: string; winner_name: string | null; winner_score: number | null; loser_score: number | null };
  type LockedTakeRow = { user_id: string; take_type: string; teams: string[] | null; is_submitted: boolean };
  type SpecialPickRow = { user_id: string; round_id: string; pick_type: string; matchup_id: string; picked_team: string | null };
  type RankedMatchupRow = { round_id: string; pick_type: string; matchup_id: string };

  const { data: resultsRaw, error: resultsErr } = await supabase
    .from("mm_game_results")
    .select("*");
  if (resultsErr) return { scored: 0, error: resultsErr.message };
  const results = (resultsRaw ?? []) as GameResultRow[];

  // Build winners by round
  const winnersByRound: Record<string, Set<string>> = {};
  for (const r of results) {
    if (!winnersByRound[r.round_id]) winnersByRound[r.round_id] = new Set();
    if (r.winner_name) winnersByRound[r.round_id].add(r.winner_name);
  }

  const scores: Record<
    string,
    {
      sweet_sixteen: number;
      elite_eight: number;
      final_four: number;
      champion: number;
      upset: number;
      correct_upsets: number;
      blowout: number;
      correct_blowouts: number;
      high_scorer: number;
      correct_high_scorers: number;
    }
  > = {};

  function emptyScore() {
    return {
      sweet_sixteen: 0, elite_eight: 0, final_four: 0, champion: 0,
      upset: 0, correct_upsets: 0,
      blowout: 0, correct_blowouts: 0,
      high_scorer: 0, correct_high_scorers: 0,
    };
  }

  // Score locked takes
  const { data: takesRaw } = await supabase
    .from("mm_locked_takes")
    .select("*")
    .eq("is_submitted", true);
  const takes = (takesRaw ?? []) as LockedTakeRow[];

  for (const take of takes) {
    if (!scores[take.user_id]) scores[take.user_id] = emptyScore();
    const roundId = TAKE_ROUND_MAP[take.take_type];
    const advancedTeams = winnersByRound[roundId];
    if (!advancedTeams || advancedTeams.size === 0) continue;

    const ptsEach = TAKE_POINTS[take.take_type] ?? 0;
    for (const team of take.teams ?? []) {
      if (advancedTeams.has(team)) {
        scores[take.user_id][take.take_type as keyof typeof scores[string]] += ptsEach;
      }
    }
  }

  // Score special picks (upset / blowout / high_scorer) from mm_special_picks
  const { data: specialPicksRaw } = await supabase
    .from("mm_special_picks")
    .select("*");
  const specialPicks = (specialPicksRaw ?? []) as SpecialPickRow[];

  // Fetch ranked matchups to know which matchup_id won each category per round
  const { data: rankedMatchupsRaw } = await supabase
    .from("mm_round_matchups")
    .select("*");
  const rankedMatchups = (rankedMatchupsRaw ?? []) as RankedMatchupRow[];

  // Build a map: round_id + pick_type → set of matchup_ids that are candidates
  const candidateMap: Record<string, Set<string>> = {};
  for (const rm of rankedMatchups) {
    const key = `${rm.round_id}:${rm.pick_type}`;
    if (!candidateMap[key]) candidateMap[key] = new Set();
    candidateMap[key].add(rm.matchup_id);
  }

  // Build per-round result maps for blowout/high_scorer scoring
  // Group results by round → compute biggest blowout and highest scorer
  const roundResults: Record<string, GameResultRow[]> = {};
  for (const r of results) {
    if (!roundResults[r.round_id]) roundResults[r.round_id] = [];
    roundResults[r.round_id].push(r);
  }

  // For each round, find the winning blowout matchup and winning high_scorer matchup
  const biggestBlowout: Record<string, string | null> = {};
  const highestScorer: Record<string, string | null> = {};

  for (const [roundId, roundRes] of Object.entries(roundResults)) {
    const blowoutCandidates = candidateMap[`${roundId}:blowout`] ?? new Set();
    const hsCandidates = candidateMap[`${roundId}:high_scorer`] ?? new Set();

    let maxMargin = -1;
    let maxTotal = -1;

    for (const r of roundRes) {
      const margin = r.winner_score != null && r.loser_score != null
        ? r.winner_score - r.loser_score : -1;
      const total = r.winner_score != null && r.loser_score != null
        ? r.winner_score + r.loser_score : -1;

      if (blowoutCandidates.has(r.matchup_id) && margin > maxMargin) {
        maxMargin = margin;
        biggestBlowout[roundId] = r.matchup_id;
      }
      if (hsCandidates.has(r.matchup_id) && total > maxTotal) {
        maxTotal = total;
        highestScorer[roundId] = r.matchup_id;
      }
    }
  }

  for (const pick of specialPicks) {
    if (!scores[pick.user_id]) scores[pick.user_id] = emptyScore();

    if (pick.pick_type === "upset") {
      const resultForGame = results.find(
        (r) => r.round_id === pick.round_id && r.matchup_id === pick.matchup_id,
      );
      if (resultForGame && resultForGame.winner_name === pick.picked_team) {
        scores[pick.user_id].upset += UPSET_POINTS;
        scores[pick.user_id].correct_upsets += 1;
      }
    } else if (pick.pick_type === "blowout") {
      const winningMatchup = biggestBlowout[pick.round_id];
      if (winningMatchup && pick.matchup_id === winningMatchup) {
        scores[pick.user_id].blowout += BLOWOUT_POINTS;
        scores[pick.user_id].correct_blowouts += 1;
      }
    } else if (pick.pick_type === "high_scorer") {
      const winningMatchup = highestScorer[pick.round_id];
      if (winningMatchup && pick.matchup_id === winningMatchup) {
        scores[pick.user_id].high_scorer += HIGH_SCORER_POINTS;
        scores[pick.user_id].correct_high_scorers += 1;
      }
    }
  }

  const upserts = Object.entries(scores).map(([userId, p]) => ({
    user_id: userId,
    total_points: p.sweet_sixteen + p.elite_eight + p.final_four + p.champion +
      p.upset + p.blowout + p.high_scorer,
    sweet_sixteen_pts: p.sweet_sixteen,
    elite_eight_pts: p.elite_eight,
    final_four_pts: p.final_four,
    champion_pts: p.champion,
    upset_pts: p.upset,
    correct_upsets: p.correct_upsets,
    blowout_pts: p.blowout,
    correct_blowouts: p.correct_blowouts,
    high_scorer_pts: p.high_scorer,
    correct_high_scorers: p.correct_high_scorers,
    updated_at: new Date().toISOString(),
  }));

  if (upserts.length > 0) {
    const { error: upsertErr } = await supabase
      .from("mm_pick_scores")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(upserts as any, { onConflict: "user_id" });
    if (upsertErr) return { scored: 0, error: upsertErr.message };
  }

  return { scored: upserts.length, error: null };
}

// ─── Score update email blast ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendScoreUpdateBlast(
  supabase: any,
): Promise<void> {
  const { sendMMScoreUpdateEmail } = await import("./email");

  type PickScoreRow = {
    user_id: string;
    total_points: number | null;
    sweet_sixteen_pts: number | null;
    elite_eight_pts: number | null;
    final_four_pts: number | null;
    champion_pts: number | null;
    upset_pts: number | null;
    correct_upsets: number | null;
    blowout_pts: number | null;
    correct_blowouts: number | null;
    high_scorer_pts: number | null;
    correct_high_scorers: number | null;
  };

  // Get all scores ordered by total (to compute rank)
  const { data: allScoresRaw } = await supabase
    .from("mm_pick_scores")
    .select("*")
    .order("total_points", { ascending: false });
  const allScores = (allScoresRaw ?? []) as PickScoreRow[];

  if (!allScores.length) return;

  const totalPlayers = allScores.length;
  const userIds = allScores.map((s) => s.user_id);

  // Use SECURITY DEFINER RPC to bypass RLS on profiles table
  const { data: profiles } = await supabase.rpc("get_all_notification_profiles");

  type ProfileRow = { id: string; notification_email?: string | null; display_name?: string | null; username: string };
  const profileMap = new Map<string, ProfileRow>(
    ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]),
  );

  let sent = 0;
  for (let i = 0; i < allScores.length; i++) {
    const s = allScores[i];
    const profile = profileMap.get(s.user_id);
    if (!profile?.notification_email) continue;
    try {
      await sendMMScoreUpdateEmail({
        to: profile.notification_email as string,
        displayName: profile.display_name || `@${profile.username}`,
        totalPoints: s.total_points ?? 0,
        sweetSixteenPts: s.sweet_sixteen_pts ?? 0,
        eliteEightPts: s.elite_eight_pts ?? 0,
        finalFourPts: s.final_four_pts ?? 0,
        championPts: s.champion_pts ?? 0,
        upsetPts: s.upset_pts ?? 0,
        correctUpsets: s.correct_upsets ?? 0,
        blowoutPts: s.blowout_pts ?? 0,
        correctBlowouts: s.correct_blowouts ?? 0,
        highScorerPts: s.high_scorer_pts ?? 0,
        correctHighScorers: s.correct_high_scorers ?? 0,
        rank: i + 1,
        totalPlayers,
      });
      sent++;
    } catch (e) {
      console.error("[mm-admin] score email failed for", s.user_id, e);
    }
  }
  console.log(`[mm-admin] Score update blast: sent to ${sent}/${totalPlayers}`);
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerMMAdminRoutes(app: Express): void {
  // Serve admin HTML page
  app.get("/admin/mm", (req: Request, res: Response) => {
    const token = req.query.token as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).send("<h1>401 — Invalid or missing admin token</h1><p>Append ?token=YOUR_TOKEN to the URL.</p>");
      return;
    }
    const htmlPath = path.resolve(process.cwd(), "server", "templates", "mm-admin.html");
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).send("Admin template not found");
    }
  });

  // Resolve a game result
  app.post("/admin/mm/api/resolve", async (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    const { round_id, matchup_id, winner_name, winner_seed, loser_name, loser_seed, winner_score, loser_score, was_upset } = req.body;
    if (!round_id || !matchup_id || !winner_name) {
      res.status(400).json({ ok: false, error: "round_id, matchup_id, winner_name are required" });
      return;
    }
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from("mm_game_results").upsert(
        {
          round_id,
          matchup_id,
          winner_name,
          winner_seed: winner_seed ?? null,
          loser_name: loser_name ?? null,
          loser_seed: loser_seed ?? null,
          winner_score: winner_score ?? null,
          loser_score: loser_score ?? null,
          was_upset: was_upset ?? false,
          resolved_at: new Date().toISOString(),
          resolved_by: "admin",
        },
        { onConflict: "round_id,matchup_id" },
      );
      if (error) {
        res.status(500).json({ ok: false, error: error.message });
        return;
      }
      res.json({ ok: true, message: `Result saved: ${winner_name} wins in ${round_id}` });
    } catch (err) {
      console.error("[mm-admin] resolve error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // Recompute all scores + auto-send score update emails
  app.post("/admin/mm/api/score", async (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const supabase = getSupabase();
      const { scored, error } = await computeAndSaveScores(supabase);
      if (error) {
        res.status(500).json({ ok: false, error });
        return;
      }
      // Respond immediately, then blast score emails in background
      res.json({ ok: true, message: `Scores recomputed for ${scored} user(s) — sending score update emails` });
      sendScoreUpdateBlast(supabase).catch((e) =>
        console.error("[mm-admin] score blast error:", e),
      );
    } catch (err) {
      console.error("[mm-admin] score error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // Get current game results
  app.get("/admin/mm/api/results", async (req: Request, res: Response) => {
    const token = req.query.token as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("mm_game_results")
        .select("*")
        .order("resolved_at", { ascending: false });
      if (error) {
        res.status(500).json({ ok: false, error: error.message });
        return;
      }
      res.json({ ok: true, results: data });
    } catch (err) {
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // Get current leaderboard snapshot
  app.get("/admin/mm/api/leaderboard", async (req: Request, res: Response) => {
    const token = req.query.token as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const supabase = getSupabase();
      const { data: scores } = await supabase
        .from("mm_pick_scores")
        .select("*")
        .order("total_points", { ascending: false })
        .limit(20);
      if (!scores?.length) {
        res.json({ ok: true, entries: [] });
        return;
      }
      const userIds = scores.map((s: { user_id: string }) => s.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", userIds);
      const profileMap = new Map(
        (profiles ?? []).map((p: { id: string; username: string; display_name: string | null }) => [p.id, p]),
      );
      const entries = scores.map((s: { user_id: string; total_points: number }) => ({
        ...s,
        username: profileMap.get(s.user_id)?.username ?? "?",
        display_name: profileMap.get(s.user_id)?.display_name ?? null,
      }));
      res.json({ ok: true, entries });
    } catch (err) {
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // Preview leaderboard blast email (no auth — just renders HTML)
  app.get("/admin/mm/email-preview/leaderboard-blast", (_req: Request, res: Response) => {
    const { buildLeaderboardBlastHtml } = require("./email");
    res.setHeader("Content-Type", "text/html");
    res.send(buildLeaderboardBlastHtml());
  });

  // Send leaderboard blast to all registered users
  app.post("/admin/mm/api/blast-leaderboard", async (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const { sendLeaderboardBlast } = await import("./email");
      const supabase = getSupabase();
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
      const eligible = (allProfiles ?? []).filter(
        (p: { notification_email?: string }) => p.notification_email,
      );
      let sent = 0;
      let failed = 0;
      for (const profile of eligible) {
        try {
          await sendLeaderboardBlast({
            to: profile.notification_email as string,
            displayName: profile.display_name || `@${profile.username}`,
          });
          sent++;
        } catch (e) {
          console.error("[mm-admin] blast failed for", profile.id, e);
          failed++;
        }
      }
      console.log(`[mm-admin] Leaderboard blast: sent=${sent} failed=${failed}`);
      res.json({ ok: true, message: `Blast sent to ${sent} user(s)${failed > 0 ? `, ${failed} failed` : ""}` });
    } catch (err) {
      console.error("[mm-admin] blast error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // Admin: send picks reminder email to users who haven't made locked takes
  app.post("/admin/mm/api/remind", async (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const { sendMMReminderEmail } = await import("./email");
      const supabase = getSupabase();
      // Use SECURITY DEFINER RPC to bypass RLS on profiles table
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: takes } = await supabase
        .from("mm_locked_takes")
        .select("user_id")
        .eq("is_submitted", true);
      const usersWithTakes = new Set((takes ?? []).map((t: { user_id: string }) => t.user_id));
      const eligible = (allProfiles ?? []).filter(
        (p: { id: string; notification_email?: string }) =>
          !usersWithTakes.has(p.id) && p.notification_email,
      );
      let sent = 0;
      for (const profile of eligible) {
        try {
          await sendMMReminderEmail({
            to: profile.notification_email as string,
            displayName: profile.display_name || `@${profile.username}`,
          });
          sent++;
        } catch (e) {
          console.error("[mm-admin] reminder email failed for", profile.id, e);
        }
      }
      res.json({ ok: true, message: `Reminders sent to ${sent} user(s)` });
    } catch (err) {
      console.error("[mm-admin] remind error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });
}
