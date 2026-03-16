import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  LayoutAnimation,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import {
  TAKE_CONFIGS,
  TAKE_ORDER,
  type TakeType,
  type LockedTake,
  type UpsetPick,
  UPSET_LIMITS,
  PICKS_LOCK_DATE,
  isPicksLocked,
  fetchMyLockedTakes,
  fetchMyUpsetPicks,
  fetchMyPickScore,
  toggleUpsetPick,
  getUpsetMatchupsForRound,
} from "@/lib/mm-picks";
import { getCurrentRound } from "@/lib/march-madness";

const ORANGE = "#E8590A";
const GOLD = "#F5A623";
const PURPLE = "#A855F7";

function LockBanner() {
  const locked = isPicksLocked();
  const lockDate = new Date(PICKS_LOCK_DATE);
  const formatted = lockDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return (
    <View style={[styles.lockBanner, locked && styles.lockBannerLocked]}>
      <Ionicons
        name={locked ? "lock-closed" : "time-outline"}
        size={14}
        color={locked ? "#9CA3AF" : GOLD}
      />
      <Text style={[styles.lockBannerText, locked && styles.lockBannerTextLocked]}>
        {locked
          ? "Picks are locked — tournament in progress"
          : `Picks lock ${formatted}`}
      </Text>
    </View>
  );
}

const SCORING_ROWS = [
  { emoji: "🏆", label: "Champion", pts: "10 pts", note: "1 pick" },
  { emoji: "🔥", label: "Final Four", pts: "5 pts each", note: "4 picks" },
  { emoji: "⚡", label: "Elite Eight", pts: "3 pts each", note: "8 picks" },
  { emoji: "🌀", label: "Sweet Sixteen", pts: "2 pts each", note: "16 picks" },
  { emoji: "💥", label: "Upset Picks", pts: "3 pts each", note: "3 max" },
];

function ScoringGuide() {
  const [expanded, setExpanded] = useState(false);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  }

  return (
    <View style={styles.scoringCard}>
      <Pressable
        style={styles.scoringHeader}
        onPress={toggle}
        hitSlop={8}
      >
        <View style={styles.scoringHeaderLeft}>
          <Ionicons name="information-circle-outline" size={16} color={GOLD} />
          <Text style={styles.scoringHeaderText}>How scoring works</Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={Colors.dark.textSecondary}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.scoringBody}>
          {SCORING_ROWS.map((row) => (
            <View key={row.label} style={styles.scoringRow}>
              <Text style={styles.scoringEmoji}>{row.emoji}</Text>
              <Text style={styles.scoringLabel}>{row.label}</Text>
              <Text style={styles.scoringNote}>{row.note}</Text>
              <Text style={styles.scoringPts}>{row.pts}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TakeCard({
  takeType,
  take,
  onPress,
}: {
  takeType: TakeType;
  take: LockedTake | undefined;
  onPress: () => void;
}) {
  const cfg = TAKE_CONFIGS[takeType];
  const locked = isPicksLocked();
  const submitted = take?.is_submitted === true;
  const teams = take?.teams ?? [];

  const statusColor = submitted ? "#22C55E" : locked ? "#6B7280" : GOLD;
  const statusIcon = submitted ? "checkmark-circle" : locked ? "lock-closed" : "radio-button-off";
  const statusText = submitted
    ? `${teams.length}/${cfg.count} locked in`
    : locked
    ? "No pick made"
    : `Open · pick ${cfg.count} team${cfg.count > 1 ? "s" : ""}`;

  const preview =
    submitted && teams.length > 0
      ? teams.slice(0, 3).join(", ") + (teams.length > 3 ? ` +${teams.length - 3}` : "")
      : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.takeCard,
        { borderColor: submitted ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)" },
        pressed && styles.cardPressed,
        locked && !submitted && styles.cardDimmed,
      ]}
      onPress={onPress}
      disabled={locked && !submitted}
    >
      <View style={[styles.takeIconBadge, { backgroundColor: `${cfg.color}18` }]}>
        <Text style={styles.takeEmoji}>{cfg.emoji}</Text>
      </View>
      <View style={styles.takeInfo}>
        <Text style={styles.takeName}>{cfg.label}</Text>
        <View style={styles.takeStatusRow}>
          <Ionicons name={statusIcon as any} size={12} color={statusColor} />
          <Text style={[styles.takeStatus, { color: statusColor }]}>{statusText}</Text>
        </View>
        {preview ? (
          <Text style={styles.takePreview} numberOfLines={1}>
            {preview}
          </Text>
        ) : null}
      </View>
      <View style={styles.takeMeta}>
        <Text style={styles.takePoints}>
          +{cfg.pointsEach * cfg.count}
        </Text>
        <Text style={styles.takePointsLabel}>pts max</Text>
        {!locked || submitted ? (
          <Ionicons
            name={submitted ? (locked ? "eye-outline" : "create-outline") : "chevron-forward"}
            size={16}
            color={submitted ? "#22C55E" : Colors.dark.textSecondary}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

function UpsetPicksSection({
  roundId,
  picks,
  onToggle,
  toggling,
}: {
  roundId: string;
  picks: UpsetPick[];
  onToggle: (matchupId: string, upsetTeam: string) => void;
  toggling: string | null;
}) {
  const locked = isPicksLocked();
  const limit = UPSET_LIMITS[roundId] ?? 3;
  const matchups = getUpsetMatchupsForRound(roundId);
  const pickedIds = new Set(picks.map((p) => p.matchup_id));

  return (
    <View style={styles.upsetSection}>
      <View style={styles.upsetHeader}>
        <View>
          <Text style={styles.sectionLabel}>UPSET PICKS</Text>
          <Text style={styles.upsetRoundLabel}>{roundId.replace("-", " of ").replace("-", " ").toUpperCase()}</Text>
        </View>
        <View style={styles.upsetCounter}>
          <Text style={[styles.upsetCountNum, picks.length >= limit && styles.upsetCountFull]}>
            {picks.length}
          </Text>
          <Text style={styles.upsetCountDivider}>/{limit}</Text>
        </View>
      </View>
      {locked ? (
        <View style={styles.upsetLockedNote}>
          <Ionicons name="lock-closed" size={13} color="#6B7280" />
          <Text style={styles.upsetLockedText}>Upset picks are locked</Text>
        </View>
      ) : (
        <Text style={styles.upsetHint}>
          Pick up to {limit} team{limit > 1 ? "s" : ""} you think will pull off an upset. Correct picks earn 3 pts each.
        </Text>
      )}
      {matchups.slice(0, 12).map((m) => {
        const picked = pickedIds.has(m.matchupId);
        const isToggling = toggling === m.matchupId;
        const canPick = !locked && (picked || picks.length < limit);
        return (
          <Pressable
            key={m.matchupId}
            style={({ pressed }) => [
              styles.upsetCard,
              picked && styles.upsetCardPicked,
              !canPick && !picked && styles.upsetCardDisabled,
              pressed && canPick && styles.cardPressed,
            ]}
            onPress={() => canPick && onToggle(m.matchupId, m.underdogTeam)}
            disabled={!canPick && !picked}
          >
            <View style={styles.upsetMatchup}>
              <View style={styles.upsetTeamRow}>
                <View style={styles.upsetFavorite}>
                  <View style={styles.seedPill}>
                    <Text style={styles.seedPillText}>{m.favoriteSeed}</Text>
                  </View>
                  <Text style={[styles.upsetTeamName, styles.upsetFavoriteName]} numberOfLines={1}>
                    {m.favoriteTeam}
                  </Text>
                </View>
                <Text style={styles.vsSmall}>vs</Text>
                <View style={styles.upsetUnderdog}>
                  <View style={[styles.seedPill, styles.seedPillUnderdog]}>
                    <Text style={[styles.seedPillText, styles.seedPillUnderdogText]}>{m.underdogSeed}</Text>
                  </View>
                  <Text style={[styles.upsetTeamName, picked && styles.upsetUnderdogPicked]} numberOfLines={1}>
                    {m.underdogTeam}
                  </Text>
                </View>
              </View>
              {m.gameDate || m.site ? (
                <Text style={styles.upsetMeta}>
                  {[m.gameDate, m.site].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
            </View>
            {isToggling ? (
              <ActivityIndicator size="small" color={ORANGE} />
            ) : picked ? (
              <View style={styles.upsetPickedBadge}>
                <Ionicons name="checkmark" size={14} color="#22C55E" />
                <Text style={styles.upsetPickedText}>Called it</Text>
              </View>
            ) : canPick ? (
              <Ionicons name="add-circle-outline" size={20} color={Colors.dark.textSecondary} />
            ) : (
              <Ionicons name="remove-circle-outline" size={20} color="#374151" />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function PicksHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const currentRound = getCurrentRound();
  const roundId = currentRound.id === "first-four" ? "round-64" : currentRound.id;

  const { data: takes, isLoading: takesLoading } = useQuery<
    Partial<Record<TakeType, LockedTake>>
  >({
    queryKey: ["mm-locked-takes", user?.id],
    queryFn: () => fetchMyLockedTakes(user!.id),
    enabled: !!user,
  });

  const { data: upsetPicks, isLoading: upsetLoading } = useQuery<UpsetPick[]>({
    queryKey: ["mm-upset-picks", user?.id, roundId],
    queryFn: () => fetchMyUpsetPicks(user!.id, roundId),
    enabled: !!user,
  });

  const { data: myScore } = useQuery({
    queryKey: ["mm-pick-score", user?.id],
    queryFn: () => fetchMyPickScore(user!.id),
    enabled: !!user,
  });

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const upsetMutation = useMutation({
    mutationFn: ({
      matchupId,
      upsetTeam,
    }: {
      matchupId: string;
      upsetTeam: string;
    }) => toggleUpsetPick(user!.id, roundId, matchupId, upsetTeam),
    onSuccess: (result, vars) => {
      setTogglingId(null);
      if (result.error) {
        Alert.alert("Can't pick that", result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["mm-upset-picks"] });
    },
    onError: () => setTogglingId(null),
  });

  function handleUpsetToggle(matchupId: string, upsetTeam: string) {
    setTogglingId(matchupId);
    upsetMutation.mutate({ matchupId, upsetTeam });
  }

  function handleTakePress(takeType: TakeType) {
    router.push({
      pathname: "/march-madness/locked-take",
      params: { type: takeType },
    });
  }

  const topPadding = isWeb ? 67 : insets.top;
  const isLoading = takesLoading || upsetLoading;

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
        <Text style={styles.headerTitle}>March Madness Picks</Text>
        {myScore && myScore.total_points > 0 ? (
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreBadgeText}>{myScore.total_points} pts</Text>
          </View>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: isWeb ? 34 + 100 : insets.bottom + 100 },
        ]}
      >
        <LockBanner />
        <ScoringGuide />

        {isLoading ? (
          <ActivityIndicator
            color={ORANGE}
            style={{ marginTop: 48 }}
          />
        ) : (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>LOCKED TAKES</Text>
                <Text style={styles.sectionSub}>Predict from the full 68-team field</Text>
              </View>

              {TAKE_ORDER.map((takeType) => (
                <TakeCard
                  key={takeType}
                  takeType={takeType}
                  take={takes?.[takeType]}
                  onPress={() => handleTakePress(takeType)}
                />
              ))}
            </View>

            <UpsetPicksSection
              roundId={roundId}
              picks={upsetPicks ?? []}
              onToggle={handleUpsetToggle}
              toggling={togglingId}
            />

            <Pressable
              style={({ pressed }) => [styles.leaderboardBtn, pressed && styles.cardPressed]}
              onPress={() => router.push("/march-madness/picks-leaderboard")}
            >
              <Ionicons name="trophy-outline" size={18} color={GOLD} />
              <Text style={styles.leaderboardBtnText}>Picks Leaderboard</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.dark.textSecondary} />
            </Pressable>
          </>
        )}
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
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Colors.dark.text,
    letterSpacing: -0.3,
  },
  scoreBadge: {
    backgroundColor: "rgba(245,166,35,0.15)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.3)",
  },
  scoreBadgeText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: GOLD,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  lockBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245,166,35,0.08)",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.25)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  lockBannerLocked: {
    backgroundColor: "rgba(107,114,128,0.08)",
    borderColor: "rgba(107,114,128,0.2)",
  },
  lockBannerText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: GOLD,
    flex: 1,
  },
  lockBannerTextLocked: {
    color: "#6B7280",
  },
  section: {
    gap: 10,
    marginTop: 4,
  },
  sectionHeaderRow: {
    gap: 2,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: Colors.dark.textSecondary,
    letterSpacing: 1.2,
  },
  sectionSub: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    opacity: 0.7,
  },
  takeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.card,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  cardPressed: {
    opacity: 0.75,
  },
  cardDimmed: {
    opacity: 0.45,
  },
  takeIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  takeEmoji: {
    fontSize: 22,
  },
  takeInfo: {
    flex: 1,
    gap: 3,
  },
  takeName: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  takeStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  takeStatus: {
    fontSize: 12,
    fontWeight: "500" as const,
  },
  takePreview: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
    marginTop: 1,
  },
  takeMeta: {
    alignItems: "flex-end",
    gap: 2,
  },
  takePoints: {
    fontSize: 16,
    fontWeight: "800" as const,
    color: GOLD,
  },
  takePointsLabel: {
    fontSize: 9,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
    letterSpacing: 0.5,
  },
  upsetSection: {
    gap: 10,
    marginTop: 8,
  },
  upsetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  upsetRoundLabel: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: Colors.dark.text,
    marginTop: 2,
  },
  upsetCounter: {
    flexDirection: "row",
    alignItems: "baseline",
    backgroundColor: Colors.dark.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  upsetCountNum: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: ORANGE,
  },
  upsetCountFull: {
    color: "#22C55E",
  },
  upsetCountDivider: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
  },
  upsetHint: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  upsetLockedNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  upsetLockedText: {
    fontSize: 13,
    color: "#6B7280",
  },
  upsetCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 12,
    gap: 12,
  },
  upsetCardPicked: {
    borderColor: "rgba(34,197,94,0.35)",
    backgroundColor: "rgba(34,197,94,0.05)",
  },
  upsetCardDisabled: {
    opacity: 0.4,
  },
  upsetMatchup: {
    flex: 1,
    gap: 4,
  },
  upsetTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  upsetFavorite: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  upsetUnderdog: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  vsSmall: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
    letterSpacing: 0.5,
  },
  seedPill: {
    backgroundColor: "rgba(107,114,128,0.25)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: "center",
  },
  seedPillUnderdog: {
    backgroundColor: `${ORANGE}25`,
  },
  seedPillText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: Colors.dark.textSecondary,
  },
  seedPillUnderdogText: {
    color: ORANGE,
  },
  upsetTeamName: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.dark.text,
    flex: 1,
  },
  upsetFavoriteName: {
    color: Colors.dark.textSecondary,
    fontWeight: "500" as const,
  },
  upsetUnderdogPicked: {
    color: "#22C55E",
  },
  upsetMeta: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  upsetPickedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(34,197,94,0.12)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  upsetPickedText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: "#22C55E",
  },
  scoringCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.15)",
    overflow: "hidden",
  },
  scoringHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  scoringHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scoringHeaderText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: GOLD,
  },
  scoringBody: {
    borderTopWidth: 1,
    borderTopColor: "rgba(245,166,35,0.1)",
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 8,
    gap: 10,
  },
  scoringRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  scoringEmoji: {
    fontSize: 15,
    width: 22,
    textAlign: "center" as const,
  },
  scoringLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.dark.text,
    flex: 1,
  },
  scoringNote: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginRight: 4,
  },
  scoringPts: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: GOLD,
    minWidth: 80,
    textAlign: "right" as const,
  },
  leaderboardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.dark.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 16,
    marginTop: 8,
  },
  leaderboardBtnText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
});
