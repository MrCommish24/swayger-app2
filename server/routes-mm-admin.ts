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

// ─── Scoring computation ─────────────────────────────────────────────────────

async function computeAndSaveScores(
  supabase: ReturnType<typeof createClient>,
): Promise<{ scored: number; error: string | null }> {
  const { data: results, error: resultsErr } = await supabase
    .from("mm_game_results")
    .select("*");
  if (resultsErr) return { scored: 0, error: resultsErr.message };

  // Build winners by round
  const winnersByRound: Record<string, Set<string>> = {};
  for (const r of results ?? []) {
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
    }
  > = {};

  // Score locked takes
  const { data: takes } = await supabase
    .from("mm_locked_takes")
    .select("*")
    .eq("is_submitted", true);

  for (const take of takes ?? []) {
    if (!scores[take.user_id]) {
      scores[take.user_id] = {
        sweet_sixteen: 0,
        elite_eight: 0,
        final_four: 0,
        champion: 0,
        upset: 0,
        correct_upsets: 0,
      };
    }
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

  // Score upset picks
  const { data: upsetPicks } = await supabase
    .from("mm_upset_picks")
    .select("*")
    .eq("is_submitted", true);

  for (const pick of upsetPicks ?? []) {
    if (!scores[pick.user_id]) {
      scores[pick.user_id] = {
        sweet_sixteen: 0,
        elite_eight: 0,
        final_four: 0,
        champion: 0,
        upset: 0,
        correct_upsets: 0,
      };
    }
    const resultForGame = (results ?? []).find(
      (r) => r.round_id === pick.round_id && r.matchup_id === pick.matchup_id,
    );
    if (resultForGame && resultForGame.winner_name === pick.upset_team) {
      scores[pick.user_id].upset += UPSET_POINTS;
      scores[pick.user_id].correct_upsets += 1;
    }
  }

  const upserts = Object.entries(scores).map(([userId, p]) => ({
    user_id: userId,
    total_points: p.sweet_sixteen + p.elite_eight + p.final_four + p.champion + p.upset,
    sweet_sixteen_pts: p.sweet_sixteen,
    elite_eight_pts: p.elite_eight,
    final_four_pts: p.final_four,
    champion_pts: p.champion,
    upset_pts: p.upset,
    correct_upsets: p.correct_upsets,
    updated_at: new Date().toISOString(),
  }));

  if (upserts.length > 0) {
    const { error: upsertErr } = await supabase
      .from("mm_pick_scores")
      .upsert(upserts, { onConflict: "user_id" });
    if (upsertErr) return { scored: 0, error: upsertErr.message };
  }

  return { scored: upserts.length, error: null };
}

// ─── Score update email blast ─────────────────────────────────────────────────

export async function sendScoreUpdateBlast(
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const { sendMMScoreUpdateEmail } = await import("./email");

  // Get all scores ordered by total (to compute rank)
  const { data: allScores } = await supabase
    .from("mm_pick_scores")
    .select("*")
    .order("total_points", { ascending: false });

  if (!allScores?.length) return;

  const totalPlayers = allScores.length;
  const userIds = allScores.map((s: { user_id: string }) => s.user_id);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, notification_email")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; notification_email?: string | null; display_name?: string | null; username: string }) => [p.id, p]),
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
    const htmlPath = path.join(__dirname, "templates", "mm-admin.html");
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
      // Find users who have no mm_locked_takes at all
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, notification_email");
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
