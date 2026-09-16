/**
 * Shared league-level Draft Day receipt.
 *
 * This component deliberately accepts only shared competition data. It has no
 * viewer, pick, guest-token, or personalized correctness props.
 */

import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CompetitionReceiptData,
  CompetitionReceiptLeaderboardEntry,
} from "@/lib/fantasy-api";
import Colors from "@/constants/colors";
import SwaygerMark from "@/components/SwaygerMark";
import { WeeklyMomentLabel } from "@/components/fantasy/WeeklyMomentLabel";

const C = Colors.dark;

interface CompetitionReceiptProps {
  data: CompetitionReceiptData;
  variant?: "draft_day" | "weekly";
  canShare: boolean;
  sharing: boolean;
  copied: boolean;
  onShare: () => void;
  onCopy: () => void;
  onViewLeaguePicks: () => void;
}

export function CompetitionReceipt({
  data,
  variant = "draft_day",
  canShare,
  sharing,
  copied,
  onShare,
  onCopy,
  onViewLeaguePicks,
}: CompetitionReceiptProps) {
  const winners = data.winners ?? [];
  const leaderboard = data.leaderboard ?? [];
  const competitionProps = data.competition_props ?? [];
  const weeklyData = variant === "weekly"
    ? data as CompetitionReceiptData & { week_number?: number }
    : null;
  const competitionLabel = variant === "weekly" ? "WEEKLY RECEIPT" : "GLOBAL DRAFT DAY RECEIPT";
  const resultTitle = variant === "weekly"
    ? `Week ${weeklyData?.week_number ?? ""}${data.season_year ? ` · ${data.season_year}` : ""}`
    : `Draft Day${data.season_year ? ` · ${data.season_year}` : ""}`;

  return (
    <View>
      <View style={styles.receiptHeader}>
        <View style={styles.brandRow}>
          <SwaygerMark color={C.tint} size={20} />
          <Text style={styles.brandName}>SWAYGER FANTASY</Text>
        </View>
        <Text style={styles.eyebrow}>{competitionLabel}</Text>
        <Text style={styles.leagueName} numberOfLines={2}>
          {data.league_name ?? "Fantasy League"}
        </Text>
        <Text style={styles.title}>
          {resultTitle}
        </Text>
        <Text style={styles.subtitle}>
          The final league result, all in one place.
        </Text>
      </View>

      <View style={styles.finalBadge}>
        <Text style={styles.finalBadgeDot}>●</Text>
        <Text style={styles.finalBadgeText}>FINALIZED RECEIPT</Text>
      </View>

      {winners.length > 0 && (
        <View style={styles.winnerCard}>
          <Text style={styles.winnerEmoji}>🏆</Text>
          <Text style={styles.winnerEyebrow}>
            {winners.length > 1 ? "CO-WINNERS" : variant === "weekly" ? "WEEK WINNER" : "DRAFT DAY WINNER"}
          </Text>
          {winners.map((winner, index) => (
            <WinnerRow key={`${winner.display_name}-${index}`} winner={winner} />
          ))}
        </View>
      )}

      <Text style={styles.sectionLabel}>FINAL STANDINGS</Text>
      <View style={styles.standingsCard}>
        {leaderboard.map((entry, index) => (
          <StandingRow
            key={`${entry.display_name}-${entry.team_name ?? "team"}-${index}`}
            entry={entry}
            isWinner={entry.rank === 1}
            isLast={index === leaderboard.length - 1}
          />
        ))}
        {leaderboard.length === 0 && (
          <Text style={styles.emptyText}>No standings were recorded.</Text>
        )}
      </View>

      <View style={styles.outcomesHeader}>
        <View>
          <Text style={styles.sectionLabel}>THE QUESTIONS</Text>
          <Text style={styles.outcomesSubtitle}>
            Every competition question and its final answer.
          </Text>
        </View>
        <Text style={styles.questionCount}>{competitionProps.length}</Text>
      </View>

      <View style={styles.outcomesCard}>
        {competitionProps.map((prop, index) => (
          <View
            key={prop.prop_id}
            style={[styles.questionRow, index > 0 && styles.questionRowBorder]}
          >
            <View style={styles.questionNumber}>
              <Text style={styles.questionNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.questionInfo}>
               <WeeklyMomentLabel templatePropId={prop.template_prop_id} compact />
               <Text style={styles.questionText}>{prop.question}</Text>
              <View style={styles.answerWrap}>
                {prop.correct_answer_labels.map((label, answerIndex) => (
                  <View key={`${prop.prop_id}-${answerIndex}`} style={styles.answerPill}>
                    <Text style={styles.answerPillText}>{label}</Text>
                  </View>
                ))}
                {prop.correct_answer_labels.length === 0 && (
                  <Text style={styles.noAnswerText}>No final answer recorded</Text>
                )}
              </View>
            </View>
            <Text style={styles.questionPoints}>{prop.point_value}{"\n"}<Text style={styles.pointsLabel}>pts</Text></Text>
          </View>
        ))}
        {competitionProps.length === 0 && (
          <Text style={styles.emptyText}>No competition questions were recorded.</Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.leaguePicksButton}
        onPress={onViewLeaguePicks}
        activeOpacity={0.82}
      >
        <Text style={styles.leaguePicksButtonText}>See Who Picked What →</Text>
        <Text style={styles.leaguePicksButtonSub}>Open the detailed League Picks view</Text>
      </TouchableOpacity>

      {canShare && (
        <View style={styles.sharePanel}>
          <Text style={styles.shareEyebrow}>SHARE THE RECEIPT</Text>
          <Text style={styles.shareTitle}>Send the final result to your league.</Text>
          <Text style={styles.shareBody}>
            Share the league-level receipt. It never includes anyone&apos;s personal picks.
          </Text>
          <TouchableOpacity
            style={[styles.shareButton, sharing && styles.buttonDisabled]}
            onPress={onShare}
            disabled={sharing}
            activeOpacity={0.82}
            accessibilityLabel={variant === "weekly" ? "Share Weekly Receipt" : "Share Draft Day Receipt"}
          >
            {sharing
              ? <ActivityIndicator color="#fff" size="small" />
              : (
                <Text style={styles.shareButtonText}>
                  {variant === "weekly" ? "Share Weekly Receipt" : "Share Draft Day Receipt"}
                </Text>
              )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.copyButton, copied && styles.copyButtonCopied]}
            onPress={onCopy}
            activeOpacity={0.82}
            accessibilityLabel="Copy Receipt Link"
          >
            <Text style={[styles.copyButtonText, copied && styles.copyButtonTextCopied]}>
              {copied ? "✓ Receipt link copied!" : "Copy Receipt Link"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.footer}>
        Shared league receipt · personalized picks are not shown
      </Text>
    </View>
  );
}

function WinnerRow({ winner }: { winner: CompetitionReceiptLeaderboardEntry }) {
  return (
    <View style={styles.winnerRow}>
      <Text style={styles.winnerName}>{winner.display_name}</Text>
      {winner.team_name && <Text style={styles.winnerTeam}>{winner.team_name}</Text>}
      <Text style={styles.winnerPoints}>{winner.points} pts</Text>
    </View>
  );
}

function StandingRow({
  entry,
  isWinner,
  isLast,
}: {
  entry: CompetitionReceiptLeaderboardEntry;
  isWinner: boolean;
  isLast: boolean;
}) {
  return (
    <View style={[styles.standingRow, !isLast && styles.standingRowBorder]}>
      <View style={[styles.rankBadge, isWinner && styles.rankBadgeWinner]}>
        <Text style={[styles.rankText, isWinner && styles.rankTextWinner]}>
          {entry.rank_label}
        </Text>
      </View>
      <View style={styles.standingInfo}>
        <Text style={[styles.standingName, isWinner && styles.standingNameWinner]}>
          {entry.display_name}
        </Text>
        {entry.team_name && <Text style={styles.standingTeam}>{entry.team_name}</Text>}
        <Text style={styles.standingCorrect}>{entry.correct_count} correct</Text>
      </View>
      <Text style={[styles.standingPoints, isWinner && styles.standingPointsWinner]}>
        {entry.points}{"\n"}<Text style={styles.pointsLabel}>pts</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  receiptHeader: { marginBottom: 14 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 13 },
  brandName: { color: C.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
  eyebrow: { color: C.tint, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 8 },
  leagueName: { color: C.text, fontSize: 17, fontWeight: "700", marginBottom: 3 },
  title: { color: C.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: C.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 5 },
  finalBadge: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: "#052E16", borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7,
    marginBottom: 18, borderWidth: 1, borderColor: "#166534",
  },
  finalBadgeDot: { color: C.success, fontSize: 10 },
  finalBadgeText: { color: "#86EFAC", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  winnerCard: {
    backgroundColor: "#1A1200", borderRadius: 18, padding: 20, alignItems: "center",
    marginBottom: 24, borderWidth: 1, borderColor: "#B45309",
  },
  winnerEmoji: { fontSize: 38, marginBottom: 3 },
  winnerEyebrow: { color: C.accentGold, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: 8 },
  winnerRow: { alignItems: "center", marginTop: 4 },
  winnerName: { color: C.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  winnerTeam: { color: C.textSecondary, fontSize: 13, marginTop: 2 },
  winnerPoints: { color: C.accentGold, fontSize: 15, fontWeight: "800", marginTop: 4 },
  sectionLabel: { color: C.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: 9 },
  standingsCard: { backgroundColor: C.surface, borderRadius: 15, overflow: "hidden", borderWidth: 1, borderColor: C.border, marginBottom: 24 },
  standingRow: { flexDirection: "row", alignItems: "center", gap: 11, padding: 14 },
  standingRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  rankBadge: { width: 35, height: 35, borderRadius: 18, backgroundColor: C.border, alignItems: "center", justifyContent: "center" },
  rankBadgeWinner: { backgroundColor: "#B45309" },
  rankText: { color: C.textSecondary, fontSize: 12, fontWeight: "800" },
  rankTextWinner: { color: "#fff" },
  standingInfo: { flex: 1, gap: 1 },
  standingName: { color: C.text, fontSize: 15, fontWeight: "600" },
  standingNameWinner: { color: C.accentGold },
  standingTeam: { color: C.textSecondary, fontSize: 12 },
  standingCorrect: { color: C.textMuted, fontSize: 11, marginTop: 2 },
  standingPoints: { color: C.text, textAlign: "right", fontSize: 18, fontWeight: "800" },
  standingPointsWinner: { color: C.accentGold },
  pointsLabel: { color: C.textMuted, fontSize: 10, fontWeight: "400" },
  emptyText: { color: C.textMuted, fontSize: 14, textAlign: "center", padding: 20 },
  outcomesHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 9 },
  outcomesSubtitle: { color: C.textSecondary, fontSize: 12, marginTop: -5, marginBottom: 8 },
  questionCount: { color: C.tint, fontSize: 24, fontWeight: "800", paddingBottom: 8 },
  outcomesCard: { backgroundColor: C.surface, borderRadius: 15, overflow: "hidden", borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  questionRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14 },
  questionRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  questionNumber: { width: 25, height: 25, borderRadius: 13, backgroundColor: "#20202A", alignItems: "center", justifyContent: "center", marginTop: 1 },
  questionNumberText: { color: C.textMuted, fontSize: 11, fontWeight: "800" },
  questionInfo: { flex: 1, gap: 7 },
  questionText: { color: C.text, fontSize: 14, lineHeight: 19, fontWeight: "600" },
  answerWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  answerPill: { backgroundColor: "#172554", borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: "#3730A3" },
  answerPillText: { color: "#BFDBFE", fontSize: 12, fontWeight: "700" },
  noAnswerText: { color: C.textMuted, fontSize: 12 },
  questionPoints: { color: C.tint, textAlign: "right", fontSize: 15, fontWeight: "800", minWidth: 34 },
  leaguePicksButton: { backgroundColor: "#0A0F1E", borderRadius: 13, borderWidth: 1.5, borderColor: C.tint, padding: 15, alignItems: "center", marginBottom: 16 },
  leaguePicksButtonText: { color: C.tint, fontSize: 15, fontWeight: "800" },
  leaguePicksButtonSub: { color: C.textMuted, fontSize: 11, marginTop: 4 },
  sharePanel: { backgroundColor: "#111A33", borderRadius: 16, padding: 17, marginTop: 4, marginBottom: 18, borderWidth: 1, borderColor: "#293B78" },
  shareEyebrow: { color: "#A5B4FC", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 5 },
  shareTitle: { color: C.text, fontSize: 17, fontWeight: "800" },
  shareBody: { color: C.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 14 },
  shareButton: { backgroundColor: C.tint, borderRadius: 11, minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  buttonDisabled: { opacity: 0.65 },
  shareButtonText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  copyButton: { borderWidth: 1, borderColor: "#5266C7", borderRadius: 11, minHeight: 43, alignItems: "center", justifyContent: "center", marginTop: 9 },
  copyButtonCopied: { borderColor: C.success, backgroundColor: "#052E16" },
  copyButtonText: { color: "#C7D2FE", fontSize: 13, fontWeight: "700" },
  copyButtonTextCopied: { color: "#86EFAC" },
  footer: { color: C.textMuted, fontSize: 11, textAlign: "center", lineHeight: 17, paddingHorizontal: 20, paddingBottom: 8 },
});