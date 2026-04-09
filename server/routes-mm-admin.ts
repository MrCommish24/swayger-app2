import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import {
  buildLeaderboardBlastHtml,
  buildLastChanceBlastHtml,
  buildSecondShotEmailHtml,
  buildR32WrapupEmailHtml,
  buildMMR32PicksEmailHtml,
  buildS16TipoffAlertEmailHtml,
  buildS16LaunchEmailHtml,
  buildOutreachAEmailPreview,
  buildOutreachBEmailPreview,
  buildThankyouEmailPreview,
} from "./email";

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

// Map take_type to the round_id that determines which teams advanced.
// A team reaches a round by WINNING the previous round:
//   Sweet 16  → must win Round of 32  (R64 win only means R32, not S16)
//   Elite 8   → must win Sweet 16
//   Final Four→ must win Elite 8
//   Champion  → must win Championship
const TAKE_ROUND_MAP: Record<string, string> = {
  sweet_sixteen: "round-32",    // won in R32 → reached Sweet 16
  elite_eight:   "sweet-16",    // won in S16 → reached Elite 8
  final_four:    "elite-8",     // won in E8  → reached Final Four
  champion:      "championship", // won the championship
};

const UPSET_POINTS = 3;
const BLOWOUT_POINTS = 3;
const HIGH_SCORER_POINTS = 3;

// Set to true to pause automated score-update emails until scoring is verified.
export const SCORE_EMAILS_PAUSED = true;

// Set to true to pause all bulk blast emails (S16 launch, R32 picks, leaderboard,
// reminders). Transactional wager notification emails are NOT affected.
export const BLAST_EMAILS_PAUSED = true;

// ─── Scoring computation ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeAndSaveScores(
  supabase: any,
): Promise<{ scored: number; error: string | null }> {
  type GameResultRow = { round_id: string; matchup_id: string; winner_name: string | null; winner_score: number | null; loser_score: number | null };
  type LockedTakeRow = { user_id: string; take_type: string; teams: string[] | null; is_submitted: boolean; is_second_chance: boolean };
  type SpecialPickRow = { user_id: string; round_id: string; pick_type: string; matchup_id: string; picked_team: string | null; points_multiplier: number | null };
  type RankedMatchupRow = { round_id: string; pick_type: string; matchup_id: string };

  const { data: resultsRaw, error: resultsErr } = await supabase
    .from("mm_game_results")
    .select("*");
  if (resultsErr) return { scored: 0, error: resultsErr.message };
  const results = (resultsRaw ?? []) as GameResultRow[];

  // Map full mascot names → FULL_BRACKET short names used in mm_locked_takes.teams
  // Both formats must be in the set so either way a user's pick resolves correctly.
  const TEAM_NAME_MAP: Record<string, string[]> = {
    "Duke Blue Devils":        ["Duke"],
    "UConn Huskies":           ["UConn"],
    "Michigan St Spartans":    ["Michigan St.", "Michigan State"],
    "Michigan St. Spartans":   ["Michigan St.", "Michigan State"],
    "Michigan State Spartans": ["Michigan St.", "Michigan State"],
    "St. John's Red Storm":    ["St. John's"],
    "Iowa Hawkeyes":           ["Iowa"],
    "Iowa State Cyclones":     ["Iowa State", "Iowa St."],
    "Iowa St. Cyclones":       ["Iowa State", "Iowa St."],
    "Arizona Wildcats":        ["Arizona"],
    "Alabama Crimson Tide":    ["Alabama"],
    "Purdue Boilermakers":     ["Purdue"],
    "Arkansas Razorbacks":     ["Arkansas"],
    "Nebraska Cornhuskers":    ["Nebraska"],
    "Illinois Fighting Illini": ["Illinois"],
    "Texas Longhorns":         ["Texas"],
    "Houston Cougars":         ["Houston"],
    "Michigan Wolverines":     ["Michigan"],
    "Tennessee Volunteers":    ["Tennessee"],
    "Florida Gators":          ["Florida"],
    "Kansas Jayhawks":         ["Kansas"],
    "Virginia Cavaliers":      ["Virginia"],
    "UCLA Bruins":             ["UCLA"],
    "TCU Horned Frogs":        ["TCU"],
    "Louisville Cardinals":    ["Louisville"],
    "VCU Rams":                ["VCU"],
    "Gonzaga Bulldogs":        ["Gonzaga"],
    "Utah State Aggies":       ["Utah State"],
    "Texas Tech Red Raiders":  ["Texas Tech"],
    "Vanderbilt Commodores":   ["Vanderbilt"],
    "High Point Panthers":     ["High Point"],
    "Miami Hurricanes":        ["Miami (FL)", "Miami FL"],
    "Miami (FL) Hurricanes":   ["Miami (FL)", "Miami FL"],
    "Saint Louis Billikens":   ["Saint Louis"],
    "Kentucky Wildcats":       ["Kentucky"],
    "Texas A&M Aggies":        ["Texas A&M"],
    "North Carolina Tar Heels": ["North Carolina", "UNC"],
    "Ohio State Buckeyes":     ["Ohio St."],
    "Ohio St. Buckeyes":       ["Ohio St."],
    "Oklahoma State Cowboys":  ["Oklahoma St."],
    "Wisconsin Badgers":       ["Wisconsin"],
    "Dayton Flyers":           ["Dayton"],
    "Nevada Wolf Pack":        ["Nevada"],
    "Minnesota Golden Gophers": ["Minnesota"],
    "Creighton Bluejays":      ["Creighton"],
    "Baylor Bears":            ["Baylor"],
  };

  // Build winners by round — add both the raw name AND all bracket-format aliases
  const winnersByRound: Record<string, Set<string>> = {};
  for (const r of results) {
    if (!winnersByRound[r.round_id]) winnersByRound[r.round_id] = new Set();
    if (!r.winner_name) continue;
    winnersByRound[r.round_id].add(r.winner_name);
    const aliases = TEAM_NAME_MAP[r.winner_name] ?? [];
    for (const alias of aliases) winnersByRound[r.round_id].add(alias);
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
      is_second_chance: boolean;
    }
  > = {};

  function emptyScore() {
    return {
      sweet_sixteen: 0, elite_eight: 0, final_four: 0, champion: 0,
      upset: 0, correct_upsets: 0,
      blowout: 0, correct_blowouts: 0,
      high_scorer: 0, correct_high_scorers: 0,
      is_second_chance: false,
    };
  }

  // Score locked takes — direct select is blocked by RLS (anon key has no JWT).
  // Use the SECURITY DEFINER RPC to read all submitted takes regardless of auth context.
  const { data: takesRaw } = await supabase.rpc("get_all_mm_locked_takes");
  const takes = (takesRaw ?? []) as LockedTakeRow[];

  for (const take of takes) {
    if (!scores[take.user_id]) scores[take.user_id] = emptyScore();
    const roundId = TAKE_ROUND_MAP[take.take_type];
    const advancedTeams = winnersByRound[roundId];
    if (!advancedTeams || advancedTeams.size === 0) continue;

    const mult = take.is_second_chance ? 0.5 : 1;
    if (take.is_second_chance) scores[take.user_id].is_second_chance = true;
    const ptsEach = (TAKE_POINTS[take.take_type] ?? 0) * mult;
    for (const team of take.teams ?? []) {
      if (advancedTeams.has(team)) {
        scores[take.user_id][take.take_type as keyof typeof scores[string]] += ptsEach;
      }
    }
  }

  // Score special picks (upset / blowout / high_scorer) from mm_special_picks
  // NOTE: Direct table select is blocked by RLS (anon key has no JWT).
  // Use the SECURITY DEFINER RPC to read all picks regardless of auth context.
  const { data: specialPicksRaw } = await supabase.rpc("get_all_mm_special_picks");
  const specialPicks = (specialPicksRaw ?? []) as SpecialPickRow[];

  // Fetch users with 2X boosts via SECURITY DEFINER RPC (bypasses profiles RLS).
  // Direct anon-key queries on profiles are blocked by RLS, so we use this RPC.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: referralProfilesRaw, error: boostErr } = await supabase.rpc("get_mm_boost_users");
  if (boostErr) console.warn("[score] get_mm_boost_users error:", boostErr.message);
  const referralRewardMap = new Map<string, string>(
    ((referralProfilesRaw ?? []) as any[])  // eslint-disable-line @typescript-eslint/no-explicit-any
      .filter((p) => p.referral_reward_round != null)
      .map((p) => [p.id as string, p.referral_reward_round as string])
  );
  const paidBoostMap = new Map<string, string>(
    ((referralProfilesRaw ?? []) as any[])  // eslint-disable-line @typescript-eslint/no-explicit-any
      .filter((p) => p.paid_2x_round != null)
      .map((p) => [p.id as string, p.paid_2x_round as string])
  );
  console.log(`[score] boost users: ${referralProfilesRaw?.length ?? 0} found (referral=${referralRewardMap.size}, paid=${paidBoostMap.size})`);

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

    const baseMult = pick.points_multiplier ?? 1;
    if (baseMult < 1) scores[pick.user_id].is_second_chance = true;
    // Apply 2X bonus — earned by referral OR purchased — capped so it never stacks beyond 2X total
    const hasBoost = referralRewardMap.get(pick.user_id) === pick.round_id
                  || paidBoostMap.get(pick.user_id) === pick.round_id;
    const mult = hasBoost ? Math.min(baseMult * 2, 2) : baseMult;

    if (pick.pick_type === "upset") {
      // Scope to the presented pool when pool data is available.
      // If the pool is empty (table not yet populated), fall back to natural
      // scoping — the user's pick already carries the matchup_id from the UI.
      const pool = candidateMap[`${pick.round_id}:upset`];
      if (pool && pool.size > 0 && !pool.has(pick.matchup_id)) continue;

      const resultForGame = results.find(
        (r) => r.round_id === pick.round_id && r.matchup_id === pick.matchup_id,
      );
      if (resultForGame && resultForGame.winner_name === pick.picked_team) {
        scores[pick.user_id].upset += UPSET_POINTS * mult;
        scores[pick.user_id].correct_upsets += 1;
      }
    } else if (pick.pick_type === "blowout") {
      const winningMatchup = biggestBlowout[pick.round_id];
      if (winningMatchup && pick.matchup_id === winningMatchup) {
        scores[pick.user_id].blowout += BLOWOUT_POINTS * mult;
        scores[pick.user_id].correct_blowouts += 1;
      }
    } else if (pick.pick_type === "high_scorer") {
      const winningMatchup = highestScorer[pick.round_id];
      if (winningMatchup && pick.matchup_id === winningMatchup) {
        scores[pick.user_id].high_scorer += HIGH_SCORER_POINTS * mult;
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
    is_second_chance: p.is_second_chance,
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

  type ProfileRow = { id: string; notification_email?: string | null; display_name?: string | null; username: string; email_unsubscribed?: boolean };
  const profileMap = new Map<string, ProfileRow>(
    ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]),
  );

  let sent = 0;
  for (let i = 0; i < allScores.length; i++) {
    const s = allScores[i];
    const profile = profileMap.get(s.user_id);
    if (!profile?.notification_email || profile.email_unsubscribed) continue;
    try {
      await sendMMScoreUpdateEmail({
        to: profile.notification_email as string,
        displayName: profile.display_name || profile.username,
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

// ─── R32 Wrapup Blast — personalized score + Sweet 16 push ───────────────────

export async function sendR32WrapupBlast(supabase: any): Promise<void> {
  const { sendR32WrapupEmail } = await import("./email");

  type PickScoreRow = {
    user_id: string;
    total_points: number | null;
    upset_pts: number | null;
    correct_upsets: number | null;
    blowout_pts: number | null;
    correct_blowouts: number | null;
    high_scorer_pts: number | null;
    correct_high_scorers: number | null;
  };

  const { data: allScoresRaw } = await supabase
    .from("mm_pick_scores")
    .select("user_id,total_points,upset_pts,correct_upsets,blowout_pts,correct_blowouts,high_scorer_pts,correct_high_scorers")
    .order("total_points", { ascending: false });
  const allScores = (allScoresRaw ?? []) as PickScoreRow[];
  if (!allScores.length) return;

  const totalPlayers = allScores.length;
  const { data: profiles } = await supabase.rpc("get_all_notification_profiles");
  type ProfileRow = { id: string; notification_email?: string | null; display_name?: string | null; username: string; email_unsubscribed?: boolean };
  const profileMap = new Map<string, ProfileRow>(
    ((profiles ?? []) as ProfileRow[]).map((p: ProfileRow) => [p.id, p]),
  );

  let sent = 0;
  for (let i = 0; i < allScores.length; i++) {
    const s = allScores[i];
    const profile = profileMap.get(s.user_id);
    if (!profile?.notification_email || profile.email_unsubscribed) continue;
    try {
      await sendR32WrapupEmail({
        to: profile.notification_email as string,
        displayName: profile.display_name || profile.username,
        totalPoints: s.total_points ?? 0,
        upsetPts: s.upset_pts ?? 0,
        correctUpsets: s.correct_upsets ?? 0,
        blowoutPts: s.blowout_pts ?? 0,
        correctBlowouts: s.correct_blowouts ?? 0,
        highScorerPts: s.high_scorer_pts ?? 0,
        correctHighScorers: s.correct_high_scorers ?? 0,
        rank: i + 1,
        totalPlayers,
        userId: profile.id,
      });
      sent++;
    } catch (e) {
      console.error("[mm-admin] R32 wrapup email failed for", s.user_id, e);
    }
  }
  console.log(`[mm-admin] R32 wrapup blast: sent to ${sent}/${totalPlayers}`);
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
      // Score computation only — NO automatic email blast.
      // Use POST /admin/mm/api/score-and-email to intentionally send a score update email.
      res.json({ ok: true, message: `Scores recomputed for ${scored} user(s). Use /score-and-email to send the blast.` });
    } catch (err) {
      console.error("[mm-admin] score error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // Score + intentional email blast — only call this when you want emails to go out.
  // Guarded by SCORE_EMAILS_PAUSED. Unlike /score, this is the explicit "send the blast" action.
  app.post("/admin/mm/api/score-and-email", async (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (SCORE_EMAILS_PAUSED) {
      res.status(403).json({ ok: false, error: "Score emails are paused (SCORE_EMAILS_PAUSED=true). Flip the flag and restart before calling this endpoint." });
      return;
    }
    try {
      const supabase = getSupabase();
      const { scored, error } = await computeAndSaveScores(supabase);
      if (error) {
        res.status(500).json({ ok: false, error });
        return;
      }
      res.json({ ok: true, message: `Scores recomputed for ${scored} user(s) — sending score update emails now` });
      sendScoreUpdateBlast(supabase).catch((e) =>
        console.error("[mm-admin] score-and-email blast error:", e),
      );
    } catch (err) {
      console.error("[mm-admin] score-and-email error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // Debug: show special picks vs results matching for a username
  app.get("/admin/mm/api/debug-picks", async (req: Request, res: Response) => {
    const token = req.query.token as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const supabase = getSupabase();
      const usernameFilter = req.query.username as string | undefined;

      // Get all special picks via SECURITY DEFINER RPC (RLS blocks direct select)
      const { data: allPicks } = await supabase.rpc("get_all_mm_special_picks");

      const { data: allResults } = await supabase
        .from("mm_game_results")
        .select("round_id, matchup_id, winner_name, loser_name, was_upset");

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username");

      const profileMap = new Map((profiles ?? []).map((p: { id: string; username: string }) => [p.id, p.username]));
      const resultMap = new Map((allResults ?? []).map((r: { round_id: string; matchup_id: string; winner_name: string; loser_name: string; was_upset: boolean }) =>
        [`${r.round_id}:${r.matchup_id}`, r]
      ));

      const picks = (allPicks ?? []).filter((p: { user_id: string }) => {
        if (!usernameFilter) return true;
        const uname = profileMap.get(p.user_id);
        return uname?.toLowerCase().includes(usernameFilter.toLowerCase());
      });

      const debug = picks.map((p: { user_id: string; round_id: string; pick_type: string; matchup_id: string; picked_team: string | null }) => {
        const key = `${p.round_id}:${p.matchup_id}`;
        const result = resultMap.get(key);
        let scored = false;
        let reason = "";
        if (!result) {
          reason = `NO result found for matchup_id=${p.matchup_id} round=${p.round_id}`;
        } else if (p.pick_type === "upset") {
          scored = result.winner_name === p.picked_team;
          reason = scored ? "MATCH" : `winner="${result.winner_name}" != picked="${p.picked_team}"`;
        } else {
          reason = "blowout/hs: scored based on best-in-round";
          scored = false; // can't tell here without full round analysis
        }
        return {
          username: profileMap.get(p.user_id) ?? p.user_id.slice(0, 8),
          pick_type: p.pick_type,
          round_id: p.round_id,
          matchup_id: p.matchup_id,
          picked_team: p.picked_team,
          result_winner: result?.winner_name ?? null,
          result_loser: result?.loser_name ?? null,
          was_upset: result?.was_upset ?? null,
          scored,
          reason,
        };
      });

      res.json({ ok: true, total_picks: picks.length, debug });
    } catch (err) {
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
      // Use SECURITY DEFINER RPC to bypass profiles RLS (anon key can't SELECT profiles)
      const { data: profiles } = await supabase.rpc("get_mm_profile_data", { user_ids: userIds });
      const profileMap = new Map(
        ((profiles ?? []) as Array<{ id: string; username: string; display_name: string | null }>)
          .map((p) => [p.id, p]),
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
    res.setHeader("Content-Type", "text/html");
    res.send(buildLeaderboardBlastHtml());
  });

  // Preview last-chance blast email
  app.get("/admin/mm/email-preview/last-chance", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html");
    res.send(buildLastChanceBlastHtml());
  });

  // Preview second-shot email
  app.get("/admin/mm/email-preview/second-shot", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html");
    res.send(buildSecondShotEmailHtml("Swayger User"));
  });

  // Preview R32 wrapup email (personalized score + Sweet 16 push)
  app.get("/admin/mm/email-preview/r32-wrapup", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html");
    res.send(buildR32WrapupEmailHtml({
      displayName: "Swayger User",
      totalPoints: 9,
      upsetPts: 6, correctUpsets: 2,
      blowoutPts: 0, correctBlowouts: 0,
      highScorerPts: 3, correctHighScorers: 1,
      rank: 1, totalPlayers: 17,
    }));
  });

  // Preview R32 quick picks launch email
  app.get("/admin/mm/email-preview/r32-picks", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html");
    res.send(buildMMR32PicksEmailHtml("Swayger User"));
  });

  // Preview S16 tipoff alert email (1-hour warning)
  app.get("/admin/mm/email-preview/s16-tipoff", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html");
    res.send(buildS16TipoffAlertEmailHtml("Swayger User"));
  });

  // Preview S16 launch email — variant A (has locked takes)
  app.get("/admin/mm/email-preview/s16-launch-a", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html");
    res.send(buildS16LaunchEmailHtml("Swayger User", true));
  });

  // Preview S16 launch email — variant B (no locked takes / second chance)
  app.get("/admin/mm/email-preview/s16-launch-b", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html");
    res.send(buildS16LaunchEmailHtml("Swayger User", false));
  });

  // Blast S16 launch email to all users (manual trigger only)
  // Users with locked takes → Variant A; users without → Variant B (includes second-chance section)
  app.post("/admin/mm/api/blast-s16-launch", async (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart before calling this endpoint." });
      return;
    }
    try {
      const { sendS16LaunchEmail } = await import("./email");
      const supabase = getSupabase();

      // Get all profiles with notification emails
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
      const eligible = (allProfiles ?? []).filter(
        (p: { notification_email?: string; email_unsubscribed?: boolean }) =>
          p.notification_email && !p.email_unsubscribed,
      );

      // Get set of user IDs who have submitted locked takes (for variant routing)
      const { data: lockedTakesRows } = await supabase
        .from("mm_locked_takes")
        .select("user_id")
        .eq("is_submitted", true)
        .eq("is_second_chance", false);
      const usersWithLockedTakes = new Set(
        (lockedTakesRows ?? []).map((r: { user_id: string }) => r.user_id),
      );

      let sentA = 0;
      let sentB = 0;
      let failed = 0;

      for (const profile of eligible) {
        try {
          const hasLockedTakes = usersWithLockedTakes.has(profile.id);
          await sendS16LaunchEmail({
            to: profile.notification_email as string,
            displayName: profile.display_name || profile.username,
            hasLockedTakes,
            userId: profile.id,
          });
          if (hasLockedTakes) sentA++;
          else sentB++;
        } catch (e) {
          console.error("[mm-admin] s16-launch blast failed for", profile.id, e);
          failed++;
        }
      }

      console.log(`[mm-admin] S16 launch blast: variantA=${sentA} variantB=${sentB} failed=${failed}`);
      res.json({
        ok: true,
        message: `S16 launch blast sent: ${sentA} variant A (has picks), ${sentB} variant B (second chance)${failed > 0 ? `, ${failed} failed` : ""}`,
        sentA,
        sentB,
        failed,
      });
    } catch (err) {
      console.error("[mm-admin] s16-launch blast error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // Blast R32 quick picks open email to all users
  app.post("/admin/mm/api/blast-r32-picks", async (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart before calling this endpoint." });
      return;
    }
    try {
      const { sendMMR32PicksEmail } = await import("./email");
      const supabase = getSupabase();
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
      const eligible = (allProfiles ?? []).filter(
        (p: { notification_email?: string; email_unsubscribed?: boolean }) =>
          p.notification_email && !p.email_unsubscribed,
      );
      let sent = 0;
      let failed = 0;
      for (const profile of eligible) {
        try {
          await sendMMR32PicksEmail({
            to: profile.notification_email as string,
            displayName: profile.display_name || profile.username,
            userId: profile.id,
          });
          sent++;
        } catch (e) {
          console.error("[mm-admin] r32-picks blast failed for", profile.id, e);
          failed++;
        }
      }
      console.log(`[mm-admin] R32 picks blast: sent=${sent} failed=${failed}`);
      res.json({ ok: true, message: `R32 picks blast sent to ${sent} user(s)${failed > 0 ? `, ${failed} failed` : ""}` });
    } catch (err) {
      console.error("[mm-admin] r32-picks blast error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // Send S16 tipoff alert to all users except excluded usernames
  app.post("/admin/mm/api/blast-s16-tipoff", async (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res.status(403).json({ ok: false, error: "Blast emails are paused." });
      return;
    }
    const excludeUsernames: string[] = (req.body?.exclude_usernames ?? []).map((u: string) => u.toLowerCase());
    try {
      const { sendS16TipoffAlertEmail } = await import("./email");
      const supabase = getSupabase();
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
      const eligible = (allProfiles ?? []).filter(
        (p: { notification_email?: string; username?: string; email_unsubscribed?: boolean }) =>
          p.notification_email &&
          !p.email_unsubscribed &&
          !excludeUsernames.includes((p.username ?? "").toLowerCase()),
      );
      let sent = 0;
      let failed = 0;
      for (const profile of eligible) {
        try {
          await sendS16TipoffAlertEmail({
            to: profile.notification_email as string,
            displayName: profile.display_name || profile.username,
            userId: profile.id,
          });
          sent++;
        } catch (e) {
          console.error("[mm-admin] s16-tipoff blast failed for", profile.id, e);
          failed++;
        }
      }
      console.log(`[mm-admin] S16 tipoff blast: sent=${sent} failed=${failed}`);
      res.json({ ok: true, message: `S16 tipoff alert sent to ${sent} user(s)${failed > 0 ? `, ${failed} failed` : ""}`, sent, failed });
    } catch (err) {
      console.error("[mm-admin] s16-tipoff blast error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // Send leaderboard blast to all registered users
  app.post("/admin/mm/api/blast-leaderboard", async (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart before calling this endpoint." });
      return;
    }
    try {
      const { sendLeaderboardBlast } = await import("./email");
      const supabase = getSupabase();
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
      const eligible = (allProfiles ?? []).filter(
        (p: { notification_email?: string; email_unsubscribed?: boolean }) =>
          p.notification_email && !p.email_unsubscribed,
      );
      let sent = 0;
      let failed = 0;
      for (const profile of eligible) {
        try {
          await sendLeaderboardBlast({
            to: profile.notification_email as string,
            displayName: profile.display_name || profile.username,
            userId: profile.id,
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
    if (BLAST_EMAILS_PAUSED) {
      res.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart before calling this endpoint." });
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
            displayName: profile.display_name || profile.username,
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

  // Manual game result insertion (for when Odds API quota runs out)
  // Body: { round_id, matchup_id, winner_name, winner_seed, loser_name, loser_seed, winner_score?, loser_score?, was_upset }
  app.get("/admin/mm/api/debug-locked-takes", async (req: Request, res: Response) => {
    const token = req.query.token as string | undefined;
    if (!isAdminToken(token)) { res.status(401).json({ ok: false, error: "Unauthorized" }); return; }
    const supabase = getSupabase();
    const { data: rpcData, error: rpcErr } = await supabase.rpc("get_all_mm_locked_takes");
    const { data: directData, error: directErr } = await supabase.from("mm_locked_takes").select("user_id, take_type, teams, is_submitted").eq("is_submitted", true).limit(5);
    res.json({ ok: true, rpcCount: (rpcData??[]).length, rpcError: rpcErr?.message??null, rpcSample: (rpcData??[]).slice(0,3), directCount: (directData??[]).length, directError: directErr?.message??null });
  });

  app.post("/admin/mm/api/delete-result", async (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const { id } = req.body;
      if (!id) {
        res.status(400).json({ ok: false, error: "Missing required field: id" });
        return;
      }
      const supabase = getSupabase();
      const { error } = await supabase.from("mm_game_results").delete().eq("id", id);
      if (error) {
        res.status(500).json({ ok: false, error: error.message });
        return;
      }
      console.log(`[mm-admin] Result deleted: id=${id}`);
      res.json({ ok: true, message: `Result ${id} deleted` });
    } catch (err) {
      console.error("[mm-admin] delete-result error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  app.post("/admin/mm/api/insert-result", async (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const {
        round_id, matchup_id, winner_name, winner_seed,
        loser_name, loser_seed, winner_score, loser_score, was_upset,
      } = req.body;
      if (!round_id || !matchup_id || !winner_name || !loser_name) {
        res.status(400).json({ ok: false, error: "Missing required fields: round_id, matchup_id, winner_name, loser_name" });
        return;
      }
      const supabase = getSupabase();
      const { error } = await supabase.from("mm_game_results").upsert({
        round_id,
        matchup_id,
        winner_name,
        winner_seed: winner_seed ?? null,
        loser_name,
        loser_seed: loser_seed ?? null,
        winner_score: winner_score ?? null,
        loser_score: loser_score ?? null,
        was_upset: was_upset ?? false,
        resolved_at: new Date().toISOString(),
      }, { onConflict: "round_id,matchup_id" });
      if (error) {
        res.status(500).json({ ok: false, error: error.message });
        return;
      }
      console.log(`[mm-admin] Manual result inserted: ${round_id} / ${matchup_id} — ${winner_name} def. ${loser_name}`);
      res.json({ ok: true, message: `Result recorded: ${winner_name} def. ${loser_name}` });
    } catch (err) {
      console.error("[mm-admin] insert-result error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // ── Thank-you blast preview ───────────────────────────────────────────────
  app.get("/admin/mm/email-preview/thankyou", (req: Request, res: Response) => {
    const token = req.query.token as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).send("Unauthorized");
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.send(buildThankyouEmailPreview());
  });

  // ── Dry-run: preview who would receive the thank-you blast and with what name ─
  app.get("/admin/mm/api/blast-thankyou/dry-run", async (req: Request, res: Response) => {
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
        .order("total_points", { ascending: false });

      if (!scores?.length) {
        res.json({ ok: true, recipients: [], note: "No scores found" });
        return;
      }

      const userIds = scores.map((s: { user_id: string }) => s.user_id);
      const { data: profileData } = await supabase.rpc("get_mm_profile_data", { user_ids: userIds });
      const nameMap = new Map(
        ((profileData ?? []) as Array<{ id: string; username: string; display_name: string | null }>)
          .map((p) => [p.id, p]),
      );
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const emailMap = new Map(
        ((emailProfiles ?? []) as Array<{ id: string; notification_email: string; email_unsubscribed: boolean }>)
          .map((p) => [p.id, p]),
      );

      const recipients = scores.map((s: { user_id: string; total_points: number }, i: number) => {
        const names = nameMap.get(s.user_id);
        const emailInfo = emailMap.get(s.user_id);
        const resolvedName = names?.display_name || names?.username || "?";
        return {
          rank: i + 1,
          user_id: s.user_id,
          username: names?.username ?? "?",
          display_name: names?.display_name ?? null,
          resolved_name: resolvedName,
          total_points: s.total_points,
          email: emailInfo?.notification_email ?? null,
          email_unsubscribed: emailInfo?.email_unsubscribed ?? false,
          would_receive: !!(emailInfo?.notification_email && !emailInfo?.email_unsubscribed),
        };
      });

      const willSend = recipients.filter((r: { would_receive: boolean }) => r.would_receive).length;
      res.json({ ok: true, total_scored: scores.length, will_send: willSend, recipients });
    } catch (err) {
      console.error("[mm-admin] dry-run error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // ── Send thank-you blast to all participants ──────────────────────────────
  app.post("/admin/mm/api/blast-thankyou", async (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart before calling this endpoint." });
      return;
    }
    try {
      const { sendThankyouEmail } = await import("./email");
      const supabase = getSupabase();

      // Fetch ranked scores
      const { data: scores } = await supabase
        .from("mm_pick_scores")
        .select("*")
        .order("total_points", { ascending: false });

      if (!scores?.length) {
        res.status(400).json({ ok: false, error: "No scores found — run scoring first" });
        return;
      }

      const totalPlayers = scores.length;
      const userIds = scores.map((s: { user_id: string }) => s.user_id);

      // get_mm_profile_data: gives username + display_name for all scored users
      const { data: profileData } = await supabase.rpc("get_mm_profile_data", { user_ids: userIds });
      const nameMap = new Map(
        ((profileData ?? []) as Array<{ id: string; username: string; display_name: string | null }>)
          .map((p) => [p.id, p]),
      );

      // get_all_notification_profiles: gives email + unsubscribed status (only users who have set an email)
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const emailMap = new Map(
        ((emailProfiles ?? []) as Array<{ id: string; notification_email: string; email_unsubscribed: boolean }>)
          .map((p) => [p.id, p]),
      );

      // Merge for profileMap (used for both leaderboard names and email routing)
      const profileMap = new Map(
        userIds.map((uid: string) => {
          const names = nameMap.get(uid) ?? { id: uid, username: "?", display_name: null };
          const emailInfo = emailMap.get(uid) ?? { notification_email: null, email_unsubscribed: true };
          return [uid, { ...names, ...emailInfo }];
        }),
      );

      // Build typed leaderboard for the email template
      const leaderboard = scores.map((s: { user_id: string; total_points: number }, i: number) => {
        const p = profileMap.get(s.user_id);
        return {
          rank: i + 1,
          username: p?.username ?? "?",
          displayName: p?.display_name ?? null,
          totalPoints: s.total_points,
        };
      });

      let sent = 0;
      let skipped = 0;
      let failed = 0;

      for (let i = 0; i < scores.length; i++) {
        const score = scores[i] as { user_id: string; total_points: number };
        const profile = profileMap.get(score.user_id);
        if (!profile?.notification_email || profile.email_unsubscribed) {
          skipped++;
          continue;
        }
        try {
          await sendThankyouEmail({
            to: profile.notification_email,
            displayName: profile.display_name || profile.username,
            rank: i + 1,
            totalPoints: score.total_points,
            totalPlayers,
            leaderboard,
            userId: score.user_id,
          });
          sent++;
        } catch (e) {
          console.error("[mm-admin] thankyou blast failed for", score.user_id, e);
          failed++;
        }
      }

      console.log(`[mm-admin] Thank-you blast: sent=${sent} skipped=${skipped} failed=${failed}`);
      res.json({ ok: true, message: `Thank-you blast sent to ${sent} user(s)${skipped > 0 ? `, ${skipped} skipped (no email/unsubscribed)` : ""}${failed > 0 ? `, ${failed} failed` : ""}` });
    } catch (err) {
      console.error("[mm-admin] thankyou blast error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // ── Read feedback submissions (admin-only) ────────────────────────────────
  app.get("/admin/mm/api/feedback", async (req: Request, res: Response) => {
    const token = req.query.token as string | undefined;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      res.json({
        ok: true,
        note: "Feedback is INSERT-only via anon key (RLS blocks SELECT). Read responses at: https://supabase.com/dashboard → Table Editor → mm_feedback",
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL USER OUTREACH — two segments (no_swayger, swayger_no_mm)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Serve feedback pages ──────────────────────────────────────────────────
  app.get("/outreach-feedback-a", (_req: Request, res: Response) => {
    const html = fs.readFileSync(path.join(process.cwd(), "server", "templates", "outreach-feedback-a.html"), "utf-8");
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });

  app.get("/outreach-feedback-b", (_req: Request, res: Response) => {
    const html = fs.readFileSync(path.join(process.cwd(), "server", "templates", "outreach-feedback-b.html"), "utf-8");
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });

  // ── Save outreach feedback ────────────────────────────────────────────────
  app.post("/api/outreach/feedback", async (req: Request, res: Response) => {
    try {
      const { user_id, segment, q1, q2, q3, q4, open_text } = req.body ?? {};
      if (!segment || !["no_swayger", "swayger_no_mm"].includes(segment)) {
        res.status(400).json({ ok: false, error: "Invalid segment" });
        return;
      }
      const supabase = getSupabase();
      const { error } = await supabase.from("outreach_feedback").insert({
        user_id: user_id ?? null,
        segment,
        q1: q1 ?? null,
        q2: q2 ?? null,
        q3: q3 ?? null,
        q4: q4 ?? null,
        open_text: open_text ?? null,
      });
      if (error) {
        console.error("[outreach] feedback insert error:", error);
        res.status(500).json({ ok: false, error: "Failed to save" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[outreach] feedback error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // ── Email previews ────────────────────────────────────────────────────────
  app.get("/admin/mm/email-preview/outreach-a", (req: Request, res: Response) => {
    const token = req.query.token as string | undefined;
    if (!isAdminToken(token)) { res.status(401).send("Unauthorized"); return; }
    res.setHeader("Content-Type", "text/html");
    res.send(buildOutreachAEmailPreview());
  });

  app.get("/admin/mm/email-preview/outreach-b", (req: Request, res: Response) => {
    const token = req.query.token as string | undefined;
    if (!isAdminToken(token)) { res.status(401).send("Unauthorized"); return; }
    res.setHeader("Content-Type", "text/html");
    res.send(buildOutreachBEmailPreview());
  });

  // ── Segmentation helper ───────────────────────────────────────────────────
  async function getOutreachSegments(): Promise<{
    segmentA: Array<{ id: string; resolved_name: string; email: string; email_unsubscribed: boolean }>;
    segmentB: Array<{ id: string; resolved_name: string; email: string; email_unsubscribed: boolean }>;
    mmUserIds: Set<string>;
    swaygerUserIds: Set<string>;
  }> {
    const supabase = getSupabase();

    // All users with a resolvable email
    const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
    const profiles = (allProfiles ?? []) as Array<{
      id: string; username: string; display_name: string | null;
      notification_email: string; email_unsubscribed: boolean;
    }>;

    // MM participants (anyone with a score row)
    const { data: scores } = await supabase.from("mm_pick_scores").select("user_id");
    const mmUserIds = new Set<string>((scores ?? []).map((s: { user_id: string }) => s.user_id));

    // Users who have placed at least one swayger (as creator or opponent)
    const { data: swaygerCreators } = await supabase
      .from("swaygers")
      .select("creator_id")
      .not("creator_id", "is", null);
    const { data: swaygerOpponents } = await supabase
      .from("swaygers")
      .select("opponent_id")
      .not("opponent_id", "is", null);

    const swaygerUserIds = new Set<string>([
      ...((swaygerCreators ?? []).map((s: { creator_id: string }) => s.creator_id)),
      ...((swaygerOpponents ?? []).map((s: { opponent_id: string }) => s.opponent_id)),
    ]);

    // Segment A: has email + NOT in MM + NOT in swaygers
    const segmentA = profiles
      .filter((p) => !mmUserIds.has(p.id) && !swaygerUserIds.has(p.id))
      .map((p) => ({
        id: p.id,
        resolved_name: p.display_name || p.username,
        email: p.notification_email,
        email_unsubscribed: p.email_unsubscribed,
      }));

    // Segment B: has email + NOT in MM + IS in swaygers
    const segmentB = profiles
      .filter((p) => !mmUserIds.has(p.id) && swaygerUserIds.has(p.id))
      .map((p) => ({
        id: p.id,
        resolved_name: p.display_name || p.username,
        email: p.notification_email,
        email_unsubscribed: p.email_unsubscribed,
      }));

    return { segmentA, segmentB, mmUserIds, swaygerUserIds };
  }

  // ── Dry-run: Segment A ────────────────────────────────────────────────────
  app.get("/admin/mm/api/blast-outreach-a/dry-run", async (req: Request, res: Response) => {
    const token = req.query.token as string | undefined;
    if (!isAdminToken(token)) { res.status(401).json({ ok: false, error: "Unauthorized" }); return; }
    try {
      const { segmentA, mmUserIds, swaygerUserIds } = await getOutreachSegments();
      const recipients = segmentA.map((u) => ({
        user_id: u.id,
        resolved_name: u.resolved_name,
        email: u.email,
        email_unsubscribed: u.email_unsubscribed,
        would_receive: !u.email_unsubscribed,
        in_mm: mmUserIds.has(u.id),
        has_swayger: swaygerUserIds.has(u.id),
      }));
      res.json({ ok: true, segment: "no_swayger", total: recipients.length, will_send: recipients.filter((r) => r.would_receive).length, recipients });
    } catch (err) {
      console.error("[outreach] dry-run A error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // ── Dry-run: Segment B ────────────────────────────────────────────────────
  app.get("/admin/mm/api/blast-outreach-b/dry-run", async (req: Request, res: Response) => {
    const token = req.query.token as string | undefined;
    if (!isAdminToken(token)) { res.status(401).json({ ok: false, error: "Unauthorized" }); return; }
    try {
      const { segmentB, mmUserIds, swaygerUserIds } = await getOutreachSegments();
      const recipients = segmentB.map((u) => ({
        user_id: u.id,
        resolved_name: u.resolved_name,
        email: u.email,
        email_unsubscribed: u.email_unsubscribed,
        would_receive: !u.email_unsubscribed,
        in_mm: mmUserIds.has(u.id),
        has_swayger: swaygerUserIds.has(u.id),
      }));
      res.json({ ok: true, segment: "swayger_no_mm", total: recipients.length, will_send: recipients.filter((r) => r.would_receive).length, recipients });
    } catch (err) {
      console.error("[outreach] dry-run B error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // ── Blast: Segment A ──────────────────────────────────────────────────────
  app.post("/admin/mm/api/blast-outreach-a", async (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!isAdminToken(token)) { res.status(401).json({ ok: false, error: "Unauthorized" }); return; }
    if (BLAST_EMAILS_PAUSED) {
      res.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart." });
      return;
    }
    try {
      const { sendOutreachAEmail } = await import("./email");
      const { segmentA } = await getOutreachSegments();
      const eligible = segmentA.filter((u) => !u.email_unsubscribed);

      let sent = 0;
      let failed = 0;
      for (const user of eligible) {
        try {
          await sendOutreachAEmail({ to: user.email, displayName: user.resolved_name, userId: user.id });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error(`[outreach-a] failed to send to ${user.email}:`, e);
          failed++;
        }
      }
      console.log(`[outreach-a] blast complete: ${sent} sent, ${failed} failed`);
      res.json({ ok: true, segment: "no_swayger", sent, failed, total_eligible: eligible.length });
    } catch (err) {
      console.error("[outreach] blast A error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // ── Blast: Segment B ──────────────────────────────────────────────────────
  app.post("/admin/mm/api/blast-outreach-b", async (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!isAdminToken(token)) { res.status(401).json({ ok: false, error: "Unauthorized" }); return; }
    if (BLAST_EMAILS_PAUSED) {
      res.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart." });
      return;
    }
    try {
      const { sendOutreachBEmail } = await import("./email");
      const { segmentB } = await getOutreachSegments();
      const eligible = segmentB.filter((u) => !u.email_unsubscribed);

      let sent = 0;
      let failed = 0;
      for (const user of eligible) {
        try {
          await sendOutreachBEmail({ to: user.email, displayName: user.resolved_name, userId: user.id });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error(`[outreach-b] failed to send to ${user.email}:`, e);
          failed++;
        }
      }
      console.log(`[outreach-b] blast complete: ${sent} sent, ${failed} failed`);
      res.json({ ok: true, segment: "swayger_no_mm", sent, failed, total_eligible: eligible.length });
    } catch (err) {
      console.error("[outreach] blast B error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // ── Test: send all email templates to a single address ────────────────────
  // GET /admin/mm/api/send-test-emails?token=...&to=someone@example.com&template=all|outreach-a|outreach-b|thankyou
  app.get("/admin/mm/api/send-test-emails", async (req: Request, res: Response) => {
    const token = req.query.token as string | undefined;
    if (!isAdminToken(token)) { res.status(401).json({ ok: false, error: "Unauthorized" }); return; }

    const to = req.query.to as string | undefined;
    if (!to) { res.status(400).json({ ok: false, error: "Missing ?to= address" }); return; }

    const template = (req.query.template as string | undefined) ?? "all";

    try {
      const { sendOutreachAEmail, sendOutreachBEmail, sendThankyouEmail } = await import("./email");
      const results: Record<string, string> = {};

      if (template === "all" || template === "outreach-a") {
        try {
          await sendOutreachAEmail({ to, displayName: "You", userId: undefined });
          results["outreach-a"] = "sent";
        } catch (e) {
          results["outreach-a"] = `error: ${e}`;
        }
      }

      if (template === "all" || template === "outreach-b") {
        try {
          await sendOutreachBEmail({ to, displayName: "You", userId: undefined });
          results["outreach-b"] = "sent";
        } catch (e) {
          results["outreach-b"] = `error: ${e}`;
        }
      }

      if (template === "all" || template === "thankyou") {
        try {
          await sendThankyouEmail({
            to,
            displayName: "You",
            rank: 1,
            totalPoints: 83,
            totalPlayers: 19,
            leaderboard: [
              { rank: 1, username: "dgrand2",    displayName: "Mr Roarke", totalPoints: 83 },
              { rank: 2, username: "leon50g",    displayName: null,        totalPoints: 50 },
              { rank: 3, username: "JayA78",     displayName: null,        totalPoints: 48 },
              { rank: 4, username: "Belt_2_Ass", displayName: null,        totalPoints: 47 },
              { rank: 5, username: "Big Boss",   displayName: null,        totalPoints: 47 },
            ],
            userId: undefined,
          });
          results["thankyou"] = "sent";
        } catch (e) {
          results["thankyou"] = `error: ${e}`;
        }
      }

      res.json({ ok: true, to, results });
    } catch (err) {
      console.error("[test-emails] error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });
}
