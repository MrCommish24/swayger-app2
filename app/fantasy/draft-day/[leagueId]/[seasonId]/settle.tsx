/**
 * app/fantasy/draft-day/[leagueId]/[seasonId]/settle.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 4C — Commissioner Draft Day Settlement Screen.
 *
 * Commissioner resolves each competition-scope prop by selecting the correct
 * answer. Season Receipts are shown as an informational "locked for later"
 * section — they are NOT settled here.
 *
 * When all competition props are resolved, the commissioner can finalize the
 * Draft Day to seal the leaderboard and reveal results to all members.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import {
  getDraftDaySettlement,
  settleDraftDayProp,
  finalizeDraftDay,
  DraftDaySettlementState,
  DraftDaySettlementProp,
} from "@/lib/fantasy-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

export default function DraftDaySettleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { leagueId, seasonId } = useLocalSearchParams<{
    leagueId: string;
    seasonId: string;
  }>();

  const [state, setState]         = useState<DraftDaySettlementState | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Per-prop settling state: propId → { settling: boolean, error: string | null }
  const [propState, setPropState] = useState<Record<string, { settling: boolean; error: string | null }>>({});

  // Finalize inline confirm
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [finalizing, setFinalizing]                 = useState(false);
  const [finalizeError, setFinalizeError]           = useState<string | null>(null);

  const fetchSettlement = useCallback(async (quiet = false) => {
    if (!leagueId || !seasonId || !session) return;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const data = await getDraftDaySettlement(leagueId, seasonId, { session });
      setState(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to load settlement state");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leagueId, seasonId, session]);

  useEffect(() => { fetchSettlement(); }, [fetchSettlement]);

  const handleSettle = useCallback(async (propId: string, answerId: string) => {
    if (!session || !leagueId || !seasonId) return;
    setPropState(prev => ({ ...prev, [propId]: { settling: true, error: null } }));
    try {
      await settleDraftDayProp(leagueId, seasonId, propId, answerId, { session });
      // Optimistic update: mark prop as settled with selected answer
      setState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          competition_props: prev.competition_props.map(p =>
            p.id === propId ? { ...p, status: "settled", correct_answer: answerId } : p
          ),
          settled_count: prev.settled_count + 1,
          all_settled: prev.settled_count + 1 === prev.total_competition_count,
        };
      });
      setPropState(prev => ({ ...prev, [propId]: { settling: false, error: null } }));
    } catch (e: any) {
      const msg = e.message?.includes("already settled")
        ? "This question is already resolved."
        : e.message ?? "Failed to resolve. Please try again.";
      setPropState(prev => ({ ...prev, [propId]: { settling: false, error: msg } }));
      // Re-fetch to get true server state
      fetchSettlement(true);
    }
  }, [session, leagueId, seasonId, fetchSettlement]);

  const handleFinalize = useCallback(async () => {
    if (!session || !leagueId || !seasonId || finalizing) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      await finalizeDraftDay(leagueId, seasonId, { session });
      // Navigate back to hub — it will show the finalized state
      router.back();
    } catch (e: any) {
      setFinalizeError(e.message ?? "Failed to finalize Draft Day. Please try again.");
    } finally {
      setFinalizing(false);
      setConfirmingFinalize(false);
    }
  }, [session, leagueId, seasonId, finalizing, router]);

  if (loading && !state) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  if (error || !state) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error ?? "Failed to load settlement state."}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => fetchSettlement()}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={styles.linkText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state.room_status === "finalized") {
    // Already finalized — shouldn't normally reach here, navigate back
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emoji}>🏆</Text>
        <Text style={styles.finalizedText}>Draft Day has been finalized!</Text>
        <TouchableOpacity style={[styles.btn, { marginTop: 20 }]} onPress={() => router.back()}>
          <Text style={styles.btnText}>Back to League Hub</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { competition_props, settled_count, total_competition_count, all_settled } = state;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchSettlement(true); }} tintColor={C.tint} />
      }
    >
      {/* Back */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.linkText}>← Back to Hub</Text>
      </TouchableOpacity>

      {/* Header */}
      <Text style={styles.screenTitle}>Resolve Draft Day</Text>
      <Text style={styles.screenSub}>
        Select the correct answer for each Draft Day question.
      </Text>

      {/* Progress */}
      <View style={styles.progressCard}>
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>DRAFT DAY QUESTIONS</Text>
          <Text style={styles.progressCount}>
            {settled_count} / {total_competition_count} resolved
          </Text>
        </View>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              { width: total_competition_count > 0 ? `${(settled_count / total_competition_count) * 100}%` : "0%" },
            ]}
          />
        </View>
      </View>

      {/* Competition Props */}
      {competition_props.map((prop, i) => (
        <PropCard
          key={prop.id}
          prop={prop}
          index={i}
          settling={propState[prop.id]?.settling ?? false}
          propError={propState[prop.id]?.error ?? null}
          onSelect={handleSettle}
        />
      ))}

      {/* Season Receipts — informational */}
      <View style={styles.seasonReceiptsCard}>
        <Text style={styles.seasonReceiptsTitle}>🗓  Season Receipts</Text>
        <View style={styles.seasonReceiptsBadge}>
          <Text style={styles.seasonReceiptsBadgeText}>Locked for Later</Text>
        </View>
        <Text style={styles.seasonReceiptsBody}>
          Season predictions will be settled as the season unfolds. They don't affect the Draft Day winner.
        </Text>
      </View>

      {/* Finalize section — shown when all competition props resolved */}
      {all_settled && (
        <View style={styles.finalizeSection}>
          <Text style={styles.finalizeSectionTitle}>🎉 All questions resolved!</Text>
          <Text style={styles.finalizeSectionBody}>
            Finalize to seal the leaderboard and let all league members see the Draft Day results.
          </Text>

          {!confirmingFinalize && (
            <TouchableOpacity
              style={[styles.btn, styles.btnFinalize, finalizing && { opacity: 0.5 }]}
              onPress={() => setConfirmingFinalize(true)}
              disabled={finalizing}
              activeOpacity={0.8}
            >
              <Text style={styles.btnText}>🏆  Finalize Draft Day</Text>
            </TouchableOpacity>
          )}

          {confirmingFinalize && (
            <View style={styles.finalizeConfirmBox}>
              <Text style={styles.finalizeConfirmTitle}>Finalize Draft Day?</Text>
              <Text style={styles.finalizeConfirmBody}>
                This permanently seals the results. Members will see the leaderboard and your Draft Day champion.
                Season Receipts will remain pending and settle later.
              </Text>
              <View style={styles.finalizeConfirmButtons}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnSecondary, { flex: 1 }]}
                  onPress={() => { setConfirmingFinalize(false); setFinalizeError(null); }}
                  disabled={finalizing}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.btnText, { color: C.tint }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnFinalize, { flex: 1 }, finalizing && { opacity: 0.5 }]}
                  onPress={handleFinalize}
                  disabled={finalizing}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnText}>{finalizing ? "Finalizing…" : "🏆  Finalize"}</Text>
                </TouchableOpacity>
              </View>
              {finalizeError && (
                <Text style={styles.errorText}>{finalizeError}</Text>
              )}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

// ── PropCard component ────────────────────────────────────────────────────────

interface PropCardProps {
  prop: DraftDaySettlementProp;
  index: number;
  settling: boolean;
  propError: string | null;
  onSelect: (propId: string, answerId: string) => void;
}

function PropCard({ prop, index, settling, propError, onSelect }: PropCardProps) {
  const isSettled = prop.status === "settled";

  return (
    <View style={[styles.propCard, isSettled && styles.propCardSettled]}>
      {/* Question header */}
      <View style={styles.propHeader}>
        <View style={styles.propNumberBadge}>
          <Text style={styles.propNumberText}>{index + 1}</Text>
        </View>
        <View style={styles.propHeaderRight}>
          <Text style={styles.propQuestion}>{prop.question}</Text>
          <Text style={styles.propPoints}>{prop.point_value} pts</Text>
        </View>
        {isSettled && (
          <View style={styles.settledBadge}>
            <Text style={styles.settledBadgeText}>✓</Text>
          </View>
        )}
      </View>

      {/* Loading overlay */}
      {settling && (
        <View style={styles.propSettling}>
          <ActivityIndicator size="small" color={C.tint} />
          <Text style={styles.propSettlingText}>Saving…</Text>
        </View>
      )}

      {/* Answer options */}
      {!settling && (
        <View style={styles.answerList}>
          {prop.answer_options.map((opt) => {
            const isCorrect = isSettled && prop.correct_answer === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.answerOption,
                  isSettled && isCorrect && styles.answerOptionCorrect,
                  isSettled && !isCorrect && styles.answerOptionDimmed,
                ]}
                onPress={() => !isSettled && onSelect(prop.id, opt.id)}
                disabled={isSettled}
                activeOpacity={0.75}
              >
                <View style={[
                  styles.answerRadio,
                  isCorrect && styles.answerRadioSelected,
                ]}>
                  {isCorrect && <View style={styles.answerRadioDot} />}
                </View>
                <Text style={[
                  styles.answerLabel,
                  isCorrect && styles.answerLabelCorrect,
                ]}>
                  {opt.label}
                </Text>
                {isCorrect && (
                  <Text style={styles.correctMark}>✓</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {propError && (
        <Text style={styles.propErrorText}>{propError}</Text>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.background },
  content:    { paddingHorizontal: 20 },
  center: {
    flex: 1, backgroundColor: C.background,
    alignItems: "center", justifyContent: "center", padding: 32, gap: 12,
  },
  backBtn:    { marginBottom: 12 },
  linkText:   { color: C.tint, fontSize: 14 },
  errorText:  { color: "#f87171", fontSize: 14, textAlign: "center" },
  emoji:      { fontSize: 48, textAlign: "center" },
  finalizedText: { color: C.text, fontSize: 18, fontWeight: "600", textAlign: "center" },

  screenTitle: {
    color: C.text, fontSize: 26, fontWeight: "700", marginBottom: 6,
  },
  screenSub: {
    color: C.textSecondary, fontSize: 14, marginBottom: 20, lineHeight: 20,
  },

  // Progress
  progressCard: {
    backgroundColor: C.surface, borderRadius: 12, padding: 16,
    marginBottom: 20, gap: 10,
    borderWidth: 1, borderColor: C.border,
  },
  progressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressLabel: { color: C.textMuted, fontSize: 11, fontWeight: "600", letterSpacing: 0.8 },
  progressCount: { color: C.tint, fontSize: 14, fontWeight: "700" },
  progressBarBg: { height: 6, backgroundColor: C.border, borderRadius: 3 },
  progressBarFill: { height: 6, backgroundColor: C.tint, borderRadius: 3 },

  // Prop cards
  propCard: {
    backgroundColor: C.surface, borderRadius: 14, padding: 16,
    marginBottom: 16, gap: 12,
    borderWidth: 1, borderColor: C.border,
  },
  propCardSettled: { borderColor: "#22c55e33" },
  propHeader: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  propNumberBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.border, alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  propNumberText: { color: C.text, fontSize: 12, fontWeight: "700" },
  propHeaderRight: { flex: 1, gap: 2 },
  propQuestion: { color: C.text, fontSize: 15, fontWeight: "600", lineHeight: 20 },
  propPoints: { color: C.tint, fontSize: 12, fontWeight: "600" },
  settledBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "#22c55e", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  settledBadgeText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  propSettling: { flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 4 },
  propSettlingText: { color: C.textSecondary, fontSize: 14 },

  answerList: { gap: 8 },
  answerOption: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.background, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: C.border,
  },
  answerOptionCorrect: {
    backgroundColor: "#052E16", borderColor: "#22c55e",
  },
  answerOptionDimmed: { opacity: 0.45 },
  answerRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: C.textMuted,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  answerRadioSelected: { borderColor: "#22c55e" },
  answerRadioDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: "#22c55e",
  },
  answerLabel: { flex: 1, color: C.text, fontSize: 14, lineHeight: 18 },
  answerLabelCorrect: { color: "#4ade80", fontWeight: "600" },
  correctMark: { color: "#4ade80", fontSize: 16, fontWeight: "700" },

  propErrorText: { color: "#f87171", fontSize: 12, marginTop: 4 },

  // Season receipts
  seasonReceiptsCard: {
    backgroundColor: "#1A1A2E", borderRadius: 14, padding: 16, gap: 10,
    marginBottom: 20, borderWidth: 1, borderColor: "#2D2D5A",
  },
  seasonReceiptsTitle: { color: C.text, fontSize: 16, fontWeight: "700" },
  seasonReceiptsBadge: {
    alignSelf: "flex-start", backgroundColor: "#2D2D5A",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  seasonReceiptsBadgeText: { color: "#818CF8", fontSize: 12, fontWeight: "600" },
  seasonReceiptsBody: { color: C.textSecondary, fontSize: 13, lineHeight: 19 },

  // Finalize
  finalizeSection: {
    backgroundColor: "#0F2D1A", borderRadius: 16, padding: 20, gap: 12,
    marginBottom: 24, borderWidth: 1, borderColor: "#22c55e33",
    alignItems: "center",
  },
  finalizeSectionTitle: { color: "#4ade80", fontSize: 18, fontWeight: "700", textAlign: "center" },
  finalizeSectionBody: { color: C.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center" },

  finalizeConfirmBox: {
    backgroundColor: C.surface, borderRadius: 14, padding: 16, gap: 12,
    borderWidth: 1, borderColor: C.border, width: "100%",
  },
  finalizeConfirmTitle: { color: C.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  finalizeConfirmBody: { color: C.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center" },
  finalizeConfirmButtons: { flexDirection: "row", gap: 10 },

  // Buttons
  btn: {
    backgroundColor: C.tint, borderRadius: 12, paddingVertical: 14,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 16,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  btnSecondary: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  btnFinalize: { backgroundColor: "#16a34a" },
});
