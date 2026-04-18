import { View, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import {
  ROUND_LABELS,
  ROUND_POINTS,
  GAMES_BONUS_POINTS,
  ROUND_PRIZES,
  type PlayoffRound,
  type BracketPick,
  type PlayoffSeries,
} from "@/lib/nba-playoffs";

const NBA_BLUE = "#1D428A";
const NBA_GOLD = "#FFC72C";
const APP_URL = process.env.EXPO_PUBLIC_APP_URL || "https://www.swayger.app";

function teamNickname(fullName: string): string {
  const parts = fullName.trim().split(" ");
  return parts[parts.length - 1];
}

const ROUND_SERIES_COUNT: Record<PlayoffRound, number> = {
  round1: 8,
  round2: 4,
  conf_finals: 2,
  finals: 1,
};

interface Props {
  round: PlayoffRound;
  picks: BracketPick[];
  series: PlayoffSeries[];
  displayName: string;
  score?: number;
  rank?: number;
  playerCount?: number;
}

export default function NBABracketShareCard({
  round,
  picks,
  series,
  displayName,
  score,
  rank,
  playerCount,
}: Props) {
  const roundSeries = series.filter((s) => s.round === round);
  const pickMap = new Map(picks.map((p) => [p.series_id, p]));
  const pickedSeries = roundSeries.filter((s) => pickMap.has(s.id));

  const pts = ROUND_POINTS[round];
  const bonus = GAMES_BONUS_POINTS[round];
  const seriesCount = ROUND_SERIES_COUNT[round];
  const maxPts = seriesCount * (pts + bonus);
  const prize = ROUND_PRIZES[round];

  const useTwoColumns = round === "round1";

  const hasScore = typeof score === "number" && score > 0;

  return (
    <View style={styles.card}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>🏀 NBA PLAYOFFS 2026</Text>
        </View>
        <Text style={styles.brand}>SWAYGER</Text>
      </View>

      {/* Title */}
      <View style={styles.titleBlock}>
        <Text style={styles.titleMain}>
          MY {ROUND_LABELS[round].toUpperCase()} PICKS
        </Text>
        <View style={styles.titleLockRow}>
          <Text style={styles.titleSub}>ARE LOCKED IN</Text>
          <Ionicons name="lock-closed" size={13} color={NBA_GOLD} style={{ marginLeft: 5 }} />
        </View>
      </View>

      {/* Picks list */}
      {useTwoColumns ? (
        <View style={styles.twoColGrid}>
          {pickedSeries.map((s) => {
            const pick = pickMap.get(s.id)!;
            return (
              <View key={s.id} style={styles.pickCellWide}>
                <Ionicons name="checkmark-circle" size={11} color="#22C55E" />
                <Text style={styles.pickCellText} numberOfLines={1}>
                  {teamNickname(pick.picked_team)}{pick.games_guess ? ` · ${pick.games_guess}G` : ""}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.singleColList}>
          {pickedSeries.map((s) => {
            const pick = pickMap.get(s.id)!;
            return (
              <View key={s.id} style={styles.pickRow}>
                <Ionicons name="checkmark-circle" size={13} color="#22C55E" />
                <View style={styles.pickRowText}>
                  <Text style={styles.pickTeam} numberOfLines={1}>
                    {teamNickname(pick.picked_team)}
                  </Text>
                  {pick.games_guess && (
                    <Text style={styles.pickGames}>· {pick.games_guess}G</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Score / Points row */}
      <View style={styles.scoreRow}>
        {hasScore ? (
          <>
            <View style={styles.scorePill}>
              <Text style={styles.scorePillNum}>{score!.toLocaleString()}</Text>
              <Text style={styles.scorePillLabel}> pts</Text>
            </View>
            {rank && playerCount ? (
              <Text style={styles.scoreRankText}>
                #{rank} of {playerCount} players
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.scorePossible}>
            Up to {maxPts.toLocaleString()} pts possible this round
          </Text>
        )}
      </View>

      {/* Prize banner */}
      <View style={styles.prizeBanner}>
        <Ionicons name="trophy" size={13} color={NBA_GOLD} />
        <Text style={styles.prizeText}>
          {prize.amount} · {prize.label}
        </Text>
      </View>

      {/* Challenge CTA */}
      <View style={styles.challengeBox}>
        <Text style={styles.challengeText}>Think my bracket's wrong? Prove it.</Text>
      </View>

      <View style={styles.divider} />

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Ionicons name="person-circle-outline" size={12} color="#6B7280" />
          <Text style={styles.footerHandle} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.footerPrizePool}>· $100 prize pool</Text>
        </View>
        <View style={styles.qrBlock}>
          {Platform.OS !== "web" ? (
            <>
              <QRCode value={APP_URL} size={48} color="#FFFFFF" backgroundColor="#111827" />
              <Text style={styles.scanLabel}>SCAN TO JOIN</Text>
            </>
          ) : (
            <Text style={styles.urlLabel}>www.swayger.app</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111827",
    borderRadius: 20,
    borderWidth: 2,
    borderColor: NBA_BLUE,
    padding: 20,
    gap: 12,
    width: 300,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: {
    backgroundColor: NBA_BLUE,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800" as const,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  brand: {
    fontSize: 12,
    fontWeight: "900" as const,
    color: NBA_GOLD,
    letterSpacing: 2,
  },
  titleBlock: {
    gap: 2,
  },
  titleMain: {
    fontSize: 15,
    fontWeight: "900" as const,
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  titleLockRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleSub: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: "#6B7280",
    letterSpacing: 1.2,
  },
  twoColGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  pickCellWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: "47%",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  pickCellText: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: "#F3F4F6",
    flex: 1,
  },
  singleColList: {
    gap: 6,
  },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pickRowText: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickTeam: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: "#F3F4F6",
    flex: 1,
  },
  pickGames: {
    fontSize: 10,
    color: "#6B7280",
    marginLeft: 6,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(29,66,138,0.25)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(29,66,138,0.5)",
  },
  scorePill: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  scorePillNum: {
    fontSize: 16,
    fontWeight: "900" as const,
    color: NBA_GOLD,
  },
  scorePillLabel: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: "#9CA3AF",
  },
  scoreRankText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: "#9CA3AF",
  },
  scorePossible: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: "#9CA3AF",
  },
  prizeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,199,44,0.1)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,199,44,0.25)",
  },
  prizeText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: NBA_GOLD,
  },
  challengeBox: {
    backgroundColor: "rgba(29,66,138,0.15)",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(29,66,138,0.4)",
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  challengeText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 0.1,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flex: 1,
    flexWrap: "wrap",
  },
  footerHandle: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: "#6B7280",
    maxWidth: 120,
  },
  footerPrizePool: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: "#6B7280",
  },
  qrBlock: {
    alignItems: "center",
    gap: 3,
    marginLeft: 8,
  },
  scanLabel: {
    fontSize: 7,
    fontWeight: "700" as const,
    color: "#6B7280",
    letterSpacing: 0.8,
  },
  urlLabel: {
    fontSize: 8,
    fontWeight: "700" as const,
    color: NBA_GOLD,
    letterSpacing: 0.2,
  },
});
