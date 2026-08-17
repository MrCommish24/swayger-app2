/**
 * app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/results.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 5 — Weekly Results Screen (post-finalization)
 *
 * Shows winners, full leaderboard, and the viewer's pick-by-pick breakdown.
 * Only accessible after room.status='finalized'.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useFantasyGuestToken } from "@/lib/use-fantasy-guest-token";
import {
  getWeeklyResults,
  WeeklyResults,
  WeeklyResultsPickEntry,
  DraftDayResultsLeaderboardEntry,
} from "@/lib/fantasy-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

export default function WeeklyResultsScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();
  const { guestToken, guestTokenLoading }   = useFantasyGuestToken();
  const { leagueId, seasonId, weekNumber }  = useLocalSearchParams<{
    leagueId: string; seasonId: string; weekNumber: string;
  }>();

  const wn = parseInt(weekNumber ?? "1", 10);
  const [data, setData]       = useState<WeeklyResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const auth = session ? { session } : guestToken ? { guestToken } : {};

  const load = useCallback(async () => {
    if (!leagueId || !seasonId) return;
    if (!session && !guestToken) return;
    setLoading(true);
    setError(null);
    try {
      const d = await getWeeklyResults(leagueId, seasonId, wn, auth);
      setData(d);
    } catch (e: any) {
      setError(e.message ?? "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [leagueId, seasonId, wn, session?.access_token, guestToken]);

  useEffect(() => {
    if (!authLoading && !guestTokenLoading) load();
  }, [authLoading, guestTokenLoading, load]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (authLoading || guestTokenLoading || loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.btn} onPress={load}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={styles.linkText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data?.finalized) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emoji}>⏳</Text>
        <Text style={styles.pendingTitle}>Results Pending</Text>
        <Text style={styles.pendingBody}>
          Week {wn} results will be revealed once the commissioner finalizes the competition.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={styles.linkText}>← Back to Hub</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const winners     = data.winners ?? [];
  const leaderboard = (data.leaderboard ?? []) as DraftDayResultsLeaderboardEntry[];
  const myPicks     = (data.my_competition_picks ?? []) as WeeklyResultsPickEntry[];
  const hasMyPicks  = myPicks.length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }]}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.linkText}>← Back</Text>
      </TouchableOpacity>

      {/* Winner banner */}
      {winners.length > 0 && (
        <View style={styles.winnerBanner}>
          <Text style={styles.winnerEmoji}>🏆</Text>
          <Text style={styles.winnerLabel}>
            {data.league_name ? `${data.league_name} — ` : ""}Week {wn} Winner{winners.length > 1 ? "s" : ""}
          </Text>
          {winners.map((w, i) => (
            <View key={i} style={styles.winnerRow}>
              <Text style={styles.winnerName}>{w.display_name}</Text>
              {w.team_name && <Text style={styles.winnerTeam}>{w.team_name}</Text>}
              <Text style={styles.winnerPts}>{w.points} pts</Text>
            </View>
          ))}
        </View>
      )}

      {/* My picks */}
      {hasMyPicks && (
        <>
          <Text style={styles.sectionLabel}>MY PICKS</Text>
          <View style={styles.myScoreRow}>
            <View style={styles.myScoreBox}>
              <Text style={styles.myScoreNum}>{data.my_total_points ?? 0}</Text>
              <Text style={styles.myScoreLabel}>Points</Text>
            </View>
            <View style={styles.myScoreBox}>
              <Text style={styles.myScoreNum}>{data.my_correct_count ?? 0}</Text>
              <Text style={styles.myScoreLabel}>Correct</Text>
            </View>
            <View style={styles.myScoreBox}>
              <Text style={styles.myScoreNum}>{myPicks.length}</Text>
              <Text style={styles.myScoreLabel}>Questions</Text>
            </View>
          </View>

          <View style={styles.card}>
            {myPicks.map((pick, i) => {
              const isCorrect = pick.is_correct === true;
              const isWrong   = pick.is_correct === false;
              const noPick    = pick.my_answer_id === null;
              return (
                <View key={pick.prop_id} style={[styles.pickRow, i > 0 && styles.pickRowBorder]}>
                  <View style={styles.pickIcon}>
                    <Text style={styles.pickIconText}>
                      {noPick ? "—" : isCorrect ? "✓" : "✗"}
                    </Text>
                  </View>
                  <View style={styles.pickContent}>
                    <Text style={styles.pickQ} numberOfLines={2}>{pick.question}</Text>
                    {!noPick && (
                      <Text style={[styles.pickAnswer, isCorrect && styles.pickAnswerCorrect, isWrong && styles.pickAnswerWrong]}>
                        Your answer: {pick.my_answer_label}
                      </Text>
                    )}
                    {noPick && <Text style={styles.pickNoAnswer}>No pick submitted</Text>}
                    {pick.correct_answer_label && (
                      <Text style={styles.pickCorrectAnswer}>
                        ✓ Correct: {pick.correct_answer_label}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.pickPts, isCorrect && styles.pickPtsCorrect]}>
                    {isCorrect ? `+${pick.points_earned}` : "0"} pts
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>LEADERBOARD</Text>
          <View style={styles.card}>
            {leaderboard.map((entry, i) => (
              <View key={entry.participant_id} style={[styles.lbRow, i > 0 && styles.lbRowBorder]}>
                <Text style={styles.lbRank}>{entry.rank_label}</Text>
                <View style={styles.lbInfo}>
                  <Text style={styles.lbName}>{entry.display_name}</Text>
                  {entry.team_name && <Text style={styles.lbTeam}>{entry.team_name}</Text>}
                </View>
                <View style={styles.lbRight}>
                  <Text style={styles.lbPoints}>{entry.points} pts</Text>
                  <Text style={styles.lbCorrect}>{entry.correct_count} correct</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Season Standings link */}
      <TouchableOpacity
        style={styles.standingsLink}
        onPress={() => router.push(`/fantasy/standings/${leagueId}/${seasonId}` as any)}
        activeOpacity={0.8}
      >
        <Text style={styles.standingsLinkText}>📊  View Season Standings →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content:   { paddingHorizontal: 20 },
  center: {
    flex: 1, backgroundColor: C.background,
    alignItems: "center", justifyContent: "center", padding: 32, gap: 12,
  },
  backBtn: { marginBottom: 16 },
  emoji:        { fontSize: 48, marginBottom: 8 },
  pendingTitle: { fontSize: 20, fontWeight: "700", color: C.text },
  pendingBody:  { fontSize: 14, color: C.textMuted, textAlign: "center", lineHeight: 20 },

  winnerBanner: {
    backgroundColor: "#1A1500", borderRadius: 14,
    borderWidth: 1, borderColor: C.accentGold,
    padding: 20, alignItems: "center", gap: 6, marginBottom: 24,
  },
  winnerEmoji: { fontSize: 40, marginBottom: 4 },
  winnerLabel: { fontSize: 12, fontWeight: "700", color: C.accentGold, letterSpacing: 0.6 },
  winnerRow:   { alignItems: "center", gap: 2, marginTop: 6 },
  winnerName:  { fontSize: 22, fontWeight: "800", color: C.text },
  winnerTeam:  { fontSize: 13, color: C.textSecondary },
  winnerPts:   { fontSize: 15, fontWeight: "700", color: C.accentGold, marginTop: 2 },

  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8, marginBottom: 8,
  },
  myScoreRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  myScoreBox: {
    flex: 1, backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, padding: 14, alignItems: "center",
  },
  myScoreNum:   { fontSize: 24, fontWeight: "800", color: C.text },
  myScoreLabel: { fontSize: 11, color: C.textMuted, marginTop: 2 },

  card: {
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    overflow: "hidden", marginBottom: 24,
  },
  pickRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  pickRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  pickIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.background, alignItems: "center", justifyContent: "center",
  },
  pickIconText: { fontSize: 14, fontWeight: "800" },
  pickContent:  { flex: 1 },
  pickQ:        { fontSize: 14, fontWeight: "600", color: C.text, lineHeight: 19 },
  pickAnswer:   { fontSize: 12, color: C.textSecondary, marginTop: 3 },
  pickAnswerCorrect: { color: "#22c55e" },
  pickAnswerWrong:   { color: C.danger },
  pickNoAnswer: { fontSize: 12, color: C.textMuted, fontStyle: "italic", marginTop: 3 },
  pickCorrectAnswer: { fontSize: 12, color: "#22c55e", fontWeight: "600", marginTop: 2 },
  pickPts:        { fontSize: 13, fontWeight: "700", color: C.textMuted, paddingTop: 2 },
  pickPtsCorrect: { color: "#22c55e" },

  lbRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  lbRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  lbRank:   { fontSize: 13, fontWeight: "700", color: C.textMuted, width: 32 },
  lbInfo:   { flex: 1 },
  lbName:   { fontSize: 14, fontWeight: "700", color: C.text },
  lbTeam:   { fontSize: 12, color: C.textSecondary },
  lbRight:  { alignItems: "flex-end" },
  lbPoints: { fontSize: 14, fontWeight: "700", color: C.tint },
  lbCorrect:{ fontSize: 11, color: C.textMuted },

  standingsLink: {
    backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.tint,
    padding: 16, alignItems: "center", marginBottom: 12,
  },
  standingsLinkText: { fontSize: 15, fontWeight: "700", color: C.tint },

  btn: {
    backgroundColor: C.tint, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 24,
    alignItems: "center", alignSelf: "stretch",
  },
  btnText:   { color: "#fff", fontWeight: "700", fontSize: 15 },
  linkText:  { color: C.tint, fontSize: 14, fontWeight: "600" },
  errorText: { color: C.danger, fontSize: 14, textAlign: "center" },
});
