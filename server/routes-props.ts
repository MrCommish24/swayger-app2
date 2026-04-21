import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { BLAST_EMAILS_PAUSED } from "./routes-mm-admin.js";

// ─── Supabase client ─────────────────────────────────────────

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
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

  // GET /api/props/leaderboard — season-long prop points leaderboard
  app.get("/api/props/leaderboard", async (_req: Request, res: Response) => {
    try {
      const supabase = getSupabase();

      const { data: picks, error } = await supabase
        .from("prop_user_picks")
        .select("user_id, score, correct_count");

      if (error) throw error;

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
      if (userIds.length === 0) return res.json({ ok: true, leaderboard: [] });

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
        .sort((a, b) => b.total_score - a.total_score)
        .slice(0, 50);

      res.json({ ok: true, leaderboard });
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

      // ── Auto-propose settlement for active Picks Challenge swaygers tied to this night ──
      try {
        const { data: challengeSwaygers } = await supabase
          .from("swaygers")
          .select("id, creator_id, opponent_id, status")
          .eq("status", "active")
          .ilike("description", `%[night:${nightId}]%`);

        for (const sw of (challengeSwaygers ?? []) as Array<{ id: string; creator_id: string; opponent_id: string | null; status: string }>) {
          if (!sw.opponent_id) continue;

          // Look up each user's correct_count for this night
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
          if (creatorScore === null || oppScore === null) {
            outcome = "no_contest";
          } else if (creatorScore > oppScore) {
            outcome = "creator";
          } else if (oppScore > creatorScore) {
            outcome = "opponent";
          } else {
            outcome = "draw";
          }

          const proposedBy = outcome === "creator" ? sw.creator_id
            : outcome === "opponent" ? sw.opponent_id
            : sw.creator_id;

          // Attempt direct writes — may be blocked by RLS in which case we log and skip
          const { error: insertErr } = await supabase
            .from("settlement_proposals")
            .insert({
              swayger_id: sw.id,
              proposed_by: proposedBy,
              outcome,
              creator_confirmed: proposedBy === sw.creator_id,
              opponent_confirmed: proposedBy === sw.opponent_id,
            });

          if (insertErr) {
            console.warn(`[props] auto-settle: could not insert proposal for swayger ${sw.id}:`, insertErr.message);
            continue;
          }

          await supabase
            .from("swaygers")
            .update({ status: "settlement_proposed" })
            .eq("id", sw.id);

          console.log(`[props] auto-settled picks challenge swayger ${sw.id}: ${outcome} (${creatorScore ?? "?"}–${oppScore ?? "?"})`);
        }
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

      // Auto-propose settlements for active Picks Challenge swaygers tied to this night
      try {
        const { data: challengeSwaygers } = await supabase
          .from("swaygers")
          .select("id, creator_id, opponent_id, status")
          .eq("status", "active")
          .ilike("description", `%[night:${nightId}]%`);

        for (const sw of (challengeSwaygers ?? []) as Array<{ id: string; creator_id: string; opponent_id: string | null; status: string }>) {
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

          const proposedBy = outcome === "creator" ? sw.creator_id
            : outcome === "opponent" ? sw.opponent_id
            : sw.creator_id;

          const { error: insertErr } = await supabase
            .from("settlement_proposals")
            .insert({
              swayger_id: sw.id,
              proposed_by: proposedBy,
              outcome,
              creator_confirmed: proposedBy === sw.creator_id,
              opponent_confirmed: proposedBy === sw.opponent_id,
            });

          if (insertErr) {
            console.warn(`[props] manual auto-settle: could not insert proposal for swayger ${sw.id}:`, insertErr.message);
            continue;
          }

          await supabase
            .from("swaygers")
            .update({ status: "settlement_proposed" })
            .eq("id", sw.id);

          console.log(`[props] manual-resolve auto-settled picks challenge ${sw.id}: ${outcome} (${creatorScore ?? "?"}–${oppScore ?? "?"})`);
        }
      } catch (autoErr) {
        console.error("[props] manual-resolve auto-settle error:", autoErr);
      }

      res.json({ ok: true, resolvedProps, picksScored: (userPicks ?? []).length });
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
}
