import { supabase } from "@/lib/supabase";
import { FULL_BRACKET } from "@/lib/march-madness";

// ─── Types ──────────────────────────────────────────────────────────────────

export type TakeType = "sweet_sixteen" | "elite_eight" | "final_four" | "champion";

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

export interface UpsetPick {
  id: string;
  user_id: string;
  round_id: string;
  matchup_id: string;
  upset_team: string;
  is_submitted: boolean;
  created_at: string;
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
  updated_at: string;
  username?: string;
  display_name?: string | null;
}

export interface BracketTeam {
  name: string;
  seed: number;
  region: string;
}

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

// ─── Constants ───────────────────────────────────────────────────────────────

export const PICKS_LOCK_DATE = "2026-03-19T12:00:00-05:00";

export const UPSET_LIMITS: Record<string, number> = {
  "round-64": 3,
  "round-32": 2,
  "sweet-16": 1,
  "elite-8": 1,
};

export function isPicksLocked(): boolean {
  return new Date() >= new Date(PICKS_LOCK_DATE);
}

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

export function getUpsetMatchupsForRound(roundId: string): UpsetMatchup[] {
  const result: UpsetMatchup[] = [];
  for (const region of REGION_ORDER) {
    const games = FULL_BRACKET[region] as Array<{
      seed1: number;
      team1: string;
      seed2: number;
      team2: string;
      date?: string;
      site?: string;
    }>;
    for (const g of games) {
      if (g.team1.includes("/") || g.team2.includes("/")) continue;
      const matchupId = `${region}-${g.seed1}v${g.seed2}`;
      result.push({
        matchupId,
        favoriteTeam: g.team1,
        favoriteSeed: g.seed1,
        underdogTeam: g.team2,
        underdogSeed: g.seed2,
        region,
        gameDate: (g as { date?: string }).date,
        site: (g as { site?: string }).site,
      });
    }
  }
  return result.sort(
    (a, b) => a.underdogSeed - a.favoriteSeed - (b.underdogSeed - b.favoriteSeed),
  );
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

// ─── CRUD — Upset Picks ──────────────────────────────────────────────────────

export async function fetchMyUpsetPicks(
  userId: string,
  roundId: string,
): Promise<UpsetPick[]> {
  const { data, error } = await supabase
    .from("mm_upset_picks")
    .select("*")
    .eq("user_id", userId)
    .eq("round_id", roundId);
  if (error) {
    console.error("[mm-picks] fetchMyUpsetPicks:", error.message);
    return [];
  }
  return (data ?? []) as UpsetPick[];
}

export async function toggleUpsetPick(
  userId: string,
  roundId: string,
  matchupId: string,
  upsetTeam: string,
): Promise<{ error: string | null }> {
  if (isPicksLocked()) return { error: "Picks are locked." };

  const { data: existing } = await supabase
    .from("mm_upset_picks")
    .select("id")
    .eq("user_id", userId)
    .eq("round_id", roundId)
    .eq("matchup_id", matchupId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("mm_upset_picks").delete().eq("id", existing.id);
    return { error: error?.message ?? null };
  }

  const { count } = await supabase
    .from("mm_upset_picks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("round_id", roundId);

  const limit = UPSET_LIMITS[roundId] ?? 3;
  if ((count ?? 0) >= limit) {
    return { error: `You can pick at most ${limit} upset${limit !== 1 ? "s" : ""} this round.` };
  }

  const { error } = await supabase.from("mm_upset_picks").insert({
    user_id: userId,
    round_id: roundId,
    matchup_id: matchupId,
    upset_team: upsetTeam,
    is_submitted: true,
  });
  return { error: error?.message ?? null };
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
