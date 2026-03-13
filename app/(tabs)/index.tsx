import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { formatDate } from "@/lib/helpers";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchMySwaygers,
  displayStatus,
  categoryIcon,
} from "@/lib/swayger";
import { SwaygerData } from "@/types";
import Colors from "@/constants/colors";

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const {
    data: swaygers = [],
    isLoading,
    error,
    refetch,
  } = useQuery<SwaygerData[]>({
    queryKey: ["swaygers", "mine", user?.id],
    queryFn: () => fetchMySwaygers(user!.id),
    enabled: !!user,
  });

  function renderSwaygerCard({ item }: { item: SwaygerData }) {
    const st = displayStatus(item.status || "pending_invite");
    const isCreator = item.creator_id === user?.id;

    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => router.push(`/swayger/${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleGroup}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {item.rematch_type && (
              <View style={styles.rematchPill}>
                <Ionicons name="refresh" size={10} color={Colors.dark.tint} />
                <Text style={styles.rematchPillText}>
                  {item.rematch_type === "double_or_nothing" ? "Double or Nothing" : "Rematch"}
                </Text>
              </View>
            )}
          </View>
          <View style={[styles.roleBadge, isCreator && styles.roleBadgeCreator]}>
            <Text style={[styles.roleBadgeText, isCreator && styles.roleBadgeTextCreator]}>
              {isCreator ? "Creator" : "Opponent"}
            </Text>
          </View>
        </View>
        <View style={styles.cardDetails}>
          <View style={styles.detailRow}>
            <Ionicons
              name={categoryIcon(item.category) as keyof typeof Ionicons.glyphMap}
              size={14}
              color={Colors.dark.textSecondary}
            />
            <Text style={styles.detailText}>{item.category || "Other"}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="flame-outline" size={14} color={Colors.dark.accentGold} />
            <Text style={styles.detailText}>{item.stake_units || 1} unit{(item.stake_units || 1) !== 1 ? "s" : ""}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="radio-button-on" size={10} color={st.color} />
            <Text style={[styles.detailText, { color: st.color }]}>{st.label}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={14} color={Colors.dark.textSecondary} />
            <Text style={styles.detailText}>{formatDate(item.created_at)}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>My Swaygers</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
          onPress={() => router.push("/(tabs)/create")}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.actionButtonText}>Create</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionButtonOutline, pressed && styles.actionButtonPressed]}
          onPress={() => router.push("/join")}
        >
          <Ionicons name="enter-outline" size={18} color={Colors.dark.tint} />
          <Text style={styles.actionButtonOutlineText}>Join</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.accentGold} />
          <Text style={styles.emptyText}>Could not load swaygers.</Text>
          <Pressable style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : swaygers.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="flash-outline" size={48} color={Colors.dark.tint} />
          <Text style={styles.emptyText}>No Swaygers yet.</Text>
          <Text style={styles.emptySubtext}>Create one or join with a code.</Text>
        </View>
      ) : (
        <FlatList
          data={swaygers}
          keyExtractor={(item) => item.id}
          renderItem={renderSwaygerCard}
          contentContainerStyle={styles.listContent}
          scrollEnabled={swaygers.length > 0}
          showsVerticalScrollIndicator={false}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: { paddingHorizontal: 24, paddingVertical: 16 },
  title: { fontSize: 28, fontWeight: "bold" as const, color: Colors.dark.text },
  actions: { flexDirection: "row", gap: 12, paddingHorizontal: 24, marginBottom: 16 },
  actionButton: {
    flex: 1, backgroundColor: Colors.dark.accent, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10,
  },
  actionButtonOutline: {
    flex: 1, backgroundColor: "transparent", flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.dark.tint,
  },
  actionButtonPressed: { opacity: 0.8 },
  actionButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" as const },
  actionButtonOutlineText: { color: Colors.dark.tint, fontSize: 15, fontWeight: "600" as const },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyText: { fontSize: 16, color: Colors.dark.textSecondary, textAlign: "center" },
  emptySubtext: { fontSize: 14, color: Colors.dark.tabIconDefault, textAlign: "center" },
  retryButton: { paddingVertical: 8, paddingHorizontal: 20 },
  retryText: { color: Colors.dark.tint, fontSize: 14, fontWeight: "600" as const },
  listContent: { paddingHorizontal: 16, gap: 12, paddingBottom: 100 },
  card: {
    backgroundColor: Colors.dark.surface, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  cardPressed: { opacity: 0.8 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  cardTitleGroup: { flex: 1, marginRight: 8, gap: 3 },
  cardTitle: { fontSize: 17, fontWeight: "600" as const, color: Colors.dark.text },
  rematchPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    alignSelf: "flex-start",
  },
  rematchPillText: { fontSize: 11, color: Colors.dark.tint, fontWeight: "600" as const },
  roleBadge: { backgroundColor: Colors.dark.surfaceLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  roleBadgeCreator: { backgroundColor: "rgba(245, 166, 35, 0.15)" },
  roleBadgeText: { fontSize: 12, color: Colors.dark.tint, fontWeight: "600" as const },
  roleBadgeTextCreator: { color: Colors.dark.accentGold },
  cardDetails: { flexDirection: "row", gap: 16 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  detailText: { fontSize: 13, color: Colors.dark.textSecondary },
});
