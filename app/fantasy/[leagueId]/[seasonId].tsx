/**
 * app/fantasy/[leagueId]/[seasonId].tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Fantasy League Hub — read-only season overview for Phase 2.
 *
 * Shows:
 *   • League name, sport, season year, status
 *   • Full participants table (name, team, commissioner badge)
 *   • Weekly reward card (if set)
 *   • Phase placeholder for Draft Day
 *
 * Data source: GET /api/fantasy/leagues/:leagueId/seasons/:seasonId
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
  fantasyFetch,
  FANTASY_SPORTS,
  FantasySeasonDetail,
  FantasyParticipant,
} from "@/lib/fantasy-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

const SPORT_EMOJI: Record<string, string> = Object.fromEntries(
  FANTASY_SPORTS.map((s) => [s.value, s.emoji])
);

const STATUS_LABEL: Record<string, string> = {
  upcoming:  "Season Setup",
  active:    "In Season",
  completed: "Completed",
  archived:  "Archived",
};

const STATUS_COLOR: Record<string, string> = {
  upcoming:  C.textMuted,
  active:    "#22c55e",
  completed: C.textSecondary,
  archived:  C.textMuted,
};

export default function LeagueHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();
  const { leagueId, seasonId } = useLocalSearchParams<{
    leagueId: string;
    seasonId: string;
  }>();

  const [detail, setDetail] = useState<FantasySeasonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(
    async (quiet = false) => {
      if (!session || !leagueId || !seasonId) return;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const data = await fantasyFetch<FantasySeasonDetail>(
          `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}`,
          {},
          { session }
        );
        setDetail(data);
      } catch (e: any) {
        setError(e.message ?? "Failed to load league");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session, leagueId, seasonId]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!session) { setLoading(false); return; }
    fetchDetail();
  }, [authLoading, session?.access_token, leagueId, seasonId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDetail(true);
  };

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (authLoading || (loading && !detail)) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Sign in to view this league.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace("/auth")}>
          <Text style={styles.btnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => fetchDetail()}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={styles.backLinkText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!detail) return null;

  const { league, season, participants } = detail;

  const commissioner = participants.find((p) => p.role === "commissioner");
  const members = participants.filter((p) => p.role !== "commissioner");
  const orderedParticipants: FantasyParticipant[] = commissioner
    ? [commissioner, ...members]
    : participants;

  const sportEmoji = SPORT_EMOJI[league.sport] ?? "🏆";
  const sportLabel = league.sport.charAt(0).toUpperCase() + league.sport.slice(1);
  const statusLabel = STATUS_LABEL[season.status] ?? season.status;
  const statusColor = STATUS_COLOR[season.status] ?? C.textMuted;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.tint} />
      }
    >
      {/* Back */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backLinkText}>← Game Day</Text>
      </TouchableOpacity>

      {/* League header */}
      <View style={styles.leagueHeader}>
        <Text style={styles.sportEmoji}>{sportEmoji}</Text>
        <View style={styles.leagueHeaderText}>
          <Text style={styles.leagueName} numberOfLines={2}>
            {league.league_name}
          </Text>
          <Text style={styles.leagueMeta}>
            {sportLabel} · {season.season_year} Season
          </Text>
        </View>
        <View style={[styles.statusBadge, { borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Weekly reward */}
      {season.default_reward_description && (
        <View style={styles.rewardCard}>
          <Text style={styles.rewardLabel}>WEEKLY REWARD</Text>
          <Text style={styles.rewardText}>
            {season.default_reward_amount_display
              ? `${season.default_reward_amount_display} — `
              : ""}
            {season.default_reward_description}
          </Text>
        </View>
      )}

      {/* Participants */}
      <Text style={styles.sectionLabel}>
        MANAGERS & TEAMS · {orderedParticipants.length}
      </Text>

      <View style={styles.participantsCard}>
        {orderedParticipants.map((p, i) => (
          <View
            key={p.season_member_id}
            style={[styles.participantRow, i > 0 && styles.participantRowBorder]}
          >
            <View style={styles.participantLeft}>
              <Text style={styles.participantName}>{p.display_name ?? "—"}</Text>
              {p.role === "commissioner" && (
                <Text style={styles.commissionerBadge}>Commissioner</Text>
              )}
              {p.role === "co_commissioner" && (
                <Text style={styles.commissionerBadge}>Co-Commissioner</Text>
              )}
            </View>
            <Text style={styles.teamName} numberOfLines={1}>
              {p.team_name ?? <Text style={{ color: C.textMuted }}>No team</Text>}
            </Text>
          </View>
        ))}
      </View>

      {/* Phase placeholder */}
      <View style={styles.phaseCard}>
        <Text style={styles.phaseIcon}>📋</Text>
        <Text style={styles.phaseTitle}>Draft Day</Text>
        <Text style={styles.phaseSubtitle}>
          Prop assignment and draft management coming in the next phase.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 20 },
  center: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },

  backBtn: { marginBottom: 16 },
  backLinkText: { color: C.tint, fontSize: 15, fontWeight: "600" },

  // Header
  leagueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 20,
  },
  sportEmoji: { fontSize: 40 },
  leagueHeaderText: { flex: 1 },
  leagueName: { fontSize: 22, fontWeight: "700", color: C.text, lineHeight: 28 },
  leagueMeta: { fontSize: 13, color: C.textMuted, marginTop: 2 },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  statusText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },

  // Reward
  rewardCard: {
    backgroundColor: "#1A1800",
    borderColor: C.accentGold,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
  },
  rewardLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: C.accentGold,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  rewardText: { color: C.text, fontSize: 14, lineHeight: 20 },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // Participants
  participantsCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    marginBottom: 24,
  },
  participantRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  participantRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  participantLeft: { flex: 1, marginRight: 12 },
  participantName: { fontSize: 15, fontWeight: "600", color: C.text },
  commissionerBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: C.tint,
    letterSpacing: 0.4,
    marginTop: 2,
  },
  teamName: { fontSize: 14, color: C.textSecondary, flexShrink: 1 },

  // Phase placeholder
  phaseCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  phaseIcon: { fontSize: 32 },
  phaseTitle: { fontSize: 16, fontWeight: "700", color: C.text },
  phaseSubtitle: {
    fontSize: 13,
    color: C.textMuted,
    textAlign: "center",
    lineHeight: 19,
  },

  // Error/loading
  errorText: { color: C.danger, fontSize: 14, textAlign: "center" },
  btn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
