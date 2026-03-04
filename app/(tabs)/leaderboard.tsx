import { StyleSheet, Text, View, Platform, FlatList, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";

interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string | null;
  wins: number;
  losses: number;
  draws: number;
  noContests: number;
  totalUnitsWon: number;
  totalUnitsLost: number;
}

async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data: settled, error } = await supabase
    .from("swaygers")
    .select("id, creator_id, opponent_id, settled_outcome, stake_units")
    .eq("status", "settled")
    .not("settled_outcome", "is", null);

  if (error) {
    console.error("[leaderboard] fetch error:", error.message);
    return [];
  }
  if (!settled || settled.length === 0) return [];

  const userIds = new Set<string>();
  settled.forEach((s) => {
    if (s.creator_id) userIds.add(s.creator_id);
    if (s.opponent_id) userIds.add(s.opponent_id);
  });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .in("id", Array.from(userIds));

  const profileMap = new Map<string, { username: string; display_name: string | null }>();
  (profiles || []).forEach((p) => profileMap.set(p.id, { username: p.username, display_name: p.display_name }));

  const statsMap = new Map<string, LeaderboardEntry>();

  function getEntry(userId: string): LeaderboardEntry {
    if (!statsMap.has(userId)) {
      const p = profileMap.get(userId);
      statsMap.set(userId, {
        userId,
        username: p?.username || "unknown",
        displayName: p?.display_name || null,
        wins: 0, losses: 0, draws: 0, noContests: 0,
        totalUnitsWon: 0, totalUnitsLost: 0,
      });
    }
    return statsMap.get(userId)!;
  }

  settled.forEach((s) => {
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
      case "no_contest":
        if (creator) creator.noContests++;
        if (opponent) opponent.noContests++;
        break;
    }
  });

  return Array.from(statsMap.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.losses - b.losses;
  });
}

function MedalIcon({ rank }: { rank: number }) {
  if (rank === 0) return <Text style={styles.medal}>🥇</Text>;
  if (rank === 1) return <Text style={styles.medal}>🥈</Text>;
  if (rank === 2) return <Text style={styles.medal}>🥉</Text>;
  return <Text style={styles.rankNum}>{rank + 1}</Text>;
}

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { data: entries = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
  });

  function renderEntry({ item, index }: { item: LeaderboardEntry; index: number }) {
    const netUnits = item.totalUnitsWon - item.totalUnitsLost;
    const netColor = netUnits > 0 ? "#22C55E" : netUnits < 0 ? "#EF4444" : Colors.dark.textSecondary;

    return (
      <View style={[styles.entryRow, index === 0 && styles.entryRowFirst]}>
        <View style={styles.rankCol}>
          <MedalIcon rank={index} />
        </View>
        <View style={styles.userCol}>
          <View style={styles.entryAvatar}>
            <Text style={styles.entryInitial}>
              {(item.displayName || item.username).charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.entryInfo}>
            <Text style={styles.entryName} numberOfLines={1}>
              {item.displayName || item.username}
            </Text>
            <Text style={styles.entryUsername}>@{item.username}</Text>
          </View>
        </View>
        <View style={styles.statsCol}>
          <Text style={styles.record}>
            {item.wins}-{item.losses}{item.draws > 0 ? `-${item.draws}` : ""}
          </Text>
          <Text style={[styles.netUnits, { color: netColor }]}>
            {netUnits > 0 ? "+" : ""}{netUnits}u
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Leaderboard</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="trophy-outline" size={48} color={Colors.dark.tint} />
          <Text style={styles.emptyText}>No settled Swaygers yet.</Text>
          <Text style={styles.emptySubtext}>Rankings appear after Swaygers are settled.</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.userId}
          renderItem={renderEntry}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={entries.length > 0}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: { paddingHorizontal: 24, paddingVertical: 16 },
  title: { fontSize: 28, fontWeight: "bold" as const, color: Colors.dark.text },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyText: { fontSize: 16, color: Colors.dark.textSecondary, textAlign: "center" },
  emptySubtext: { fontSize: 14, color: Colors.dark.tabIconDefault, textAlign: "center" },
  listContent: { paddingHorizontal: 16, paddingBottom: 100, gap: 8 },
  entryRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.dark.surface,
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.dark.border,
  },
  entryRowFirst: { borderColor: Colors.dark.accentGold, backgroundColor: "rgba(245, 166, 35, 0.05)" },
  rankCol: { width: 36, alignItems: "center" },
  medal: { fontSize: 20 },
  rankNum: { fontSize: 16, fontWeight: "bold" as const, color: Colors.dark.tabIconDefault },
  userCol: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  entryAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.dark.surfaceLight,
    alignItems: "center", justifyContent: "center",
  },
  entryInitial: { fontSize: 16, fontWeight: "600" as const, color: Colors.dark.tint },
  entryInfo: { flex: 1, gap: 2 },
  entryName: { fontSize: 15, fontWeight: "600" as const, color: Colors.dark.text },
  entryUsername: { fontSize: 12, color: Colors.dark.tabIconDefault },
  statsCol: { alignItems: "flex-end", gap: 2 },
  record: { fontSize: 16, fontWeight: "bold" as const, color: Colors.dark.text },
  netUnits: { fontSize: 13, fontWeight: "600" as const },
});
