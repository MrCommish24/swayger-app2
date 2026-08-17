/**
 * app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/settle.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 5 — Commissioner Weekly Settlement Screen
 *
 * Shows all competition props with answer options.
 * Commissioner selects correct answer for each; result correction allowed.
 * Shows live leaderboard preview as answers are submitted.
 * Finalize button appears when all props are resolved.
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
import {
  getWeeklySettlement,
  settleWeeklyProp,
  finalizeWeekly,
  WeeklySettlementState,
  DraftDaySettlementLeaderboardEntry,
} from "@/lib/fantasy-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

const goToHub = (router: ReturnType<typeof useRouter>, leagueId: string, seasonId: string) => {
  router.replace(`/fantasy/${leagueId}/${seasonId}` as any);
};

export default function WeeklySettleScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { session } = useAuth();
  const { leagueId, seasonId, weekNumber } = useLocalSearchParams<{
    leagueId: string; seasonId: string; weekNumber: string;
  }>();

  const wn = parseInt(weekNumber ?? "1", 10);

  const [data, setData]           = useState<WeeklySettlementState | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  // propId → settling true/false
  const [settling, setSettling]   = useState<Record<string, boolean>>({});
  const [finalizing, setFinalizing]         = useState(false);
  const [finalizeError, setFinalizeError]   = useState<string | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  // local correct answers (updated optimistically)
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});

  const auth = session ? { session } : {};

  const load = useCallback(async () => {
    if (!leagueId || !seasonId || !session) return;
    setLoading(true);
    setError(null);
    try {
      const d = await getWeeklySettlement(leagueId, seasonId, wn, { session });
      setData(d);
      const answers: Record<string, string> = {};
      for (const p of d.competition_props) {
        if (p.correct_answer) answers[p.id] = p.correct_answer;
      }
      setLocalAnswers(answers);
    } catch (e: any) {
      setError(e.message ?? "Failed to load settlement");
    } finally {
      setLoading(false);
    }
  }, [leagueId, seasonId, wn, session?.access_token]);

  useEffect(() => { load(); }, [load]);

  const handleSettle = async (propId: string, answerId: string) => {
    if (!session || settling[propId]) return;
    setSettling(prev => ({ ...prev, [propId]: true }));
    try {
      await settleWeeklyProp(leagueId, seasonId, wn, propId, answerId, { session });
      setLocalAnswers(prev => ({ ...prev, [propId]: answerId }));
      // Refresh to get updated leaderboard
      const d = await getWeeklySettlement(leagueId, seasonId, wn, { session });
      setData(d);
      const answers: Record<string, string> = {};
      for (const p of d.competition_props) {
        if (p.correct_answer) answers[p.id] = p.correct_answer;
      }
      setLocalAnswers(answers);
    } catch (e: any) {
      setError(e.message ?? "Failed to resolve question");
    } finally {
      setSettling(prev => ({ ...prev, [propId]: false }));
    }
  };

  const handleFinalize = async () => {
    if (!session || finalizing) return;
    setFinalizeError(null);
    setFinalizing(true);
    try {
      await finalizeWeekly(leagueId, seasonId, wn, { session });
      goToHub(router, leagueId, seasonId);
    } catch (e: any) {
      setFinalizeError(e.message ?? "Failed to finalize. Please try again.");
    } finally {
      setFinalizing(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  if (error && !data) {
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

  if (!data) return null;

  const settledCount  = Object.keys(localAnswers).length;
  const totalCount    = data.competition_props.length;
  const allSettled    = totalCount > 0 && settledCount >= totalCount;
  const isFinalized   = data.room_status === "finalized";
  const leaderboard: DraftDaySettlementLeaderboardEntry[] = data.preview_leaderboard ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }]}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.linkText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.heading}>Resolve Week {wn}</Text>
      <Text style={styles.sub}>
        Select the correct answer for each question. You can correct answers before finalizing.
      </Text>

      {/* Progress */}
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>{settledCount} / {totalCount} resolved</Text>
        {allSettled && <Text style={styles.allDoneText}>✓ All resolved!</Text>}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Props */}
      {data.competition_props.map((prop, i) => {
        const currentAnswer = localAnswers[prop.id] ?? null;
        const isSettled     = !!currentAnswer;
        const isSaving      = settling[prop.id];

        return (
          <View key={prop.id} style={[styles.propCard, isSettled && styles.propCardSettled]}>
            <View style={styles.propHeader}>
              <Text style={styles.propNum}>Q{i + 1}</Text>
              <Text style={styles.propPts}>{prop.point_value} pt{prop.point_value !== 1 ? "s" : ""}</Text>
              {isSettled && <View style={styles.settledDot} />}
            </View>
            <Text style={styles.propQ}>{prop.question}</Text>

            {isSaving && <Text style={styles.savingText}>Saving…</Text>}

            {!isFinalized && (
              <View style={styles.answers}>
                {(prop.answer_options ?? []).map((opt) => {
                  const isCorrect = currentAnswer === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.answerBtn, isCorrect && styles.answerBtnCorrect]}
                      onPress={() => handleSettle(prop.id, opt.id)}
                      disabled={isSaving || isFinalized}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.answerText, isCorrect && styles.answerTextCorrect]}>
                        {opt.label}
                      </Text>
                      {isCorrect && <Text style={styles.correctCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {isFinalized && currentAnswer && (
              <Text style={styles.finalAnswer}>
                ✓ Correct: {(prop.answer_options ?? []).find(o => o.id === currentAnswer)?.label ?? currentAnswer}
              </Text>
            )}
          </View>
        );
      })}

      {/* Leaderboard preview */}
      {leaderboard.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>PREVIEW LEADERBOARD</Text>
          <View style={styles.card}>
            {leaderboard.map((entry, i) => (
              <View key={entry.participant_id} style={[styles.lbRow, i > 0 && styles.lbRowBorder]}>
                <Text style={styles.lbRank}>{entry.rank_label}</Text>
                <View style={styles.lbInfo}>
                  <Text style={styles.lbName}>{entry.display_name}</Text>
                  {entry.team_name && <Text style={styles.lbTeam}>{entry.team_name}</Text>}
                </View>
                <Text style={styles.lbPoints}>{entry.points} pts</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Finalize */}
      {!isFinalized && allSettled && (
        <>
          {!confirmFinalize ? (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: "#16a34a" }, finalizing && { opacity: 0.5 }]}
              onPress={() => setConfirmFinalize(true)}
              disabled={finalizing}
              activeOpacity={0.8}
            >
              <Text style={styles.btnText}>🏆  Finalize Week {wn}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.confirmBox}>
              <Text style={styles.confirmTitle}>Finalize Week {wn}?</Text>
              <Text style={styles.confirmBody}>
                This permanently seals the leaderboard and reveals results to all members.
              </Text>
              <View style={styles.confirmButtons}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnSecondary, { flex: 1 }]}
                  onPress={() => setConfirmFinalize(false)}
                  disabled={finalizing}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.btnText, { color: C.tint }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, { flex: 1, backgroundColor: "#16a34a" }, finalizing && { opacity: 0.5 }]}
                  onPress={handleFinalize}
                  disabled={finalizing}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnText}>{finalizing ? "Finalizing…" : "🏆  Finalize"}</Text>
                </TouchableOpacity>
              </View>
              {finalizeError && <Text style={styles.errorText}>{finalizeError}</Text>}
            </View>
          )}
        </>
      )}

      {isFinalized && (
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: "#B45309" }]}
          onPress={() => router.push(`/fantasy/weeks/${leagueId}/${seasonId}/${wn}/results` as any)}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>🏆  View Week {wn} Results</Text>
        </TouchableOpacity>
      )}
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
  heading: { fontSize: 22, fontWeight: "800", color: C.text, marginBottom: 6 },
  sub:     { fontSize: 13, color: C.textMuted, lineHeight: 18, marginBottom: 16 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  progressText: { fontSize: 13, color: C.textMuted },
  allDoneText:  { fontSize: 13, color: "#22c55e", fontWeight: "700" },
  propCard: {
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 16, marginBottom: 14, gap: 10,
  },
  propCardSettled: { borderColor: "#22c55e" },
  propHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  propNum:    { fontSize: 11, fontWeight: "700", color: C.textMuted, letterSpacing: 0.5 },
  propPts:    { fontSize: 11, fontWeight: "700", color: C.tint, flex: 1 },
  settledDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" },
  propQ:      { fontSize: 16, fontWeight: "700", color: C.text, lineHeight: 22 },
  savingText: { fontSize: 12, color: C.textMuted },
  finalAnswer:{ fontSize: 14, fontWeight: "700", color: "#22c55e" },
  answers:    { gap: 8 },
  answerBtn: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.background, borderRadius: 10, borderWidth: 1, borderColor: C.border,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  answerBtnCorrect: { backgroundColor: "#0A1F0A", borderColor: "#22c55e" },
  answerText:       { flex: 1, fontSize: 14, fontWeight: "600", color: C.text },
  answerTextCorrect:{ color: "#22c55e" },
  correctCheck: { fontSize: 16, color: "#22c55e", fontWeight: "800" },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8,
    marginBottom: 8, marginTop: 8,
  },
  card: {
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    overflow: "hidden", marginBottom: 20,
  },
  lbRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  lbRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  lbRank:   { fontSize: 13, fontWeight: "700", color: C.textMuted, width: 30 },
  lbInfo:   { flex: 1 },
  lbName:   { fontSize: 14, fontWeight: "700", color: C.text },
  lbTeam:   { fontSize: 12, color: C.textSecondary },
  lbPoints: { fontSize: 14, fontWeight: "700", color: C.tint },
  btn: {
    backgroundColor: C.tint, borderRadius: 12,
    paddingVertical: 14, alignItems: "center",
    alignSelf: "stretch", marginBottom: 12,
  },
  btnSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: C.tint },
  btnText:   { color: "#fff", fontWeight: "700", fontSize: 15 },
  linkText:  { color: C.tint, fontSize: 14, fontWeight: "600" },
  errorText: { color: C.danger, fontSize: 13, textAlign: "center", marginBottom: 10 },
  confirmBox: {
    backgroundColor: "#0A1F0A", borderRadius: 12,
    borderWidth: 1, borderColor: "#16a34a",
    padding: 16, gap: 8, marginBottom: 12,
  },
  confirmTitle: { fontSize: 15, fontWeight: "700", color: C.text },
  confirmBody:  { fontSize: 13, color: C.textSecondary, lineHeight: 18 },
  confirmButtons: { flexDirection: "row", gap: 8, marginTop: 4 },
});
