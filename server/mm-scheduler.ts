import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { sendMMReminderEmail } from "./email";

// ─── State file (persists across restarts) ────────────────────────────────────

const STATE_FILE = path.join(__dirname, "mm-email-state.json");

interface EmailState {
  pre_lock: {
    mar17: boolean;
    mar18: boolean;
    mar19: boolean;
  };
}

function loadState(): EmailState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as EmailState;
    }
  } catch {
    // ignore parse errors
  }
  return { pre_lock: { mar17: false, mar18: false, mar19: false } };
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
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, notification_email");
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

// ─── Schedule windows — all use explicit CDT offset (-05:00) ──────────────────
// Picks lock at 2026-03-19T12:00:00-05:00 (noon CDT)
// Mar 17 9:00am CDT = 2026-03-17T09:00:00-05:00
// Mar 18 9:00am CDT = 2026-03-18T09:00:00-05:00
// Mar 19 8:00am CDT = 2026-03-19T08:00:00-05:00 (4hrs before lock)

interface Window {
  key: keyof EmailState["pre_lock"];
  label: string;
  targetMs: number;
}

const WINDOWS: Window[] = [
  {
    key: "mar17",
    label: "Mar 17 — 2 days to go",
    targetMs: new Date("2026-03-17T09:00:00-05:00").getTime(),
  },
  {
    key: "mar18",
    label: "Mar 18 — 24 hours left",
    targetMs: new Date("2026-03-18T09:00:00-05:00").getTime(),
  },
  {
    key: "mar19",
    label: "Mar 19 — final warning",
    targetMs: new Date("2026-03-19T08:00:00-05:00").getTime(),
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
      await sendReminderBlast(w.label);
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
