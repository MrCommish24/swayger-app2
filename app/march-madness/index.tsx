import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Share,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import MarchMadnessShareCard from "@/components/MarchMadnessShareCard";
import {
  MARCH_MADNESS_ACTIVE,
  getCurrentRound,
  getFeaturedMatchups,
  matchupToCreateParams,
  MM_ROUNDS,
  type MMMatchup,
} from "@/lib/march-madness";

const ORANGE = "#E8590A";
const ORANGE_DIM = "rgba(232,89,10,0.12)";
const ORANGE_BORDER = "rgba(232,89,10,0.35)";
const GOLD = "#F5A623";

interface MMSwaygerStats {
  wins: number;
  losses: number;
  draws: number;
  active: number;
  total: number;
}

async function fetchMMStats(userId: string): Promise<MMSwaygerStats> {
  const { data, error } = await supabase
    .from("swaygers")
    .select("status, settled_outcome, creator_id, opponent_id")
    .eq("category", "March Madness")
    .or(`creator_id.eq.${userId},opponent_id.eq.${userId}`);

  if (error || !data) return { wins: 0, losses: 0, draws: 0, active: 0, total: 0 };

  let wins = 0, losses = 0, draws = 0, active = 0;

  for (const s of data) {
    const isCreator = s.creator_id === userId;
    if (s.status === "settled") {
      if (s.settled_outcome === "draw") {
        draws++;
      } else if (
        (s.settled_outcome === "creator" && isCreator) ||
        (s.settled_outcome === "opponent" && !isCreator)
      ) {
        wins++;
      } else {
        losses++;
      }
    } else if (s.status === "active" || s.status === "settlement_proposed") {
      active++;
    }
  }

  return { wins, losses, draws, active, total: data.length };
}

function RoundIndicator() {
  const currentRound = getCurrentRound();
  const today = new Date().toISOString().split("T")[0];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.roundPillsContent}
    >
      {MM_ROUNDS.map((r) => {
        const isActive = r.id === currentRound.id;
        const isPast = r.endDate < today;
        return (
          <View
            key={r.id}
            style={[
              styles.roundPill,
              isActive && styles.roundPillActive,
              isPast && !isActive && styles.roundPillPast,
            ]}
          >
            <Text
              style={[
                styles.roundPillText,
                isActive && styles.roundPillTextActive,
                isPast && !isActive && styles.roundPillTextPast,
              ]}
            >
              {r.shortLabel}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function MatchupCard({
  matchup,
  onPress,
}: {
  matchup: MMMatchup;
  onPress: (m: MMMatchup) => void;
}) {
  const hasTBD = matchup.teamA.name === "TBD" || matchup.teamB.name === "TBD";

  return (
    <View style={styles.matchupCard}>
      <View style={styles.matchupTop}>
        <View style={styles.regionBadge}>
          <Text style={styles.regionText}>{matchup.region.toUpperCase()}</Text>
        </View>
        {matchup.gameDateLabel ? (
          <Text style={styles.gameDateText}>{matchup.gameDateLabel}</Text>
        ) : null}
      </View>

      <View style={styles.matchupTeams}>
        <View style={styles.teamSide}>
          {matchup.teamA.seed > 0 ? (
            <View style={styles.seedBadge}>
              <Text style={styles.seedText}>{matchup.teamA.seed}</Text>
            </View>
          ) : null}
          <Text style={styles.teamName} numberOfLines={2}>
            {matchup.teamA.name}
          </Text>
        </View>

        <View style={styles.vsColumn}>
          <Text style={styles.vsText}>VS</Text>
        </View>

        <View style={[styles.teamSide, styles.teamSideRight]}>
          {matchup.teamB.seed > 0 ? (
            <View style={[styles.seedBadge, styles.seedBadgeRight]}>
              <Text style={styles.seedText}>{matchup.teamB.seed}</Text>
            </View>
          ) : null}
          <Text style={[styles.teamName, styles.teamNameRight]} numberOfLines={2}>
            {matchup.teamB.name}
          </Text>
        </View>
      </View>

      <Text style={styles.matchupPrompt} numberOfLines={2}>
        {matchup.prompt}
      </Text>

      <Pressable
        style={({ pressed }) => [
          styles.swaygerBtn,
          hasTBD && styles.swaygerBtnDim,
          pressed && styles.swaygerBtnPressed,
        ]}
        onPress={() => onPress(matchup)}
        disabled={hasTBD}
      >
        <Ionicons name="flash" size={14} color="#FFFFFF" />
        <Text style={styles.swaygerBtnText}>
          {hasTBD ? "Coming Soon" : "Swayger On This"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function MarchMadnessHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, profile } = useAuth();
  const shareCardRef = useRef<View>(null);
  const [sharingCard, setSharingCard] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);

  const currentRound = getCurrentRound();
  const featuredMatchups = useMemo(() => getFeaturedMatchups(8), []);

  const { data: mmStats, isLoading: statsLoading } = useQuery<MMSwaygerStats>({
    queryKey: ["mm-stats", user?.id],
    queryFn: () => fetchMMStats(user!.id),
    enabled: !!user,
  });

  const stats = mmStats ?? { wins: 0, losses: 0, draws: 0, active: 0, total: 0 };
  const hasMMActivity = stats.total > 0;

  function handleMatchupPress(matchup: MMMatchup) {
    const params = matchupToCreateParams(matchup);
    router.push({
      pathname: "/(tabs)/create",
      params,
    });
  }

  async function handleShareCard() {
    if (!shareCardRef.current) return;
    setSharingCard(true);
    try {
      const uri = await captureRef(shareCardRef, { format: "png", quality: 1 });
      if (Platform.OS === "web") {
        const link = document.createElement("a");
        link.href = uri;
        link.download = "swayger-march-madness.png";
        link.click();
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: "image/png" });
        } else {
          await Share.share({ url: uri });
        }
      }
    } catch (e) {
      console.error("[mm-share]", e);
    } finally {
      setSharingCard(false);
    }
  }

  const topPadding = isWeb ? 67 : insets.top;

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>March Madness</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: isWeb ? 34 + 100 : insets.bottom + 100 },
        ]}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIconRow}>
            <Text style={styles.heroEmoji}>🏀</Text>
          </View>
          <Text style={styles.heroTitle}>March Madness</Text>
          <Text style={styles.heroTagline}>Think you're right? Swayger on it.</Text>
          <Text style={styles.heroSub}>Friendly wagers. No real money. Just bragging rights.</Text>
        </View>

        {/* Round progress */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TOURNAMENT PROGRESS</Text>
          <RoundIndicator />
          <View style={styles.currentRoundCard}>
            <Text style={styles.currentRoundNow}>NOW PLAYING</Text>
            <Text style={styles.currentRoundName}>{currentRound.label}</Text>
            <Text style={styles.currentRoundDates}>
              {currentRound.startDate === currentRound.endDate
                ? currentRound.startDate
                : `${currentRound.startDate} – ${currentRound.endDate}`}
            </Text>
          </View>
        </View>

        {/* Featured Matchups */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>FEATURED MATCHUPS</Text>
            <View style={styles.liveDot}>
              <View style={styles.liveDotInner} />
              <Text style={styles.liveText}>{currentRound.shortLabel}</Text>
            </View>
          </View>
          <Text style={styles.sectionSub}>Tap a matchup to instantly create a Swayger.</Text>

          <View style={styles.matchupGrid}>
            {featuredMatchups.map((m) => (
              <MatchupCard key={m.id} matchup={m} onPress={handleMatchupPress} />
            ))}
          </View>
        </View>

        {/* My MM Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MY MARCH MADNESS RECORD</Text>

          {statsLoading ? (
            <ActivityIndicator color={ORANGE} style={{ marginTop: 16 }} />
          ) : hasMMActivity ? (
            <>
              <View style={styles.statsCard}>
                <View style={styles.statsRow}>
                  <View style={styles.statsBlock}>
                    <Text style={styles.statsValue}>{stats.wins}</Text>
                    <Text style={styles.statsBlockLabel}>WINS</Text>
                  </View>
                  <View style={styles.statsDivider} />
                  <View style={styles.statsBlock}>
                    <Text style={styles.statsValue}>{stats.losses}</Text>
                    <Text style={styles.statsBlockLabel}>LOSSES</Text>
                  </View>
                  {stats.draws > 0 ? (
                    <>
                      <View style={styles.statsDivider} />
                      <View style={styles.statsBlock}>
                        <Text style={styles.statsValue}>{stats.draws}</Text>
                        <Text style={styles.statsBlockLabel}>DRAWS</Text>
                      </View>
                    </>
                  ) : null}
                  {stats.active > 0 ? (
                    <>
                      <View style={styles.statsDivider} />
                      <View style={styles.statsBlock}>
                        <Text style={[styles.statsValue, { color: "#22C55E" }]}>{stats.active}</Text>
                        <Text style={styles.statsBlockLabel}>LIVE</Text>
                      </View>
                    </>
                  ) : null}
                </View>
              </View>

              {/* Share card toggle */}
              <Pressable
                style={({ pressed }) => [styles.shareToggle, pressed && { opacity: 0.8 }]}
                onPress={() => setShowShareCard((v) => !v)}
              >
                <Ionicons
                  name={showShareCard ? "chevron-up" : "trophy-outline"}
                  size={15}
                  color={ORANGE}
                />
                <Text style={styles.shareToggleText}>
                  {showShareCard ? "Hide Share Card" : "View Share Card"}
                </Text>
              </Pressable>

              {showShareCard ? (
                <View style={styles.shareCardSection}>
                  <View ref={shareCardRef} collapsable={false} style={styles.shareCardWrapper}>
                    <MarchMadnessShareCard
                      stats={{
                        wins: stats.wins,
                        losses: stats.losses,
                        draws: stats.draws,
                        active: stats.active,
                        username: profile?.username || user?.email?.split("@")[0] || "?",
                        displayName: profile?.display_name || null,
                      }}
                    />
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.85 }]}
                    onPress={handleShareCard}
                    disabled={sharingCard}
                  >
                    {sharingCard ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="share-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.shareBtnText}>Share My Record</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.emptyStats}>
              <Text style={styles.emptyStatsText}>
                No March Madness Swaygers yet.{"\n"}Create one from a matchup above!
              </Text>
            </View>
          )}
        </View>

        {/* Leaderboard link */}
        <Pressable
          style={({ pressed }) => [styles.leaderboardLink, pressed && { opacity: 0.85 }]}
          onPress={() =>
            router.push({
              pathname: "/(tabs)/leaderboard",
              params: { category: "March Madness" },
            })
          }
        >
          <View style={styles.leaderboardLinkLeft}>
            <Ionicons name="podium-outline" size={20} color={ORANGE} />
            <View>
              <Text style={styles.leaderboardLinkTitle}>March Madness Leaderboard</Text>
              <Text style={styles.leaderboardLinkSub}>See who's running the table</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.dark.textSecondary} />
        </Pressable>

        {/* Bottom CTA */}
        <View style={styles.ctaSection}>
          <Text style={styles.ctaTitle}>Ready to make a pick?</Text>
          <Text style={styles.ctaSub}>
            Choose a matchup above, or create a custom March Madness Swayger.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/create",
                params: {
                  counterCategory: "March Madness",
                  openChallenge: "true",
                },
              })
            }
          >
            <Ionicons name="flash" size={16} color="#FFFFFF" />
            <Text style={styles.ctaBtnText}>Create a Custom Swayger</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },

  scroll: {
    paddingHorizontal: 20,
    gap: 28,
    paddingTop: 8,
  },

  // Hero
  hero: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 6,
  },
  heroIconRow: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: ORANGE_DIM,
    borderWidth: 2,
    borderColor: ORANGE_BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heroEmoji: {
    fontSize: 30,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "900" as const,
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  heroTagline: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: ORANGE,
    textAlign: "center",
  },
  heroSub: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginTop: 2,
  },

  // Sections
  section: {
    gap: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: Colors.dark.textSecondary,
    letterSpacing: 1.2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionSub: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginTop: -4,
  },
  liveDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: ORANGE_DIM,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: ORANGE_BORDER,
  },
  liveDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ORANGE,
  },
  liveText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: ORANGE,
  },

  // Round progress
  roundPillsContent: {
    gap: 6,
    paddingVertical: 2,
  },
  roundPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  roundPillActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  roundPillPast: {
    opacity: 0.45,
  },
  roundPillText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
  },
  roundPillTextActive: {
    color: "#FFFFFF",
    fontWeight: "700" as const,
  },
  roundPillTextPast: {
    color: Colors.dark.textSecondary,
  },
  currentRoundCard: {
    backgroundColor: ORANGE_DIM,
    borderWidth: 1,
    borderColor: ORANGE_BORDER,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 3,
  },
  currentRoundNow: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: ORANGE,
    letterSpacing: 1.5,
  },
  currentRoundName: {
    fontSize: 22,
    fontWeight: "800" as const,
    color: "#FFFFFF",
  },
  currentRoundDates: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },

  // Matchup cards
  matchupGrid: {
    gap: 14,
  },
  matchupCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 16,
    gap: 12,
  },
  matchupTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  regionBadge: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  regionText: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: Colors.dark.textSecondary,
    letterSpacing: 1,
  },
  gameDateText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontWeight: "500" as const,
  },
  matchupTeams: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  teamSide: {
    flex: 1,
    gap: 5,
  },
  teamSideRight: {
    alignItems: "flex-end",
  },
  seedBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: ORANGE_DIM,
    borderWidth: 1,
    borderColor: ORANGE_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  seedBadgeRight: {},
  seedText: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: ORANGE,
  },
  teamName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  teamNameRight: {
    textAlign: "right",
  },
  vsColumn: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  vsText: {
    fontSize: 11,
    fontWeight: "900" as const,
    color: Colors.dark.textSecondary,
    letterSpacing: 1,
  },
  matchupPrompt: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
    fontStyle: "italic",
  },
  swaygerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: ORANGE,
    borderRadius: 10,
    paddingVertical: 10,
  },
  swaygerBtnDim: {
    backgroundColor: Colors.dark.border,
  },
  swaygerBtnPressed: {
    opacity: 0.8,
  },
  swaygerBtnText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },

  // Stats
  statsCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ORANGE_BORDER,
    paddingVertical: 16,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statsBlock: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statsValue: {
    fontSize: 26,
    fontWeight: "800" as const,
    color: "#FFFFFF",
  },
  statsBlockLabel: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: Colors.dark.textSecondary,
    letterSpacing: 1,
  },
  statsDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.dark.border,
  },
  emptyStats: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 24,
    alignItems: "center",
  },
  emptyStatsText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  // Share card
  shareToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  shareToggleText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: ORANGE,
  },
  shareCardSection: {
    alignItems: "center",
    gap: 14,
  },
  shareCardWrapper: {
    borderRadius: 20,
    overflow: "hidden",
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: ORANGE,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  shareBtnText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },

  // Leaderboard link
  leaderboardLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 16,
    gap: 12,
  },
  leaderboardLinkLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  leaderboardLinkTitle: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  leaderboardLinkSub: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: 1,
  },

  // Bottom CTA
  ctaSection: {
    backgroundColor: ORANGE_DIM,
    borderWidth: 1,
    borderColor: ORANGE_BORDER,
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
    gap: 8,
  },
  ctaTitle: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: "#FFFFFF",
    textAlign: "center",
  },
  ctaSub: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: ORANGE,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  ctaBtnText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
});
