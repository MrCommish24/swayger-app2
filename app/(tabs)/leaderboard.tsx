import {
  StyleSheet, Text, View, Platform, FlatList,
  ActivityIndicator, ScrollView, Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/helpers";
import { categoryIcon, fetchAllBalances } from "@/lib/swayger";
import { Analytics } from "@/lib/posthog";
import Colors from "@/constants/colors";

interface SettledRow {
  id: string;
  creator_id: string;
  opponent_id: string | null;
  settled_outcome: string;
  stake_units: number;
  category: string;
  title: string;
  updated_at: string;
}

interface ProfileInfo {
  username: string;
  display_name: string | null;
}

interface AllSettledData {
  rows: SettledRow[];
  profileMap: Map<string, ProfileInfo>;
}

interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string | null;
  wins: number;
  losses: number;
  draws: number;
  totalUnitsWon: number;
  totalUnitsLost: number;
  swaygerPoints: number;
  winPct: number;
  currentStreak: number;
}

async function fetchAllSettled(): Promise<AllSettledData> {
  // Use SECURITY DEFINER RPC to bypass per-user RLS on swaygers table.
  // Direct query returns only rows where caller is creator/opponent,
  // giving each viewer a different slice and incorrect global leaderboard stats.
  const { data: settled, error } = await supabase.rpc("get_all_settled_swaygers");

  if (error) {
    console.error("[leaderboard] fetch error:", error.message);
    return { rows: [], profileMap: new Map() };
  }
  if (!settled || settled.length === 0) return { rows: [], profileMap: new Map() };

  const userIds = new Set<string>();
  settled.forEach((s: SettledRow) => {
    if (s.creator_id) userIds.add(s.creator_id);
    if (s.opponent_id) userIds.add(s.opponent_id);
  });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .in("id", Array.from(userIds));

  const profileMap = new Map<string, ProfileInfo>();
  (profiles || []).forEach((p) =>
    profileMap.set(p.id, { username: p.username, display_name: p.display_name })
  );

  return { rows: settled as SettledRow[], profileMap };
}

function computeCurrentStreak(userId: string, rows: SettledRow[]): number {
  // Sort this user's decided games newest-first, then walk until the streak breaks
  const userRows = rows
    .filter((s) => {
      if (s.settled_outcome !== "creator" && s.settled_outcome !== "opponent") return false;
      return s.creator_id === userId || s.opponent_id === userId;
    })
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  let streak = 0;
  for (const s of userRows) {
    const won =
      (s.settled_outcome === "creator" && s.creator_id === userId) ||
      (s.settled_outcome === "opponent" && s.opponent_id === userId);
    if (won) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function computeLeaderboard(
  rows: SettledRow[],
  profileMap: Map<string, ProfileInfo>,
  balanceMap: Map<string, number>
): LeaderboardEntry[] {
  const statsMap = new Map<string, LeaderboardEntry>();

  function getEntry(userId: string): LeaderboardEntry {
    if (!statsMap.has(userId)) {
      const p = profileMap.get(userId);
      statsMap.set(userId, {
        userId,
        username: p?.username || "unknown",
        displayName: p?.display_name || null,
        wins: 0, losses: 0, draws: 0,
        totalUnitsWon: 0, totalUnitsLost: 0,
        swaygerPoints: balanceMap.get(userId) ?? 0,
        winPct: 0,
        currentStreak: 0,
      });
    }
    return statsMap.get(userId)!;
  }

  rows.forEach((s) => {
    const stake = s.stake_units || 1;
    const creator = s.creator_id ? getEntry(s.creator_id) : null;
    const opponent = s.opponent_id ? getEntry(s.opponent_id) : null;

    switch (s.settled_outcome) {
      case "creator":
        if (creator) { creator.wins++; creator.totalUnitsWon += stake; }
        if (opponent) { opponent.losses++; opponent.totalUnitsLost += stake; }
        break;
      case "opponent":
        if (opponent) { opponent.wins++; opponent.totalUnitsWon += stake; }
        if (creator) { creator.losses++; creator.totalUnitsLost += stake; }
        break;
      case "draw":
        if (creator) creator.draws++;
        if (opponent) opponent.draws++;
        break;
    }
  });

  statsMap.forEach((entry, userId) => {
    entry.currentStreak = computeCurrentStreak(userId, rows);
    // Update balance in case it wasn't populated via getEntry (edge case)
    if (!entry.swaygerPoints && balanceMap.has(userId)) {
      entry.swaygerPoints = balanceMap.get(userId) ?? 0;
    }
  });

  return Array.from(statsMap.values())
    .map((e) => {
      const decided = e.wins + e.losses;
      return { ...e, winPct: decided > 0 ? Math.round((e.wins / decided) * 100) : 0 };
    })
    .sort((a, b) => {
      // Primary: bank balance (highest first)
      if (b.swaygerPoints !== a.swaygerPoints) return b.swaygerPoints - a.swaygerPoints;
      // Secondary: W-L record
      const aNet = a.wins - a.losses;
      const bNet = b.wins - b.losses;
      if (bNet !== aNet) return bNet - aNet;
      if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
      return b.winPct - a.winPct;
    });
}

function MedalIcon({ rank }: { rank: number }) {
  if (rank === 0) return <Text style={styles.medal}>🥇</Text>;
  if (rank === 1) return <Text style={styles.medal}>🥈</Text>;
  if (rank === 2) return <Text style={styles.medal}>🥉</Text>;
  return <Text style={styles.rankNum}>{rank + 1}</Text>;
}

function CategoryPills({
  categories,
  selected,
  onSelect,
}: {
  categories: string[];
  selected: string;
  onSelect: (cat: string) => void;
}) {
  return (
    <View style={styles.pillsScroll}>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pillsContent}
    >
      {["All", ...categories].map((cat) => {
        const isSelected = cat === selected;
        const icon = cat === "All" ? "trophy-outline" : categoryIcon(cat);
        return (
          <Pressable
            key={cat}
            style={[styles.pill, isSelected && styles.pillSelected]}
            onPress={() => onSelect(cat)}
          >
            <Ionicons
              name={icon as keyof typeof Ionicons.glyphMap}
              size={13}
              color={isSelected ? "#FFFFFF" : Colors.dark.textSecondary}
            />
            <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
              {cat}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
    </View>
  );
}

interface RecentSectionProps { rows: SettledRow[]; profileMap: Map<string, ProfileInfo> }
function RecentSection({ rows, profileMap }: RecentSectionProps) {
  const items = rows.slice(0, 5);
  if (items.length === 0) return null;

  return (
    <View style={styles.recentSection}>
      <Text style={styles.recentHeader}>Recent Settled</Text>
      {items.map((s) => {
        const isDraw = s.settled_outcome === "draw";
        const isNoContest = s.settled_outcome === "no_contest";
        const creatorUsername = profileMap.get(s.creator_id)?.username || "unknown";
        const opponentUsername = s.opponent_id ? (profileMap.get(s.opponent_id)?.username || "unknown") : null;
        const winnerUsername = s.settled_outcome === "opponent"
          ? (opponentUsername || creatorUsername)
          : creatorUsername;
        const loserUsername = s.settled_outcome === "opponent"
          ? creatorUsername
          : opponentUsername;

        return (
          <View key={s.id} style={styles.recentRow}>
            <View style={styles.recentLeft}>
              <Text style={styles.recentTitle} numberOfLines={1}>{s.title}</Text>
              <Text style={styles.recentMeta}>
                {isDraw
                  ? "Draw"
                  : isNoContest
                  ? "No Contest"
                  : (
                    <>
                      <Text style={styles.recentWinner}>@{winnerUsername}</Text>
                      {loserUsername ? ` beat @${loserUsername}` : ""}
                    </>
                  )
                }
              </Text>
            </View>
            <View style={styles.recentRight}>
              {!isDraw && !isNoContest && (
                <Text style={styles.recentUnits}>
                  {s.stake_units === 10
                    ? "Gut Feeling"
                    : s.stake_units === 25
                    ? "Pretty Sure"
                    : s.stake_units === 50
                    ? "No Doubt"
                    : `${s.stake_units} SP`}
                </Text>
              )}
              <Text style={styles.recentDate}>{formatDate(s.updated_at)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function MyStandingCard({
  entries,
  userId,
  balanceMap,
  onPress,
}: {
  entries: LeaderboardEntry[];
  userId: string | undefined;
  balanceMap: Map<string, number>;
  onPress: () => void;
}) {
  const rankIndex = userId ? entries.findIndex((e) => e.userId === userId) : -1;
  const entry = rankIndex >= 0 ? entries[rankIndex] : null;
  const rank = rankIndex + 1;
  const sp = userId ? (balanceMap.get(userId) ?? 0) : 0;
  const hasGames = entry && (entry.wins + entry.losses + entry.draws) > 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.myStandingCard, pressed && styles.entryRowPressed]}
      onPress={onPress}
    >
      <View style={styles.myStandingLeft}>
        <View style={styles.myStandingIcon}>
          <Ionicons name="person" size={16} color={Colors.dark.tint} />
        </View>
        <View>
          <Text style={styles.myStandingLabel}>Your Standing</Text>
          {!hasGames ? (
            <Text style={styles.myStandingEmpty}>No games settled yet — your spot is waiting</Text>
          ) : (
            <View style={styles.myStandingStats}>
              <Text style={styles.myStandingRecord}>
                {entry!.wins}–{entry!.losses}{entry!.draws > 0 ? `–${entry!.draws}` : ""}
              </Text>
              {entry!.currentStreak >= 2 && (
                <View style={styles.streakBadge}>
                  <Text style={styles.streakText}>🔥 {entry!.currentStreak}W</Text>
                </View>
              )}
              <Text style={styles.myStandingSP}>{sp.toLocaleString()} SP</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.myStandingRight}>
        {rank > 0 ? (
          <>
            <Text style={styles.myRankNum}>#{rank}</Text>
            {rank > 100 && (
              <Text style={styles.myRankSub}>of {entries.length}</Text>
            )}
          </>
        ) : (
          <Text style={styles.myRankDash}>—</Text>
        )}
        <Ionicons name="chevron-forward" size={14} color={Colors.dark.tabIconDefault} />
      </View>
    </Pressable>
  );
}

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();
  const [selectedCategory, setSelectedCategory] = useState(params.category || "All");

  useFocusEffect(useCallback(() => { Analytics.leaderboardViewed(selectedCategory); }, [selectedCategory]));

  const { data, isLoading } = useQuery<AllSettledData>({
    queryKey: ["leaderboard-all"],
    queryFn: fetchAllSettled,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: balanceMap = new Map<string, number>() } = useQuery<Map<string, number>>({
    queryKey: ["balances-all"],
    queryFn: fetchAllBalances,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const allRows = data?.rows ?? [];
  const profileMap = data?.profileMap ?? new Map();

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    allRows.forEach((r) => { if (r.category) cats.add(r.category); });
    return Array.from(cats).sort();
  }, [allRows]);

  const filteredRows = useMemo(() => {
    if (selectedCategory === "All") return allRows;
    return allRows.filter((r) => r.category === selectedCategory);
  }, [allRows, selectedCategory]);

  const entries = useMemo(
    () => computeLeaderboard(filteredRows, profileMap, balanceMap),
    [filteredRows, profileMap, balanceMap]
  );

  // Cap displayed list at 100 — full entries used for accurate ranking in MyStandingCard
  const displayEntries = useMemo(() => entries.slice(0, 100), [entries]);

  function renderEntry({ item, index }: { item: LeaderboardEntry; index: number }) {
    const decided = item.wins + item.losses;
    const isMe = item.userId === user?.id;

    function handleRowPress() {
      if (isMe) {
        router.push("/h2h");
      } else {
        router.push(`/h2h/${item.userId}`);
      }
    }

    return (
      <Pressable
        style={({ pressed }) => [
          styles.entryRow,
          index === 0 && styles.entryRowFirst,
          isMe && styles.entryRowMe,
          pressed && styles.entryRowPressed,
        ]}
        onPress={handleRowPress}
        testID={`leaderboard-row-${item.username}`}
      >
        <View style={styles.rankCol}>
          <MedalIcon rank={index} />
        </View>
        <View style={styles.userCol}>
          <View style={[styles.entryAvatar, isMe && styles.entryAvatarMe]}>
            <Text style={[styles.entryInitial, isMe && styles.entryInitialMe]}>
              {(item.displayName || item.username).charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.entryInfo}>
            <View style={styles.entryNameRow}>
              <Text style={[styles.entryName, isMe && styles.entryNameMe]} numberOfLines={1}>
                {item.displayName || `@${item.username}`}
              </Text>
              {isMe && (
                <View style={styles.youBadge}>
                  <Text style={styles.youBadgeText}>You</Text>
                </View>
              )}
            </View>
            <Text style={styles.entryUsername}>@{item.username}</Text>
          </View>
        </View>
        <View style={styles.statsCol}>
          <View style={styles.statsTopRow}>
            <Text style={[styles.record, isMe && styles.recordMe]}>
              {item.wins}–{item.losses}{item.draws > 0 ? `–${item.draws}` : ""}
            </Text>
            {item.currentStreak >= 2 && (
              <View style={styles.streakBadge}>
                <Text style={styles.streakText}>🔥 {item.currentStreak}W</Text>
              </View>
            )}
          </View>
          <View style={styles.statsRow}>
            <View style={styles.spPill}>
              <Text style={[styles.spPillText, isMe && styles.spPillTextMe]}>
                {item.swaygerPoints.toLocaleString()} SP
              </Text>
            </View>
            {decided > 0 && (
              <Text style={styles.winPct}>{item.winPct}%</Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  }

  const showEmpty = !isLoading && entries.length === 0;
  const showList = !isLoading && entries.length > 0;

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Leaderboard</Text>
      </View>

      {availableCategories.length > 0 && (
        <CategoryPills
          categories={availableCategories}
          selected={selectedCategory}
          onSelect={(cat) => setSelectedCategory(cat)}
        />
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
        </View>
      ) : showEmpty ? (
        <View style={styles.centered}>
          <Ionicons name="trophy-outline" size={48} color={Colors.dark.tint} />
          <Text style={styles.emptyText}>
            {selectedCategory === "All"
              ? "No settled Swaygers yet."
              : `No settled ${selectedCategory} Swaygers yet.`}
          </Text>
          <Text style={styles.emptySubtext}>Rankings appear after Swaygers are settled.</Text>
        </View>
      ) : showList ? (
        <FlatList
          data={displayEntries}
          keyExtractor={(item) => item.userId}
          renderItem={renderEntry}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!displayEntries.length}
          ListHeaderComponent={
            <>
              <MyStandingCard
                entries={entries}
                userId={user?.id}
                balanceMap={balanceMap}
                onPress={() => router.push("/h2h")}
              />
              <View style={styles.columnHeaders}>
                <View style={styles.rankCol} />
                <Text style={[styles.colLabel, { flex: 1 }]}>Player</Text>
                <Text style={[styles.colLabel, styles.colLabelRight]}>W–L  Swayger Pts  Win%</Text>
              </View>
            </>
          }
          ListFooterComponent={
            <RecentSection rows={filteredRows} profileMap={profileMap} />
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: { paddingHorizontal: 24, paddingVertical: 16 },
  title: { fontFamily: "BarlowCondensed_800ExtraBold", fontSize: 32, color: Colors.dark.text, textTransform: "uppercase" as const, letterSpacing: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyText: { fontSize: 16, color: Colors.dark.textSecondary, textAlign: "center" as const },
  emptySubtext: { fontSize: 14, color: Colors.dark.tabIconDefault, textAlign: "center" as const },

  pillsScroll: { height: 40, marginBottom: 8 },
  pillsContent: { paddingHorizontal: 16, gap: 8, flexDirection: "row" as const, alignItems: "center" as const, height: 40 },
  pill: {
    flexDirection: "row" as const, alignItems: "center" as const, gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  pillSelected: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  pillText: { fontSize: 13, color: Colors.dark.textSecondary, fontWeight: "500" as const },
  pillTextSelected: { color: "#FFFFFF", fontWeight: "600" as const },

  listContent: { paddingHorizontal: 16, paddingTop: 4, gap: 6 },
  columnHeaders: {
    flexDirection: "row" as const, alignItems: "center" as const, paddingHorizontal: 14, paddingBottom: 8,
  },
  colLabel: { fontFamily: "DMSans_500Medium", fontSize: 11, color: Colors.dark.tabIconDefault, textTransform: "uppercase" as const, letterSpacing: 0.8 },
  colLabelRight: { textAlign: "right" as const },

  entryRow: {
    flexDirection: "row" as const, alignItems: "center" as const, backgroundColor: Colors.dark.surface,
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.dark.border,
  },
  entryRowFirst: { borderColor: Colors.dark.accentGold, backgroundColor: "rgba(245, 166, 35, 0.05)" },
  entryRowMe: { borderColor: Colors.dark.tint, backgroundColor: "rgba(99, 102, 241, 0.08)" },
  entryRowPressed: { opacity: 0.7 },
  rankCol: { width: 36, alignItems: "center" as const },
  medal: { fontSize: 20 },
  rankNum: { fontSize: 16, fontWeight: "bold" as const, color: Colors.dark.tabIconDefault },
  userCol: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, gap: 10 },
  entryAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.dark.surfaceLight,
    alignItems: "center" as const, justifyContent: "center" as const,
  },
  entryAvatarMe: { backgroundColor: Colors.dark.accent },
  entryInitial: { fontSize: 16, fontWeight: "600" as const, color: Colors.dark.tint },
  entryInitialMe: { color: "#ffffff" },
  entryInfo: { flex: 1, gap: 2 },
  entryNameRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
  entryName: { fontFamily: "DMSans_500Medium", fontSize: 15, color: Colors.dark.text },
  entryNameMe: { color: Colors.dark.tint },
  youBadge: {
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  youBadgeText: { fontSize: 10, fontWeight: "700" as const, color: Colors.dark.tint },
  entryUsername: { fontSize: 11, color: Colors.dark.tabIconDefault },
  statsCol: { alignItems: "flex-end" as const, gap: 3 },
  record: { fontFamily: "BarlowCondensed_800ExtraBold", fontSize: 17, color: Colors.dark.text },
  recordMe: { color: Colors.dark.tint },
  statsTopRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, marginBottom: 2 },
  streakBadge: {
    backgroundColor: "rgba(251, 146, 60, 0.15)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  streakText: { fontSize: 11, fontWeight: "700" as const, color: "#FB923C" },
  statsRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  spPill: {
    backgroundColor: `${Colors.dark.accentGold}18`,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  spPillText: { fontSize: 12, fontWeight: "700" as const, color: Colors.dark.accentGold },
  spPillTextMe: { color: Colors.dark.tint },
  winPct: { fontSize: 12, color: Colors.dark.tabIconDefault, fontWeight: "500" as const },

  myStandingCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    borderWidth: 1.5,
    borderColor: Colors.dark.tint,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  myStandingLeft: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  myStandingIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  myStandingLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 11,
    color: Colors.dark.tint,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  myStandingEmpty: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
  },
  myStandingStats: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  myStandingRecord: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 17,
    color: Colors.dark.text,
  },
  myStandingSP: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.dark.accentGold,
  },
  myStandingRight: {
    alignItems: "flex-end" as const,
    gap: 2,
  },
  myRankNum: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 22,
    color: Colors.dark.tint,
  },
  myRankSub: {
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
  },
  myRankDash: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: Colors.dark.tabIconDefault,
  },
  recentSection: {
    marginTop: 24, paddingTop: 20,
    borderTopWidth: 1, borderTopColor: Colors.dark.border, gap: 8,
  },
  recentHeader: {
    fontFamily: "DMSans_500Medium",
    fontSize: 11, color: Colors.dark.tabIconDefault,
    textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 4,
  },
  recentRow: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const,
    backgroundColor: Colors.dark.surface, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.dark.border, gap: 12,
  },
  recentLeft: { flex: 1, gap: 3 },
  recentTitle: { fontSize: 14, fontWeight: "600" as const, color: Colors.dark.text },
  recentMeta: { fontSize: 12, color: Colors.dark.textSecondary },
  recentWinner: { color: "#22C55E", fontWeight: "600" as const },
  recentRight: { alignItems: "flex-end" as const, gap: 2 },
  recentUnits: { fontSize: 13, fontWeight: "700" as const, color: "#22C55E" },
  recentDate: { fontSize: 11, color: Colors.dark.tabIconDefault },
});
