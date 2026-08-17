/**
 * app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/league-picks.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 6C — Weekly League Picks Social Reveal Screen
 *
 * Accessible after the card is locked. Shows pick distribution for every
 * competition question — counts, percentages, picker names, and correct markers.
 *
 * Auth: same resolution as weekly play (Bearer token or guest token).
 * Privacy: server returns { revealed: false } while open; this screen redirects back.
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
  getWeeklyLeaguePicks,
  LeaguePicksRevealed,
} from "@/lib/fantasy-api";
import { LeaguePicks } from "@/components/fantasy/LeaguePicks";
import Colors from "@/constants/colors";

const C = Colors.dark;

export default function WeeklyLeaguePicksScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();
  const { guestToken, guestTokenLoading }   = useFantasyGuestToken();
  const { leagueId, seasonId, weekNumber }  = useLocalSearchParams<{
    leagueId: string; seasonId: string; weekNumber: string;
  }>();

  const wn = parseInt(weekNumber ?? "1", 10);

  const [data, setData]           = useState<LeaguePicksRevealed | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const auth = session ? { session } : guestToken ? { guestToken } : {};

  const load = useCallback(async (quiet = false) => {
    if (!leagueId || !seasonId || !wn) return;
    if (!session && !guestToken) return;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const resp = await getWeeklyLeaguePicks(leagueId, seasonId, wn, auth);
      if (!resp.revealed) {
        // Card still open — go back to play screen
        router.replace(`/fantasy/weeks/${leagueId}/${seasonId}/${wn}/play` as any);
        return;
      }
      setData(resp);
    } catch (e: any) {
      setError(e.message ?? "Failed to load League Picks");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leagueId, seasonId, wn, session?.access_token, guestToken]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  useEffect(() => {
    if (!authLoading && !guestTokenLoading) load();
  }, [authLoading, guestTokenLoading, load]);

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
        <TouchableOpacity style={styles.btn} onPress={() => load()}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={styles.linkText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data) return null;

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
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.linkText}>← Week {wn}</Text>
      </TouchableOpacity>

      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>🔒 Picks Are Locked</Text>
        <Text style={styles.pageSubtitle}>The receipts are in. See how your league picked.</Text>
      </View>

      <LeaguePicks data={data} />
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
  pageHeader: { marginBottom: 20, gap: 4 },
  pageTitle: { fontSize: 22, fontWeight: "800", color: C.text },
  pageSubtitle: { fontSize: 14, color: C.textMuted, lineHeight: 20 },
  btn: {
    backgroundColor: C.tint, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 24,
    alignItems: "center", alignSelf: "stretch",
  },
  btnText:   { color: "#fff", fontWeight: "700", fontSize: 15 },
  linkText:  { color: C.tint, fontSize: 14, fontWeight: "600" },
  errorText: { color: C.danger, fontSize: 14, textAlign: "center" },
});
