import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import {
  fantasyFetch,
  getArchivedLeagues,
  restoreLeague,
  FANTASY_SPORTS,
  FantasyLeague,
} from "@/lib/fantasy-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

/** The existing league browser, shared by the Fantasy tab and legacy entry points. */
export default function FantasyLeaguesSection() {
  const router = useRouter();
  const { session, isLoading: authLoading } = useAuth();
  const [leagues, setLeagues] = useState<FantasyLeague[]>([]);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [archivedLeagues, setArchivedLeagues] = useState<FantasyLeague[]>([]);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadLeagues = useCallback(async () => {
    if (!session) return;
    setLeagueLoading(true);
    try {
      const result = await fantasyFetch<{ leagues: FantasyLeague[] }>(
        "/api/fantasy/leagues",
        {},
        { session },
      );
      setLeagues(result.leagues);
    } catch {
      // Keep the existing empty-state fallback when the league request fails.
    } finally {
      setLeagueLoading(false);
      setFetched(true);
    }
  }, [session]);

  const loadArchivedLeagues = useCallback(async () => {
    if (!session) return;
    setArchivedLoading(true);
    try {
      const result = await getArchivedLeagues({ session });
      setArchivedLeagues(result.leagues);
    } catch {
      setArchivedLeagues([]);
    } finally {
      setArchivedLoading(false);
    }
  }, [session]);

  const toggleArchived = useCallback(() => {
    const next = !archivedExpanded;
    setArchivedExpanded(next);
    if (next) loadArchivedLeagues();
  }, [archivedExpanded, loadArchivedLeagues]);

  const restore = useCallback(async (leagueId: string) => {
    if (!session) return;
    setRestoringId(leagueId);
    try {
      await restoreLeague(leagueId, { session });
      await Promise.all([loadLeagues(), loadArchivedLeagues()]);
    } catch {
      // Preserve the existing non-blocking restore behavior.
    } finally {
      setRestoringId(null);
    }
  }, [session, loadLeagues, loadArchivedLeagues]);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      setFetched(true);
      return;
    }
    loadLeagues();
  }, [authLoading, session?.access_token]);

  useFocusEffect(useCallback(() => {
    if (!authLoading && session) loadLeagues();
  }, [authLoading, session?.access_token, loadLeagues]));

  if (authLoading && !fetched) return null;

  if (!session) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>FANTASY SWAYGER</Text>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.82 }]}
          onPress={() => router.push("/auth" as never)}
        >
          <Text style={styles.cardTitle}>Run Your Own Fantasy League</Text>
          <Text style={styles.cardBody}>
            Bring your fantasy league to Swayger for Draft Day and weekly prediction competitions.
          </Text>
          <View style={styles.cta}><Text style={styles.ctaText}>Sign In to Get Started →</Text></View>
        </Pressable>
      </View>
    );
  }

  if (leagueLoading && !fetched) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>FANTASY SWAYGER</Text>
        <ActivityIndicator color={C.tint} size="small" style={{ alignSelf: "flex-start", marginTop: 4 }} />
      </View>
    );
  }

  if (leagues.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>FANTASY SWAYGER</Text>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.82 }]}
          onPress={() => router.push("/fantasy/setup" as never)}
        >
          <Text style={styles.cardTitle}>Create Fantasy League</Text>
          <Text style={styles.cardBody}>
            Bring your fantasy league to Swayger for Draft Day and weekly prediction competitions.
          </Text>
          <View style={styles.cta}><Text style={styles.ctaText}>Create Fantasy League →</Text></View>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>MY FANTASY LEAGUES</Text>
      {leagues.map((league) => {
        const season = [...(league.fantasy_league_seasons ?? [])]
          .sort((a, b) => b.season_year - a.season_year)[0];
        const sportIcon = FANTASY_SPORTS.find((sport) => sport.value === league.sport)?.emoji ?? "🏆";
        return (
          <Pressable
            key={league.id}
            accessibilityRole="button"
            style={({ pressed }) => [styles.leagueCard, pressed && { opacity: 0.82 }]}
            onPress={() => season && router.push(`/fantasy/${league.id}/${season.id}` as never)}
          >
            <View style={styles.leagueTop}>
              <Text style={styles.leagueName}>{sportIcon}{"  "}{league.league_name}</Text>
              {season && (
                <Text style={styles.leagueMeta}>
                  {season.season_year} • {league.sport.charAt(0).toUpperCase() + league.sport.slice(1)}
                </Text>
              )}
            </View>
            <View style={styles.cta}><Text style={styles.ctaText}>Open League →</Text></View>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.createMoreLink, pressed && { opacity: 0.6 }]}
        onPress={() => router.push("/fantasy/setup" as never)}
      >
        <Text style={styles.createMoreText}>+ Create Fantasy League</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.archivedToggle, pressed && { opacity: 0.7 }]}
        onPress={toggleArchived}
      >
        <Text style={styles.archivedToggleText}>{archivedExpanded ? "▲" : "▼"}{"  "}Archived Leagues</Text>
      </Pressable>
      {archivedExpanded && (
        <>
          {archivedLoading ? (
            <ActivityIndicator color={C.tint} size="small" style={{ alignSelf: "flex-start", marginLeft: 8, marginTop: 4 }} />
          ) : archivedLeagues.length === 0 ? (
            <Text style={styles.archivedEmpty}>No archived leagues</Text>
          ) : archivedLeagues.map((league) => {
            const season = [...(league.fantasy_league_seasons ?? [])]
              .sort((a, b) => b.season_year - a.season_year)[0];
            const sportIcon = FANTASY_SPORTS.find((sport) => sport.value === league.sport)?.emoji ?? "🏆";
            const restoring = restoringId === league.id;
            return (
              <View key={league.id} style={styles.archivedCard}>
                <View style={styles.archivedCardLeft}>
                  <Text style={styles.archivedCardName} numberOfLines={1}>{sportIcon}{"  "}{league.league_name}</Text>
                  {season && <Text style={styles.archivedCardMeta}>{season.season_year} · Archived</Text>}
                </View>
                <View style={styles.archivedCardActions}>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    style={({ pressed }) => [styles.archivedActionBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => season && router.push(`/fantasy/${league.id}/${season.id}` as never)}
                  >
                    <Text style={styles.archivedActionText}>View</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={restoring}
                    hitSlop={8}
                    style={({ pressed }) => [styles.archivedActionBtn, styles.archivedRestoreBtn, (pressed || restoring) && { opacity: 0.6 }]}
                    onPress={() => restore(league.id)}
                  >
                    {restoring
                      ? <ActivityIndicator color={C.tint} size="small" />
                      : <Text style={[styles.archivedActionText, { color: C.tint }]}>Restore</Text>}
                  </Pressable>
                </View>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24, paddingTop: 24, borderTopWidth: 1, borderTopColor: C.border },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 1.0,
    color: C.textMuted,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 20, gap: 12, marginBottom: 4 },
  cardTitle: { fontSize: 17, fontWeight: "700", color: C.text },
  cardBody: { fontSize: 14, color: C.textSecondary, lineHeight: 21 },
  cta: { backgroundColor: C.tint, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  ctaText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  leagueCard: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 20, gap: 12, marginBottom: 10 },
  leagueTop: { gap: 4 },
  leagueName: { fontSize: 17, fontWeight: "700", color: C.text },
  leagueMeta: { fontSize: 13, color: C.textSecondary },
  createMoreLink: { paddingVertical: 14, paddingHorizontal: 8, alignItems: "center" },
  createMoreText: { fontSize: 14, color: C.textMuted, textDecorationLine: "underline" },
  archivedToggle: { paddingVertical: 10, paddingHorizontal: 8, alignItems: "center", marginTop: 4 },
  archivedToggleText: { fontSize: 12, fontWeight: "600", color: C.textMuted, letterSpacing: 0.5 },
  archivedEmpty: { fontSize: 13, color: C.textMuted, paddingHorizontal: 8, paddingVertical: 6, fontStyle: "italic" },
  archivedCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8, gap: 10 },
  archivedCardLeft: { flex: 1 },
  archivedCardName: { fontSize: 14, fontWeight: "600", color: C.textSecondary },
  archivedCardMeta: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  archivedCardActions: { flexDirection: "row", gap: 8 },
  archivedActionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", minWidth: 50 },
  archivedRestoreBtn: { borderColor: C.tint },
  archivedActionText: { fontSize: 12, fontWeight: "600", color: C.textMuted },
});
