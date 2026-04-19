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
import {
  fetchLeaderboard,
  ROUND_PRIZES,
  type PlayoffScore,
  type PlayoffRound,
} from "@/lib/nba-playoffs";

const NBA_BLUE = "#1D428A";
const NBA_GOLD = "#FFC72C";
const GOLD = "#F5A623";
const PURPLE = "#A855F7";
const GREEN = "#22C55E";
const BLUE = "#3B82F6";

const RANK_COLORS = ["#F5A623", "#9CA3AF", "#CD7F32"] as const;
const RANK_LABELS = ["🥇", "🥈", "🥉"] as const;

function ScoreBreakdown({ score }: { score: PlayoffScore }) {
  const parts: { label: string; pts: number; color: string }[] = [
    { label: "R1",    pts: score.round1_pts,      color: BLUE },
    { label: "R2",    pts: score.round2_pts,      color: "#F97316" },
    { label: "CF",    pts: score.conf_finals_pts, color: PURPLE },
    { label: "Finals",pts: score.finals_pts,      color: GOLD },
  ].filter((p) => p.pts > 0);

  if (!parts.length) return null;

  return (
    <View style={styles.breakdown}>
      {parts.map((p) => (
        <View key={p.label} style={styles.breakdownChip}>
          <Text style={[styles.breakdownPts, { color: p.color }]}>{p.pts.toLocaleString()}</Text>
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
  entry: PlayoffScore;
  rank: number;
  isMe: boolean;
}) {
  const rankIdx = rank - 1;
  const isTopThree = rank <= 3;
  const handle = entry.display_name || `@${entry.username}`;

  return (
    <View style={[styles.row, isMe && styles.rowMe, isTopThree && styles.rowTop]}>
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
          <Text style={styles.rowPts}>{entry.total_pts.toLocaleString()} pts</Text>
        </View>
        <View style={styles.rowMeta}>
          <Text style={styles.rowMetaText}>
            {entry.correct_picks} correct · {entry.correct_games} games called
          </Text>
        </View>
        <ScoreBreakdown score={entry} />
      </View>
    </View>
  );
}

function PrizeRow({ round, amount, label }: { round: string; amount: string; label: string }) {
  const colors: Record<string, string> = {
    round1: BLUE,
    round2: "#F97316",
    conf_finals: PURPLE,
    finals: GOLD,
  };
  const color = colors[round] ?? NBA_BLUE;
  return (
    <View style={styles.prizeRow}>
      <View style={[styles.prizeDot, { backgroundColor: color }]} />
      <View style={styles.prizeInfo}>
        <Text style={styles.prizeLabel}>{label}</Text>
      </View>
      <Text style={[styles.prizeAmount, { color }]}>{amount}</Text>
    </View>
  );
}

export default function NBALeaderboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: leaderboard, isLoading } = useQuery<PlayoffScore[]>({
    queryKey: ["/api/nba/leaderboard"],
    queryFn: fetchLeaderboard,
    staleTime: 60_000,
  });

  const myEntry = leaderboard?.find((e) => e.user_id === user?.id);
  const myRank = leaderboard?.findIndex((e) => e.user_id === user?.id);

  const topPts = leaderboard?.[0]?.total_pts ?? 0;
  const gapToFirst =
    myEntry && leaderboard && myRank && myRank > 0
      ? topPts - myEntry.total_pts
      : null;

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace("/playoffs")}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.dark.text} />
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>🏆 Leaderboard</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* My position banner */}
        {myEntry && myRank !== undefined && myRank >= 0 && (
          <View style={styles.myPosBanner}>
            <View>
              <Text style={styles.myPosLabel}>Your position</Text>
              <Text style={styles.myPosRank}>#{myRank + 1}</Text>
            </View>
            <View style={styles.myPosDivider} />
            <View>
              <Text style={styles.myPosLabel}>Your points</Text>
              <Text style={styles.myPosPts}>{myEntry.total_pts.toLocaleString()}</Text>
            </View>
            {gapToFirst !== null && gapToFirst > 0 && (
              <>
                <View style={styles.myPosDivider} />
                <View>
                  <Text style={styles.myPosLabel}>Gap to 1st</Text>
                  <Text style={styles.myPosGap}>-{gapToFirst.toLocaleString()}</Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* Prize structure */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prize Pool</Text>
          {Object.entries(ROUND_PRIZES).map(([round, prize]) => (
            <PrizeRow key={round} round={round} amount={prize.amount} label={prize.label} />
          ))}
        </View>

        {/* Leaderboard */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rankings</Text>
          {isLoading ? (
            <ActivityIndicator color={NBA_GOLD} style={{ marginTop: 24 }} />
          ) : !leaderboard || leaderboard.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="trophy-outline" size={40} color={Colors.dark.textSecondary} />
              <Text style={styles.emptyText}>
                Leaderboard fills in as series are resolved.{"\n"}Make your picks to reserve your spot.
              </Text>
            </View>
          ) : (
            leaderboard.map((entry, idx) => (
              <LeaderboardRow
                key={entry.user_id}
                entry={entry}
                rank={idx + 1}
                isMe={entry.user_id === user?.id}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  backBtnText: { fontSize: 16, color: Colors.dark.text, fontWeight: "500" },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 20 },

  myPosBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${NBA_BLUE}18`,
    borderWidth: 1,
    borderColor: `${NBA_BLUE}50`,
    borderRadius: 14,
    padding: 16,
    gap: 16,
  },
  myPosLabel: { fontSize: 11, color: Colors.dark.textSecondary, marginBottom: 2 },
  myPosRank: { fontSize: 22, fontWeight: "800" as const, color: Colors.dark.text },
  myPosPts: { fontSize: 22, fontWeight: "800" as const, color: NBA_GOLD },
  myPosGap: { fontSize: 22, fontWeight: "800" as const, color: "#EF4444" },
  myPosDivider: { width: 1, height: 36, backgroundColor: Colors.dark.border },

  section: { gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },

  prizeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  prizeDot: { width: 10, height: 10, borderRadius: 5 },
  prizeInfo: { flex: 1 },
  prizeLabel: { fontSize: 14, color: Colors.dark.text, fontWeight: "500" as const },
  prizeAmount: { fontSize: 16, fontWeight: "700" as const },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 14,
    padding: 14,
  },
  rowMe: {
    borderColor: `${NBA_BLUE}60`,
    backgroundColor: `${NBA_BLUE}10`,
  },
  rowTop: {
    borderColor: Colors.dark.border,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.dark.background,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: Colors.dark.textSecondary,
  },
  rowInfo: { flex: 1, gap: 4 },
  rowTop2: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowHandle: { fontSize: 15, fontWeight: "700" as const, color: Colors.dark.text, flex: 1 },
  rowHandleMe: { color: NBA_GOLD },
  rowPts: { fontSize: 15, fontWeight: "800" as const, color: Colors.dark.text },
  rowMeta: { flexDirection: "row" },
  rowMetaText: { fontSize: 12, color: Colors.dark.textSecondary },
  breakdown: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  breakdownChip: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
    backgroundColor: Colors.dark.background,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  breakdownPts: { fontSize: 13, fontWeight: "700" as const },
  breakdownLabel: { fontSize: 11, color: Colors.dark.textSecondary },

  emptyState: { alignItems: "center", paddingVertical: 32, gap: 12 },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
