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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { gamedayFetch } from "@/lib/gameday-api";
import { fantasyFetch, FANTASY_SPORTS, FantasyLeague } from "@/lib/fantasy-api";
import Colors from "@/constants/colors";
import { Analytics } from "@/lib/posthog";

const C = Colors.dark;


interface RoomSummary {
  id: string;
  room_name: string;
  team_a_name: string;
  team_b_name: string;
  game_date: string | null;
  status: "draft" | "active" | "final";
  created_at: string;
  participant_count: number;
  room_code?: string | null;
  archived_at?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Live",
  final: "Final",
};

const STATUS_COLOR: Record<string, string> = {
  draft: C.textMuted,
  active: "#22c55e",
  final: C.textSecondary,
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00"); // noon to avoid UTC-offset date shift
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function GameDayHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();

  // Resolved server-side so GAMEDAY_HOST_EMAILS is the single source of truth.
  const [isHost, setIsHost] = useState<boolean | null>(null);

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // ── Fantasy leagues (any signed-in user, independent of host status) ──────
  const [fantasyLeagues, setFantasyLeagues] = useState<FantasyLeague[]>([]);
  const [fantasyLoading, setFantasyLoading] = useState(false);

  /** Strip raw HTML error bodies (e.g. Express "Cannot GET …") into a friendly message. */
  function cleanError(raw: string): string {
    if (raw.trim().startsWith("<")) return "Server is starting up — retrying…";
    return raw;
  }

  const fetchFantasyLeagues = useCallback(async () => {
    if (!session) return;
    setFantasyLoading(true);
    try {
      const data = await fantasyFetch<{ leagues: FantasyLeague[] }>(
        "/api/fantasy/leagues",
        {},
        { session }
      );
      setFantasyLeagues(data.leagues);
    } catch {
      // Silently ignore — Fantasy section shows the "Create" card as fallback
    } finally {
      setFantasyLoading(false);
    }
  }, [session]);

  const fetchRooms = useCallback(async (quiet = false, attempt = 0) => {
    if (!session) return;
    if (!quiet) setLoading(true);
    try {
      const data = await gamedayFetch<{ rooms: RoomSummary[] }>(
        "/api/gameday/rooms",
        {},
        { session }
      );
      setRooms(data.rooms);
      setError(null);
      setLoading(false);
      setRefreshing(false);
    } catch (e: any) {
      const msg: string = e?.message ?? "Failed to load rooms";
      // Auto-retry up to 3 times when the server is still starting (HTML response)
      if (msg.trim().startsWith("<") && attempt < 3) {
        setTimeout(() => fetchRooms(true, attempt + 1), 1500);
        // Leave the loading spinner up — don't touch loading/refreshing state
        return;
      }
      setError(cleanError(msg));
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  // Resolve host status server-side once auth finishes initialising.
  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      setIsHost(false);
      setLoading(false);
      return;
    }
    gamedayFetch<{ isHost: boolean }>("/api/gameday/is-host", {}, { session })
      .then((d) => setIsHost(d.isHost))
      .catch(() => {
        setIsHost(false);
        setLoading(false);
      });
  }, [authLoading, session?.access_token]);

  useEffect(() => {
    if (isHost === null) return;
    Analytics.gamedayHubViewed();
    if (isHost) {
      fetchRooms();
    } else {
      setLoading(false);
    }
  }, [isHost]);

  // Fetch fantasy leagues for any signed-in user, independently of host status
  useEffect(() => {
    if (authLoading || !session) return;
    fetchFantasyLeagues();
  }, [authLoading, session?.access_token]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRooms(true);
    fetchFantasyLeagues();
  };

  // ── Fantasy section — rendered in both host and non-host signed-in views ──
  function renderFantasySection() {
    return (
      <View style={styles.fantasySection}>
        <Text style={styles.fantasySectionLabel}>FANTASY LEAGUES</Text>

        {fantasyLoading ? (
          <ActivityIndicator
            color={C.tint}
            size="small"
            style={{ alignSelf: "flex-start", marginTop: 4, marginBottom: 16 }}
          />
        ) : fantasyLeagues.length === 0 ? (
          /* Empty state — invite to create */
          <TouchableOpacity
            style={styles.fantasyCreateCard}
            onPress={() => router.push("/fantasy/setup" as never)}
            activeOpacity={0.75}
          >
            <Text style={styles.fantasyCreateIcon}>🏆</Text>
            <View style={styles.fantasyCreateBody}>
              <Text style={styles.fantasyCreateTitle}>Create Fantasy League</Text>
              <Text style={styles.fantasyCreateSubtitle}>
                Run your own fantasy competition with your Game Day crew.
              </Text>
            </View>
            <Text style={styles.fantasyChevron}>→</Text>
          </TouchableOpacity>
        ) : (
          /* Has leagues */
          <View>
            {fantasyLeagues.map((league) => {
              const latestSeason = [...(league.fantasy_league_seasons ?? [])]
                .sort((a, b) => b.season_year - a.season_year)[0];
              const sportEmoji =
                FANTASY_SPORTS.find((s) => s.value === league.sport)?.emoji ?? "🏆";
              return (
                <TouchableOpacity
                  key={league.id}
                  style={styles.fantasyLeagueCard}
                  onPress={() => {
                    if (latestSeason) {
                      router.push(
                        `/fantasy/${league.id}/${latestSeason.id}` as never
                      );
                    }
                  }}
                  activeOpacity={0.75}
                >
                  <View style={styles.fantasyLeagueCardTop}>
                    <Text style={styles.fantasyLeagueName}>
                      {sportEmoji}  {league.league_name}
                    </Text>
                    {latestSeason && (
                      <View style={styles.fantasySeasonBadge}>
                        <Text style={styles.fantasySeasonBadgeText}>
                          {latestSeason.season_year}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.fantasyLeagueMeta}>
                    {league.sport.charAt(0).toUpperCase() + league.sport.slice(1)}
                    {latestSeason
                      ? ` · ${latestSeason.status === "upcoming" ? "Setup" : latestSeason.status === "active" ? "In Season" : "Completed"}`
                      : ""}
                  </Text>
                  <Text style={styles.fantasyLeagueHint}>Tap to open →</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.fantasyNewLink}
              onPress={() => router.push("/fantasy/setup" as never)}
            >
              <Text style={styles.fantasyNewLinkText}>+ Create another league</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ── Not signed in ──────────────────────────────────────────────────────
  if (!session && isHost !== null) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyIcon}>🏀</Text>
        <Text style={styles.emptyTitle}>Game Day Swayger</Text>
        <Text style={styles.emptySubtitle}>Sign in to join a room.</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => router.replace("/auth")}>
          <Text style={styles.createBtnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Non-host: Game Day message + Fantasy section ──────────────────────
  if (isHost === false) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 },
        ]}
      >
        <View style={styles.nonHostHero}>
          <Text style={styles.emptyIcon}>🏀</Text>
          <Text style={styles.emptyTitle}>Game Day Swayger</Text>
          <Text style={styles.emptySubtitle}>
            Get the room link from your host to join tonight's picks.
          </Text>
        </View>
        {renderFantasySection()}
      </ScrollView>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  // ── Host view ──────────────────────────────────────────────────────────
  const displayedRooms = showArchived
    ? rooms
    : rooms.filter((r) => !r.archived_at);
  const hasArchivedRooms = rooms.some((r) => !!r.archived_at);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={C.tint}
        />
      }
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.heading}>Game Day Rooms</Text>
          <Text style={styles.subheading}>Your host control panel</Text>
        </View>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => router.push("/gameday/create" as never)}
        >
          <Text style={styles.newBtnText}>+ New Room</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchRooms()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : rooms.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>🏀</Text>
          <Text style={styles.emptyTitle}>No rooms yet</Text>
          <Text style={styles.emptySubtitle}>
            Create your first Game Day room to get started.
          </Text>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => router.push("/gameday/create" as never)}
          >
            <Text style={styles.createBtnText}>Create a Room</Text>
          </TouchableOpacity>
        </View>
      ) : displayedRooms.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyTitle}>All rooms archived</Text>
          <Text style={styles.emptySubtitle}>
            Toggle below to view archived rooms.
          </Text>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => setShowArchived(true)}
          >
            <Text style={styles.createBtnText}>Show Archived</Text>
          </TouchableOpacity>
        </View>
      ) : (
        displayedRooms.map((room) => (
          <TouchableOpacity
            key={room.id}
            style={[styles.roomCard, room.archived_at ? styles.roomCardArchived : null]}
            onPress={() => router.push(`/gameday/${room.id}/host` as never)}
            activeOpacity={0.75}
          >
            <View style={styles.roomCardTop}>
              <Text style={styles.roomName} numberOfLines={1}>
                {room.room_name}
              </Text>
              <View style={[
                styles.statusBadge,
                { borderColor: room.archived_at ? C.textMuted : (STATUS_COLOR[room.status] ?? C.textMuted) },
              ]}>
                <Text style={[
                  styles.statusText,
                  { color: room.archived_at ? C.textMuted : (STATUS_COLOR[room.status] ?? C.textMuted) },
                ]}>
                  {room.archived_at ? "Archived" : (STATUS_LABEL[room.status] ?? room.status)}
                </Text>
              </View>
            </View>

            <Text style={styles.matchup}>
              {room.team_a_name} vs {room.team_b_name}
            </Text>

            <View style={styles.roomCardMeta}>
              {room.game_date ? (
                <Text style={styles.metaChip}>{formatDate(room.game_date)}</Text>
              ) : null}
              <Text style={styles.metaChip}>
                {room.participant_count} player{room.participant_count !== 1 ? "s" : ""}
              </Text>
              {room.room_code ? (
                <Text style={styles.roomCodeChip}>{room.room_code}</Text>
              ) : null}
            </View>

            <Text style={styles.enterHint}>Tap to open Host Control →</Text>
          </TouchableOpacity>
        ))
      )}

      {/* Show / hide archived rooms toggle — only visible when there are archived rooms */}
      {(hasArchivedRooms || showArchived) && (
        <TouchableOpacity
          style={styles.archivedToggle}
          onPress={() => setShowArchived((v) => !v)}
        >
          <Text style={styles.archivedToggleText}>
            {showArchived ? "Hide archived rooms" : "Show archived rooms"}
          </Text>
        </TouchableOpacity>
      )}

      {renderFantasySection()}
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

  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  heading: { fontSize: 26, fontWeight: "700", color: C.text },
  subheading: { fontSize: 13, color: C.textMuted, marginTop: 2 },
  newBtn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  newBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  // Room card
  roomCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 12,
  },
  roomCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  roomName: {
    fontSize: 17,
    fontWeight: "700",
    color: C.text,
    flex: 1,
    marginRight: 10,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  matchup: { fontSize: 14, color: C.textSecondary, marginBottom: 10 },
  roomCardMeta: { flexDirection: "row", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  metaChip: {
    fontSize: 12,
    color: C.textMuted,
    backgroundColor: C.background,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roomCodeChip: {
    fontSize: 12,
    fontWeight: "700",
    color: C.tint,
    backgroundColor: C.tint + "22",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    letterSpacing: 0.8,
  },
  enterHint: { fontSize: 12, color: C.tint, fontWeight: "600" },
  roomCardArchived: { opacity: 0.55 },

  // Archived toggle
  archivedToggle: {
    alignSelf: "center",
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  archivedToggleText: { fontSize: 13, color: C.textMuted, textDecorationLine: "underline" },

  // Error
  errorBox: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  errorText: { color: "#ef4444", fontSize: 14, textAlign: "center" },
  retryBtn: {
    backgroundColor: C.tint,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  // Empty / non-host
  emptyBox: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: C.text },
  emptySubtitle: { fontSize: 14, color: C.textSecondary, textAlign: "center", lineHeight: 20 },
  createBtn: {
    backgroundColor: C.tint,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 8,
  },
  createBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Non-host hero block
  nonHostHero: { alignItems: "center", paddingTop: 40, paddingBottom: 32, gap: 12 },

  // Fantasy section
  fantasySection: { marginTop: 8, paddingTop: 24, borderTopWidth: 1, borderTopColor: C.border },
  fantasySectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  // Fantasy — empty / create card
  fantasyCreateCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 14,
    marginBottom: 4,
  },
  fantasyCreateIcon: { fontSize: 28 },
  fantasyCreateBody: { flex: 1 },
  fantasyCreateTitle: { fontSize: 16, fontWeight: "700", color: C.text },
  fantasyCreateSubtitle: { fontSize: 13, color: C.textSecondary, marginTop: 2, lineHeight: 18 },
  fantasyChevron: { fontSize: 18, color: C.tint, fontWeight: "700" },

  // Fantasy — league cards
  fantasyLeagueCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 10,
  },
  fantasyLeagueCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  fantasyLeagueName: { fontSize: 16, fontWeight: "700", color: C.text, flex: 1, marginRight: 8 },
  fantasySeasonBadge: {
    backgroundColor: C.tint + "22",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  fantasySeasonBadgeText: { fontSize: 12, fontWeight: "700", color: C.tint },
  fantasyLeagueMeta: { fontSize: 13, color: C.textSecondary, marginBottom: 8 },
  fantasyLeagueHint: { fontSize: 12, color: C.tint, fontWeight: "600" },

  // Fantasy — "Create another" link
  fantasyNewLink: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 2,
    marginBottom: 4,
  },
  fantasyNewLinkText: { fontSize: 14, color: C.textMuted, textDecorationLine: "underline" },
});
