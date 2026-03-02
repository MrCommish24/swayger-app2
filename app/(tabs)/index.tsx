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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { Swayger } from "@/types";
import { formatDateTime } from "@/lib/helpers";
import Colors from "@/constants/colors";

async function fetchUserSwaygers(userId: string): Promise<Swayger[]> {
  const { data, error } = await supabase
    .from("swaygers")
    .select("*")
    .or(`creator_id.eq.${userId},opponent_id.eq.${userId}`)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  return (data ?? []) as Swayger[];
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const {
    data: swaygers = [],
    isLoading,
    error,
  } = useQuery<Swayger[]>({
    queryKey: ["swaygers", "mine", user?.id],
    queryFn: () => fetchUserSwaygers(user!.id),
    enabled: !!user,
  });

  function renderSwaygerItem({ item }: { item: Swayger }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        <View style={styles.cardDetails}>
          {item.stake_units != null && (
            <View style={styles.detailRow}>
              <Ionicons name="flame-outline" size={14} color={Colors.dark.accentGold} />
              <Text style={styles.detailText}>{item.stake_units} units</Text>
            </View>
          )}
          {item.expires_at && (
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={14} color={Colors.dark.textSecondary} />
              <Text style={styles.detailText}>{formatDateTime(item.expires_at)}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Swayger</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.accentGold} />
          <Text style={styles.emptyText}>Could not load swaygers.</Text>
        </View>
      ) : swaygers.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="flash-outline" size={48} color={Colors.dark.tint} />
          <Text style={styles.emptyText}>No swaygers yet. Create one.</Text>
        </View>
      ) : (
        <FlatList
          data={swaygers}
          keyExtractor={(item) => item.id}
          renderItem={renderSwaygerItem}
          contentContainerStyle={styles.listContent}
          scrollEnabled={swaygers.length > 0}
        />
      )}

      <View style={[styles.bottomArea, { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 100 }]}>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => router.push("/(tabs)/create")}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.buttonText}>Create Swayger</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold" as const,
    color: Colors.dark.text,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.dark.text,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    backgroundColor: Colors.dark.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    color: Colors.dark.tint,
    fontWeight: "600" as const,
    textTransform: "capitalize" as const,
  },
  cardDetails: {
    flexDirection: "row",
    gap: 16,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  bottomArea: {
    paddingHorizontal: 24,
  },
  button: {
    backgroundColor: Colors.dark.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600" as const,
  },
});
