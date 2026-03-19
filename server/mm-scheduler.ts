import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { sendMMReminderEmail, sendLastChanceBlast, sendLeaderboardReminderBlast } from "./email";

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
}

function loadState(): EmailState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as EmailState;
      // Backfill any missing keys so old state files still work
      saved.pre_lock.mar19_last_chance ??= false;
      saved.pre_lock.mar19_10am_leaderboard ??= false;
      return saved;
    }
  } catch {
    // ignore parse errors
  }
  return { pre_lock: { mar17: false, mar18: false, mar19: false, mar19_last_chance: false, mar19_10am_leaderboard: false } };
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

// ─── Blast logic (users with no submitted locked takes) ───────────────────────

async function sendReminderBlast(label: string): Promise<void> {
  console.log(`[mm-scheduler] Firing pre-lock reminder blast: ${label}`);
  try {
    const supabase = getSupabase();
    // Use SECURITY DEFINER RPC to bypass RLS on profiles table
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

// ─── Last-chance all-users blast ─────────────────────────────────────────────

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

// ─── Schedule windows — all use explicit CDT offset (-05:00) ──────────────────
// Picks lock at 2026-03-19T11:00:00-05:00 (11am CDT)
// Mar 17 9:00am CDT = 2026-03-17T09:00:00-05:00
// Mar 18 9:00am CDT = 2026-03-18T09:00:00-05:00
// Mar 19 8:00am CDT = 2026-03-19T08:00:00-05:00 (reminder — users without picks)
// Mar 19 9:00am CDT = 2026-03-19T09:00:00-05:00 (last-chance blast — all users)

interface ScheduleWindow {
  key: keyof EmailState["pre_lock"];
  label: string;
  targetMs: number;
  type: "reminder" | "last_chance" | "leaderboard_reminder";
}

const WINDOWS: ScheduleWindow[] = [
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

const FIRE_WINDOW_MS = 30 * 60 * 1000; // fire if within 30 min after target

// ─── Scheduler tick ───────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  const state = loadState();
  const now = Date.now();

  for (const w of WINDOWS) {
    if (state.pre_lock[w.key]) continue; // already sent
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
}

// ─── Public: start the scheduler ─────────────────────────────────────────────

export function startMMScheduler(): void {
  console.log("[mm-scheduler] Starting pre-lock reminder scheduler");
  tick().catch((e) => console.error("[mm-scheduler] tick error:", e));
  setInterval(() => {
    tick().catch((e) => console.error("[mm-scheduler] tick error:", e));
  }, 15 * 60 * 1000); // every 15 minutes
}
