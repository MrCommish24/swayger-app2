import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { BLAST_EMAILS_PAUSED } from "./routes-mm-admin.js";

// ─── Supabase client ─────────────────────────────────────────
// Server uses the service role key so it can bypass RLS for admin operations
// (scoring, leaderboard reads across all users, night management).
// The anon key is for frontend/user-scoped access only.

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

// ─── Picks challenge rounds ───────────────────────────────────
// Date ranges define which prop_nights belong to each round.
// No DB migration needed — filtering is done by night date.
const PICK_ROUNDS: Record<number, { label: string; start: string; end: string }> = {
  1: { label: "Round 1 — NBA First Round",       start: "2026-04-19", end: "2026-05-03" },
  2: { label: "Round 2 — Conference Semifinals", start: "2026-05-04", end: "2026-05-19" },
  3: { label: "Round 3 — Conference Finals",     start: "2026-05-20", end: "2026-06-01" },
  4: { label: "Round 4 — NBA Finals",            start: "2026-06-02", end: "2026-06-25" },
};

// ─── Server-side Expo push helper ────────────────────────────

async function sendExpoPush(userId: string, title: string, body: string): Promise<void> {
  const supabase = getSupabase();
  try {
    const { data: tokenRow } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId)
      .maybeSingle();
    const token = (tokenRow as { token?: string } | null)?.token;
    if (!token) return;
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ to: token, title, body, sound: "default" }),
    });
    console.log(`[push] sent to user ${userId}: "${title}"`);
  } catch (e) {
    console.warn(`[push] failed for user ${userId}:`, e);
  }
}

// ─── Auto-settle picks challenge swaygers ────────────────────

type NotifProfile = { id: string; username: string; display_name: string | null; notification_email: string; email_unsubscribed: boolean };

async function autoSettlePicksChallenges(nightId: string, label: string): Promise<void> {
  const supabase = getSupabase();
  const { data: challengeSwaygers } = await supabase
    .from("swaygers")
    .select("id, creator_id, opponent_id, title, stake_units, stake_note, status")
    .eq("status", "active")
    .ilike("description", `%[night:${nightId}]%`);

  if (!challengeSwaygers?.length) return;

  // Fetch notification profiles once for all users
  const { data: allProfiles } = await supabase.rpc("get_auth_only_profiles");
  const profileMap = new Map<string, NotifProfile>();
  for (const p of (allProfiles ?? []) as NotifProfile[]) {
    profileMap.set(p.id, p);
  }

  for (const sw of challengeSwaygers as Array<{ id: string; creator_id: string; opponent_id: string | null; title: string; stake_units: number; stake_note: string | null; status: string }>) {
    if (!sw.opponent_id) continue;

    const { data: creatorRow } = await supabase
      .from("prop_user_picks")
      .select("correct_count")
      .eq("night_id", nightId)
      .eq("user_id", sw.creator_id)
      .maybeSingle();

    const { data: oppRow } = await supabase
      .from("prop_user_picks")
      .select("correct_count")
      .eq("night_id", nightId)
      .eq("user_id", sw.opponent_id)
      .maybeSingle();

    const creatorScore: number | null = (creatorRow as { correct_count?: number } | null)?.correct_count ?? null;
    const oppScore: number | null = (oppRow as { correct_count?: number } | null)?.correct_count ?? null;

    let outcome: "creator" | "opponent" | "draw" | "no_contest";
    if (creatorScore === null || oppScore === null) outcome = "no_contest";
    else if (creatorScore > oppScore) outcome = "creator";
    else if (oppScore > creatorScore) outcome = "opponent";
    else outcome = "draw";

    const { error: settleErr } = await supabase
      .from("swaygers")
      .update({ status: "settled", settled_outcome: outcome, settled_at: new Date().toISOString() })
      .eq("id", sw.id);

    if (settleErr) {
      console.warn(`[props] ${label}: could not settle swayger ${sw.id}:`, settleErr.message);
      continue;
    }

    console.log(`[props] ${label}: settled picks challenge ${sw.id}: ${outcome} (${creatorScore ?? "?"}–${oppScore ?? "?"})`);

    // ── Notifications ──
    const creatorProfile = profileMap.get(sw.creator_id);
    const oppProfile = profileMap.get(sw.opponent_id);
    const creatorName = creatorProfile?.username ?? "Creator";
    const oppName = oppProfile?.username ?? "Opponent";

    const denom = 4;

    // Build personalized push copy
    const buildPushCopy = (myScore: number | null, theirScore: number | null, theirName: string, isWinner: boolean, isDraw: boolean): { title: string; body: string } => {
      const myStr = myScore !== null ? `${myScore}/${denom}` : "?";
      const theirStr = theirScore !== null ? `${theirScore}/${denom}` : "?";
      if (isDraw) {
        return { title: "Picks Challenge — It's a Draw 🤝", body: `You both went ${myStr}. No one takes the bag tonight.` };
      }
      if (outcome === "no_contest") {
        return { title: "Picks Challenge — No Contest", body: "Not enough data to settle your challenge. Points returned." };
      }
      if (isWinner) {
        return { title: "Picks settled. You won. 🏆", body: `You went ${myStr}. @${theirName} went ${theirStr}. The bag is yours.` };
      }
      return { title: "Picks settled.", body: `You went ${myStr}. @${theirName} went ${theirStr}. Settle up.` };
    };

    const isDraw = outcome === "draw";
    const creatorWins = outcome === "creator";
    const oppWins = outcome === "opponent";

    const creatorPush = buildPushCopy(creatorScore, oppScore, oppName, creatorWins, isDraw);
    const oppPush = buildPushCopy(oppScore, creatorScore, creatorName, oppWins, isDraw);

    await Promise.allSettled([
      sendExpoPush(sw.creator_id, creatorPush.title, creatorPush.body),
      sendExpoPush(sw.opponent_id, oppPush.title, oppPush.body),
    ]);

    // ── Email notifications ──
    try {
      const { sendPicksChallengeSettledEmail } = await import("./email.js");
      const swaygerMeta = { id: sw.id, title: sw.title, category: "NBA Picks", stakeUnits: sw.stake_units, stakeNote: sw.stake_note };

      const notifPromises: Promise<void>[] = [];

      if (creatorProfile && !creatorProfile.email_unsubscribed) {
        notifPromises.push(
          sendPicksChallengeSettledEmail({
            swayger: swaygerMeta,
            recipientEmail: creatorProfile.notification_email,
            recipientName: creatorProfile.display_name ?? creatorProfile.username,
            myScore: creatorScore,
            theirScore: oppScore,
            theirName: oppProfile?.display_name ?? oppName,
            outcome,
            isCreator: true,
          })
        );
      }

      if (oppProfile && !oppProfile.email_unsubscribed) {
        notifPromises.push(
          sendPicksChallengeSettledEmail({
            swayger: swaygerMeta,
            recipientEmail: oppProfile.notification_email,
            recipientName: oppProfile.display_name ?? oppProfile.username,
            myScore: oppScore,
            theirScore: creatorScore,
            theirName: creatorProfile?.display_name ?? creatorName,
            outcome,
            isCreator: false,
          })
        );
      }

      await Promise.allSettled(notifPromises);
    } catch (emailErr) {
      console.warn(`[props] ${label}: email error for swayger ${sw.id}:`, emailErr);
    }
  }
}

// ─── Admin guard ─────────────────────────────────────────────

function requireAdmin(req: Request, res: Response): boolean {
  const token = req.headers["x-admin-token"] || req.query["token"];
  if (token !== process.env.MM_ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

// ─── SportsGameOdds fetcher ───────────────────────────────────
// SGO does not support individual event lookup (/v2/events/:id returns 404).
// Instead we page through the list endpoint using startsAfter to build a map.

// nightDate: ISO date string (e.g. "2026-04-19") to narrow the search window
async function fetchSGOEventMap(eventIDs: string[], nightDate?: string): Promise<Record<string, Record<string, unknown>>> {
  const apiKey = process.env.SPORTS_GAME_ODDS_API_KEY;
  if (!apiKey || eventIDs.length === 0) return {};

  const map: Record<string, Record<string, unknown>> = {};
  const needed = new Set(eventIDs);

  // Start 1 day before the night's date to catch games that start the prior evening.
  // Fall back to 3 days ago if no date hint is given.
  let windowStart: string;
  if (nightDate) {
    const d = new Date(nightDate + "T00:00:00Z");
    d.setDate(d.getDate() - 1);
    windowStart = d.toISOString();
  } else {
    windowStart = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  }

  let cursor: string | null = null;
  let pageCount = 0;
  const MAX_PAGES = 15; // safety ceiling — 15 pages × 10 events = 150 events

  try {
    do {
      const url = new URL("https://api.sportsgameodds.com/v2/events/");
      url.searchParams.set("sportID", "BASKETBALL");
      url.searchParams.set("leagueID", "NBA");
      url.searchParams.set("startsAfter", windowStart);
      url.searchParams.set("includeResults", "true");
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url.toString(), { headers: { "X-Api-Key": apiKey } });
      if (!res.ok) break;

      const data = await res.json() as {
        success: boolean;
        data: Record<string, unknown>[];
        nextCursor?: string;
      };
      if (!data.success) break;

      pageCount++;
      for (const event of (data.data || [])) {
        const id = event.eventID as string;
        if (needed.has(id)) {
          map[id] = event;
          needed.delete(id);
        }
      }

      cursor = needed.size > 0 && pageCount < MAX_PAGES ? (data.nextCursor || null) : null;
    } while (cursor);
  } catch {
    // return whatever we found so far
  }

  console.log(`[SGO] fetchSGOEventMap: ${pageCount} page(s), found ${Object.keys(map).length}/${eventIDs.length} events`);
  return map;
}

// Helper: extract a single stat value from a player's stats object or legacy flat number.
// Supports composite stat "pra" = points + rebounds + assists.
function extractStat(playerData: unknown, statName: string): number | null {
  if (playerData === undefined || playerData === null) return null;
  // SGO returns player stats as an object: { points: 23, rebounds: 6, assists: 2, ... }
  if (typeof playerData === "object") {
    const obj = playerData as Record<string, number>;
    if (statName === "pra") {
      const p = obj["points"], r = obj["rebounds"], a = obj["assists"];
      if (typeof p !== "number" || typeof r !== "number" || typeof a !== "number") return null;
      return p + r + a;
    }
    if (statName === "pa" || statName === "PA") {
      const p = obj["points"], a = obj["assists"];
      if (typeof p !== "number" || typeof a !== "number") return null;
      return p + a;
    }
    if (statName === "pr" || statName === "PR") {
      const p = obj["points"], r = obj["rebounds"];
      if (typeof p !== "number" || typeof r !== "number") return null;
      return p + r;
    }
    if (statName === "prb" || statName === "PRB") {
      const p = obj["points"], r = obj["rebounds"], b = obj["blocks"];
      if (typeof p !== "number" || typeof r !== "number" || typeof b !== "number") return null;
      return p + r + b;
    }
    const val = obj[statName];
    return typeof val === "number" ? val : null;
  }
  // Legacy flat number format
  const num = Number(playerData);
  return isNaN(num) ? null : num;
}

// ─── Scoring helper ───────────────────────────────────────────

function computeScore(correctCount: number, totalProps: number): number {
  if (correctCount === 0) return 0;
  if (totalProps === 4) {
    if (correctCount === 1) return 10;
    if (correctCount === 2) return 40;
    if (correctCount === 3) return 100;
    return 250;
  }
  // Fallback for non-4 prop nights
  return correctCount * 25;
}

// ─── Types ───────────────────────────────────────────────────

interface PropDef {
  id: string;
  player_name: string;
  player_id: string;
  team: string;
  stat: string;
  stat_label: string;
  line: number;
  game: string;
  event_id: string;
  odd_id: string;
  status: "open" | "voided";
  result: "over" | "under" | null;
}

interface UserPickEntry {
  prop_id: string;
  pick: "over" | "under";
}

// ─── Routes ──────────────────────────────────────────────────

export function registerPropsRoutes(app: Express) {

  // GET /api/props/tonight — returns tonight's open or locked prop night.
  // Searches today AND yesterday in UTC to handle games that run past UTC midnight
  // while still being "tonight" in US Eastern time (NBA home timezone).
  app.get("/api/props/tonight", async (_req: Request, res: Response) => {
    try {
      const supabase = getSupabase();
      const todayUTC = new Date().toISOString().slice(0, 10);
      const yesterdayUTC = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("prop_nights")
        .select("*")
        .in("date", [todayUTC, yesterdayUTC])
        .in("status", ["open", "locked", "resolved"])
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      res.json({ ok: true, night: data ?? null });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // GET /api/props/last-night?user_id= — most recent resolved night + user's picks
  app.get("/api/props/last-night", async (req: Request, res: Response) => {
    try {
      const { user_id } = req.query as Record<string, string>;
      const supabase = getSupabase();

      const { data: night, error } = await supabase
        .from("prop_nights")
        .select("*")
        .eq("status", "resolved")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!night) return res.json({ ok: true, night: null, pick: null });

      let pick = null;
      if (user_id) {
        const { data } = await supabase
          .from("prop_user_picks")
          .select("*")
          .eq("night_id", night.id)
          .eq("user_id", user_id)
          .maybeSingle();
        pick = data;
      }

      res.json({ ok: true, night, pick });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // GET /api/props/history — last 10 resolved nights
  app.get("/api/props/history", async (_req: Request, res: Response) => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("prop_nights")
        .select("id, date, status, props")
        .eq("status", "resolved")
        .order("date", { ascending: false })
        .limit(10);

      if (error) throw error;
      res.json({ ok: true, nights: data ?? [] });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // GET /api/props/my-picks?night_id=&user_id=
  app.get("/api/props/my-picks", async (req: Request, res: Response) => {
    try {
      const { night_id, user_id } = req.query as Record<string, string>;
      if (!night_id || !user_id) {
        return res.status(400).json({ ok: false, error: "night_id and user_id required" });
      }
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("prop_user_picks")
        .select("*")
        .eq("night_id", night_id)
        .eq("user_id", user_id)
        .maybeSingle();

      if (error) throw error;
      res.json({ ok: true, pick: data ?? null });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // POST /api/props/pick — submit or update picks
  app.post("/api/props/pick", async (req: Request, res: Response) => {
    try {
      const { night_id, user_id, picks } = req.body as {
        night_id: string;
        user_id: string;
        picks: UserPickEntry[];
      };

      if (!night_id || !user_id || !Array.isArray(picks)) {
        return res.status(400).json({ ok: false, error: "night_id, user_id, picks required" });
      }

      const supabase = getSupabase();

      // Confirm the night is still open
      const { data: night, error: nightErr } = await supabase
        .from("prop_nights")
        .select("status, lock_time, props")
        .eq("id", night_id)
        .maybeSingle();

      if (nightErr) throw nightErr;
      if (!night) return res.status(404).json({ ok: false, error: "Night not found" });

      const now = new Date();
      const lockTime = new Date(night.lock_time);
      if (now >= lockTime || night.status !== "open") {
        return res.status(403).json({ ok: false, error: "Picks are locked" });
      }

      const { error } = await supabase
        .from("prop_user_picks")
        .upsert(
          {
            user_id,
            night_id,
            picks,
            score: 0,
            correct_count: 0,
            submitted_at: now.toISOString(),
          },
          { onConflict: "user_id,night_id" }
        );

      if (error) throw error;
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // GET /api/props/leaderboard — prop points leaderboard; ?round=1 filters to a specific round
  app.get("/api/props/leaderboard", async (req: Request, res: Response) => {
    try {
      const supabase = getSupabase();
      const roundParam = req.query.round ? Number(req.query.round) : null;

      let picks;
      if (roundParam && PICK_ROUNDS[roundParam]) {
        const { start, end } = PICK_ROUNDS[roundParam];
        const { data: nights } = await supabase
          .from("prop_nights")
          .select("id")
          .gte("date", start)
          .lte("date", end);
        const nightIds = (nights ?? []).map((n: { id: string }) => n.id);
        if (nightIds.length === 0) return res.json({ ok: true, leaderboard: [], round: roundParam });
        const { data: p, error } = await supabase
          .from("prop_user_picks")
          .select("user_id, score, correct_count")
          .in("night_id", nightIds);
        if (error) throw error;
        picks = p;
      } else {
        const { data: p, error } = await supabase
          .from("prop_user_picks")
          .select("user_id, score, correct_count");
        if (error) throw error;
        picks = p;
      }

      // Aggregate by user
      const userMap: Record<string, { total_score: number; total_correct: number; nights_played: number }> = {};
      for (const p of (picks ?? [])) {
        if (!userMap[p.user_id]) {
          userMap[p.user_id] = { total_score: 0, total_correct: 0, nights_played: 0 };
        }
        userMap[p.user_id].total_score += p.score ?? 0;
        userMap[p.user_id].total_correct += p.correct_count ?? 0;
        userMap[p.user_id].nights_played += 1;
      }

      // Fetch usernames for all user IDs
      const userIds = Object.keys(userMap);
      if (userIds.length === 0) return res.json({ ok: true, leaderboard: [], round: roundParam ?? null });

      // Use SECURITY DEFINER RPC to bypass RLS on profiles table
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
      type ProfileRow = { id: string; username: string; display_name?: string | null };

      const profileMap: Record<string, { username: string; display_name: string }> = {};
      for (const p of ((allProfiles ?? []) as ProfileRow[])) {
        if (userIds.includes(p.id)) {
          profileMap[p.id] = { username: p.username, display_name: p.display_name ?? "" };
        }
      }

      const leaderboard = Object.entries(userMap)
        .map(([user_id, stats]) => ({
          user_id,
          username: profileMap[user_id]?.username ?? "—",
          display_name: profileMap[user_id]?.display_name ?? "",
          ...stats,
        }))
        .sort((a, b) => b.total_score - a.total_score || b.total_correct - a.total_correct)
        .slice(0, 50);

      res.json({ ok: true, leaderboard, round: roundParam ?? null });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // ─── Admin routes ─────────────────────────────────────────

  // POST /api/admin/props/night — create or update a prop night
  app.post("/api/admin/props/night", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;

    try {
      const { date, lock_time, props, id } = req.body as {
        date: string;
        lock_time: string;
        props: PropDef[];
        id?: string;
      };

      if (!date || !lock_time || !Array.isArray(props)) {
        return res.status(400).json({ ok: false, error: "date, lock_time, props required" });
      }

      const supabase = getSupabase();

      if (id) {
        const { error } = await supabase
          .from("prop_nights")
          .update({ date, lock_time, props })
          .eq("id", id);
        if (error) throw error;
        return res.json({ ok: true, updated: true });
      }

      const { data, error } = await supabase
        .from("prop_nights")
        .insert({ date, lock_time, props, status: "open" })
        .select("id")
        .single();

      if (error) throw error;
      res.json({ ok: true, id: data.id });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // GET /api/admin/props/hq-challenge-link — returns the shareable HQ challenge URL for tonight (or a specific night)
  app.get("/api/admin/props/hq-challenge-link", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const supabase = getSupabase();
      const nightId = req.query.night_id as string | undefined;

      let night: { id: string; date: string } | null = null;

      if (nightId) {
        const { data } = await supabase
          .from("prop_nights")
          .select("id, date")
          .eq("id", nightId)
          .maybeSingle();
        night = data;
      } else {
        // Get tonight's open night
        const today = new Date().toISOString().split("T")[0];
        const { data } = await supabase
          .from("prop_nights")
          .select("id, date")
          .eq("date", today)
          .eq("status", "open")
          .maybeSingle();
        night = data;
        // Fallback: latest open night
        if (!night) {
          const { data: latest } = await supabase
            .from("prop_nights")
            .select("id, date")
            .eq("status", "open")
            .order("date", { ascending: false })
            .limit(1)
            .maybeSingle();
          night = latest;
        }
      }

      if (!night) {
        return res.status(404).json({ ok: false, error: "No open prop night found" });
      }

      const baseUrl = "https://www.swayger.app";
      const url = `${baseUrl}/picks?hq=1`;

      res.json({
        ok: true,
        night_id: night.id,
        night_date: night.date,
        hq_challenge_url: url,
        email_cta1: {
          text: "Accept the Challenge →",
          url,
        },
        email_cta2: {
          text: "Challenge a Friend →",
          url: `${baseUrl}/picks`,
          note: "User creates a Picks Challenge from the challenge sheet after submitting picks",
        },
      });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // POST /api/admin/props/send-challenge-email — send HQ challenge email to one or all users
  app.post("/api/admin/props/send-challenge-email", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const { to, displayName, userId, lockTime, props, hqChallengeUrl, picksUrl } = req.body as {
        to: string;
        displayName?: string;
        userId?: string;
        lockTime?: string;
        props?: Array<{ player: string; line: string; matchup: string }>;
        hqChallengeUrl?: string;
        picksUrl?: string;
      };

      if (!to) return res.status(400).json({ ok: false, error: "to is required" });

      const { sendNightlyPicksChallenge } = await import("./email.js");

      await sendNightlyPicksChallenge({
        to,
        displayName: displayName ?? "there",
        userId,
        lockTime: lockTime ?? "6:30 PM CDT",
        props: props ?? [
          { player: "Jayson Tatum",       line: "O/U 23.5 pts", matchup: "Celtics vs 76ers" },
          { player: "Alperen Sengun",     line: "O/U 5.5 ast",  matchup: "Rockets vs Lakers" },
          { player: "Jaylen Brown",       line: "O/U 37.5 PRA", matchup: "Celtics vs 76ers" },
          { player: "Victor Wembanyama", line: "O/U 11.5 reb", matchup: "Spurs vs Blazers" },
        ],
        hqChallengeUrl: hqChallengeUrl ?? "https://www.swayger.app/picks?hq=1",
        picksUrl: picksUrl ?? "https://www.swayger.app/picks",
      });

      res.json({ ok: true, sent_to: to });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // GET /api/admin/props/preview-challenge-email — renders the HQ challenge email HTML for preview
  app.get("/api/admin/props/preview-challenge-email", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const { buildNightlyPicksChallengePreview } = await import("./email.js");
    res.setHeader("Content-Type", "text/html");
    res.send(buildNightlyPicksChallengePreview());
  });

  // Open preview route (no auth) — for visual inspection only
  app.get("/admin/props/email-preview/challenge", async (_req: Request, res: Response) => {
    const { buildNightlyPicksChallengePreview } = await import("./email.js");
    res.setHeader("Content-Type", "text/html");
    res.send(buildNightlyPicksChallengePreview());
  });

  // GET /api/admin/props/blast-challenge-email/dry-run — preview who would receive the blast
  app.get("/api/admin/props/blast-challenge-email/dry-run", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const supabase = getSupabase();
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      type Profile = { id: string; username: string; display_name: string | null; notification_email: string; email_unsubscribed: boolean };
      const allProfiles = [
        ...((emailProfiles ?? []) as Profile[]),
        ...((authProfiles ?? []) as Profile[]),
      ];
      const seen = new Set<string>();
      const deduped = allProfiles.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
      const eligible = deduped.filter((p) => !p.email_unsubscribed);
      const recipients = eligible.map((u) => ({
        user_id: u.id,
        email: u.notification_email,
        display_name: u.display_name || u.username,
        hq_url: `https://www.swayger.app/picks?hq=1&uid=${u.id}`,
      }));
      res.json({ ok: true, total_eligible: eligible.length, recipients });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // POST /api/admin/props/blast-challenge-email — send HQ challenge email to all users
  app.post("/api/admin/props/blast-challenge-email", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (BLAST_EMAILS_PAUSED) {
      res.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag in routes-mm-admin.ts and restart." });
      return;
    }
    try {
      const { sendNightlyPicksChallenge } = await import("./email.js");
      const supabase = getSupabase();

      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      type Profile = { id: string; username: string; display_name: string | null; notification_email: string; email_unsubscribed: boolean };
      const allProfiles = [
        ...((emailProfiles ?? []) as Profile[]),
        ...((authProfiles ?? []) as Profile[]),
      ];
      const seen = new Set<string>();
      const deduped = allProfiles.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
      const eligible = deduped.filter((p) => !p.email_unsubscribed);

      let sent = 0; let failed = 0;
      for (const user of eligible) {
        try {
          await sendNightlyPicksChallenge({
            to: user.notification_email,
            displayName: user.display_name || user.username,
            userId: user.id,
            hqChallengeUrl: `https://www.swayger.app/picks?hq=1&uid=${user.id}`,
            picksUrl: "https://www.swayger.app/picks",
          });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error(`[challenge-blast] failed for ${user.notification_email}:`, e);
          failed++;
        }
      }
      console.log(`[challenge-blast] complete: ${sent} sent, ${failed} failed`);
      res.json({ ok: true, sent, failed, total_eligible: eligible.length });
    } catch (err) {
      console.error("[challenge-blast] error:", err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // ─── Weekend Picks Blast routes ───────────────────────────────────────────

  // GET /admin/props/email-preview/weekend-picks — render email HTML for review
  app.get("/admin/props/email-preview/weekend-picks", (_req: Request, res: Response) => {
    const { buildWeekendPicksBlastPreview } = require("./email.js");
    res.setHeader("Content-Type", "text/html");
    res.send(buildWeekendPicksBlastPreview());
  });

  // GET /api/admin/props/blast-weekend-picks/dry-run — show who would receive it
  app.get("/api/admin/props/blast-weekend-picks/dry-run", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const supabase = getSupabase();
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      type Profile = { id: string; username: string; display_name: string | null; notification_email: string; email_unsubscribed: boolean };
      const allProfiles = [
        ...((emailProfiles ?? []) as Profile[]),
        ...((authProfiles ?? []) as Profile[]),
      ];
      const seen = new Set<string>();
      const deduped = allProfiles.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
      const eligible = deduped.filter((p) => p.notification_email && !p.email_unsubscribed);
      res.json({
        ok: true,
        total_eligible: eligible.length,
        recipients: eligible.map((u) => ({
          user_id: u.id,
          email: u.notification_email,
          display_name: u.display_name || u.username,
        })),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // POST /api/admin/props/blast-weekend-picks/test — send one test copy to a specific email
  app.post("/api/admin/props/blast-weekend-picks/test", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const { email, name } = req.body as { email?: string; name?: string };
    if (!email) { res.status(400).json({ ok: false, error: "email is required" }); return; }
    try {
      const { sendWeekendPicksBlast } = await import("./email.js");
      await sendWeekendPicksBlast({
        to: email,
        displayName: name || "Friend",
        userId: "test-preview",
        picksUrl: "https://www.swayger.app/picks",
      });
      res.json({ ok: true, sent_to: email });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // POST /api/admin/props/blast-weekend-picks — send to all eligible users
  app.post("/api/admin/props/blast-weekend-picks", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (BLAST_EMAILS_PAUSED) {
      res.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag in routes-mm-admin.ts and restart." });
      return;
    }
    try {
      const { sendWeekendPicksBlast } = await import("./email.js");
      const supabase = getSupabase();
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      type Profile = { id: string; username: string; display_name: string | null; notification_email: string; email_unsubscribed: boolean };
      const allProfiles = [
        ...((emailProfiles ?? []) as Profile[]),
        ...((authProfiles ?? []) as Profile[]),
      ];
      const seen = new Set<string>();
      const deduped = allProfiles.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
      const eligible = deduped.filter((p) => p.notification_email && !p.email_unsubscribed);

      let sent = 0; let failed = 0;
      for (const user of eligible) {
        try {
          await sendWeekendPicksBlast({
            to: user.notification_email,
            displayName: user.display_name || user.username,
            userId: user.id,
            picksUrl: "https://www.swayger.app/picks",
          });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error(`[weekend-blast] failed for ${user.notification_email}:`, e);
          failed++;
        }
      }
      console.log(`[weekend-blast] complete: ${sent} sent, ${failed} failed`);
      res.json({ ok: true, sent, failed, total_eligible: eligible.length });
    } catch (err) {
      console.error("[weekend-blast] error:", err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // POST /api/admin/props/lock/:nightId — manually lock a night
  app.post("/api/admin/props/lock/:nightId", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("prop_nights")
        .update({ status: "locked" })
        .eq("id", req.params.nightId);
      if (error) throw error;
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // GET /api/props/night/:nightId — public, returns a specific night's data (for invite previews)
  app.get("/api/props/night/:nightId", async (req: Request, res: Response) => {
    try {
      const supabase = getSupabase();
      const { nightId } = req.params;
      const { data: night, error } = await supabase
        .from("prop_nights")
        .select("id, date, status, lock_time, props")
        .eq("id", nightId)
        .maybeSingle();
      if (error) throw error;
      if (!night) return res.status(404).json({ ok: false, error: "Night not found" });
      res.json({ ok: true, night });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // POST /api/admin/props/resolve/:nightId — auto-resolve using SportsGameOdds
  app.post("/api/admin/props/resolve/:nightId", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;

    try {
      const supabase = getSupabase();
      const { nightId } = req.params;

      const { data: night, error: nightErr } = await supabase
        .from("prop_nights")
        .select("*")
        .eq("id", nightId)
        .maybeSingle();

      if (nightErr) throw nightErr;
      if (!night) return res.status(404).json({ ok: false, error: "Night not found" });

      const props = night.props as PropDef[];

      // Batch-fetch all events from SGO using the list endpoint with startsAfter.
      // Pass the night's date so the window starts 1 day before, keeping page count low.
      const eventIds = [...new Set(props.map((p) => p.event_id))];
      const eventMap = await fetchSGOEventMap(eventIds, night.date as string);
      console.log(`[props/resolve] fetched ${Object.keys(eventMap).length}/${eventIds.length} events from SGO`);

      // Resolve each prop
      const resolvedProps: PropDef[] = props.map((prop) => {
        if (prop.status === "voided") return prop;

        const event = eventMap[prop.event_id];
        if (!event) {
          console.warn(`[props/resolve] no SGO event found for event_id=${prop.event_id}, prop=${prop.id}`);
          return prop;
        }

        const gameResults = (event.results as Record<string, unknown> | undefined)?.game as Record<string, unknown> | undefined;
        if (!gameResults) return prop;

        const playerData = gameResults[prop.player_id];
        if (playerData === undefined || playerData === null) {
          // Player didn't appear in game data — void the prop
          console.warn(`[props/resolve] player ${prop.player_id} not in results, voiding`);
          return { ...prop, status: "voided" as const };
        }

        const actualScore = extractStat(playerData, prop.stat);
        if (actualScore === null) {
          console.warn(`[props/resolve] stat "${prop.stat}" not found for ${prop.player_id}, voiding`);
          return { ...prop, status: "voided" as const };
        }

        const result: "over" | "under" = actualScore > prop.line ? "over" : "under";
        console.log(`[props/resolve] ${prop.player_name} ${prop.stat}: ${actualScore} vs line ${prop.line} → ${result}`);
        return { ...prop, result };
      });

      // Update night with resolved props
      await supabase
        .from("prop_nights")
        .update({ props: resolvedProps, status: "resolved" })
        .eq("id", nightId);

      // Score all user picks for this night
      const { data: userPicks } = await supabase
        .from("prop_user_picks")
        .select("*")
        .eq("night_id", nightId);

      for (const userPick of (userPicks ?? [])) {
        const picks = userPick.picks as UserPickEntry[];
        let correctCount = 0;
        let voidedCount = 0;

        for (const pick of picks) {
          const prop = resolvedProps.find((p) => p.id === pick.prop_id);
          if (!prop) continue;
          if (prop.status === "voided") {
            voidedCount++;
            continue;
          }
          if (prop.result === pick.pick) correctCount++;
        }

        const activePropCount = resolvedProps.filter((p) => p.status !== "voided").length;
        const score = computeScore(correctCount, activePropCount) + voidedCount * 25;

        await supabase
          .from("prop_user_picks")
          .update({ score, correct_count: correctCount })
          .eq("id", userPick.id);
      }

      // ── Auto-settle Picks Challenge swaygers tied to this night ──
      try {
        await autoSettlePicksChallenges(nightId, "auto-resolve");
      } catch (autoErr) {
        console.error("[props] auto-settle picks challenge error:", autoErr);
      }

      res.json({ ok: true, resolvedProps });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // POST /api/admin/props/manual-resolve/:nightId — manually enter results and score picks
  // Body: { results: { [prop_id]: "over" | "under" | "voided" } }
  app.post("/api/admin/props/manual-resolve/:nightId", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const supabase = getSupabase();
      const { nightId } = req.params;
      const { results } = req.body as { results: Record<string, "over" | "under" | "voided"> };

      if (!results || typeof results !== "object") {
        return res.status(400).json({ ok: false, error: "results object required: {prop_id: 'over'|'under'|'voided'}" });
      }

      const { data: night, error: nightErr } = await supabase
        .from("prop_nights")
        .select("*")
        .eq("id", nightId)
        .maybeSingle();

      if (nightErr) throw nightErr;
      if (!night) return res.status(404).json({ ok: false, error: "Night not found" });

      const props = night.props as PropDef[];

      // Apply manual results
      const resolvedProps: PropDef[] = props.map((prop) => {
        const manualResult = results[prop.id];
        if (!manualResult) return prop;
        if (manualResult === "voided") return { ...prop, status: "voided" as const, result: null };
        return { ...prop, result: manualResult };
      });

      // Update night
      await supabase
        .from("prop_nights")
        .update({ props: resolvedProps, status: "resolved" })
        .eq("id", nightId);

      // Score all user picks
      const { data: userPicks } = await supabase
        .from("prop_user_picks")
        .select("*")
        .eq("night_id", nightId);

      for (const userPick of (userPicks ?? [])) {
        const picks = userPick.picks as UserPickEntry[];
        let correctCount = 0;
        let voidedCount = 0;

        for (const pick of picks) {
          const prop = resolvedProps.find((p) => p.id === pick.prop_id);
          if (!prop) continue;
          if (prop.status === "voided") { voidedCount++; continue; }
          if (prop.result === pick.pick) correctCount++;
        }

        const activePropCount = resolvedProps.filter((p) => p.status !== "voided").length;
        const score = computeScore(correctCount, activePropCount) + voidedCount * 25;

        await supabase
          .from("prop_user_picks")
          .update({ score, correct_count: correctCount })
          .eq("id", userPick.id);
      }

      // ── Auto-settle Picks Challenge swaygers tied to this night ──
      try {
        await autoSettlePicksChallenges(nightId, "manual-resolve");
      } catch (autoErr) {
        console.error("[props] manual-resolve auto-settle error:", autoErr);
      }

      res.json({ ok: true, resolvedProps, picksScored: (userPicks ?? []).length });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // GET /api/props/challenge-result?swayger_id= — returns both users' pick scores for a settled picks challenge
  app.get("/api/props/challenge-result", async (req: Request, res: Response) => {
    try {
      const supabase = getSupabase();
      const { swayger_id } = req.query as { swayger_id?: string };
      if (!swayger_id) return res.status(400).json({ ok: false, error: "swayger_id required" });

      const { data: sw } = await supabase
        .from("swaygers")
        .select("id, creator_id, opponent_id, description, settled_outcome")
        .eq("id", swayger_id)
        .maybeSingle();

      if (!sw) return res.status(404).json({ ok: false, error: "Swayger not found" });

      const nightMatch = (sw.description ?? "").match(/\[night:([^\]]+)\]/);
      const nightId = nightMatch?.[1] ?? null;
      if (!nightId) return res.json({ ok: true, nightId: null, creator_score: null, opp_score: null });

      const [{ data: creatorRow }, { data: oppRow }] = await Promise.all([
        supabase.from("prop_user_picks").select("correct_count").eq("night_id", nightId).eq("user_id", sw.creator_id).maybeSingle(),
        sw.opponent_id
          ? supabase.from("prop_user_picks").select("correct_count").eq("night_id", nightId).eq("user_id", sw.opponent_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      res.json({
        ok: true,
        nightId,
        creator_score: (creatorRow as { correct_count?: number } | null)?.correct_count ?? null,
        opp_score: (oppRow as { correct_count?: number } | null)?.correct_count ?? null,
        settled_outcome: sw.settled_outcome ?? null,
      });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // POST /api/admin/props/void/:nightId/:propId — void a single prop
  app.post("/api/admin/props/void/:nightId/:propId", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const supabase = getSupabase();
      const { nightId, propId } = req.params;

      const { data: night } = await supabase
        .from("prop_nights")
        .select("props")
        .eq("id", nightId)
        .maybeSingle();

      if (!night) return res.status(404).json({ ok: false, error: "Night not found" });

      const props = (night.props as PropDef[]).map((p) =>
        p.id === propId ? { ...p, status: "voided" as const } : p
      );

      await supabase.from("prop_nights").update({ props }).eq("id", nightId);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // ─── Round leaderboard + winner email ─────────────────────────────────────

  // Helper: build round leaderboard (reused by multiple endpoints)
  async function getRoundLeaderboard(roundNum: number): Promise<{
    leaderboard: Array<{ user_id: string; username: string; display_name: string; email: string; total_score: number; total_correct: number; nights_played: number }>;
    nightsInRound: number;
    roundLabel: string;
    error?: string;
  }> {
    const roundConfig = PICK_ROUNDS[roundNum];
    if (!roundConfig) return { leaderboard: [], nightsInRound: 0, roundLabel: "", error: `Unknown round: ${roundNum}` };

    const supabase = getSupabase();
    const { start, end } = roundConfig;

    const { data: nights } = await supabase.from("prop_nights").select("id").gte("date", start).lte("date", end);
    const nightIds = (nights ?? []).map((n: { id: string }) => n.id);
    if (nightIds.length === 0) return { leaderboard: [], nightsInRound: 0, roundLabel: roundConfig.label };

    const { data: picks, error } = await supabase.from("prop_user_picks").select("user_id, score, correct_count").in("night_id", nightIds);
    if (error) return { leaderboard: [], nightsInRound: nightIds.length, roundLabel: roundConfig.label, error: error.message };

    const userMap: Record<string, { total_score: number; total_correct: number; nights_played: number }> = {};
    for (const p of (picks ?? [])) {
      if (!userMap[p.user_id]) userMap[p.user_id] = { total_score: 0, total_correct: 0, nights_played: 0 };
      userMap[p.user_id].total_score += p.score ?? 0;
      userMap[p.user_id].total_correct += p.correct_count ?? 0;
      userMap[p.user_id].nights_played += 1;
    }

    const userIds = Object.keys(userMap);
    if (userIds.length === 0) return { leaderboard: [], nightsInRound: nightIds.length, roundLabel: roundConfig.label };

    const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
    type ProfileRow = { id: string; username: string; display_name?: string | null; notification_email?: string };
    const profileMap: Record<string, { username: string; display_name: string; email: string }> = {};
    for (const p of ((allProfiles ?? []) as ProfileRow[])) {
      if (userIds.includes(p.id)) {
        profileMap[p.id] = { username: p.username, display_name: p.display_name ?? "", email: p.notification_email ?? "" };
      }
    }

    const leaderboard = Object.entries(userMap)
      .map(([user_id, stats]) => ({
        user_id,
        username: profileMap[user_id]?.username ?? "—",
        display_name: profileMap[user_id]?.display_name ?? "",
        email: profileMap[user_id]?.email ?? "",
        ...stats,
      }))
      .sort((a, b) => b.total_score - a.total_score || b.total_correct - a.total_correct);

    return { leaderboard, nightsInRound: nightIds.length, roundLabel: roundConfig.label };
  }

  // GET /api/admin/props/round/:roundNum/leaderboard — standings for a specific round
  app.get("/api/admin/props/round/:roundNum/leaderboard", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const roundNum = Number(req.params.roundNum);
      if (!PICK_ROUNDS[roundNum]) return res.status(400).json({ ok: false, error: `Unknown round: ${roundNum}` });
      const result = await getRoundLeaderboard(roundNum);
      if (result.error) return res.status(500).json({ ok: false, error: result.error });
      res.json({ ok: true, round: roundNum, round_label: result.roundLabel, nights_in_round: result.nightsInRound, leaderboard: result.leaderboard });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // POST /api/admin/props/send-round-winner-email — send winner email to #1 scorer of a round
  // Body: { round: 1 }
  app.post("/api/admin/props/send-round-winner-email", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const { round } = req.body as { round?: number };
    if (!round) return res.status(400).json({ ok: false, error: "round is required in body" });
    if (!PICK_ROUNDS[round]) return res.status(400).json({ ok: false, error: `Unknown round: ${round}` });
    try {
      const result = await getRoundLeaderboard(round);
      if (result.error) return res.status(500).json({ ok: false, error: result.error });
      if (result.leaderboard.length === 0) return res.json({ ok: false, error: "No participants found for this round." });

      const winner = result.leaderboard[0];
      if (!winner.email) return res.status(404).json({ ok: false, error: `Winner (${winner.username}) has no email on file.` });

      const { sendRoundWinnerEmail } = await import("./email.js");
      await sendRoundWinnerEmail({
        to: winner.email,
        displayName: winner.display_name || winner.username,
        userId: winner.user_id,
        round,
        roundLabel: result.roundLabel,
        totalScore: winner.total_score,
        correctCount: winner.total_correct,
        nightsPlayed: winner.nights_played,
        rank: 1,
        totalPlayers: result.leaderboard.length,
      });

      res.json({
        ok: true,
        sent_to: winner.email,
        winner: { username: winner.username, score: winner.total_score, correct: winner.total_correct, nights: winner.nights_played },
        total_players: result.leaderboard.length,
      });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // ─── Round launch (re-engagement) blast ───────────────────────────────────

  // GET /admin/props/email-preview/round-launch — render Round 2 blast email HTML for preview
  app.get("/admin/props/email-preview/round-launch", (_req: Request, res: Response) => {
    import("./email.js").then(({ buildRoundLaunchBlastPreview }) => {
      res.setHeader("Content-Type", "text/html");
      res.send(buildRoundLaunchBlastPreview());
    }).catch((err) => res.status(500).send(String(err)));
  });

  // GET /api/admin/props/blast-round-launch/dry-run — preview who receives the blast
  app.get("/api/admin/props/blast-round-launch/dry-run", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const supabase = getSupabase();
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      type Profile = { id: string; username: string; display_name: string | null; notification_email: string; email_unsubscribed: boolean };
      const allProfiles = [...((emailProfiles ?? []) as Profile[]), ...((authProfiles ?? []) as Profile[])];
      const seen = new Set<string>();
      const deduped = allProfiles.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
      const eligible = deduped.filter((p) => p.notification_email && !p.email_unsubscribed);
      res.json({ ok: true, total_eligible: eligible.length, recipients: eligible.map((u) => ({ user_id: u.id, email: u.notification_email, display_name: u.display_name || u.username })) });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // POST /api/admin/props/blast-round-launch/test — send one test copy
  app.post("/api/admin/props/blast-round-launch/test", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const { email, name } = req.body as { email?: string; name?: string };
    if (!email) return res.status(400).json({ ok: false, error: "email is required" });
    try {
      const { sendRoundLaunchBlast } = await import("./email.js");
      await sendRoundLaunchBlast({ to: email, displayName: name || "Friend", userId: "test-preview", picksUrl: "https://www.swayger.app/picks" });
      res.json({ ok: true, sent_to: email });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // POST /api/admin/props/blast-round-launch — send Round 2 re-engagement blast to all users
  app.post("/api/admin/props/blast-round-launch", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    if (BLAST_EMAILS_PAUSED) {
      res.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag in routes-mm-admin.ts and restart." });
      return;
    }
    try {
      const { sendRoundLaunchBlast } = await import("./email.js");
      const supabase = getSupabase();
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      type Profile = { id: string; username: string; display_name: string | null; notification_email: string; email_unsubscribed: boolean };
      const allProfiles = [...((emailProfiles ?? []) as Profile[]), ...((authProfiles ?? []) as Profile[])];
      const seen = new Set<string>();
      const deduped = allProfiles.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
      const eligible = deduped.filter((p) => p.notification_email && !p.email_unsubscribed);

      let sent = 0; let failed = 0;
      for (const user of eligible) {
        try {
          await sendRoundLaunchBlast({
            to: user.notification_email,
            displayName: user.display_name || user.username,
            userId: user.id,
            picksUrl: "https://www.swayger.app/picks",
          });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error(`[round-launch-blast] failed for ${user.notification_email}:`, e);
          failed++;
        }
      }
      console.log(`[round-launch-blast] complete: ${sent} sent, ${failed} failed`);
      res.json({ ok: true, sent, failed, total_eligible: eligible.length });
    } catch (err: unknown) {
      console.error("[round-launch-blast] error:", err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
}
