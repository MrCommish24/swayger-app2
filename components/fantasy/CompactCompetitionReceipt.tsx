import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { CompetitionReceiptData } from "@/lib/fantasy-api";
import { getCompactReceiptLeaderboard } from "@/lib/fantasy-receipt-share";
import Colors from "@/constants/colors";
import SwaygerMark from "@/components/SwaygerMark";

const C = Colors.dark;

interface CompactCompetitionReceiptProps {
  data: CompetitionReceiptData;
  variant?: "draft_day" | "weekly";
}

export function CompactCompetitionReceipt({
  data,
  variant = "draft_day",
}: CompactCompetitionReceiptProps) {
  const winners = data.winners ?? [];
  const leaderboard = getCompactReceiptLeaderboard(data.leaderboard ?? []);

  return (
    <View style={styles.card} collapsable={false}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <SwaygerMark color={C.tint} size={19} />
          <Text style={styles.brand}>SWAYGER FANTASY</Text>
        </View>
        <Text style={styles.receiptLabel}>
          {variant === "weekly" ? "WEEKLY RECEIPT" : "DRAFT DAY RECEIPT"}
        </Text>
        <Text style={styles.leagueName} numberOfLines={2}>
          {data.league_name ?? "Fantasy League"}
        </Text>
        <Text style={styles.season}>
          {variant === "weekly"
            ? `Week ${(data as CompetitionReceiptData & { week_number?: number }).week_number ?? ""}${data.season_year ? ` · ${data.season_year}` : ""}`
            : `Draft Day${data.season_year ? ` · ${data.season_year}` : ""}`}
        </Text>
      </View>

      <View style={styles.finalRow}>
        <View style={styles.finalDot} />
        <Text style={styles.finalText}>FINALIZED</Text>
      </View>

      <View style={styles.winnerCard}>
        <Text style={styles.trophy}>🏆</Text>
        <Text style={styles.winnerLabel}>
          {winners.length > 1 ? "CO-WINNERS" : "WINNER"}
        </Text>
        {winners.length > 0 ? (
          winners.map((winner, index) => (
            <View key={`${winner.display_name}-${index}`} style={styles.winnerRow}>
              <Text style={styles.winnerName} numberOfLines={1}>
                {winner.display_name}
              </Text>
              <Text style={styles.winnerPoints}>{winner.points} pts</Text>
            </View>
          ))
        ) : (
          <Text style={styles.noWinner}>No winner recorded</Text>
        )}
      </View>

      <Text style={styles.sectionLabel}>TOP STANDINGS</Text>
      <View style={styles.standings}>
        {leaderboard.length > 0 ? leaderboard.map((entry, index) => (
          <View
            key={`${entry.display_name}-${entry.team_name ?? "team"}-${index}`}
            style={[styles.standingRow, index > 0 && styles.standingBorder]}
          >
            <Text style={[styles.rank, entry.rank === 1 && styles.rankWinner]}>
              {entry.rank_label}
            </Text>
            <Text style={styles.name} numberOfLines={1}>{entry.display_name}</Text>
            <Text style={[styles.points, entry.rank === 1 && styles.pointsWinner]}>
              {entry.points} pts
            </Text>
          </View>
        )) : (
          <Text style={styles.noWinner}>No standings recorded</Text>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Shared league result · personalized picks omitted</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 360,
    backgroundColor: "#0C1220",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#B45309",
    overflow: "hidden",
  },
  header: {
    backgroundColor: "#111C30",
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 15 },
  brand: { color: "#7A8FA8", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  receiptLabel: { color: C.tint, fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginBottom: 7 },
  leagueName: { color: "#FFFFFF", fontSize: 21, fontWeight: "800", marginBottom: 4 },
  season: { color: "#A9B7C8", fontSize: 14, fontWeight: "700" },
  finalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    marginHorizontal: 22,
    marginTop: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#052E16",
    borderWidth: 1,
    borderColor: "#166534",
  },
  finalDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4ADE80" },
  finalText: { color: "#86EFAC", fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  winnerCard: {
    margin: 18,
    marginBottom: 22,
    padding: 17,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: "#1A1200",
    borderWidth: 1,
    borderColor: "#B45309",
  },
  trophy: { fontSize: 31, marginBottom: 2 },
  winnerLabel: { color: "#F5A623", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 7 },
  winnerRow: { alignItems: "center", maxWidth: "100%", marginTop: 2 },
  winnerName: { color: "#FFFFFF", fontSize: 19, fontWeight: "800" },
  winnerPoints: { color: "#F5A623", fontSize: 14, fontWeight: "800", marginTop: 3 },
  noWinner: { color: "#A9B7C8", fontSize: 13 },
  sectionLabel: { color: "#7A8FA8", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginHorizontal: 22, marginBottom: 8 },
  standings: { marginHorizontal: 18, borderRadius: 13, overflow: "hidden", backgroundColor: "#111C30", borderWidth: 1, borderColor: "#1E2D45" },
  standingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  standingBorder: { borderTopWidth: 1, borderTopColor: "#1E2D45" },
  rank: { width: 31, color: "#A9B7C8", fontSize: 12, fontWeight: "800", textAlign: "center" },
  rankWinner: { color: "#F5A623" },
  name: { flex: 1, color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  points: { color: "#A9B7C8", fontSize: 13, fontWeight: "700" },
  pointsWinner: { color: "#F5A623" },
  footer: { paddingHorizontal: 22, paddingVertical: 18 },
  footerText: { color: "#61758F", fontSize: 10, textAlign: "center" },
});