/**
 * app/fantasy/standings/[leagueId]/[seasonId].tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 5 — Fantasy Season Standings Screen
 *
 * Shows cumulative standings across all finalized fantasy competitions
 * (Draft Day + all weekly rounds). Derived on-demand — no new table.
 *
 * • Members who played at least one competition appear in the leaderboard.
 * • Includes: rank, total_points, draft_day_points, weekly_points,
 *   competitions_played, weekly_wins.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
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
  getSeasonStandings,
  SeasonStandings,
  SeasonStandingEntry,
  FinalizedCompetition,
} from "@/lib/fantasy-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

export default function SeasonStandingsScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();
  const { guestToken, guestTokenLoading }   = useFantasyGuestToken();
  const { leagueId, seasonId }              = useLocalSearchParams<{
    leagueId: string; seasonId: string;
  }>();

  const [data, setData]           = useState<SeasonStandings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const auth = session ? { session } : guestToken ? { guestToken } : {};

  const load = useCallback(async (quiet = false) => {
    if (!leagueId || !seasonId) return;
    if (!session && !guestToken) return;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const d = await getSeasonStandings(leagueId, seasonId, auth);
      setData(d);
    } catch (e: any) {
      setError(e.message ?? "Failed to load standings");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leagueId, seasonId, session?.access_token, guestToken]);

  useEffect(() => {
    if (!authLoading && !guestTokenLoading) load();
  }, [authLoading, guestTokenLoading, load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (authLoading || guestTokenLoading || (loading && !data)) {
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
        <TouchableOpacity style={styles.btn} onPress={() => load()}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={styles.linkText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const competitions: FinalizedCompetition[] = data?.finalized_competitions ?? [];
  const standings:    SeasonStandingEntry[]   = data?.standings ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.tint} />}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.linkText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.heading}>Season Standings</Text>
      {data?.league_name && (
        <Text style={styles.sub}>{data.league_name} · {data.season_year} Season</Text>
      )}

      {/* Competitions included */}
      {competitions.length > 0 && (
        <View style={styles.chipsRow}>
          {competitions.map(c => (
            <View key={c.room_id} style={styles.chip}>
              <Text style={styles.chipText}>{c.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* No data yet */}
      {standings.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>No Standings Yet</Text>
          <Text style={styles.emptyBody}>
            Standings appear after the first competition is finalized and members have submitted picks.
          </Text>
        </View>
      )}

      {/* Standings table */}
      {standings.length > 0 && (
        <>
          {/* Column headers */}
          <View style={styles.tableHeader}>
            <Text style={[styles.thRank]}>RK</Text>
            <Text style={[styles.thName]}>MANAGER / TEAM</Text>
            <Text style={[styles.thNum]}>DD</Text>
            <Text style={[styles.thNum]}>WK</Text>
            <Text style={[styles.thTotal]}>TOT</Text>
          </View>

          <View style={styles.card}>
            {standings.map((entry, i) => {
              const isTop = i === 0;
              return (
                <View
                  key={entry.season_member_id}
                  style={[styles.row, i > 0 && styles.rowBorder, isTop && styles.rowTop]}
                >
                  <View style={[styles.rankCell, isTop && styles.rankCellTop]}>
                    <Text style={[styles.rank, isTop && styles.rankTop]}>
                      {entry.rank_label}
                    </Text>
                  </View>

                  <View style={styles.nameCell}>
                    <Text style={[styles.name, isTop && styles.nameTop]} numberOfLines={1}>
                      {entry.display_name ?? "—"}
                    </Text>
                    {entry.team_name && (
                      <Text style={styles.teamName} numberOfLines={1}>{entry.team_name}</Text>
                    )}
                    {entry.weekly_wins > 0 && (
                      <Text style={styles.wins}>🏆 {entry.weekly_wins} win{entry.weekly_wins !== 1 ? "s" : ""}</Text>
                    )}
                  </View>

                  <Text style={styles.numCell}>{entry.draft_day_points}</Text>
                  <Text style={styles.numCell}>{entry.weekly_points}</Text>
                  <Text style={[styles.totalCell, isTop && styles.totalCellTop]}>
                    {entry.total_points}
                  </Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.legend}>DD = Draft Day · WK = Weekly · TOT = Total pts</Text>
        </>
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
  heading: { fontSize: 26, fontWeight: "800", color: C.text, marginBottom: 4 },
  sub:     { fontSize: 13, color: C.textMuted, marginBottom: 16 },
  chipsRow:{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  chip: {
    backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  chipText: { fontSize: 12, fontWeight: "600", color: C.textSecondary },
  emptyCard: {
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 32, alignItems: "center", gap: 8,
  },
  emptyEmoji: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: C.text },
  emptyBody:  { fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 19 },
  // Table
  tableHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingBottom: 6, gap: 0,
  },
  thRank:  { width: 32, fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.6 },
  thName:  { flex: 1, fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.6 },
  thNum:   { width: 36, fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.6, textAlign: "center" },
  thTotal: { width: 44, fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.6, textAlign: "right" },
  card: {
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    overflow: "hidden", marginBottom: 12,
  },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 14, gap: 0,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  rowTop:    { backgroundColor: "#1A1500" },
  rankCell:  { width: 32, alignItems: "flex-start" },
  rankCellTop:  {},
  rank:     { fontSize: 14, fontWeight: "700", color: C.textMuted },
  rankTop:  { color: C.accentGold },
  nameCell: { flex: 1, paddingRight: 8 },
  name:     { fontSize: 14, fontWeight: "700", color: C.text },
  nameTop:  { color: C.accentGold },
  teamName: { fontSize: 12, color: C.textSecondary, marginTop: 1 },
  wins:     { fontSize: 11, color: C.accentGold, marginTop: 2 },
  numCell:  { width: 36, fontSize: 13, fontWeight: "600", color: C.textSecondary, textAlign: "center" },
  totalCell:   { width: 44, fontSize: 16, fontWeight: "800", color: C.tint, textAlign: "right" },
  totalCellTop:{ color: C.accentGold },
  legend: { fontSize: 11, color: C.textMuted, textAlign: "center", marginBottom: 12 },
  btn: {
    backgroundColor: C.tint, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 24,
    alignItems: "center", alignSelf: "stretch",
  },
  btnText:   { color: "#fff", fontWeight: "700", fontSize: 15 },
  linkText:  { color: C.tint, fontSize: 14, fontWeight: "600" },
  errorText: { color: C.danger, fontSize: 14, textAlign: "center" },
});
