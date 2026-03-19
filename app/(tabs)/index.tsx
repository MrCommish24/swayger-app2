import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { formatDate, getAvatarColor } from "@/lib/helpers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import {
  fetchMySwaygers,
  fetchMyBalance,
  displayStatus,
  categoryIcon,
} from "@/lib/swayger";
import { MARCH_MADNESS_ACTIVE, getCurrentRound } from "@/lib/march-madness";
import { SwaygerData } from "@/types";
import Colors from "@/constants/colors";

const MM_ORANGE = "#E8590A";

function MarchMadnessBanner({ onPress }: { onPress: () => void }) {
  if (!MARCH_MADNESS_ACTIVE) return null;
  const round = getCurrentRound();
  return (
    <Pressable
      style={({ pressed }) => [styles.mmBanner, pressed && { opacity: 0.85 }]}
      onPress={onPress}
    >
      <View style={styles.mmBannerLeft}>
        <Text style={styles.mmBannerEmoji}>🏀</Text>
        <View style={styles.mmBannerText}>
          <Text style={styles.mmBannerTitle}>Leaderboard Challenge 🏆</Text>
          <Text style={styles.mmBannerSub}>
            Win a $100 gift card · Make your picks
          </Text>
        </View>
      </View>
      <View style={styles.mmBannerArrow}>
        <Ionicons name="chevron-forward" size={16} color={MM_ORANGE} />
      </View>
    </Pressable>
  );
}

const ONBOARDING_KEY = "swayger_onboarding_v1_dismissed";
const GOLD = "#F5A623";

const HOW_TO_STEPS = [
  { num: "1", title: "Create", sub: "Name your wager & set stakes" },
  { num: "2", title: "Pick Your Side", sub: "Enter your take" },
  { num: "3", title: "Share Code", sub: "Friend joins & picks theirs" },
];

function OnboardingCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <View style={styles.onboardingCard}>
      <View style={styles.onboardingHeader}>
        <View style={styles.onboardingTitleRow}>
          <Ionicons name="flash" size={13} color={GOLD} />
          <Text style={styles.onboardingTitle}>How to create a Swayger</Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={12} testID="onboarding-dismiss">
          <Ionicons name="close" size={18} color="#6B7280" />
        </Pressable>
      </View>
      <View style={styles.onboardingSteps}>
        {HOW_TO_STEPS.map((step, i) => (
          <React.Fragment key={step.num}>
            <View style={styles.onboardingStep}>
              <View style={styles.onboardingStepBadge}>
                <Text style={styles.onboardingStepNum}>{step.num}</Text>
              </View>
              <Text style={styles.onboardingStepTitle}>{step.title}</Text>
              <Text style={styles.onboardingStepSub}>{step.sub}</Text>
            </View>
            {i < HOW_TO_STEPS.length - 1 ? (
              <Ionicons
                name="chevron-forward"
                size={13}
                color="rgba(255,255,255,0.18)"
                style={styles.onboardingArrow}
              />
            ) : null}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

function StatsStrip({
  swaygers,
  userId,
  spBalance,
}: {
  swaygers: SwaygerData[];
  userId: string;
  spBalance: number | null;
}) {
  const stats = useMemo(() => {
    const total = swaygers.length;
    const active = swaygers.filter(
      (s) => s.status === "active" || s.status === "settlement_proposed"
    ).length;

    const settled = swaygers.filter((s) => s.status === "settled");
    const decided = settled.filter(
      (s) => s.settled_outcome === "creator" || s.settled_outcome === "opponent"
    );
    const wins = decided.filter((s) => {
      const isCreator = s.creator_id === userId;
      const isOpponent = s.opponent_id === userId;
      return (
        (isCreator && s.settled_outcome === "creator") ||
        (isOpponent && s.settled_outcome === "opponent")
      );
    }).length;

    const winPct =
      decided.length > 0
        ? Math.round((wins / decided.length) * 100) + "%"
        : "—";

    return { total, active, winPct };
  }, [swaygers, userId]);

  return (
    <View style={styles.statsStrip}>
      <View style={styles.statTile}>
        <Text style={styles.statValue}>{stats.total}</Text>
        <Text style={styles.statLabel}>Total</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statTile}>
        <Text style={[styles.statValue, stats.active > 0 && styles.statValueActive]}>
          {stats.active}
        </Text>
        <Text style={styles.statLabel}>Active</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statTile}>
        <Text style={styles.statValue}>{stats.winPct}</Text>
        <Text style={styles.statLabel}>Win %</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statTile}>
        <Text style={[styles.statValue, styles.statValueSP]}>
          {spBalance !== null ? spBalance.toLocaleString() : "—"}
        </Text>
        <Text style={styles.statLabel}>Swayger Pts</Text>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

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

  const { data: balanceData } = useQuery({
    queryKey: ["balance", user?.id],
    queryFn: () => fetchMyBalance(user!.id),
    enabled: !!user,
    staleTime: 0,
  });
  const spBalance = balanceData?.balance ?? null;

  const [showOnboarding, setShowOnboarding] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      if (val) setShowOnboarding(false);
    });
  }, []);

  function dismissOnboarding() {
    setShowOnboarding(false);
    AsyncStorage.setItem(ONBOARDING_KEY, "1");
  }

  type FilterKey = "all" | "active" | "pending" | "settled" | "other";
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const counts = useMemo(() => ({
    all:     swaygers.length,
    active:  swaygers.filter((s) => ["active", "settlement_proposed"].includes(s.status)).length,
    pending: swaygers.filter((s) => s.status === "pending_invite").length,
    settled: swaygers.filter((s) => s.status === "settled").length,
    other:   swaygers.filter((s) => ["canceled", "declined", "expired"].includes(s.status)).length,
  }), [swaygers]);

  const filteredSwaygers = useMemo(() => {
    const statusOrder = (s: SwaygerData): number => {
      if (["active", "settlement_proposed"].includes(s.status)) return 0;
      if (s.status === "pending_invite") return 1;
      if (s.status === "settled") return 2;
      return 3;
    };
    const filtered = activeFilter === "all"
      ? [...swaygers]
      : swaygers.filter((s) => {
          if (activeFilter === "active")  return ["active", "settlement_proposed"].includes(s.status);
          if (activeFilter === "pending") return s.status === "pending_invite";
          if (activeFilter === "settled") return s.status === "settled";
          if (activeFilter === "other")   return ["canceled", "declined", "expired"].includes(s.status);
          return true;
        });
    return filtered.sort((a, b) => {
      const orderDiff = statusOrder(a) - statusOrder(b);
      if (orderDiff !== 0) return orderDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [swaygers, activeFilter]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`swayger-list-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swaygers" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["swaygers", "mine", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

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
            <Text style={styles.detailText}>{item.stake_units || 1} SP</Text>
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
        {user && (
          <Pressable
            style={styles.avatarPill}
            onPress={() => router.push("/(tabs)/profile")}
          >
            <View style={[styles.avatarCircle, { backgroundColor: getAvatarColor(profile?.username || user.email || "?") }]}>
              <Text style={styles.avatarInitial}>
                {(profile?.display_name || profile?.username || user.email || "?").charAt(0).toUpperCase()}
              </Text>
            </View>
            {profile?.username ? (
              <Text style={styles.avatarUsername} numberOfLines={1}>
                @{profile.username}
              </Text>
            ) : (
              <Text style={[styles.avatarUsername, { opacity: 0.5 }]} numberOfLines={1}>
                {user.email?.split("@")[0] ?? "…"}
              </Text>
            )}
          </Pressable>
        )}
      </View>

      {!isLoading && !error && user && (
        <StatsStrip swaygers={swaygers} userId={user.id} spBalance={spBalance} />
      )}

      <MarchMadnessBanner onPress={() => router.push("/march-madness")} />

      {showOnboarding ? (
        <OnboardingCard onDismiss={dismissOnboarding} />
      ) : null}

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

      {!isLoading && !error && swaygers.length > 0 && (
        <View style={styles.filterBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            bounces={false}
          >
            {(["all", "active", "pending", "settled", "other"] as FilterKey[]).map((key) => {
              const isActive = activeFilter === key;
              const label = key === "all" ? "All" : key.charAt(0).toUpperCase() + key.slice(1);
              const count = counts[key];
              return (
                <Pressable
                  key={key}
                  style={[styles.filterChip, isActive && styles.filterChipActive]}
                  onPress={() => setActiveFilter(key)}
                >
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                    {label}
                    <Text style={[styles.filterChipCount, isActive && styles.filterChipCountActive]}>
                      {" "}{count}
                    </Text>
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

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
        <ScrollView
          style={styles.emptyStateScroll}
          contentContainerStyle={[
            styles.emptyStateContainer,
            { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.emptyStateLabel}>HOW IT WORKS</Text>

          {/* Step 1 — Active */}
          <View style={styles.sampleCard}>
            <View style={styles.sampleCardHeader}>
              <Text style={styles.sampleCardTitle}>Celtics win Game 7</Text>
              <View style={styles.sampleActivePill}>
                <Ionicons name="radio-button-on" size={9} color="#22C55E" />
                <Text style={styles.sampleActivePillText}>Active</Text>
              </View>
            </View>

            <View style={styles.samplePicksRow}>
              <View style={styles.samplePickCard}>
                <Text style={styles.samplePickName}>Darius</Text>
                <Text style={styles.samplePickValue}>Celtics 🍀</Text>
              </View>
              <View style={styles.sampleVsDivider}>
                <Text style={styles.sampleVsText}>VS</Text>
              </View>
              <View style={[styles.samplePickCard, styles.samplePickCardRight]}>
                <Text style={styles.samplePickName}>Mike</Text>
                <Text style={styles.samplePickValue}>Mavericks 🤠</Text>
              </View>
            </View>

            <View style={styles.sampleFooter}>
              <Ionicons name="flame-outline" size={13} color={Colors.dark.accentGold} />
              <Text style={styles.sampleFooterText}>5 Swayger Points at stake</Text>
            </View>
          </View>

          {/* Connector */}
          <View style={styles.sampleConnector}>
            <View style={styles.sampleConnectorLine} />
            <View style={styles.sampleConnectorBadge}>
              <Ionicons name="checkmark-done" size={12} color={Colors.dark.tint} />
              <Text style={styles.sampleConnectorText}>Both agreed</Text>
            </View>
            <View style={styles.sampleConnectorLine} />
          </View>

          {/* Step 2 — Settled */}
          <View style={[styles.sampleCard, styles.sampleCardSettled]}>
            <View style={styles.sampleCardHeader}>
              <Text style={styles.sampleCardTitle}>Celtics win Game 7</Text>
              <View style={styles.sampleSettledPill}>
                <Ionicons name="trophy" size={9} color={Colors.dark.accentGold} />
                <Text style={styles.sampleSettledPillText}>Settled</Text>
              </View>
            </View>

            <View style={styles.sampleResultRow}>
              <Ionicons name="trophy" size={20} color={Colors.dark.accentGold} />
              <Text style={styles.sampleResultText}>Darius wins · +5 SP</Text>
            </View>

            <View style={styles.sampleFooter}>
              <Ionicons name="person-outline" size={13} color={Colors.dark.tabIconDefault} />
              <Text style={styles.sampleFooterText}>Mike owes Darius 5 Swayger Points</Text>
            </View>
          </View>

          <Text style={styles.emptySubtext}>Pick a side. Challenge a friend. Settle it.</Text>

          <Pressable
            style={({ pressed }) => [styles.emptyCreateButton, pressed && styles.actionButtonPressed]}
            onPress={() => router.push("/(tabs)/create")}
          >
            <Ionicons name="flash" size={16} color="#FFFFFF" />
            <Text style={styles.emptyCreateButtonText}>Create Your First Swayger</Text>
          </Pressable>
        </ScrollView>
      ) : filteredSwaygers.length === 0 && swaygers.length > 0 ? (
        <View style={styles.centered}>
          <Ionicons name="filter-outline" size={40} color={Colors.dark.textSecondary} />
          <Text style={styles.emptyText}>No {activeFilter === "all" ? "" : activeFilter + " "}swaygers yet.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredSwaygers}
          keyExtractor={(item) => item.id}
          renderItem={renderSwaygerCard}
          contentContainerStyle={styles.listContent}
          scrollEnabled={filteredSwaygers.length > 0}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row" as const,
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 28, fontWeight: "bold" as const, color: Colors.dark.text },
  avatarPill: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.surface,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  avatarUsername: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: Colors.dark.text,
    maxWidth: 100,
  },

  statsStrip: {
    flexDirection: "row" as const,
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingVertical: 14,
  },
  statTile: {
    flex: 1,
    alignItems: "center" as const,
    gap: 3,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  statValueActive: {
    color: "#22C55E",
  },
  statValueSP: {
    color: Colors.dark.accentGold,
    fontSize: 18,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "500" as const,
    color: Colors.dark.tabIconDefault,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: 4,
  },

  mmBanner: {
    flexDirection: "row" as const,
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 24,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(232,89,10,0.10)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(232,89,10,0.35)",
  },
  mmBannerLeft: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  mmBannerEmoji: {
    fontSize: 24,
  },
  mmBannerText: {
    gap: 1,
    flex: 1,
  },
  mmBannerTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  mmBannerSub: {
    fontSize: 12,
    color: "rgba(232,89,10,0.85)",
    fontWeight: "500" as const,
  },
  mmBannerArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(232,89,10,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  actions: { flexDirection: "row", gap: 12, paddingHorizontal: 24, marginBottom: 12 },
  filterBar: { marginBottom: 10, height: 42 },
  filterRow: { paddingLeft: 16, paddingRight: 20, gap: 8, alignItems: "center", height: 42 },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  filterChipText: { fontSize: 13, fontWeight: "600" as const, color: Colors.dark.textSecondary },
  filterChipTextActive: { color: "#FFFFFF" },
  filterChipCount: { fontSize: 11, fontWeight: "500" as const, color: Colors.dark.textSecondary, opacity: 0.7 },
  filterChipCountActive: { color: "rgba(255,255,255,0.75)" },
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

  emptyStateScroll: {
    flex: 1,
  },
  emptyStateContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 16,
  },
  emptyStateLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: Colors.dark.tint,
    letterSpacing: 1.5,
  },
  sampleCard: {
    width: "100%",
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 18,
    gap: 14,
  },
  sampleCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sampleCardTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Colors.dark.text,
    flex: 1,
    marginRight: 10,
  },
  sampleActivePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sampleActivePillText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: "#22C55E",
  },
  samplePicksRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  samplePickCard: {
    flex: 1,
    backgroundColor: "rgba(29, 161, 242, 0.07)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(29, 161, 242, 0.2)",
    padding: 12,
    gap: 4,
    alignItems: "center",
  },
  samplePickCardRight: {
    backgroundColor: "rgba(245, 166, 35, 0.07)",
    borderColor: "rgba(245, 166, 35, 0.2)",
  },
  samplePickName: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.dark.tabIconDefault,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  samplePickValue: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  sampleVsDivider: {
    alignItems: "center",
    justifyContent: "center",
  },
  sampleVsText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: Colors.dark.tabIconDefault,
    letterSpacing: 1,
  },
  sampleFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 2,
  },
  sampleFooterText: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    flex: 1,
  },
  sampleConnector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  sampleConnectorLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dark.border,
  },
  sampleConnectorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(29, 161, 242, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(29, 161, 242, 0.2)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sampleConnectorText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: Colors.dark.tint,
  },
  sampleCardSettled: {
    borderColor: "rgba(245, 166, 35, 0.25)",
    backgroundColor: "rgba(245, 166, 35, 0.04)",
  },
  sampleSettledPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sampleSettledPillText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: Colors.dark.accentGold,
  },
  sampleResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  sampleResultText: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Colors.dark.accentGold,
  },
  emptyCreateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.accent,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: 4,
  },
  emptyCreateButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600" as const,
  },
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
  cardDetails: { flexDirection: "row", gap: 12, flexWrap: "wrap", rowGap: 4 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  detailText: { fontSize: 13, color: Colors.dark.textSecondary },
  onboardingCard: {
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.2)",
    padding: 14,
    gap: 12,
  },
  onboardingHeader: {
    flexDirection: "row" as const,
    alignItems: "center",
    justifyContent: "space-between",
  },
  onboardingTitleRow: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 6,
  },
  onboardingTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#F5A623",
  },
  onboardingSteps: {
    flexDirection: "row" as const,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  onboardingStepWrapper: {
    flexDirection: "row" as const,
    alignItems: "flex-start",
    flex: 1,
  },
  onboardingStep: {
    flex: 1,
    alignItems: "center" as const,
    gap: 5,
  },
  onboardingStepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(245,166,35,0.15)",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.35)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  onboardingStepNum: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#F5A623",
  },
  onboardingStepTitle: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: Colors.dark.text,
    textAlign: "center" as const,
  },
  onboardingStepSub: {
    fontSize: 10,
    color: Colors.dark.textSecondary,
    textAlign: "center" as const,
    lineHeight: 14,
  },
  onboardingArrow: {
    marginTop: 6,
    alignSelf: "flex-start" as const,
  },
});
