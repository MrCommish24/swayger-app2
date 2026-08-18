import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import AppSectionHeader from "@/components/AppSectionHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useEffect, useRef, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Analytics } from "@/lib/posthog";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { fetchMySwaygers, fetchMyBalance } from "@/lib/swayger";
import { fantasyFetch, getArchivedLeagues, restoreLeague, FANTASY_SPORTS, FantasyLeague } from "@/lib/fantasy-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

interface PublicGDRoom {
  id: string;
  room_name: string;
  team_a_name: string;
  team_b_name: string;
  game_date: string | null;
  status: string;
  room_code: string | null;
}

// ─── My Swaygers summary card ──────────────────────────────────────────────────
// Shown in the empty state only. Reuses fetchMySwaygers + fetchMyBalance from
// lib/swayger.ts (same functions used by challenges.tsx — no new backend work).
function MySwaygersCard() {
  const router = useRouter();
  const { user } = useAuth();

  const swaygerQuery = useQuery({
    queryKey: ["swaygers", user?.id],
    queryFn: () => fetchMySwaygers(user!.id),
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const balanceQuery = useQuery({
    queryKey: ["balance", user?.id],
    queryFn: () => fetchMyBalance(user!.id),
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const onPress = useCallback(() => {
    router.push("/(tabs)/challenges" as never);
  }, [router]);

  // Not signed in — static fallback card
  if (!user) {
    return (
      <Pressable
        style={({ pressed }) => [cardStyles.card, pressed && cardStyles.cardPressed]}
        onPress={onPress}
      >
        <Text style={cardStyles.title}>My Swaygers</Text>
        <Text style={cardStyles.body}>
          Create, join, and manage your 1v1 Swaygers while you wait for the next Game Day Room.
        </Text>
        <View style={cardStyles.cta}>
          <Text style={cardStyles.ctaText}>View My Swaygers →</Text>
        </View>
      </Pressable>
    );
  }

  // Loading / errored — static fallback card (non-blocking)
  const swaygers = swaygerQuery.data ?? null;
  const balance = balanceQuery.data ?? null;
  const isReady = swaygers !== null;

  const activeCount = isReady
    ? swaygers.filter((s) => s.status === "active").length
    : null;

  return (
    <Pressable
      style={({ pressed }) => [cardStyles.card, pressed && cardStyles.cardPressed]}
      onPress={onPress}
    >
      <Text style={cardStyles.title}>My Swaygers</Text>

      {!isReady ? (
        // Still loading — preserve static fallback, never briefly flash "zero Swaygers"
        <Text style={cardStyles.body}>
          Create, join, and manage your 1v1 Swaygers while you wait for the next Game Day Room.
        </Text>
      ) : swaygers.length === 0 ? (
        // Query resolved and confirmed empty — show educational copy
        <Text style={cardStyles.body}>
          Challenge a friend to a 1v1 sports prediction.
        </Text>
      ) : (
        // Existing users — show descriptor + live activity summary
        <>
        <Text style={cardStyles.descriptor}>Your 1v1 sports challenges</Text>
        <View style={cardStyles.statsRow}>
          <View style={cardStyles.statItem}>
            <Text style={cardStyles.statValue}>{activeCount}</Text>
            <Text style={cardStyles.statLabel}>Active</Text>
          </View>
          {balance !== null && (
            <>
              <View style={cardStyles.statDivider} />
              <View style={cardStyles.statItem}>
                <Text style={[cardStyles.statValue, cardStyles.statValueGold]}>
                  {balance.balance.toLocaleString()}
                </Text>
                <Text style={cardStyles.statLabel}>SP Balance</Text>
              </View>
            </>
          )}
        </View>
        </>
      )}

      <View style={cardStyles.cta}>
        <Text style={cardStyles.ctaText}>View My Swaygers →</Text>
      </View>
    </Pressable>
  );
}

// ─── FantasySection ───────────────────────────────────────────────────────────
// Self-contained: fetches its own data, handles signed-out / loading / empty / has-leagues.
function FantasySection() {
  const router = useRouter();
  const { session, isLoading: authLoading } = useAuth();
  const [leagues, setLeagues] = useState<FantasyLeague[]>([]);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  // Archived leagues (Phase 6E)
  const [archivedLeagues, setArchivedLeagues]   = useState<FantasyLeague[]>([]);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [archivedLoading, setArchivedLoading]   = useState(false);
  const [restoringId, setRestoringId]           = useState<string | null>(null);

  const loadLeagues = useCallback(async () => {
    if (!session) return;
    setLeagueLoading(true);
    try {
      const d = await fantasyFetch<{ leagues: FantasyLeague[] }>(
        "/api/fantasy/leagues",
        {},
        { session }
      );
      setLeagues(d.leagues);
    } catch {
      // Silently ignore — promo card already shown in empty state
    } finally {
      setLeagueLoading(false);
      setFetched(true);
    }
  }, [session]);

  const loadArchivedLeagues = useCallback(async () => {
    if (!session) return;
    setArchivedLoading(true);
    try {
      const d = await getArchivedLeagues({ session });
      setArchivedLeagues(d.leagues);
    } catch {
      setArchivedLeagues([]);
    } finally {
      setArchivedLoading(false);
    }
  }, [session]);

  const handleToggleArchived = useCallback(() => {
    const next = !archivedExpanded;
    setArchivedExpanded(next);
    if (next) loadArchivedLeagues();
  }, [archivedExpanded, loadArchivedLeagues]);

  const handleRestore = useCallback(async (leagueId: string) => {
    if (!session) return;
    setRestoringId(leagueId);
    try {
      await restoreLeague(leagueId, { session });
      // Refresh both lists
      await Promise.all([loadLeagues(), loadArchivedLeagues()]);
    } catch { /* silently ignore */ } finally {
      setRestoringId(null);
    }
  }, [session, loadLeagues, loadArchivedLeagues]);

  // Fire when auth resolves on initial render
  useEffect(() => {
    if (authLoading) return;
    if (!session) { setFetched(true); return; }
    loadLeagues();
  }, [authLoading, session?.access_token]);

  // Refetch whenever this tab regains focus (e.g. user returns after creating a league)
  useFocusEffect(
    useCallback(() => {
      if (!authLoading && session) loadLeagues();
    }, [authLoading, session?.access_token, loadLeagues])
  );

  // Still resolving auth — show nothing to avoid flash
  if (authLoading && !fetched) return null;

  // ── Signed out ─────────────────────────────────────────────────────────────
  if (!session) {
    return (
      <View style={fantasyStyles.section}>
        <Text style={fantasyStyles.sectionLabel}>FANTASY SWAYGER</Text>
        <Pressable
          style={({ pressed }) => [fantasyStyles.card, pressed && { opacity: 0.82 }]}
          onPress={() => router.push("/auth" as never)}
        >
          <Text style={fantasyStyles.cardTitle}>Run Your Own Fantasy League</Text>
          <Text style={fantasyStyles.cardBody}>
            Bring your fantasy league to Swayger for Draft Day and weekly prediction competitions.
          </Text>
          <View style={fantasyStyles.cta}>
            <Text style={fantasyStyles.ctaText}>Sign In to Get Started →</Text>
          </View>
        </Pressable>
      </View>
    );
  }

  // ── Signed in — loading first fetch ───────────────────────────────────────
  if (leagueLoading && !fetched) {
    return (
      <View style={fantasyStyles.section}>
        <Text style={fantasyStyles.sectionLabel}>FANTASY SWAYGER</Text>
        <ActivityIndicator color={C.tint} size="small" style={{ alignSelf: "flex-start", marginTop: 4 }} />
      </View>
    );
  }

  // ── Signed in — no leagues ─────────────────────────────────────────────────
  if (leagues.length === 0) {
    return (
      <View style={fantasyStyles.section}>
        <Text style={fantasyStyles.sectionLabel}>FANTASY SWAYGER</Text>
        <Pressable
          style={({ pressed }) => [fantasyStyles.card, pressed && { opacity: 0.82 }]}
          onPress={() => router.push("/fantasy/setup" as never)}
        >
          <Text style={fantasyStyles.cardTitle}>Create Fantasy League</Text>
          <Text style={fantasyStyles.cardBody}>
            Bring your fantasy league to Swayger for Draft Day and weekly prediction competitions.
          </Text>
          <View style={fantasyStyles.cta}>
            <Text style={fantasyStyles.ctaText}>Create Fantasy League →</Text>
          </View>
        </Pressable>
      </View>
    );
  }

  // ── Signed in — has leagues ────────────────────────────────────────────────
  return (
    <View style={fantasyStyles.section}>
      <Text style={fantasyStyles.sectionLabel}>MY FANTASY LEAGUES</Text>

      {leagues.map((league) => {
        const latestSeason = [...(league.fantasy_league_seasons ?? [])]
          .sort((a, b) => b.season_year - a.season_year)[0];
        const sportEmoji =
          FANTASY_SPORTS.find((s) => s.value === league.sport)?.emoji ?? "🏆";
        return (
          <Pressable
            key={league.id}
            style={({ pressed }) => [fantasyStyles.leagueCard, pressed && { opacity: 0.82 }]}
            onPress={() => {
              if (latestSeason) {
                router.push(`/fantasy/${league.id}/${latestSeason.id}` as never);
              }
            }}
          >
            <View style={fantasyStyles.leagueTop}>
              <Text style={fantasyStyles.leagueName}>
                {sportEmoji}{"  "}{league.league_name}
              </Text>
              {latestSeason && (
                <Text style={fantasyStyles.leagueMeta}>
                  {latestSeason.season_year} •{" "}
                  {league.sport.charAt(0).toUpperCase() + league.sport.slice(1)}
                </Text>
              )}
            </View>
            <View style={fantasyStyles.cta}>
              <Text style={fantasyStyles.ctaText}>Open League →</Text>
            </View>
          </Pressable>
        );
      })}

      <Pressable
        style={({ pressed }) => [fantasyStyles.createMoreLink, pressed && { opacity: 0.6 }]}
        onPress={() => router.push("/fantasy/setup" as never)}
      >
        <Text style={fantasyStyles.createMoreText}>+ Create Fantasy League</Text>
      </Pressable>

      {/* Archived Leagues — collapsed by default (Phase 6E) */}
      <Pressable
        style={({ pressed }) => [fantasyStyles.archivedToggle, pressed && { opacity: 0.7 }]}
        onPress={handleToggleArchived}
      >
        <Text style={fantasyStyles.archivedToggleText}>
          {archivedExpanded ? "▲" : "▼"}{"  "}Archived Leagues
        </Text>
      </Pressable>

      {archivedExpanded && (
        <>
          {archivedLoading ? (
            <ActivityIndicator
              color={C.tint}
              size="small"
              style={{ alignSelf: "flex-start", marginLeft: 8, marginTop: 4 }}
            />
          ) : archivedLeagues.length === 0 ? (
            <Text style={fantasyStyles.archivedEmpty}>No archived leagues</Text>
          ) : (
            archivedLeagues.map((lg) => {
              const latestSeason = [...(lg.fantasy_league_seasons ?? [])]
                .sort((a, b) => b.season_year - a.season_year)[0];
              const sportEmoji =
                FANTASY_SPORTS.find((s) => s.value === lg.sport)?.emoji ?? "🏆";
              const isRestoring = restoringId === lg.id;
              return (
                <View key={lg.id} style={fantasyStyles.archivedCard}>
                  <View style={fantasyStyles.archivedCardLeft}>
                    <Text style={fantasyStyles.archivedCardName} numberOfLines={1}>
                      {sportEmoji}{"  "}{lg.league_name}
                    </Text>
                    {latestSeason && (
                      <Text style={fantasyStyles.archivedCardMeta}>
                        {latestSeason.season_year} · Archived
                      </Text>
                    )}
                  </View>
                  <View style={fantasyStyles.archivedCardActions}>
                    <Pressable
                      onPress={() => {
                        if (latestSeason) {
                          router.push(`/fantasy/${lg.id}/${latestSeason.id}` as never);
                        }
                      }}
                      style={({ pressed }) => [
                        fantasyStyles.archivedActionBtn,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={fantasyStyles.archivedActionText}>View</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleRestore(lg.id)}
                      disabled={isRestoring}
                      style={({ pressed }) => [
                        fantasyStyles.archivedActionBtn,
                        fantasyStyles.archivedRestoreBtn,
                        (pressed || isRestoring) && { opacity: 0.6 },
                      ]}
                    >
                      {isRestoring
                        ? <ActivityIndicator color={C.tint} size="small" />
                        : <Text style={[fantasyStyles.archivedActionText, { color: C.tint }]}>Restore</Text>}
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </>
      )}
    </View>
  );
}

// ─── FeaturedRoomCard ─────────────────────────────────────────────────────────
function FeaturedRoomCard({ room, totalRooms }: { room: PublicGDRoom; totalRooms: number }) {
  const router = useRouter();
  return (
    <Pressable
      style={({ pressed }) => [featuredStyles.card, pressed && featuredStyles.cardPressed]}
      onPress={() => {
        Analytics.gamedayLiveNowCardTapped({
          room_id: room.id,
          room_name: room.room_name,
          matchup: `${room.team_a_name} vs ${room.team_b_name}`,
          position: 0,
          total_rooms: totalRooms,
        });
        router.push(`/gameday/${room.id}?src=home_featured` as never);
      }}
    >
      <View style={featuredStyles.liveRow}>
        <View style={featuredStyles.liveDot} />
        <Text style={featuredStyles.liveLabel}>LIVE NOW</Text>
      </View>
      <Text style={featuredStyles.matchup} numberOfLines={1}>
        {room.team_a_name} vs {room.team_b_name}
      </Text>
      <Text style={featuredStyles.roomName} numberOfLines={2}>
        {room.room_name}
      </Text>
      {room.game_date ? (
        <Text style={featuredStyles.date}>{room.game_date}</Text>
      ) : null}
      <View style={featuredStyles.cta}>
        <Text style={featuredStyles.ctaText}>Join &amp; Make Picks →</Text>
      </View>
    </Pressable>
  );
}

// ─── More Rooms strip (shown when 2+ rooms exist) ─────────────────────────────
function MoreRoomsStrip({ rooms, totalRooms }: { rooms: PublicGDRoom[]; totalRooms: number }) {
  const router = useRouter();
  if (rooms.length === 0) return null;
  return (
    <View style={gdStyles.section}>
      <View style={gdStyles.header}>
        <Text style={gdStyles.headerLabel}>MORE ROOMS</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={gdStyles.scroll}
        bounces={false}
      >
        {rooms.map((room, index) => (
          <Pressable
            key={room.id}
            style={({ pressed }) => [gdStyles.card, pressed && gdStyles.cardPressed]}
            onPress={() => {
              Analytics.gamedayLiveNowCardTapped({
                room_id: room.id,
                room_name: room.room_name,
                matchup: `${room.team_a_name} vs ${room.team_b_name}`,
                position: index + 1,
                total_rooms: totalRooms,
              });
              router.push(`/gameday/${room.id}?src=home_live_strip` as never);
            }}
          >
            <Text style={gdStyles.matchup} numberOfLines={1}>
              {room.team_a_name} vs {room.team_b_name}
            </Text>
            {room.game_date ? <Text style={gdStyles.date}>{room.game_date}</Text> : null}
            <View style={gdStyles.footer}>
              <View style={gdStyles.statusDot} />
              <Text style={gdStyles.statusText}>Live</Text>
              <Text style={gdStyles.enterCta}>Enter →</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Game Day Home Screen ─────────────────────────────────────────────────────
export default function GameDayHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const hasTrackedSection = useRef(false);

  // Keep dashboard_viewed for analytics continuity
  useFocusEffect(useCallback(() => { Analytics.dashboardViewed(); }, []));

  const { data, isLoading } = useQuery<{ rooms: PublicGDRoom[] }>({
    queryKey: ["gameday", "public-rooms"],
    queryFn: async () => {
      const url = new URL("/api/gameday/public-rooms", getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load rooms");
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });

  const rooms = data?.rooms ?? [];
  const featuredRoom = rooms[0] ?? null;
  const stripRooms = rooms.slice(1);

  useEffect(() => {
    if (rooms.length > 0 && !hasTrackedSection.current) {
      hasTrackedSection.current = true;
      Analytics.gamedayLiveNowSectionViewed({
        room_count: rooms.length,
        room_ids: rooms.map((r) => r.id),
      });
    }
  }, [rooms]);

  return (
    <ScrollView
      style={homeStyles.container}
      contentContainerStyle={[
        homeStyles.content,
        { paddingTop: isWeb ? 84 : insets.top + 20, paddingBottom: insets.bottom + 80 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: 8, marginBottom: 20 }}>
        <AppSectionHeader title="GAME DAY" />
      </View>

      {isLoading ? (
        <View style={homeStyles.loadingWrap}>
          <ActivityIndicator color={C.tint} size="small" />
        </View>
      ) : featuredRoom ? (
        // ── Live state: featured room + strip ─────────────────────────────────
        <>
          <FeaturedRoomCard room={featuredRoom} totalRooms={rooms.length} />
          <MoreRoomsStrip rooms={stripRooms} totalRooms={rooms.length} />
          {/* Subtle link — stays below the live content, does not compete */}
          <Pressable
            style={({ pressed }) => [homeStyles.swaygerLink, pressed && homeStyles.swaygerLinkPressed]}
            onPress={() => router.push("/(tabs)/challenges" as never)}
          >
            <Text style={homeStyles.swaygerLinkText}>My 1v1 Swaygers →</Text>
          </Pressable>
        </>
      ) : (
        // ── Empty state ───────────────────────────────────────────────────────
        <>
          <View style={homeStyles.emptyWrap}>
            <Text style={homeStyles.emptyEmoji}>🏟️</Text>
            <Text style={homeStyles.emptyTitle}>Nothing live right now</Text>
            <Text style={homeStyles.emptySub}>
              Game Day Rooms are group pick'em competitions that open before and during featured games.
            </Text>
            <Text style={homeStyles.emptyInvite}>
              Have an invite link? Open it from your text or group chat to join directly.
            </Text>
          </View>

          <MySwaygersCard />
        </>
      )}

      {/* ── Fantasy Swayger — always visible after Game Day content ─────── */}
      <FantasySection />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const homeStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 16 },
  title: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 32,
    color: C.text,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  loadingWrap: { alignItems: "center", paddingVertical: 40 },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 8,
    gap: 10,
    marginBottom: 8,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 4 },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: C.text,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyInvite: {
    fontSize: 13,
    color: C.textMuted,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 2,
  },
  swaygerLink: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    alignItems: "center",
  },
  swaygerLinkPressed: { opacity: 0.6 },
  swaygerLinkText: {
    fontSize: 14,
    color: C.textSecondary,
    fontWeight: "500" as const,
  },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    gap: 14,
  },
  cardPressed: { opacity: 0.82 },
  title: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: C.text,
  },
  body: {
    fontSize: 14,
    color: C.textSecondary,
    lineHeight: 21,
  },
  descriptor: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 19,
  },
  statsRow: {
    flexDirection: "row" as const,
    alignItems: "center",
  },
  statItem: {
    flex: 1,
    alignItems: "center" as const,
    gap: 3,
  },
  statValue: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 28,
    color: C.text,
  },
  statValueGold: {
    color: C.accentGold,
    fontSize: 22,
  },
  statLabel: {
    fontSize: 11,
    color: C.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    fontWeight: "500" as const,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: C.border,
    marginHorizontal: 4,
  },
  cta: {
    backgroundColor: C.tint,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
});

const featuredStyles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(34,197,94,0.30)",
    padding: 20,
    gap: 10,
    marginBottom: 16,
  },
  cardPressed: { opacity: 0.85 },
  liveRow: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 7,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },
  liveLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 1.2,
    color: "#22C55E",
  },
  matchup: {
    fontSize: 22,
    fontWeight: "800" as const,
    color: C.text,
    letterSpacing: -0.3,
  },
  roomName: {
    fontSize: 14,
    color: C.textSecondary,
    fontWeight: "500" as const,
  },
  date: {
    fontSize: 12,
    color: C.textMuted,
  },
  cta: {
    marginTop: 8,
    backgroundColor: C.tint,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
});

const fantasyStyles = StyleSheet.create({
  section: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 1.0,
    color: C.textMuted,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  // Promo / create card (signed-out & no-leagues state)
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    gap: 12,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: C.text,
  },
  cardBody: {
    fontSize: 14,
    color: C.textSecondary,
    lineHeight: 21,
  },
  cta: {
    backgroundColor: C.tint,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center" as const,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  // League card (has-leagues state)
  leagueCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    gap: 12,
    marginBottom: 10,
  },
  leagueTop: { gap: 4 },
  leagueName: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: C.text,
  },
  leagueMeta: {
    fontSize: 13,
    color: C.textSecondary,
  },
  // "+ Create Fantasy League" link below existing league cards
  createMoreLink: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center" as const,
  },
  createMoreText: {
    fontSize: 14,
    color: C.textMuted,
    textDecorationLine: "underline" as const,
  },

  // Phase 6E — Archived leagues section
  archivedToggle: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center" as const,
    marginTop: 4,
  },
  archivedToggleText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: C.textMuted,
    letterSpacing: 0.5,
  },
  archivedEmpty: {
    fontSize: 13,
    color: C.textMuted,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontStyle: "italic" as const,
  },
  archivedCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 10,
  },
  archivedCardLeft: { flex: 1 },
  archivedCardName: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: C.textSecondary,
  },
  archivedCardMeta: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 2,
  },
  archivedCardActions: {
    flexDirection: "row" as const,
    gap: 8,
  },
  archivedActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    minWidth: 50,
  },
  archivedRestoreBtn: {
    borderColor: C.tint,
  },
  archivedActionText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: C.textMuted,
  },
});

const gdStyles = StyleSheet.create({
  section: { marginBottom: 4 },
  header: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 1.2,
    color: C.textSecondary,
  },
  scroll: { paddingHorizontal: 8, gap: 10 },
  card: {
    width: 200,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    gap: 6,
  },
  cardPressed: { opacity: 0.8 },
  matchup: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: C.text,
    lineHeight: 19,
  },
  date: { fontSize: 12, color: C.textMuted },
  footer: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
  },
  statusText: {
    fontSize: 12,
    color: "#22C55E",
    fontWeight: "600" as const,
  },
  enterCta: {
    marginLeft: "auto" as never,
    fontSize: 12,
    fontWeight: "700" as const,
    color: C.tint,
  },
});
