import { useCallback } from "react";
import {
  StyleSheet, Text, View, Platform, FlatList,
  ActivityIndicator, Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchAllH2HOpponents, H2HOpponent } from "@/lib/swayger";
import { getAvatarColor, formatDate } from "@/lib/helpers";
import Colors from "@/constants/colors";
import { Analytics } from "@/lib/posthog";

export default function H2HIndexScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const router = useRouter();
  const { user, profile } = useAuth();

  useFocusEffect(useCallback(() => { Analytics.h2hViewed(); }, []));

  const { data: opponents, isLoading } = useQuery<H2HOpponent[]>({
    queryKey: ["h2h-opponents", user?.id],
    queryFn: () => fetchAllH2HOpponents(user!.id),
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  function renderOpponent({ item }: { item: H2HOpponent }) {
    const avatarColor = getAvatarColor(item.username);
    const initial = (item.displayName || item.username).charAt(0).toUpperCase();
    const decided = item.myWins + item.theirWins;
    const isWinning = item.myWins > item.theirWins;
    const isLosing = item.theirWins > item.myWins;
    const recordColor = isWinning ? "#22C55E" : isLosing ? "#EF4444" : Colors.dark.textSecondary;

    return (
      <Pressable
        style={({ pressed }) => [styles.opponentRow, pressed && styles.rowPressed]}
        onPress={() => router.push(`/h2h/${item.opponentId}`)}
        testID={`h2h-opponent-${item.username}`}
      >
        <View style={[styles.opponentAvatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.opponentInitial}>{initial}</Text>
        </View>

        <View style={styles.opponentInfo}>
          <Text style={styles.opponentName} numberOfLines={1}>
            {item.displayName || `@${item.username}`}
          </Text>
          <Text style={styles.opponentUsername}>@{item.username}</Text>
          <Text style={styles.lastPlayed}>Last played {formatDate(item.lastPlayed)}</Text>
        </View>

        <View style={styles.recordSection}>
          <Text style={[styles.record, { color: recordColor }]}>
            {item.myWins}–{item.theirWins}{item.draws > 0 ? `–${item.draws}` : ""}
          </Text>
          <Text style={styles.recordSub}>{item.total} settled</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.dark.tabIconDefault} style={{ marginTop: 4 }} />
        </View>
      </Pressable>
    );
  }

  const myName = profile?.display_name || profile?.username || "You";

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="h2h-back">
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Head to Head</Text>
          <Text style={styles.subtitle}>Your records vs. every opponent</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
        </View>
      ) : !opponents || opponents.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={48} color={Colors.dark.tint} />
          <Text style={styles.emptyTitle}>No H2H records yet</Text>
          <Text style={styles.emptySubtext}>
            Your records against opponents will appear here once Swaygers are settled.
          </Text>
        </View>
      ) : (
        <FlatList
          data={opponents}
          keyExtractor={(item) => item.opponentId}
          renderItem={renderOpponent}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderLabel}>{opponents.length} opponent{opponents.length !== 1 ? "s" : ""}</Text>
              <Text style={[styles.listHeaderLabel, styles.colRight]}>Your record</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  headerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  backBtn: { padding: 4 },
  headerText: { flex: 1 },
  title: { fontSize: 24, fontWeight: "bold" as const, color: Colors.dark.text },
  subtitle: { fontSize: 13, color: Colors.dark.textSecondary, marginTop: 2 },

  centered: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "600" as const, color: Colors.dark.text, textAlign: "center" as const },
  emptySubtext: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center" as const, lineHeight: 20 },

  listContent: { paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  listHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  listHeaderLabel: { fontSize: 11, fontWeight: "600" as const, color: Colors.dark.tabIconDefault, textTransform: "uppercase" as const, letterSpacing: 0.5 },
  colRight: { textAlign: "right" as const },

  opponentRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 12,
  },
  rowPressed: { opacity: 0.7 },
  opponentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  opponentInitial: { fontSize: 18, fontWeight: "700" as const, color: "#fff" },
  opponentInfo: { flex: 1, gap: 2 },
  opponentName: { fontSize: 15, fontWeight: "600" as const, color: Colors.dark.text },
  opponentUsername: { fontSize: 12, color: Colors.dark.tabIconDefault },
  lastPlayed: { fontSize: 11, color: Colors.dark.tabIconDefault, marginTop: 2 },
  recordSection: { alignItems: "flex-end" as const },
  record: { fontSize: 18, fontWeight: "700" as const },
  recordSub: { fontSize: 11, color: Colors.dark.tabIconDefault },
});
