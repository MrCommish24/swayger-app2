/**
 * app/fantasy/draft-day/[leagueId]/[seasonId]/results.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 4C — Draft Day Results Screen.
 *
 * Available to all league members (and guests) once the commissioner finalizes
 * the Draft Day. Shows:
 *   • Champion banner (ties = co-champions)
 *   • Full leaderboard with rank, points, correct count
 *   • Viewer's own competition picks with correct answers + points earned
 *   • Season Receipts pending summary
 *
 * Before finalization: shows a "not ready yet" placeholder.
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
import { useFantasyGuestToken } from "@/lib/use-fantasy-guest-token";
import {
  getDraftDayResults,
  DraftDayResults,
  DraftDayResultsPickEntry,
} from "@/lib/fantasy-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

export default function DraftDayResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { guestToken } = useFantasyGuestToken();
  const { leagueId, seasonId } = useLocalSearchParams<{
    leagueId: string;
    seasonId: string;
  }>();

  const [results, setResults]     = useState<DraftDayResults | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const fetchResults = useCallback(async (quiet = false) => {
    if (!leagueId || !seasonId) return;
    const auth = session ? { session } : guestToken ? { guestToken } : null;
    if (!auth) { setLoading(false); return; }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const data = await getDraftDayResults(leagueId, seasonId, auth);
      setResults(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to load results");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leagueId, seasonId, session, guestToken]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  if (loading && !results) {
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
        <TouchableOpacity style={styles.btn} onPress={() => fetchResults()}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={styles.linkText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Before finalization
  if (!results?.finalized) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.notReadyEmoji}>⏳</Text>
        <Text style={styles.notReadyTitle}>Results Not Ready Yet</Text>
        <Text style={styles.notReadyBody}>
          Your commissioner is still resolving the Draft Day questions. Check back soon!
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={styles.linkText}>← Back to League Hub</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const {
    league_name, season_year, winners = [], leaderboard = [],
    my_competition_picks = [], my_total_points = 0, my_correct_count = 0,
    season_props_pending_count = 0, total_competition_props = 0,
  } = results;

  const hasMyPicks = my_competition_picks.length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchResults(true); }}
          tintColor={C.tint}
        />
      }
    >
      {/* Back */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.linkText}>← Back to Hub</Text>
      </TouchableOpacity>

      {/* League header */}
      {league_name && (
        <Text style={styles.leagueName}>{league_name}</Text>
      )}
      <Text style={styles.screenTitle}>
        Draft Day Results{season_year ? ` · ${season_year}` : ""}
      </Text>

      {/* Champion banner */}
      {winners.length > 0 && (
        <View style={styles.championCard}>
          <Text style={styles.championEmoji}>🏆</Text>
          <Text style={styles.championLabel}>
            {winners.length > 1 ? "CO-CHAMPIONS" : "DRAFT DAY CHAMPION"}
          </Text>
          {winners.map((w, i) => (
            <View key={i} style={styles.championEntry}>
              <Text style={styles.championName}>{w.display_name}</Text>
              {w.team_name && (
                <Text style={styles.championTeam}>{w.team_name}</Text>
              )}
              <Text style={styles.championPoints}>{w.points} pts</Text>
            </View>
          ))}
        </View>
      )}

      {/* Leaderboard */}
      <Text style={styles.sectionLabel}>LEADERBOARD</Text>
      <View style={styles.leaderboardCard}>
        {leaderboard.map((entry, i) => {
          const isTop = entry.rank === 1;
          return (
            <View
              key={entry.participant_id}
              style={[
                styles.leaderboardRow,
                i > 0 && styles.leaderboardRowBorder,
                isTop && styles.leaderboardRowTop,
              ]}
            >
              <View style={[styles.rankBadge, isTop && styles.rankBadgeTop]}>
                <Text style={[styles.rankText, isTop && styles.rankTextTop]}>
                  {entry.rank_label}
                </Text>
              </View>
              <View style={styles.leaderboardEntryInfo}>
                <Text style={[styles.leaderboardName, isTop && styles.leaderboardNameTop]}>
                  {entry.display_name}
                  {isTop && " 🏆"}
                </Text>
                {entry.team_name && (
                  <Text style={styles.leaderboardTeam}>{entry.team_name}</Text>
                )}
                <Text style={styles.leaderboardCorrect}>
                  {entry.correct_count} correct
                </Text>
              </View>
              <Text style={[styles.leaderboardPoints, isTop && styles.leaderboardPointsTop]}>
                {entry.points}
                {"\n"}
                <Text style={styles.ptsLabel}>pts</Text>
              </Text>
            </View>
          );
        })}
        {leaderboard.length === 0 && (
          <Text style={styles.emptyText}>No participants yet.</Text>
        )}
      </View>

      {/* My picks breakdown */}
      {hasMyPicks && (
        <>
          <Text style={styles.sectionLabel}>MY PICKS</Text>
          <View style={styles.myScoreSummary}>
            <View style={styles.myScoreItem}>
              <Text style={styles.myScoreNum}>{my_total_points}</Text>
              <Text style={styles.myScoreLabel}>Total Points</Text>
            </View>
            <View style={styles.myScoreDivider} />
            <View style={styles.myScoreItem}>
              <Text style={styles.myScoreNum}>{my_correct_count}</Text>
              <Text style={styles.myScoreLabel}>Correct</Text>
            </View>
            <View style={styles.myScoreDivider} />
            <View style={styles.myScoreItem}>
              <Text style={styles.myScoreNum}>{my_competition_picks.length}</Text>
              <Text style={styles.myScoreLabel}>Answered</Text>
            </View>
          </View>
          {my_competition_picks.map((pick) => (
            <PickRow key={pick.prop_id} pick={pick} />
          ))}
        </>
      )}

      {/* League Picks link — available on finalized Draft Day (§33) */}
      <TouchableOpacity
        style={styles.leaguePicksLink}
        onPress={() =>
          router.push(`/fantasy/draft-day/${leagueId}/${seasonId}/league-picks` as any)
        }
        activeOpacity={0.8}
      >
        <Text style={styles.leaguePicksLinkText}>🗳  View League Picks →</Text>
      </TouchableOpacity>

      {/* Season Receipts pending */}
      {season_props_pending_count > 0 && (
        <View style={styles.seasonPendingCard}>
          <Text style={styles.seasonPendingTitle}>🗓  Season Receipts</Text>
          <View style={styles.seasonPendingBadge}>
            <Text style={styles.seasonPendingBadgeText}>Pending</Text>
          </View>
          <Text style={styles.seasonPendingBody}>
            {season_props_pending_count} season prediction{season_props_pending_count !== 1 ? "s" : ""} will be settled as the season unfolds.
            They don't affect the Draft Day results above.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── PickRow ───────────────────────────────────────────────────────────────────

function PickRow({ pick }: { pick: DraftDayResultsPickEntry }) {
  const isCorrect  = pick.is_correct === true;
  const isWrong    = pick.is_correct === false;
  const noPick     = pick.my_answer_id === null;

  return (
    <View style={[
      styles.pickRow,
      isCorrect && styles.pickRowCorrect,
      isWrong   && styles.pickRowWrong,
      noPick    && styles.pickRowNo,
    ]}>
      <View style={styles.pickIcon}>
        <Text style={styles.pickIconText}>
          {noPick ? "—" : isCorrect ? "✓" : "✗"}
        </Text>
      </View>
      <View style={styles.pickInfo}>
        <Text style={styles.pickQuestion}>{pick.question}</Text>
        <Text style={styles.pickMyAnswer}>
          My pick: {pick.my_answer_label ?? "—"}
        </Text>
        <Text style={[
          styles.pickCorrectAnswer,
          isCorrect && styles.pickCorrectGreen,
        ]}>
          Correct: {pick.correct_answer_label ?? "—"}
        </Text>
      </View>
      <View style={styles.pickPointsCol}>
        <Text style={[styles.pickPoints, isCorrect && styles.pickPointsGreen]}>
          {isCorrect ? `+${pick.points_earned}` : "0"}
        </Text>
        <Text style={styles.ptsLabel}>pts</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content:   { paddingHorizontal: 20 },
  center: {
    flex: 1, backgroundColor: C.background,
    alignItems: "center", justifyContent: "center", padding: 32, gap: 12,
  },
  backBtn:   { marginBottom: 12 },
  linkText:  { color: C.tint, fontSize: 14 },
  errorText: { color: "#f87171", fontSize: 14, textAlign: "center" },

  notReadyEmoji: { fontSize: 48, textAlign: "center" },
  notReadyTitle: { color: C.text, fontSize: 20, fontWeight: "700", textAlign: "center" },
  notReadyBody:  { color: C.textSecondary, fontSize: 14, textAlign: "center", lineHeight: 20 },

  leagueName:   { color: C.textMuted, fontSize: 13, marginBottom: 2 },
  screenTitle:  { color: C.text, fontSize: 24, fontWeight: "700", marginBottom: 20 },

  // Champion
  championCard: {
    backgroundColor: "#1A1200", borderRadius: 16, padding: 20, gap: 6,
    alignItems: "center", marginBottom: 24,
    borderWidth: 1, borderColor: "#B45309",
  },
  championEmoji: { fontSize: 40 },
  championLabel: { color: C.accentGold, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 4 },
  championEntry: { alignItems: "center", gap: 2 },
  championName:  { color: C.text, fontSize: 20, fontWeight: "700" },
  championTeam:  { color: C.textSecondary, fontSize: 14 },
  championPoints: { color: C.accentGold, fontSize: 16, fontWeight: "700" },

  // Leaderboard
  sectionLabel: {
    color: C.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1,
    marginBottom: 10, marginTop: 4,
  },
  leaderboardCard: {
    backgroundColor: C.surface, borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: C.border, marginBottom: 24,
  },
  leaderboardRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
  },
  leaderboardRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  leaderboardRowTop: { backgroundColor: "#1A1200" },
  rankBadge: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  rankBadgeTop: { backgroundColor: "#B45309" },
  rankText:     { color: C.textSecondary, fontSize: 13, fontWeight: "700" },
  rankTextTop:  { color: "#fff" },
  leaderboardEntryInfo: { flex: 1, gap: 1 },
  leaderboardName: { color: C.text, fontSize: 15, fontWeight: "600" },
  leaderboardNameTop: { color: C.accentGold },
  leaderboardTeam: { color: C.textSecondary, fontSize: 12 },
  leaderboardCorrect: { color: C.textMuted, fontSize: 11 },
  leaderboardPoints: {
    color: C.text, fontSize: 18, fontWeight: "700", textAlign: "right", flexShrink: 0,
  },
  leaderboardPointsTop: { color: C.accentGold },
  ptsLabel: { color: C.textMuted, fontSize: 10, fontWeight: "400" },
  emptyText: { color: C.textMuted, fontSize: 14, textAlign: "center", padding: 20 },

  // My score summary
  myScoreSummary: {
    flexDirection: "row", backgroundColor: C.surface, borderRadius: 14,
    padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border,
    alignItems: "center",
  },
  myScoreItem: { flex: 1, alignItems: "center", gap: 2 },
  myScoreNum:  { color: C.tint, fontSize: 22, fontWeight: "700" },
  myScoreLabel: { color: C.textMuted, fontSize: 11 },
  myScoreDivider: { width: 1, height: 36, backgroundColor: C.border },

  // Pick rows
  pickRow: {
    flexDirection: "row", gap: 12, alignItems: "flex-start",
    backgroundColor: C.surface, borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  pickRowCorrect: { borderColor: "#22c55e33", backgroundColor: "#052E16" },
  pickRowWrong:   { borderColor: "#ef444433", backgroundColor: "#2D1515" },
  pickRowNo:      { opacity: 0.6 },
  pickIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  pickIconText: { fontSize: 13, fontWeight: "700", color: C.text },
  pickInfo: { flex: 1, gap: 3 },
  pickQuestion: { color: C.text, fontSize: 14, fontWeight: "600", lineHeight: 18 },
  pickMyAnswer: { color: C.textSecondary, fontSize: 12 },
  pickCorrectAnswer: { color: C.textMuted, fontSize: 12 },
  pickCorrectGreen: { color: "#4ade80" },
  pickPointsCol: { alignItems: "flex-end", flexShrink: 0, gap: 1 },
  pickPoints: { color: C.text, fontSize: 16, fontWeight: "700" },
  pickPointsGreen: { color: "#4ade80" },

  // Season pending
  seasonPendingCard: {
    backgroundColor: "#1A1A2E", borderRadius: 14, padding: 16, gap: 10,
    marginTop: 8, marginBottom: 24, borderWidth: 1, borderColor: "#2D2D5A",
  },
  seasonPendingTitle: { color: C.text, fontSize: 16, fontWeight: "700" },
  seasonPendingBadge: {
    alignSelf: "flex-start", backgroundColor: "#2D2D5A",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  seasonPendingBadgeText: { color: "#818CF8", fontSize: 12, fontWeight: "600" },
  seasonPendingBody: { color: C.textSecondary, fontSize: 13, lineHeight: 19 },

  leaguePicksLink: {
    backgroundColor: "#0A0F1E", borderRadius: 12,
    borderWidth: 1.5, borderColor: C.tint,
    padding: 16, alignItems: "center" as const, marginBottom: 12,
  },
  leaguePicksLinkText: { fontSize: 15, fontWeight: "700" as const, color: C.tint },

  // Buttons
  btn: {
    backgroundColor: C.tint, borderRadius: 12, paddingVertical: 14,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 16,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
