import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  sendMMReminderEmail,
  sendLastChanceBlast,
  sendLeaderboardReminderBlast,
  sendSecondShotEmail,
  sendQuickPickReminderEmail,
} from "./email";
import { checkAndAutoScore, getActiveGameWindow } from "./mm-auto-score";
import { sendScoreUpdateBlast, SCORE_EMAILS_PAUSED } from "./routes-mm-admin";

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
    mar20_morning: boolean;
    mar21_morning: boolean;
    mar22_morning: boolean;
    mar23_morning: boolean;
    mar28_morning: boolean;
    mar29_morning: boolean;
    mar30_morning: boolean;
    mar31_morning: boolean;
    apr05_morning: boolean;
    apr06_morning: boolean;
    apr08_morning: boolean;
  };
  // Second-shot email — users who missed R64 bracket picks
  second_shot: {
    mar21: boolean;
  };
  // Per-round quick pick reminders
  quick_pick_reminders: {
    s16_mar25: boolean;
    s16_mar27_last_chance: boolean;
    e8_mar27: boolean;
    e8_mar28_last_chance: boolean;
    ff_apr03: boolean;
    ff_apr04_last_chance: boolean;
    champ_apr05: boolean;
    champ_apr06_last_chance: boolean;
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
      saved.second_shot ??= { mar21: false };
      saved.quick_pick_reminders ??= {
        s16_mar25: false,
        s16_mar27_last_chance: false,
        e8_mar27: false,
        e8_mar28_last_chance: false,
        ff_apr03: false,
        ff_apr04_last_chance: false,
        champ_apr05: false,
        champ_apr06_last_chance: false,
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
    second_shot: {
      mar21: false,
    },
    quick_pick_reminders: {
      s16_mar25: false,
      s16_mar27_last_chance: false,
      e8_mar27: false,
      e8_mar28_last_chance: false,
      ff_apr03: false,
      ff_apr04_last_chance: false,
      champ_apr05: false,
      champ_apr06_last_chance: false,
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

// ─── Second-shot blast (users who never submitted locked takes) ───────────────

async function sendSecondShotBlast(label: string): Promise<void> {
  console.log(`[mm-scheduler] Firing second-shot blast: ${label}`);
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
    // Target: everyone who has NOT submitted locked takes
    const eligible = (allProfiles ?? []).filter(
      (p: { id: string; notification_email?: string | null }) =>
        !usersWithTakes.has(p.id) && p.notification_email,
    );
    let sent = 0;
    for (const profile of eligible) {
      try {
        await sendSecondShotEmail({
          to: profile.notification_email as string,
          displayName: profile.display_name || `@${profile.username}`,
        });
        sent++;
      } catch (e) {
        console.error("[mm-scheduler] Second-shot email failed for", profile.id, e);
      }
    }
    console.log(`[mm-scheduler] ${label}: sent to ${sent} user(s)`);
  } catch (e) {
    console.error(`[mm-scheduler] Second-shot blast error:`, e);
  }
}

// ─── Per-round quick pick reminder blast (all users) ─────────────────────────

async function sendQuickPickReminderBlast(
  label: string,
  roundLabel: string,
  lockDateLabel: string,
  isLastChance: boolean,
): Promise<void> {
  console.log(`[mm-scheduler] Firing quick pick reminder blast: ${label}`);
  try {
    const supabase = getSupabase();
    const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
    const eligible = (allProfiles ?? []).filter(
      (p: { notification_email?: string | null }) => p.notification_email,
    );
    let sent = 0;
    for (const profile of eligible) {
      try {
        await sendQuickPickReminderEmail({
          to: profile.notification_email as string,
          displayName: profile.display_name || `@${profile.username}`,
          roundLabel,
          lockDateLabel,
          isLastChance,
        });
        sent++;
      } catch (e) {
        console.error("[mm-scheduler] Quick pick reminder failed for", profile.id, e);
      }
    }
    console.log(`[mm-scheduler] ${label}: sent to ${sent} user(s)`);
  } catch (e) {
    console.error(`[mm-scheduler] Quick pick reminder blast error:`, e);
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

// ─── Second-shot email window ─────────────────────────────────────────────────
// Target: 9am CDT on March 21 — before the first R32 game at 11:10am CDT.
const SECOND_SHOT_TARGET_MS = new Date("2026-03-21T09:00:00-05:00").getTime();

// ─── Per-round quick pick reminder windows ────────────────────────────────────

interface QuickPickWindow {
  key: keyof EmailState["quick_pick_reminders"];
  label: string;
  roundLabel: string;
  lockDateLabel: string;
  targetMs: number;
  isLastChance: boolean;
}

const QUICK_PICK_WINDOWS: QuickPickWindow[] = [
  // Sweet 16 — games Mar 26-27, picks lock Mar 27 noon CDT
  {
    key: "s16_mar25",
    label: "Mar 25 — Sweet 16 picks open reminder",
    roundLabel: "Sweet 16",
    lockDateLabel: "noon CDT on Friday Mar 27",
    targetMs: new Date("2026-03-25T09:00:00-05:00").getTime(),
    isLastChance: false,
  },
  {
    key: "s16_mar27_last_chance",
    label: "Mar 27 — Sweet 16 picks last chance",
    roundLabel: "Sweet 16",
    lockDateLabel: "noon CDT today",
    targetMs: new Date("2026-03-27T08:00:00-05:00").getTime(),
    isLastChance: true,
  },
  // Elite 8 — games Mar 28-29, picks lock Mar 28 noon CDT
  {
    key: "e8_mar27",
    label: "Mar 27 — Elite 8 picks open reminder",
    roundLabel: "Elite 8",
    lockDateLabel: "noon CDT on Saturday Mar 28",
    targetMs: new Date("2026-03-27T14:00:00-05:00").getTime(),
    isLastChance: false,
  },
  {
    key: "e8_mar28_last_chance",
    label: "Mar 28 — Elite 8 picks last chance",
    roundLabel: "Elite 8",
    lockDateLabel: "noon CDT today",
    targetMs: new Date("2026-03-28T09:00:00-05:00").getTime(),
    isLastChance: true,
  },
  // Final Four — games Apr 4, picks lock Apr 4 6pm CDT
  {
    key: "ff_apr03",
    label: "Apr 3 — Final Four picks open reminder",
    roundLabel: "Final Four",
    lockDateLabel: "6pm CDT on Saturday Apr 4",
    targetMs: new Date("2026-04-03T09:00:00-05:00").getTime(),
    isLastChance: false,
  },
  {
    key: "ff_apr04_last_chance",
    label: "Apr 4 — Final Four picks last chance",
    roundLabel: "Final Four",
    lockDateLabel: "6pm CDT today",
    targetMs: new Date("2026-04-04T14:00:00-05:00").getTime(),
    isLastChance: true,
  },
  // Championship — game Apr 6, picks lock Apr 6 8pm CDT
  {
    key: "champ_apr05",
    label: "Apr 5 — Championship picks open reminder",
    roundLabel: "Championship",
    lockDateLabel: "8pm CDT on Monday Apr 6",
    targetMs: new Date("2026-04-05T09:00:00-05:00").getTime(),
    isLastChance: false,
  },
  {
    key: "champ_apr06_last_chance",
    label: "Apr 6 — Championship picks last chance",
    roundLabel: "Championship",
    lockDateLabel: "8pm CDT tonight",
    targetMs: new Date("2026-04-06T16:00:00-05:00").getTime(),
    isLastChance: true,
  },
];

const FIRE_WINDOW_MS   = 30 * 60 * 1000; // 30-min fire window per blast
const POLL_INTERVAL_MS = 20 * 60 * 1000; // poll Odds API every 20 min during game windows

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
      if (SCORE_EMAILS_PAUSED) {
        console.log(`[mm-scheduler] Score emails paused — skipping morning blast: ${w.label}`);
        // Do NOT mark as sent — will fire once SCORE_EMAILS_PAUSED is set to false
      } else {
        await sendMorningScoreBlast(w.label);
        state.score_emails[w.key] = true;
        saveState(state);
      }
    }
  }

  // ── 3. Second-shot email (users with no submitted locked takes) ───────────
  if (!state.second_shot.mar21) {
    const elapsed = now - SECOND_SHOT_TARGET_MS;
    if (elapsed >= 0 && elapsed < FIRE_WINDOW_MS) {
      await sendSecondShotBlast("Mar 21 9am CDT — second shot email");
      state.second_shot.mar21 = true;
      saveState(state);
    }
  }

  // ── 4. Per-round quick pick reminders ─────────────────────────────────────
  for (const w of QUICK_PICK_WINDOWS) {
    if (state.quick_pick_reminders[w.key]) continue;
    const elapsed = now - w.targetMs;
    if (elapsed >= 0 && elapsed < FIRE_WINDOW_MS) {
      await sendQuickPickReminderBlast(w.label, w.roundLabel, w.lockDateLabel, w.isLastChance);
      state.quick_pick_reminders[w.key] = true;
      saveState(state);
    }
  }

  // ── 5. Real-time score polling during active game windows ─────────────────
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
