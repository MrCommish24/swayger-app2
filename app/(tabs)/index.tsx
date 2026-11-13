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
import { Ionicons } from "@expo/vector-icons";
import AppSectionHeader from "@/components/AppSectionHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useEffect, useRef, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Analytics } from "@/lib/posthog";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { gamedayFetch } from "@/lib/gameday-api";
import Colors from "@/constants/colors";
import HistoryRecordCard from "@/components/GameDayHistoryRecordCard";
import { getMyGameDayHistory } from "@/lib/gameday-history";

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

interface JoinedGDRoom {
  room_id: string;
  room_code: string | null;
  room_name: string;
  sport: string | null;
  template_type: string | null;
  game_date: string | null;
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

function ContinuePlayingSection() {
  const router = useRouter();
  const { session, user } = useAuth();
  const joinedRoomsQuery = useQuery<{ rooms: JoinedGDRoom[] }>({
    queryKey: ["gameday", "my-rooms", user?.id],
    queryFn: () =>
      gamedayFetch<{ rooms: JoinedGDRoom[] }>(
        "/api/gameday/my-rooms",
        {},
        { session },
      ),
    enabled: !!session && !!user,
    staleTime: 30 * 1000,
  });

  const rooms = joinedRoomsQuery.data?.rooms ?? [];
  if (!session || (!joinedRoomsQuery.isLoading && rooms.length === 0)) return null;

  return (
    <View style={continueStyles.section}>
      <Text style={continueStyles.sectionLabel}>CONTINUE GAME DAYS</Text>
      {joinedRoomsQuery.isLoading ? (
        <ActivityIndicator color={C.tint} size="small" style={continueStyles.loading} />
      ) : (
        rooms.map((room) => (
          <Pressable
            key={room.room_id}
            disabled={!room.room_code}
            onPress={() => room.room_code && router.push(`/g/${room.room_code}` as never)}
            style={({ pressed }) => [
              continueStyles.card,
              pressed && continueStyles.cardPressed,
            ]}
          >
            <View style={continueStyles.cardBody}>
              <Text style={continueStyles.roomName} numberOfLines={1}>
                {room.room_name}
              </Text>
              <Text style={continueStyles.meta}>
                {room.template_type === "nfl_sunday_slate"
                  ? "NFL Sunday Slate"
                  : room.template_type === "nfl_single_game"
                    ? "NFL Single Game"
                    : room.template_type === "weekly_pick_card"
                      ? "Madden Weekly Pick Card"
                    : room.sport
                      ? `${room.sport.toUpperCase()} Game Day`
                      : "Game Day"}
                {room.game_date ? ` · ${room.game_date}` : ""}
                {" · Active"}
              </Text>
            </View>
            <Text style={continueStyles.cta}>Resume →</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

function RecentGameDaysSection() {
  const router = useRouter();
  const { session, isLoading: authLoading } = useAuth();
  const historyQuery = useQuery({
    queryKey: ["gameday", "my-history", session?.user.id],
    queryFn: () => getMyGameDayHistory(session!),
    enabled: !!session,
    staleTime: 30_000,
  });
  const records = historyQuery.data?.records ?? [];
  const openHistory = () => router.push("/gameday/history" as never);

  return (
    <View style={historyStyles.section}>
      <View style={historyStyles.header}>
        <View>
          <Text style={historyStyles.sectionLabel}>YOUR RECEIPTS</Text>
          <Text style={historyStyles.title}>Recent Game Days</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={openHistory}
          style={({ pressed }) => [historyStyles.viewAll, pressed && { opacity: 0.65 }]}
        >
          <Text style={historyStyles.viewAllText}>View All History</Text>
        </Pressable>
      </View>
      {authLoading ? (
        <View style={historyStyles.skeleton} />
      ) : !session ? (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [historyStyles.accountCard, pressed && { opacity: 0.75 }]}
          onPress={openHistory}
        >
          <Text style={historyStyles.emptyTitle}>Your results, whenever you need them</Text>
          <Text style={historyStyles.emptyText}>Sign in to return to competitions linked to your account.</Text>
          <Text style={historyStyles.signInLink}>Sign in to view history  ›</Text>
        </Pressable>
      ) : historyQuery.isLoading ? (
        <>
          <View style={historyStyles.skeleton} />
          <View style={[historyStyles.skeleton, { height: 112 }]} />
        </>
      ) : historyQuery.isError ? (
        <View style={historyStyles.accountCard}>
          <Text style={historyStyles.emptyTitle}>Couldn’t load your receipts</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => historyQuery.refetch()}
            style={historyStyles.retry}
          >
            <Text style={historyStyles.signInLink}>Try again  ›</Text>
          </Pressable>
        </View>
      ) : records.length ? (
        <>
          {records.slice(0, 3).map((record) => (
            <HistoryRecordCard
              key={record.room.room_id}
              record={record}
              compact
              onPress={() => router.push(`/gameday/history/${encodeURIComponent(record.room.room_id)}` as never)}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={openHistory}
            style={({ pressed }) => [historyStyles.bottomLink, pressed && { opacity: 0.65 }]}
          >
            <Text style={historyStyles.bottomLinkText}>View All History  ›</Text>
          </Pressable>
        </>
      ) : (
        <View style={historyStyles.accountCard}>
          <Text style={historyStyles.emptyTitle}>No Game Day receipts yet</Text>
          <Text style={historyStyles.emptyText}>Play in a competition and your results will be here after picks begin to settle.</Text>
        </View>
      )}
    </View>
  );
}

// ─── Game Day Home Screen ─────────────────────────────────────────────────────
export default function GameDayHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const hasTrackedSection = useRef(false);
  const [focusedWay, setFocusedWay] = useState<"1v1" | "fantasy" | null>(null);

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
        { paddingTop: isWeb ? 75 : insets.top + 12, paddingBottom: insets.bottom + 80 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={homeStyles.header}>
        <AppSectionHeader title="GAME DAY" />
      </View>

      <View testID="ways-to-play" style={homeStyles.waysSection}>
        <Text style={homeStyles.waysLabel}>WAYS TO PLAY</Text>
        <View style={homeStyles.waysRow}>
          <View
            testID="way-game-day"
            accessibilityLabel="Game Day, Live games and slates, selected"
            style={[homeStyles.wayCard, homeStyles.wayCardSelected]}
          >
            <Ionicons name="calendar-outline" size={19} color={C.tint} />
            <Text style={homeStyles.wayTitle} numberOfLines={1}>Game Day</Text>
            <Text style={homeStyles.wayDescription} numberOfLines={2}>Live games &amp; slates</Text>
          </View>
          <Pressable
            testID="way-1v1"
            accessibilityRole="button"
            accessibilityLabel="1v1, Challenge someone"
            style={({ pressed }) => [
              homeStyles.wayCard,
              focusedWay === "1v1" && homeStyles.wayCardFocused,
              pressed && homeStyles.wayCardPressed,
            ]}
            onFocus={() => setFocusedWay("1v1")}
            onBlur={() => setFocusedWay(null)}
            onPress={() => router.push("/(tabs)/challenges" as never)}
          >
            <View style={homeStyles.wayIconRow}>
              <Ionicons name="people-outline" size={19} color={C.textSecondary} />
              <Ionicons name="arrow-forward" size={14} color={C.textMuted} />
            </View>
            <Text style={homeStyles.wayTitle} numberOfLines={1}>1v1</Text>
            <Text style={homeStyles.wayDescription} numberOfLines={2}>Challenge someone</Text>
          </Pressable>
          <Pressable
            testID="way-fantasy"
            accessibilityRole="button"
            accessibilityLabel="Fantasy, Compete in your league"
            style={({ pressed }) => [
              homeStyles.wayCard,
              focusedWay === "fantasy" && homeStyles.wayCardFocused,
              pressed && homeStyles.wayCardPressed,
            ]}
            onFocus={() => setFocusedWay("fantasy")}
            onBlur={() => setFocusedWay(null)}
            onPress={() => router.push("/(tabs)/fantasy" as never)}
          >
            <View style={homeStyles.wayIconRow}>
              <Ionicons name="trophy-outline" size={19} color={C.textSecondary} />
              <Ionicons name="arrow-forward" size={14} color={C.textMuted} />
            </View>
            <Text style={homeStyles.wayTitle} numberOfLines={1}>Fantasy</Text>
            <Text style={homeStyles.wayDescription} numberOfLines={2}>Compete in your league</Text>
          </Pressable>
        </View>
      </View>

      <Text style={homeStyles.liveTitle} accessibilityRole="header">Live Game Day</Text>
      {isLoading ? (
        <View style={homeStyles.loadingWrap}>
          <ActivityIndicator color={C.tint} size="small" />
        </View>
      ) : featuredRoom ? (
        <>
          <FeaturedRoomCard room={featuredRoom} totalRooms={rooms.length} />
          <MoreRoomsStrip rooms={stripRooms} totalRooms={rooms.length} />
        </>
      ) : (
        <View style={homeStyles.emptyWrap}>
          <Ionicons name="calendar-outline" size={24} color={C.textMuted} />
          <Text style={homeStyles.emptyTitle}>Nothing live right now</Text>
          <Text style={homeStyles.emptySub}>
            Game Day Rooms are group pick’em competitions that open before and during featured games.
          </Text>
          <Text style={homeStyles.emptyInvite}>
            Have an invite link? Open it from your text or group chat to join directly.
          </Text>
        </View>
      )}

      <ContinuePlayingSection />
      <RecentGameDaysSection />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const homeStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 16 },
  header: { marginHorizontal: 4, paddingTop: 8, paddingBottom: 10 },
  waysSection: { marginBottom: 18 },
  waysLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 1.1,
    color: C.textMuted,
    marginBottom: 8,
    paddingHorizontal: 3,
  },
  waysRow: { flexDirection: "row" as const, gap: 8 },
  wayCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 100,
    justifyContent: "flex-start" as const,
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  wayCardSelected: {
    borderColor: "rgba(67,97,238,0.68)",
    backgroundColor: "#202638",
  },
  wayCardFocused: { borderWidth: 2, borderColor: "#8C9BFF" },
  wayCardPressed: { opacity: 0.75 },
  wayIconRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    height: 21,
  },
  wayTitle: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: C.text,
  },
  wayDescription: {
    fontSize: 10,
    lineHeight: 13,
    color: C.textSecondary,
  },
  liveTitle: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 23,
    color: C.text,
    marginBottom: 10,
    paddingHorizontal: 3,
  },
  loadingWrap: { alignItems: "center", paddingVertical: 40 },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 8,
    gap: 10,
    marginBottom: 8,
  },
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
});

const continueStyles = StyleSheet.create({
  section: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 1,
    color: C.textMuted,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  loading: {
    alignSelf: "flex-start",
    marginLeft: 8,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row" as const,
    alignItems: "center",
  },
  cardPressed: { opacity: 0.82 },
  cardBody: { flex: 1, paddingRight: 12 },
  roomName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: C.text,
  },
  meta: {
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 5,
  },
  cta: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: C.tint,
  },
});

const historyStyles = StyleSheet.create({
  section: {
    marginTop: 24,
    paddingTop: 22,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  header: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    alignItems: "flex-end" as const,
    justifyContent: "space-between" as const,
    gap: 12,
    marginBottom: 13,
    paddingHorizontal: 3,
  },
  sectionLabel: {
    color: C.tint,
    fontSize: 9,
    fontWeight: "800" as const,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  title: {
    color: C.text,
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 25,
    textTransform: "uppercase" as const,
  },
  viewAll: {
    minHeight: 44,
    justifyContent: "center" as const,
    paddingHorizontal: 2,
  },
  viewAllText: { color: C.tint, fontSize: 11, fontWeight: "700" as const },
  accountCard: {
    backgroundColor: C.surface,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  emptyTitle: { color: C.text, fontSize: 14, fontWeight: "700" as const },
  emptyText: { color: C.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5 },
  signInLink: { color: C.tint, fontSize: 12, fontWeight: "700" as const, marginTop: 12 },
  retry: { alignSelf: "flex-start", minHeight: 40, justifyContent: "center" as const },
  skeleton: {
    height: 142,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 15,
    marginBottom: 9,
  },
  bottomLink: {
    minHeight: 44,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  bottomLinkText: { color: C.tint, fontSize: 12, fontWeight: "700" as const },
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
