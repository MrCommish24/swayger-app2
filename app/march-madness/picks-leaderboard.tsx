import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import { fetchPicksLeaderboard, fetchMyPickScore, TAKE_CONFIGS, type PickScore } from "@/lib/mm-picks";

const ORANGE = "#E8590A";
const GOLD = "#F5A623";
const PURPLE = "#A855F7";

const RANK_COLORS = ["#F5A623", "#9CA3AF", "#CD7F32"] as const;
const RANK_LABELS = ["🥇", "🥈", "🥉"] as const;

function ScoreBreakdown({ score }: { score: PickScore }) {
  const parts = [
    { label: "S16",    pts: score.sweet_sixteen_pts, color: "#3B82F6" },
    { label: "E8",     pts: score.elite_eight_pts,   color: "#F97316" },
    { label: "FF",     pts: score.final_four_pts,    color: PURPLE },
    { label: "Champ",  pts: score.champion_pts,      color: GOLD },
    { label: "Upset",  pts: score.upset_pts,         color: "#22C55E" },
    { label: "Blowout",pts: score.blowout_pts ?? 0,  color: "#A855F7" },
    { label: "Hi-Sc",  pts: score.high_scorer_pts ?? 0, color: "#3B82F6" },
  ].filter((p) => p.pts > 0);

  if (!parts.length) return null;

  return (
    <View style={styles.breakdown}>
      {parts.map((p) => (
        <View key={p.label} style={styles.breakdownChip}>
          <Text style={[styles.breakdownPts, { color: p.color }]}>{p.pts}</Text>
          <Text style={styles.breakdownLabel}>{p.label}</Text>
        </View>
      ))}
    </View>
  );
}

function LeaderboardRow({
  entry,
  rank,
  isMe,
}: {
  entry: PickScore;
  rank: number;
  isMe: boolean;
}) {
  const rankIdx = rank - 1;
  const isTopThree = rank <= 3;
  const handle = entry.display_name || `@${entry.username}`;

  return (
    <View
      style={[
        styles.row,
        isMe && styles.rowMe,
        isTopThree && styles.rowTop,
      ]}
    >
      <View style={[styles.rankBadge, isTopThree && { backgroundColor: `${RANK_COLORS[rankIdx]}18` }]}>
        <Text style={[styles.rankText, isTopThree && { color: RANK_COLORS[rankIdx] }]}>
          {isTopThree ? RANK_LABELS[rankIdx] : rank}
        </Text>
      </View>

      <View style={styles.rowInfo}>
        <View style={styles.rowTop2}>
          <Text style={[styles.rowHandle, isMe && styles.rowHandleMe]} numberOfLines={1}>
            {handle}
          </Text>
          {isMe ? (
            <View style={styles.meBadge}>
              <Text style={styles.meBadgeText}>You</Text>
            </View>
          ) : null}
          {entry.is_second_chance ? (
            <View style={styles.secondChanceBadge}>
              <Text style={styles.secondChanceBadgeText}>½ pts</Text>
            </View>
          ) : null}
        </View>
        {entry.total_points > 0 ? <ScoreBreakdown score={entry} /> : (
          <Text style={styles.rowNoPoints}>No points yet</Text>
        )}
      </View>

      <View style={styles.rowPoints}>
        <Text style={[styles.rowPts, isTopThree && { color: RANK_COLORS[rankIdx] }]}>
          {entry.total_points}
        </Text>
        <Text style={styles.rowPtsLabel}>pts</Text>
      </View>
    </View>
  );
}

export default function PicksLeaderboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const { data: board, isLoading } = useQuery<PickScore[]>({
    queryKey: ["mm-picks-leaderboard"],
    queryFn: fetchPicksLeaderboard,
    staleTime: 60_000,
  });

  const { data: myScore } = useQuery({
    queryKey: ["mm-pick-score", user?.id],
    queryFn: () => fetchMyPickScore(user!.id),
    enabled: !!user,
  });

  const topPadding = isWeb ? 67 : insets.top;
  const entries = board ?? [];
  const myRank = user ? entries.findIndex((e) => e.user_id === user.id) + 1 : 0;

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Picks Leaderboard</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: isWeb ? 34 + 80 : insets.bottom + 80 },
        ]}
      >
        <View style={styles.scoringInfo}>
          <Text style={styles.scoringTitle}>Scoring</Text>
          <View style={styles.scoringRow}>
            {Object.entries(TAKE_CONFIGS).map(([key, cfg]) => (
              <View key={key} style={styles.scoringItem}>
                <Text style={styles.scoringEmoji}>{cfg.emoji}</Text>
                <Text style={styles.scoringPts}>+{cfg.pointsEach}</Text>
                <Text style={styles.scoringLabel}>{cfg.shortLabel}</Text>
              </View>
            ))}
            <View style={styles.scoringItem}>
              <Text style={styles.scoringEmoji}>💥</Text>
              <Text style={styles.scoringPts}>+3</Text>
              <Text style={styles.scoringLabel}>Upset</Text>
            </View>
            <View style={styles.scoringItem}>
              <Text style={styles.scoringEmoji}>🎯</Text>
              <Text style={styles.scoringPts}>+3</Text>
              <Text style={styles.scoringLabel}>Blowout</Text>
            </View>
            <View style={styles.scoringItem}>
              <Text style={styles.scoringEmoji}>🏀</Text>
              <Text style={styles.scoringPts}>+3</Text>
              <Text style={styles.scoringLabel}>Hi-Sc</Text>
            </View>
          </View>
        </View>

        {user && myScore && myRank === 0 ? (
          <View style={styles.myScoreCard}>
            <View style={styles.myScoreRow}>
              <Text style={styles.myScoreLabel}>Your Score</Text>
              <Text style={styles.myScorePts}>{myScore.total_points} pts</Text>
            </View>
            <Text style={styles.myScoreHint}>Make your picks to climb the board</Text>
          </View>
        ) : null}

        {user && myRank > 3 && myScore ? (
          <View style={styles.myPositionCard}>
            <Ionicons name="person-circle-outline" size={16} color={Colors.dark.tint} />
            <Text style={styles.myPositionText}>
              You're ranked #{myRank} with {myScore.total_points} pts
            </Text>
          </View>
        ) : null}

        {isLoading ? (
          <ActivityIndicator color={ORANGE} style={{ marginTop: 48 }} />
        ) : entries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🏆</Text>
            <Text style={styles.emptyTitle}>No scores yet</Text>
            <Text style={styles.emptySub}>
              Scores update after games are resolved. Make your picks now to be ready.
            </Text>
          </View>
        ) : (
          <View style={styles.boardList}>
            {entries.map((entry, idx) => (
              <LeaderboardRow
                key={entry.user_id}
                entry={entry}
                rank={idx + 1}
                isMe={entry.user_id === user?.id}
              />
            ))}
          </View>
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
  scroll: {
    padding: 16,
    gap: 12,
  },
  scoringInfo: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 14,
    gap: 10,
  },
  scoringTitle: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: Colors.dark.textSecondary,
    letterSpacing: 1,
  },
  scoringRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  scoringItem: {
    alignItems: "center",
    gap: 3,
  },
  scoringEmoji: {
    fontSize: 18,
  },
  scoringPts: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: GOLD,
  },
  scoringLabel: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
  },
  myScoreCard: {
    backgroundColor: `${Colors.dark.tint}12`,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${Colors.dark.tint}30`,
    padding: 14,
    gap: 4,
  },
  myScoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  myScoreLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  myScorePts: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: Colors.dark.tint,
  },
  myScoreHint: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  myPositionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${Colors.dark.tint}10`,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: `${Colors.dark.tint}25`,
  },
  myPositionText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.dark.tint,
  },
  boardList: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 14,
    gap: 12,
  },
  rowMe: {
    borderColor: `${Colors.dark.tint}40`,
    backgroundColor: `${Colors.dark.tint}08`,
  },
  rowTop: {
    borderColor: "rgba(245,166,35,0.2)",
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    fontSize: 14,
    fontWeight: "800" as const,
    color: Colors.dark.textSecondary,
  },
  rowInfo: {
    flex: 1,
    gap: 4,
  },
  rowTop2: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowHandle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: Colors.dark.text,
    flex: 1,
  },
  rowHandleMe: {
    color: Colors.dark.tint,
  },
  meBadge: {
    backgroundColor: `${Colors.dark.tint}20`,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  meBadgeText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: Colors.dark.tint,
  },
  secondChanceBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  secondChanceBadgeText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "#F59E0B",
  },
  rowNoPoints: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
  },
  breakdown: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  breakdownChip: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  breakdownPts: {
    fontSize: 11,
    fontWeight: "700" as const,
  },
  breakdownLabel: {
    fontSize: 9,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
    letterSpacing: 0.3,
  },
  rowPoints: {
    alignItems: "flex-end",
    gap: 0,
  },
  rowPts: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: Colors.dark.text,
  },
  rowPtsLabel: {
    fontSize: 9,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
    letterSpacing: 0.5,
  },
  empty: {
    alignItems: "center",
    paddingTop: 48,
    gap: 12,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  emptySub: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
});
