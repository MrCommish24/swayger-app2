import { supabase } from "@/lib/supabase";
import { getApiUrl } from "@/lib/query-client";
import { FULL_BRACKET } from "@/lib/march-madness";

// ─── Types ──────────────────────────────────────────────────────────────────

export type TakeType = "sweet_sixteen" | "elite_eight" | "final_four" | "champion";
export type SpecialPickType = "upset" | "blowout" | "high_scorer";

export interface TakeConfig {
  label: string;
  shortLabel: string;
  count: number;
  pointsEach: number;
  emoji: string;
  color: string;
}

export const TAKE_CONFIGS: Record<TakeType, TakeConfig> = {
  sweet_sixteen: {
    label: "Sweet Sixteen",
    shortLabel: "S16",
    count: 16,
    pointsEach: 2,
    emoji: "🏀",
    color: "#3B82F6",
  },
  elite_eight: {
    label: "Elite Eight",
    shortLabel: "E8",
    count: 8,
    pointsEach: 3,
    emoji: "🔥",
    color: "#F97316",
  },
  final_four: {
    label: "Final Four",
    shortLabel: "FF",
    count: 4,
    pointsEach: 5,
    emoji: "⚡",
    color: "#A855F7",
  },
  champion: {
    label: "Champion",
    shortLabel: "Champ",
    count: 1,
    pointsEach: 10,
    emoji: "🏆",
    color: "#F5A623",
  },
};

export const TAKE_ORDER: TakeType[] = [
  "sweet_sixteen",
  "elite_eight",
  "final_four",
  "champion",
];

export interface LockedTake {
  id: string;
  user_id: string;
  take_type: TakeType;
  teams: string[];
  is_submitted: boolean;
  created_at: string;
  updated_at: string;
}

export interface SpecialPick {
  id: string;
  user_id: string;
  round_id: string;
  pick_type: SpecialPickType;
  matchup_id: string;
  picked_team: string | null;
  created_at: string;
}

export interface RankedMatchup {
  matchupId: string;
  teamA: string;
  teamB: string;
  seedA: number;
  seedB: number;
  region: string;
  rank: number;
  // Upset-specific
  underdogTeam?: string;
  underdogSeed?: number;
  favoriteTeam?: string;
  favoriteSeed?: number;
  upsetProbability?: number;
  // Odds data when available
  spread?: number;       // absolute spread (blowout indicator)
  overUnder?: number;    // total points line (high-scorer indicator)
  underdogMoneyline?: number; // positive moneyline (upset indicator)
  gameDate?: string;
  site?: string;
  oddsSource?: "live" | "seed-based";
  keyStat?: string;      // curated reason this is an intriguing pick
}

export interface RoundMatchups {
  roundId: string;
  upset: RankedMatchup[];
  blowout: RankedMatchup[];
  highScorer: RankedMatchup[];
  isLocked: boolean;
  lockedAt: string;
  oddsSource?: "live" | "seed-based";
}

export interface GameResult {
  id: string;
  round_id: string;
  matchup_id: string;
  winner_name: string;
  winner_seed: number;
  loser_name: string;
  loser_seed: number;
  winner_score: number | null;
  loser_score: number | null;
  was_upset: boolean;
  resolved_at: string;
}

export interface PickScore {
  user_id: string;
  total_points: number;
  champion_pts: number;
  final_four_pts: number;
  elite_eight_pts: number;
  sweet_sixteen_pts: number;
  upset_pts: number;
  correct_upsets: number;
  blowout_pts: number;
  high_scorer_pts: number;
  correct_blowouts: number;
  correct_high_scorers: number;
  updated_at: string;
  username?: string;
  display_name?: string | null;
}

export interface BracketTeam {
  name: string;
  seed: number;
  region: string;
}

// Keep for backward compat reference
export interface UpsetMatchup {
  matchupId: string;
  favoriteTeam: string;
  favoriteSeed: number;
  underdogTeam: string;
  underdogSeed: number;
  region: string;
  gameDate?: string;
  site?: string;
}

// ─── Lock Dates ───────────────────────────────────────────────────────────────

// Bracket locked takes lock before the tournament starts
export const BRACKET_LOCK_DATE = "2026-03-19T11:00:00-05:00";

// Per-round lock dates for special picks (upset / blowout / high-scorer)
export const ROUND_LOCK_DATES: Record<string, string> = {
  "first-four":   "2026-03-17T12:00:00-05:00",
  "round-64":     "2026-03-19T11:00:00-05:00",  // 11am CDT, first games tip 11:15am CDT
  "round-32":     "2026-03-21T12:00:00-05:00",  // noon CDT, R32 starts Mar 21
  "sweet-16":     "2026-03-27T12:00:00-05:00",  // noon CDT
  "elite-8":      "2026-03-28T12:00:00-05:00",  // noon CDT
  "final-four":   "2026-04-04T18:00:00-05:00",  // 6 PM CDT, games start ~7 PM CDT
};

// Keep old export for bracket-take lock banners
export const PICKS_LOCK_DATE = BRACKET_LOCK_DATE;

// ─── Email Reminder Schedule ──────────────────────────────────────────────────
// Full cadence of automated emails for the 2026 tournament.
// "audience": who receives the email
//   - "no-picks"   → users with zero submitted locked takes
//   - "all"        → everyone with a notification_email
//   - "has-score"  → users with at least 1 point in mm_pick_scores
// "trigger": how the email fires
//   - "scheduled"  → mm-scheduler.ts fires automatically at triggerAt
//   - "manual"     → POST /admin/mm/api/remind or /admin/mm/api/score-update
//   - "admin"      → must be triggered manually from admin panel / curl

export interface EmailScheduleEntry {
  id: string;
  label: string;
  description: string;
  triggerAt: string;       // ISO date-time (CDT = UTC-5)
  type: "reminder" | "score-update" | "final";
  audience: "no-picks" | "all" | "has-score";
  trigger: "scheduled" | "manual" | "admin";
  status: "sent" | "pending" | "future";
}

export const EMAIL_SCHEDULE: EmailScheduleEntry[] = [
  // ── Pre-lock reminders (bracket picks) ─────────────────────────────────────
  {
    id: "pre-lock-mar17",
    label: "Mar 17 — 2 days to go",
    description: "Remind users to lock their bracket picks before the tournament starts.",
    triggerAt: "2026-03-17T09:00:00-05:00",
    type: "reminder",
    audience: "no-picks",
    trigger: "scheduled",
    status: "sent",
  },
  {
    id: "pre-lock-mar18",
    label: "Mar 18 — 24 hours left",
    description: "Final day reminder — bracket picks lock tomorrow at 11am CDT.",
    triggerAt: "2026-03-18T09:00:00-05:00",
    type: "reminder",
    audience: "no-picks",
    trigger: "scheduled",
    status: "pending",
  },
  {
    id: "pre-lock-mar19",
    label: "Mar 19 — Final warning (4hrs to lock)",
    description: "Last chance — bracket picks lock at 11am CDT today.",
    triggerAt: "2026-03-19T08:00:00-05:00",
    type: "reminder",
    audience: "no-picks",
    trigger: "scheduled",
    status: "pending",
  },

  // ── Round score updates (manual — enter results in admin first) ─────────────
  {
    id: "scores-r64",
    label: "Round of 64 results",
    description: "Score update after Round of 64 results are entered in admin panel.",
    triggerAt: "2026-03-21T12:00:00-05:00",
    type: "score-update",
    audience: "has-score",
    trigger: "admin",
    status: "future",
  },
  {
    id: "scores-r32",
    label: "Round of 32 results",
    description: "Score update after Round of 32 results are entered.",
    triggerAt: "2026-03-23T12:00:00-05:00",
    type: "score-update",
    audience: "has-score",
    trigger: "admin",
    status: "future",
  },
  {
    id: "scores-s16",
    label: "Sweet 16 results",
    description: "Score update after Sweet 16 results are entered.",
    triggerAt: "2026-03-29T12:00:00-05:00",
    type: "score-update",
    audience: "has-score",
    trigger: "admin",
    status: "future",
  },
  {
    id: "scores-e8",
    label: "Elite 8 results",
    description: "Score update after Elite 8 results are entered.",
    triggerAt: "2026-03-30T12:00:00-05:00",
    type: "score-update",
    audience: "has-score",
    trigger: "admin",
    status: "future",
  },
  {
    id: "scores-ff",
    label: "Final Four results",
    description: "Score update after Final Four results are entered.",
    triggerAt: "2026-04-05T20:00:00-05:00",
    type: "score-update",
    audience: "has-score",
    trigger: "admin",
    status: "future",
  },
  {
    id: "scores-championship",
    label: "Championship results + final standings",
    description: "Final score update with winner announced and full leaderboard standings.",
    triggerAt: "2026-04-07T22:00:00-05:00",
    type: "final",
    audience: "has-score",
    trigger: "admin",
    status: "future",
  },
];

export function isPicksLocked(): boolean {
  return new Date() >= new Date(BRACKET_LOCK_DATE);
}

export function isRoundLocked(roundId: string): boolean {
  const lockDate = ROUND_LOCK_DATES[roundId];
  if (!lockDate) return true;
  return new Date() >= new Date(lockDate);
}

export function getRoundLockDate(roundId: string): Date | null {
  const lockDate = ROUND_LOCK_DATES[roundId];
  return lockDate ? new Date(lockDate) : null;
}

// ─── Upset limits per round ───────────────────────────────────────────────────
export const UPSET_LIMITS: Record<string, number> = {
  "round-64":  3,
  "round-32":  3,
  "sweet-16":  2,
  "elite-8":   1,
  "final-four": 1,
};

// How many candidates to show per pick type per round
export const CANDIDATE_COUNTS: Record<string, Record<SpecialPickType, number>> = {
  "round-64":   { upset: 5, blowout: 5, high_scorer: 5 },
  "round-32":   { upset: 5, blowout: 4, high_scorer: 4 },
  "sweet-16":   { upset: 4, blowout: 4, high_scorer: 4 },
  "elite-8":    { upset: 3, blowout: 4, high_scorer: 4 },
  "final-four": { upset: 2, blowout: 2, high_scorer: 2 },
};

// ─── Team Data Helpers ───────────────────────────────────────────────────────

const REGION_ORDER = ["east", "south", "west", "midwest"] as const;
type RegionKey = (typeof REGION_ORDER)[number];

export function getAllBracketTeams(): BracketTeam[] {
  const teams: BracketTeam[] = [];
  for (const region of REGION_ORDER) {
    const matchups = FULL_BRACKET[region] as Array<{
      seed1: number;
      team1: string;
      seed2: number;
      team2: string;
    }>;
    for (const m of matchups) {
      if (!m.team1.includes("/")) teams.push({ name: m.team1, seed: m.seed1, region });
      if (!m.team2.includes("/")) teams.push({ name: m.team2, seed: m.seed2, region });
    }
  }
  for (const ff of FULL_BRACKET.firstFour) {
    const r = ff.region.toLowerCase() as RegionKey;
    teams.push({ name: ff.teamA, seed: ff.slot, region: r });
    teams.push({ name: ff.teamB, seed: ff.slot, region: r });
  }
  return teams.sort((a, b) => {
    const ra = REGION_ORDER.indexOf(a.region as RegionKey);
    const rb = REGION_ORDER.indexOf(b.region as RegionKey);
    return ra !== rb ? ra - rb : a.seed - b.seed;
  });
}

export function getTeamsByRegion(): Record<string, BracketTeam[]> {
  const map: Record<string, BracketTeam[]> = {};
  for (const t of getAllBracketTeams()) {
    if (!map[t.region]) map[t.region] = [];
    map[t.region].push(t);
  }
  return map;
}

// ─── CRUD — Locked Takes ─────────────────────────────────────────────────────

export async function fetchMyLockedTakes(
  userId: string,
): Promise<Partial<Record<TakeType, LockedTake>>> {
  const { data, error } = await supabase
    .from("mm_locked_takes")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    console.error("[mm-picks] fetchMyLockedTakes:", error.message);
    return {};
  }
  const map: Partial<Record<TakeType, LockedTake>> = {};
  for (const row of data ?? []) map[row.take_type as TakeType] = row as LockedTake;
  return map;
}

export async function saveTake(
  userId: string,
  takeType: TakeType,
  teams: string[],
): Promise<{ error: string | null }> {
  if (isPicksLocked()) {
    return { error: "The tournament has started — picks are locked." };
  }
  const expected = TAKE_CONFIGS[takeType].count;
  if (teams.length !== expected) {
    return { error: `Select exactly ${expected} team${expected !== 1 ? "s" : ""}.` };
  }
  const { error } = await supabase
    .from("mm_locked_takes")
    .upsert(
      {
        user_id: userId,
        take_type: takeType,
        teams,
        is_submitted: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,take_type" },
    );
  if (error) {
    console.error("[mm-picks] saveTake:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ─── CRUD — Special Picks (upset / blowout / high_scorer) ────────────────────

export async function fetchMySpecialPicks(
  userId: string,
  roundId: string,
): Promise<SpecialPick[]> {
  const { data, error } = await supabase
    .from("mm_special_picks")
    .select("*")
    .eq("user_id", userId)
    .eq("round_id", roundId);
  if (error) {
    console.error("[mm-picks] fetchMySpecialPicks:", error.message);
    return [];
  }
  return (data ?? []) as SpecialPick[];
}

export async function saveSpecialPick(
  userId: string,
  roundId: string,
  pickType: SpecialPickType,
  matchupId: string,
  pickedTeam: string | null,
): Promise<{ error: string | null }> {
  if (isRoundLocked(roundId)) return { error: "Picks for this round are locked." };

  // For blowout / high_scorer: single pick per round — delete any existing before insert
  if (pickType !== "upset") {
    await supabase
      .from("mm_special_picks")
      .delete()
      .eq("user_id", userId)
      .eq("round_id", roundId)
      .eq("pick_type", pickType);
  } else {
    // Upset: check if already picked (toggle off)
    const { data: existing } = await supabase
      .from("mm_special_picks")
      .select("id")
      .eq("user_id", userId)
      .eq("round_id", roundId)
      .eq("pick_type", "upset")
      .eq("matchup_id", matchupId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("mm_special_picks")
        .delete()
        .eq("id", existing.id);
      return { error: error?.message ?? null };
    }
    // Check upset limit
    const limit = UPSET_LIMITS[roundId] ?? 3;
    const { count } = await supabase
      .from("mm_special_picks")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("round_id", roundId)
      .eq("pick_type", "upset");
    if ((count ?? 0) >= limit) {
      return { error: `You can pick at most ${limit} upset${limit !== 1 ? "s" : ""} this round.` };
    }
  }

  const { error } = await supabase.from("mm_special_picks").insert({
    user_id: userId,
    round_id: roundId,
    pick_type: pickType,
    matchup_id: matchupId,
    picked_team: pickedTeam,
  });
  return { error: error?.message ?? null };
}

// ─── Ranked Matchups (fetched from backend) ──────────────────────────────────

export async function fetchRoundMatchups(roundId: string): Promise<RoundMatchups | null> {
  try {
    const url = new URL(`/api/mm/round-matchups/${roundId}`, getApiUrl());
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return (await res.json()) as RoundMatchups;
  } catch (e) {
    console.error("[mm-picks] fetchRoundMatchups:", e);
    return null;
  }
}

// ─── Game Results ────────────────────────────────────────────────────────────

export async function fetchGameResults(): Promise<GameResult[]> {
  const { data } = await supabase
    .from("mm_game_results")
    .select("*")
    .order("resolved_at", { ascending: false });
  return (data ?? []) as GameResult[];
}

// ─── Picks Leaderboard ───────────────────────────────────────────────────────

export async function fetchPicksLeaderboard(): Promise<PickScore[]> {
  const { data: scores } = await supabase
    .from("mm_pick_scores")
    .select("*")
    .order("total_points", { ascending: false })
    .limit(50);
  if (!scores?.length) return [];

  const userIds = scores.map((s) => s.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  return scores.map((s) => ({
    ...(s as PickScore),
    username: profileMap.get(s.user_id)?.username ?? "—",
    display_name: profileMap.get(s.user_id)?.display_name ?? null,
  }));
}

export async function fetchMyPickScore(userId: string): Promise<PickScore | null> {
  const { data } = await supabase
    .from("mm_pick_scores")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as PickScore) ?? null;
}
