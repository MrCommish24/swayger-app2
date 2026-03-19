import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { sendMMReminderEmail, sendLastChanceBlast, sendLeaderboardReminderBlast } from "./email";
import { checkAndAutoScore, getActiveGameWindow } from "./mm-auto-score";
import { sendScoreUpdateBlast } from "./routes-mm-admin";

// ─── State file (persists across restarts) ────────────────────────────────────

const STATE_FILE = path.resolve(process.cwd(), "mm-email-state.json");

interface EmailState {
  pre_lock: {
    mar17: boolean;
    mar18: boolean;
    mar19: boolean;
    mar19_last_chance: boolean;
    mar19_10am_leaderboard: boolean;
  };
  // Morning-after score update emails — one per game day
  score_emails: {
    mar20_morning: boolean; // after Mar 19 games
    mar21_morning: boolean; // after Mar 20 games
    mar22_morning: boolean; // after Mar 21 games
    mar23_morning: boolean; // after Mar 22 games
    mar28_morning: boolean; // after Mar 27 games
    mar29_morning: boolean; // after Mar 28 games
    mar30_morning: boolean; // after Mar 29 games
    mar31_morning: boolean; // after Mar 30 games
    apr05_morning: boolean; // after Apr 4 games
    apr06_morning: boolean; // after Apr 5 games
    apr08_morning: boolean; // after Apr 7 games
  };
  // Timestamp of last Odds API scores poll (ms)
  scores_last_checked_ms: number;
}

function loadState(): EmailState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as EmailState;
      // Backfill any missing keys so old state files still work
      saved.pre_lock.mar19_last_chance ??= false;
      saved.pre_lock.mar19_10am_leaderboard ??= false;
      saved.score_emails ??= {
        mar20_morning: false,
        mar21_morning: false,
        mar22_morning: false,
        mar23_morning: false,
        mar28_morning: false,
        mar29_morning: false,
        mar30_morning: false,
        mar31_morning: false,
        apr05_morning: false,
        apr06_morning: false,
        apr08_morning: false,
      };
      saved.scores_last_checked_ms ??= 0;
      return saved;
    }
  } catch {
    // ignore parse errors — fall through to default
  }
  return {
    pre_lock: {
      mar17: false,
      mar18: false,
      mar19: false,
      mar19_last_chance: false,
      mar19_10am_leaderboard: false,
    },
    score_emails: {
      mar20_morning: false,
      mar21_morning: false,
      mar22_morning: false,
      mar23_morning: false,
      mar28_morning: false,
      mar29_morning: false,
      mar30_morning: false,
      mar31_morning: false,
      apr05_morning: false,
      apr06_morning: false,
      apr08_morning: false,
    },
    scores_last_checked_ms: 0,
  };
}

function saveState(state: EmailState): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("[mm-scheduler] Failed to save state:", e);
  }
}

// ─── Supabase helper ──────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key);
}

// ─── Pre-lock reminder blast (users with no submitted locked takes) ────────────

async function sendReminderBlast(label: string): Promise<void> {
  console.log(`[mm-scheduler] Firing pre-lock reminder blast: ${label}`);
  try {
    const supabase = getSupabase();
    const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
    const { data: takes } = await supabase
      .from("mm_locked_takes")
      .select("user_id")
      .eq("is_submitted", true);
    const usersWithTakes = new Set(
      (takes ?? []).map((t: { user_id: string }) => t.user_id),
    );
    const eligible = (allProfiles ?? []).filter(
      (p: { id: string; notification_email?: string | null }) =>
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
        console.error("[mm-scheduler] Reminder failed for", profile.id, e);
      }
    }
    console.log(`[mm-scheduler] ${label}: sent to ${sent} user(s)`);
  } catch (e) {
    console.error(`[mm-scheduler] Blast error for ${label}:`, e);
  }
}

// ─── Last-chance all-users blast ──────────────────────────────────────────────

async function sendLastChanceBlastAll(label: string): Promise<void> {
  console.log(`[mm-scheduler] Firing last-chance leaderboard blast: ${label}`);
  try {
    const supabase = getSupabase();
    const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
    const eligible = (allProfiles ?? []).filter(
      (p: { notification_email?: string | null }) => p.notification_email,
    );
    let sent = 0;
    for (const profile of eligible) {
      try {
        await sendLastChanceBlast({ to: profile.notification_email as string });
        sent++;
      } catch (e) {
        console.error("[mm-scheduler] Last-chance blast failed for", profile.id, e);
      }
    }
    console.log(`[mm-scheduler] ${label}: sent to ${sent} user(s)`);
  } catch (e) {
    console.error(`[mm-scheduler] Last-chance blast error:`, e);
  }
}

// ─── Leaderboard reminder blast — all users ───────────────────────────────────

async function sendLeaderboardReminderBlastAll(label: string): Promise<void> {
  console.log(`[mm-scheduler] Firing leaderboard reminder blast: ${label}`);
  try {
    const supabase = getSupabase();
    const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
    const eligible = (allProfiles ?? []).filter(
      (p: { notification_email?: string | null }) => p.notification_email,
    );
    let sent = 0;
    for (const profile of eligible) {
      try {
        await sendLeaderboardReminderBlast({ to: profile.notification_email as string });
        sent++;
      } catch (e) {
        console.error("[mm-scheduler] Leaderboard reminder failed for", profile.id, e);
      }
    }
    console.log(`[mm-scheduler] ${label}: sent to ${sent} user(s)`);
  } catch (e) {
    console.error(`[mm-scheduler] Leaderboard reminder blast error:`, e);
  }
}

// ─── Morning score update email blast ─────────────────────────────────────────

async function sendMorningScoreBlast(label: string): Promise<void> {
  console.log(`[mm-scheduler] Firing morning score update blast: ${label}`);
  try {
    const supabase = getSupabase();
    await sendScoreUpdateBlast(supabase);
    console.log(`[mm-scheduler] ${label}: morning score blast complete`);
  } catch (e) {
    console.error(`[mm-scheduler] Morning score blast error for ${label}:`, e);
  }
}

// ─── Pre-lock schedule windows ────────────────────────────────────────────────

interface PreLockWindow {
  key: keyof EmailState["pre_lock"];
  label: string;
  targetMs: number;
  type: "reminder" | "last_chance" | "leaderboard_reminder";
}

const PRE_LOCK_WINDOWS: PreLockWindow[] = [
  {
    key: "mar17",
    label: "Mar 17 — 2 days to go",
    targetMs: new Date("2026-03-17T09:00:00-05:00").getTime(),
    type: "reminder",
  },
  {
    key: "mar18",
    label: "Mar 18 — 24 hours left",
    targetMs: new Date("2026-03-18T09:00:00-05:00").getTime(),
    type: "reminder",
  },
  {
    key: "mar19",
    label: "Mar 19 — 3 hours to lock (reminder)",
    targetMs: new Date("2026-03-19T08:00:00-05:00").getTime(),
    type: "reminder",
  },
  {
    key: "mar19_last_chance",
    label: "Mar 19 — 2 hours to lock (last-chance blast)",
    targetMs: new Date("2026-03-19T09:00:00-05:00").getTime(),
    type: "last_chance",
  },
  {
    key: "mar19_10am_leaderboard",
    label: "Mar 19 — 10am (leaderboard reminder — all users)",
    targetMs: new Date("2026-03-19T10:00:00-05:00").getTime(),
    type: "leaderboard_reminder",
  },
];

// ─── Morning-after score email windows (8am CDT = 13:00 UTC) ─────────────────

interface MorningEmailWindow {
  key: keyof EmailState["score_emails"];
  label: string;
  targetMs: number;
}

const MORNING_EMAIL_WINDOWS: MorningEmailWindow[] = [
  { key: "mar20_morning", label: "Mar 20 — morning scores (after R64 Day 1)", targetMs: new Date("2026-03-20T13:00:00Z").getTime() },
  { key: "mar21_morning", label: "Mar 21 — morning scores (after R64 Day 2)", targetMs: new Date("2026-03-21T13:00:00Z").getTime() },
  { key: "mar22_morning", label: "Mar 22 — morning scores (after R32 Day 1)", targetMs: new Date("2026-03-22T13:00:00Z").getTime() },
  { key: "mar23_morning", label: "Mar 23 — morning scores (after R32 Day 2)", targetMs: new Date("2026-03-23T13:00:00Z").getTime() },
  { key: "mar28_morning", label: "Mar 28 — morning scores (after S16 Day 1)", targetMs: new Date("2026-03-28T13:00:00Z").getTime() },
  { key: "mar29_morning", label: "Mar 29 — morning scores (after S16 Day 2)", targetMs: new Date("2026-03-29T13:00:00Z").getTime() },
  { key: "mar30_morning", label: "Mar 30 — morning scores (after E8 Day 1)",  targetMs: new Date("2026-03-30T13:00:00Z").getTime() },
  { key: "mar31_morning", label: "Mar 31 — morning scores (after E8 Day 2)",  targetMs: new Date("2026-03-31T13:00:00Z").getTime() },
  { key: "apr05_morning", label: "Apr 5  — morning scores (after FF Day 1)",  targetMs: new Date("2026-04-05T13:00:00Z").getTime() },
  { key: "apr06_morning", label: "Apr 6  — morning scores (after FF Day 2)",  targetMs: new Date("2026-04-06T13:00:00Z").getTime() },
  { key: "apr08_morning", label: "Apr 8  — morning scores (after Championship)", targetMs: new Date("2026-04-08T13:00:00Z").getTime() },
];

const FIRE_WINDOW_MS    = 30 * 60 * 1000; // 30-min fire window per blast
const POLL_INTERVAL_MS  = 20 * 60 * 1000; // poll Odds API every 20 min during game windows

// ─── Scheduler tick ───────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  const state = loadState();
  const now = Date.now();

  // ── 1. Pre-lock reminder emails ──────────────────────────────────────────
  for (const w of PRE_LOCK_WINDOWS) {
    if (state.pre_lock[w.key]) continue;
    const elapsed = now - w.targetMs;
    if (elapsed >= 0 && elapsed < FIRE_WINDOW_MS) {
      if (w.type === "last_chance") {
        await sendLastChanceBlastAll(w.label);
      } else if (w.type === "leaderboard_reminder") {
        await sendLeaderboardReminderBlastAll(w.label);
      } else {
        await sendReminderBlast(w.label);
      }
      state.pre_lock[w.key] = true;
      saveState(state);
    }
  }

  // ── 2. Morning-after score update emails ─────────────────────────────────
  for (const w of MORNING_EMAIL_WINDOWS) {
    if (state.score_emails[w.key]) continue;
    const elapsed = now - w.targetMs;
    if (elapsed >= 0 && elapsed < FIRE_WINDOW_MS) {
      await sendMorningScoreBlast(w.label);
      state.score_emails[w.key] = true;
      saveState(state);
    }
  }

  // ── 3. Real-time score polling during active game windows ─────────────────
  const activeWindow = getActiveGameWindow();
  if (activeWindow) {
    const msSinceLastCheck = now - (state.scores_last_checked_ms ?? 0);
    if (msSinceLastCheck >= POLL_INTERVAL_MS) {
      console.log(`[mm-scheduler] Polling scores for ${activeWindow.roundId}...`);
      state.scores_last_checked_ms = now;
      saveState(state); // save before async call so concurrent ticks don't double-poll
      try {
        const result = await checkAndAutoScore();
        if (result.skipped) {
          console.log(`[mm-scheduler] Auto-score skipped: ${result.skipped}`);
        } else {
          console.log(`[mm-scheduler] Auto-score: ${result.newResults} new result(s), ${result.scored} user(s) updated`);
        }
      } catch (e) {
        console.error("[mm-scheduler] Auto-score error:", e);
      }
    }
  }
}

// ─── Public: start the scheduler ─────────────────────────────────────────────

export function startMMScheduler(): void {
  console.log("[mm-scheduler] Starting scheduler (pre-lock emails + auto-scoring + morning blasts)");
  tick().catch((e) => console.error("[mm-scheduler] tick error:", e));
  setInterval(() => {
    tick().catch((e) => console.error("[mm-scheduler] tick error:", e));
  }, 15 * 60 * 1000); // tick every 15 minutes
}
