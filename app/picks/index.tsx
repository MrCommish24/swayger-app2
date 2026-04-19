import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";

const NBA_BLUE = "#1D428A";
const NBA_GOLD = "#FFC72C";

// ─── Types ────────────────────────────────────────────────────

interface PropDef {
  id: string;
  player_name: string;
  player_id: string;
  team: string;
  stat: string;
  stat_label: string;
  line: number;
  game: string;
  event_id: string;
  odd_id: string;
  status: "open" | "voided";
  result: "over" | "under" | null;
}

interface PropNight {
  id: string;
  date: string;
  lock_time: string;
  status: "open" | "locked" | "resolved";
  props: PropDef[];
}

interface UserPick {
  id: string;
  night_id: string;
  picks: { prop_id: string; pick: "over" | "under" }[];
  score: number;
  correct_count: number;
}

interface LeaderboardEntry {
  user_id: string;
  username: string;
  display_name: string;
  total_score: number;
  total_correct: number;
  nights_played: number;
}

// ─── Helpers ─────────────────────────────────────────────────

function statIcon(stat: string): keyof typeof Ionicons.glyphMap {
  if (stat === "points") return "basketball-outline";
  if (stat === "rebounds") return "sync-outline";
  if (stat === "assists") return "git-network-outline";
  return "stats-chart-outline";
}

function formatLockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function scoreLabel(score: number): string {
  if (score >= 250) return "Perfect Night 🔥";
  if (score >= 100) return "Strong Night";
  if (score >= 40) return "Decent Night";
  if (score >= 10) return "Getting Started";
  return "No Points";
}

// ─── Sub-components ──────────────────────────────────────────

function PropCard({
  prop,
  myPick,
  onPick,
  locked,
  showResult,
}: {
  prop: PropDef;
  myPick: "over" | "under" | undefined;
  onPick: (propId: string, side: "over" | "under") => void;
  locked: boolean;
  showResult: boolean;
}) {
  const voided = prop.status === "voided";

  function getOverStyle(side: "over" | "under") {
    if (showResult && prop.result) {
      const isCorrect = prop.result === side;
      const userPicked = myPick === side;
      if (userPicked && isCorrect) return [styles.pickBtn, styles.pickBtnCorrect];
      if (userPicked && !isCorrect) return [styles.pickBtn, styles.pickBtnWrong];
      if (!userPicked && isCorrect) return [styles.pickBtn, styles.pickBtnCorrectDim];
      return [styles.pickBtn, styles.pickBtnDim];
    }
    if (myPick === side) return [styles.pickBtn, styles.pickBtnSelected];
    return styles.pickBtn;
  }

  function getTextStyle(side: "over" | "under") {
    if (showResult && prop.result) {
      const isCorrect = prop.result === side;
      const userPicked = myPick === side;
      if (userPicked && isCorrect) return [styles.pickBtnText, styles.pickBtnTextCorrect];
      if (userPicked && !isCorrect) return [styles.pickBtnText, styles.pickBtnTextWrong];
    }
    if (myPick === side) return [styles.pickBtnText, styles.pickBtnTextSelected];
    return styles.pickBtnText;
  }

  return (
    <View style={[styles.propCard, voided && styles.propCardVoided]}>
      <View style={styles.propCardHeader}>
        <View style={styles.propStatBadge}>
          <Ionicons name={statIcon(prop.stat)} size={12} color={NBA_GOLD} />
          <Text style={styles.propStatLabel}>{prop.stat_label}</Text>
        </View>
        {voided && (
          <View style={styles.voidedBadge}>
            <Text style={styles.voidedText}>Voided · +25 pts</Text>
          </View>
        )}
      </View>

      <Text style={styles.propPlayerName}>{prop.player_name}</Text>
      <Text style={styles.propGame} numberOfLines={1}>{prop.game}</Text>

      <View style={styles.lineRow}>
        <Text style={styles.lineLabel}>O/U</Text>
        <Text style={styles.lineValue}>{prop.line}</Text>
      </View>

      {!voided && (
        <View style={styles.pickRow}>
          <Pressable
            style={getOverStyle("over")}
            onPress={() => !locked && !showResult && onPick(prop.id, "over")}
            disabled={locked || showResult}
          >
            {showResult && prop.result === "over" && myPick === "over" && (
              <Ionicons name="checkmark" size={12} color={Colors.dark.success} />
            )}
            {showResult && prop.result !== "over" && myPick === "over" && (
              <Ionicons name="close" size={12} color={Colors.dark.danger} />
            )}
            <Text style={getTextStyle("over")}>Over</Text>
          </Pressable>
          <Pressable
            style={getOverStyle("under")}
            onPress={() => !locked && !showResult && onPick(prop.id, "under")}
            disabled={locked || showResult}
          >
            {showResult && prop.result === "under" && myPick === "under" && (
              <Ionicons name="checkmark" size={12} color={Colors.dark.success} />
            )}
            {showResult && prop.result !== "under" && myPick === "under" && (
              <Ionicons name="close" size={12} color={Colors.dark.danger} />
            )}
            <Text style={getTextStyle("under")}>Under</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function LeaderboardView({ nightId }: { nightId: string }) {
  const { data, isLoading } = useQuery<{ ok: boolean; leaderboard: LeaderboardEntry[] }>({
    queryKey: ["/api/props/leaderboard"],
    staleTime: 60_000,
  });

  if (isLoading) return <ActivityIndicator color={NBA_GOLD} style={{ marginTop: 24 }} />;

  const entries = data?.leaderboard ?? [];

  return (
    <View style={styles.leaderboardSection}>
      <Text style={styles.sectionTitle}>Picks Leaderboard</Text>
      {entries.length === 0 ? (
        <Text style={styles.emptyText}>No scores yet this season.</Text>
      ) : (
        entries.slice(0, 20).map((entry, i) => (
          <View key={entry.user_id} style={styles.lbRow}>
            <Text style={[styles.lbRank, i < 3 && styles.lbRankTop]}>{i + 1}</Text>
            <View style={styles.lbName}>
              <Text style={styles.lbUsername}>
                {entry.display_name || entry.username || "Anonymous"}
              </Text>
              <Text style={styles.lbMeta}>
                {entry.nights_played} {entry.nights_played === 1 ? "night" : "nights"} ·{" "}
                {entry.total_correct} correct
              </Text>
            </View>
            <Text style={styles.lbScore}>{entry.total_score.toLocaleString()} pts</Text>
          </View>
        ))
      )}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────

export default function PicksScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [pendingPicks, setPendingPicks] = useState<Record<string, "over" | "under">>({});
  const [submitted, setSubmitted] = useState(false);
  const [activeTab, setActiveTab] = useState<"picks" | "leaderboard">("picks");

  const { data: nightData, isLoading: nightLoading } = useQuery<{ ok: boolean; night: PropNight | null }>({
    queryKey: ["/api/props/tonight"],
    staleTime: 60_000,
  });

  const night = nightData?.night ?? null;
  const isLocked = !night || night.status !== "open" || new Date() >= new Date(night.lock_time);
  const isResolved = night?.status === "resolved";

  const { data: myPickData } = useQuery<{ ok: boolean; pick: UserPick | null }>({
    queryKey: ["/api/props/my-picks", night?.id, user?.id],
    queryFn: async () => {
      if (!night?.id || !user?.id) return { ok: true, pick: null };
      const url = new URL("/api/props/my-picks", getApiUrl());
      url.searchParams.set("night_id", night.id);
      url.searchParams.set("user_id", user.id);
      const res = await fetch(url.toString());
      return res.json();
    },
    enabled: !!night?.id && !!user?.id,
    staleTime: 30_000,
  });

  const myPick = myPickData?.pick ?? null;

  const existingPickMap: Record<string, "over" | "under"> = {};
  if (myPick?.picks) {
    for (const p of myPick.picks) {
      existingPickMap[p.prop_id] = p.pick;
    }
  }

  // Pre-populate pending picks from saved server picks (so user can edit them)
  useEffect(() => {
    if (myPick?.picks && Object.keys(pendingPicks).length === 0) {
      const map: Record<string, "over" | "under"> = {};
      for (const p of myPick.picks) map[p.prop_id] = p.pick;
      setPendingPicks(map);
    }
  }, [myPick]);

  // Before lock: use pendingPicks (editable). After lock/resolved: use server picks.
  const activePicks = isLocked || isResolved ? existingPickMap : pendingPicks;

  const submitMutation = useMutation({
    mutationFn: async (picks: { prop_id: string; pick: "over" | "under" }[]) => {
      const url = new URL("/api/props/pick", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ night_id: night!.id, user_id: user!.id, picks }),
      });
      if (!res.ok) throw new Error("Failed to submit picks");
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/props/my-picks", night?.id, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/props/leaderboard"] });
    },
    onError: () => {
      Alert.alert("Error", "Could not submit picks. Please try again.");
    },
  });

  const handlePick = useCallback((propId: string, side: "over" | "under") => {
    setPendingPicks((prev) => ({ ...prev, [propId]: side }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!night || !user) return;
    const picks = Object.entries(pendingPicks).map(([prop_id, pick]) => ({ prop_id, pick }));
    if (picks.length !== night.props.length) {
      Alert.alert("Pick all props", "Make a pick on every prop before submitting.");
      return;
    }
    submitMutation.mutate(picks);
  }, [night, user, pendingPicks, submitMutation]);

  const allPicked =
    night &&
    night.props.filter((p) => p.status !== "voided").every((p) => pendingPicks[p.id]);

  const hasPriorPicks = !!myPick;

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>NBA PLAYOFFS CHALLENGE</Text>
        <Text style={styles.title}>Picks</Text>
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabBtn, activeTab === "picks" && styles.tabBtnActive]}
            onPress={() => setActiveTab("picks")}
          >
            <Text style={[styles.tabBtnText, activeTab === "picks" && styles.tabBtnTextActive]}>
              Tonight
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, activeTab === "leaderboard" && styles.tabBtnActive]}
            onPress={() => setActiveTab("leaderboard")}
          >
            <Text style={[styles.tabBtnText, activeTab === "leaderboard" && styles.tabBtnTextActive]}>
              Leaderboard
            </Text>
          </Pressable>
        </View>
      </View>

      {activeTab === "leaderboard" ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          <LeaderboardView nightId={night?.id ?? ""} />
        </ScrollView>
      ) : nightLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={NBA_GOLD} />
        </View>
      ) : !night ? (
        <View style={styles.centered}>
          <Ionicons name="moon-outline" size={48} color={Colors.dark.textSecondary} />
          <Text style={styles.emptyHeading}>No picks tonight</Text>
          <Text style={styles.emptyBody}>Check back on game nights during the playoffs.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Night header */}
          <View style={styles.nightHeader}>
            <View style={styles.nightHeaderLeft}>
              <Text style={styles.nightDate}>
                {new Date(night.date + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
              {isResolved ? (
                <View style={[styles.statusPill, styles.statusPillResolved]}>
                  <Ionicons name="checkmark-circle" size={12} color={Colors.dark.success} />
                  <Text style={[styles.statusText, { color: Colors.dark.success }]}>Results in</Text>
                </View>
              ) : isLocked ? (
                <View style={[styles.statusPill, styles.statusPillLocked]}>
                  <Ionicons name="lock-closed" size={12} color={Colors.dark.textSecondary} />
                  <Text style={[styles.statusText, { color: Colors.dark.textSecondary }]}>Locked</Text>
                </View>
              ) : (
                <View style={[styles.statusPill, styles.statusPillOpen]}>
                  <Ionicons name="time-outline" size={12} color={NBA_GOLD} />
                  <Text style={[styles.statusText, { color: NBA_GOLD }]}>
                    Locks {formatLockTime(night.lock_time)}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.scoringGuide}>
              <Text style={styles.scoringGuideTitle}>Scoring</Text>
              <Text style={styles.scoringGuideRow}>1/4 · 10 pts</Text>
              <Text style={styles.scoringGuideRow}>2/4 · 40 pts</Text>
              <Text style={styles.scoringGuideRow}>3/4 · 100 pts</Text>
              <Text style={[styles.scoringGuideRow, { color: NBA_GOLD }]}>4/4 · 250 pts 🔥</Text>
            </View>
          </View>

          {/* Result summary for resolved nights */}
          {isResolved && myPick && (
            <View style={styles.resultSummary}>
              <Text style={styles.resultScore}>{myPick.score} pts</Text>
              <Text style={styles.resultLabel}>
                {myPick.correct_count}/{night.props.filter((p) => p.status !== "voided").length} correct ·{" "}
                {scoreLabel(myPick.score)}
              </Text>
            </View>
          )}

          {/* Prior picks submitted banner */}
          {hasPriorPicks && !isResolved && (
            <View style={styles.submittedBanner}>
              <Ionicons
                name={isLocked ? "lock-closed" : "checkmark-circle"}
                size={16}
                color={isLocked ? Colors.dark.textSecondary : Colors.dark.success}
              />
              <Text style={[styles.submittedText, isLocked && { color: Colors.dark.textSecondary }]}>
                {isLocked ? "Picks locked in" : "Picks saved · tap any card to change"}
              </Text>
            </View>
          )}

          {/* Props */}
          <View style={styles.propsGrid}>
            {night.props.map((prop) => (
              <PropCard
                key={prop.id}
                prop={prop}
                myPick={activePicks[prop.id]}
                onPick={handlePick}
                locked={isLocked}
                showResult={isResolved}
              />
            ))}
          </View>

          {/* Submit button */}
          {!isLocked && (
            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                !allPicked && styles.submitBtnDisabled,
                pressed && allPicked && styles.submitBtnPressed,
              ]}
              onPress={handleSubmit}
              disabled={!allPicked || submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="flash" size={18} color="#FFFFFF" />
                  <Text style={styles.submitBtnText}>{hasPriorPicks ? "Update Picks" : "Submit Picks"}</Text>
                </>
              )}
            </Pressable>
          )}

          <LeaderboardView nightId={night.id} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyHeading: { fontSize: 20, fontWeight: "700", color: Colors.dark.text, textAlign: "center" },
  emptyBody: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 20 },
  emptyText: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center", marginTop: 12 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: NBA_GOLD,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  tabRow: { flexDirection: "row", gap: 8 },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
  },
  tabBtnActive: { backgroundColor: NBA_BLUE },
  tabBtnText: { fontSize: 13, fontWeight: "600", color: Colors.dark.textSecondary },
  tabBtnTextActive: { color: "#FFFFFF" },

  scrollContent: { padding: 16, gap: 16 },

  nightHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 16,
  },
  nightHeaderLeft: { gap: 8, flex: 1 },
  nightDate: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusPillOpen: { backgroundColor: "rgba(255,199,44,0.12)" },
  statusPillLocked: { backgroundColor: "rgba(255,255,255,0.06)" },
  statusPillResolved: { backgroundColor: "rgba(16,185,129,0.12)" },
  statusText: { fontSize: 12, fontWeight: "600" },

  scoringGuide: { alignItems: "flex-end", gap: 2 },
  scoringGuideTitle: { fontSize: 10, color: Colors.dark.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },
  scoringGuideRow: { fontSize: 11, color: Colors.dark.textSecondary },

  resultSummary: {
    backgroundColor: "rgba(16,185,129,0.10)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.25)",
    padding: 16,
    alignItems: "center",
    gap: 4,
  },
  resultScore: { fontSize: 36, fontWeight: "800", color: Colors.dark.success },
  resultLabel: { fontSize: 14, color: Colors.dark.textSecondary },

  submittedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16,185,129,0.10)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.25)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  submittedText: { fontSize: 13, fontWeight: "600", color: Colors.dark.success },

  propsGrid: { gap: 12 },

  propCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 16,
    gap: 6,
  },
  propCardVoided: { opacity: 0.5 },
  propCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  propStatBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,199,44,0.10)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  propStatLabel: { fontSize: 11, fontWeight: "600", color: NBA_GOLD, textTransform: "uppercase", letterSpacing: 0.6 },
  voidedBadge: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  voidedText: { fontSize: 11, fontWeight: "600", color: Colors.dark.textSecondary },

  propPlayerName: { fontSize: 18, fontWeight: "700", color: Colors.dark.text, marginTop: 2 },
  propGame: { fontSize: 12, color: Colors.dark.textSecondary },

  lineRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 },
  lineLabel: { fontSize: 12, color: Colors.dark.textMuted, textTransform: "uppercase", letterSpacing: 0.6 },
  lineValue: { fontSize: 28, fontWeight: "800", color: Colors.dark.text },

  pickRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  pickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  pickBtnSelected: {
    backgroundColor: NBA_BLUE,
    borderColor: NBA_BLUE,
  },
  pickBtnCorrect: {
    backgroundColor: "rgba(16,185,129,0.15)",
    borderColor: Colors.dark.success,
  },
  pickBtnCorrectDim: {
    backgroundColor: "rgba(16,185,129,0.06)",
    borderColor: "rgba(16,185,129,0.25)",
  },
  pickBtnWrong: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderColor: Colors.dark.danger,
  },
  pickBtnDim: {
    opacity: 0.4,
  },
  pickBtnText: { fontSize: 14, fontWeight: "600", color: Colors.dark.textSecondary },
  pickBtnTextSelected: { color: "#FFFFFF" },
  pickBtnTextCorrect: { color: Colors.dark.success },
  pickBtnTextWrong: { color: Colors.dark.danger },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: NBA_BLUE,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnPressed: { opacity: 0.85 },
  submitBtnText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },

  leaderboardSection: { gap: 2, marginTop: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    marginBottom: 6,
    gap: 12,
  },
  lbRank: { fontSize: 14, fontWeight: "700", color: Colors.dark.textSecondary, width: 22, textAlign: "center" },
  lbRankTop: { color: NBA_GOLD },
  lbName: { flex: 1, gap: 2 },
  lbUsername: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  lbMeta: { fontSize: 11, color: Colors.dark.textMuted },
  lbScore: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },
});
