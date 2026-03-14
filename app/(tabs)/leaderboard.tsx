import {
  StyleSheet, Text, View, Platform, FlatList,
  ActivityIndicator, ScrollView, Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/helpers";
import { categoryIcon } from "@/lib/swayger";
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
  winPct: number;
}

async function fetchAllSettled(): Promise<AllSettledData> {
  const { data: settled, error } = await supabase
    .from("swaygers")
    .select("id, creator_id, opponent_id, settled_outcome, stake_units, category, title, updated_at")
    .eq("status", "settled")
    .not("settled_outcome", "is", null)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[leaderboard] fetch error:", error.message);
    return { rows: [], profileMap: new Map() };
  }
  if (!settled || settled.length === 0) return { rows: [], profileMap: new Map() };

  const userIds = new Set<string>();
  settled.forEach((s) => {
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

function computeLeaderboard(rows: SettledRow[], profileMap: Map<string, ProfileInfo>): LeaderboardEntry[] {
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
        winPct: 0,
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

  return Array.from(statsMap.values())
    .map((e) => {
      const decided = e.wins + e.losses;
      return { ...e, winPct: decided > 0 ? Math.round((e.wins / decided) * 100) : 0 };
    })
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winPct !== a.winPct) return b.winPct - a.winPct;
      return a.losses - b.losses;
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pillsContent}
      style={styles.pillsScroll}
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
  );
}

function RecentSection({ rows, profileMap }: { rows: SettledRow[]; profileMap: Map<string, ProfileInfo> }) {
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
                <Text style={styles.recentUnits}>+{s.stake_units}u</Text>
              )}
              <Text style={styles.recentDate}>{formatDate(s.updated_at)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState("All");

  const { data, isLoading } = useQuery<AllSettledData>({
    queryKey: ["leaderboard-all"],
    queryFn: fetchAllSettled,
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

  const entries = useMemo(() => computeLeaderboard(filteredRows, profileMap), [filteredRows, profileMap]);

  function renderEntry({ item, index }: { item: LeaderboardEntry; index: number }) {
    const netUnits = item.totalUnitsWon - item.totalUnitsLost;
    const netColor = netUnits > 0 ? "#22C55E" : netUnits < 0 ? "#EF4444" : Colors.dark.tabIconDefault;
    const decided = item.wins + item.losses;
    const isMe = item.userId === user?.id;

    return (
      <View style={[
        styles.entryRow,
        index === 0 && styles.entryRowFirst,
        isMe && styles.entryRowMe,
      ]}>
        <View style={styles.rankCol}>
          <MedalIcon rank={index} />
        </View>
        <View style={styles.userCol}>
          <View style={[styles.entryAvatar, isMe && styles.entryAvatarMe]}>
            <Text style={styles.entryInitial}>
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
          <Text style={[styles.record, isMe && styles.recordMe]}>
            {item.wins}–{item.losses}{item.draws > 0 ? `–${item.draws}` : ""}
          </Text>
          <View style={styles.statsRow}>
            <Text style={[styles.netUnits, { color: netColor }]}>
              {netUnits > 0 ? "+" : ""}{netUnits}u
            </Text>
            {decided > 0 && (
              <Text style={styles.winPct}>{item.winPct}%</Text>
            )}
          </View>
        </View>
      </View>
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
          data={entries}
          keyExtractor={(item) => item.userId}
          renderItem={renderEntry}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!entries.length}
          ListHeaderComponent={
            <View style={styles.columnHeaders}>
              <View style={styles.rankCol} />
              <Text style={[styles.colLabel, { flex: 1 }]}>Player</Text>
              <Text style={[styles.colLabel, styles.colLabelRight]}>W–L  Units  Win%</Text>
            </View>
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
  title: { fontSize: 28, fontWeight: "bold" as const, color: Colors.dark.text },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyText: { fontSize: 16, color: Colors.dark.textSecondary, textAlign: "center" as const },
  emptySubtext: { fontSize: 14, color: Colors.dark.tabIconDefault, textAlign: "center" as const },

  pillsScroll: { flexGrow: 0, marginBottom: 8 },
  pillsContent: { paddingHorizontal: 16, gap: 8, flexDirection: "row" as const },
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
  colLabel: { fontSize: 11, fontWeight: "600" as const, color: Colors.dark.tabIconDefault, textTransform: "uppercase" as const, letterSpacing: 0.5 },
  colLabelRight: { textAlign: "right" as const },

  entryRow: {
    flexDirection: "row" as const, alignItems: "center" as const, backgroundColor: Colors.dark.surface,
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.dark.border,
  },
  entryRowFirst: { borderColor: Colors.dark.accentGold, backgroundColor: "rgba(245, 166, 35, 0.05)" },
  entryRowMe: { borderColor: Colors.dark.tint, backgroundColor: "rgba(99, 102, 241, 0.08)" },
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
  entryInfo: { flex: 1, gap: 2 },
  entryNameRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
  entryName: { fontSize: 15, fontWeight: "600" as const, color: Colors.dark.text },
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
  record: { fontSize: 15, fontWeight: "bold" as const, color: Colors.dark.text },
  recordMe: { color: Colors.dark.tint },
  statsRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  netUnits: { fontSize: 12, fontWeight: "600" as const },
  winPct: { fontSize: 12, color: Colors.dark.tabIconDefault, fontWeight: "500" as const },

  recentSection: {
    marginTop: 24, paddingTop: 20,
    borderTopWidth: 1, borderTopColor: Colors.dark.border, gap: 8,
  },
  recentHeader: {
    fontSize: 13, fontWeight: "600" as const, color: Colors.dark.tabIconDefault,
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
