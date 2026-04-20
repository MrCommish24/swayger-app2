import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

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

async function fetchEventFromSGO(eventID: string): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.SPORTS_GAME_ODDS_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://api.sportsgameodds.com/v2/events/${eventID}`;
    const res = await fetch(url, { headers: { "X-Api-Key": apiKey } });
    if (!res.ok) return null;
    const data = await res.json() as { success: boolean; data: Record<string, unknown> };
    return data.success ? data.data : null;
  } catch {
    return null;
  }
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

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", userIds);

      const profileMap: Record<string, { username: string; display_name: string }> = {};
      for (const p of (profiles ?? [])) {
        profileMap[p.id] = { username: p.username, display_name: p.display_name };
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

      // Group props by event_id to minimize API calls
      const eventIds = [...new Set(props.map((p) => p.event_id))];
      const eventMap: Record<string, Record<string, unknown>> = {};

      for (const eventId of eventIds) {
        const event = await fetchEventFromSGO(eventId);
        if (event) eventMap[eventId] = event;
      }

      // Resolve each prop
      const resolvedProps: PropDef[] = props.map((prop) => {
        if (prop.status === "voided") return prop;

        const event = eventMap[prop.event_id];
        if (!event) return prop;

        const results = event.results as Record<string, Record<string, number>> | undefined;
        if (!results) return prop;

        const playerStats = results.game?.[prop.player_id as keyof typeof results.game];
        if (playerStats === undefined || playerStats === null) {
          // Player didn't play — void it
          return { ...prop, status: "voided" as const };
        }

        const actualScore = Number(playerStats);
        const result: "over" | "under" = actualScore > prop.line ? "over" : "under";
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
