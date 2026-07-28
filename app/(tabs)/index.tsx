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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Analytics } from "@/lib/posthog";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { fetchMySwaygers, fetchMyBalance } from "@/lib/swayger";
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
        // Existing users — show live activity summary unchanged
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
      )}

      <View style={cardStyles.cta}>
        <Text style={cardStyles.ctaText}>View My Swaygers →</Text>
      </View>
    </Pressable>
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
      <Text style={homeStyles.title}>GAME DAY</Text>

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
              Game Day Rooms appear here before and during featured games.
            </Text>
            <Text style={homeStyles.emptyInvite}>
              Have an invite link? Open it from your text or group chat to join directly.
            </Text>
          </View>

          <MySwaygersCard />
        </>
      )}
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
