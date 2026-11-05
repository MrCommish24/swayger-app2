import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
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
  status: string;
  created_at: string;
  participant_count: number;
  room_code?: string | null;
  archived_at?: string | null;
  can_archive?: boolean;
}

interface JoinedRoom {
  room_id: string;
  room_code: string | null;
  room_name: string;
  status: string;
  sport: string | null;
  template_type: string | null;
  game_date: string | null;
  participant_id: string;
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
  const queryClient = useQueryClient();

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
  const [joinedRooms, setJoinedRooms] = useState<JoinedRoom[]>([]);
  const [joinedRoomsLoading, setJoinedRoomsLoading] = useState(false);
  const [archiveTargets, setArchiveTargets] = useState<RoomSummary[]>([]);
  const [archiveAction, setArchiveAction] = useState<"archive" | "restore">("archive");
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archivingRoomId, setArchivingRoomId] = useState<string | null>(null);

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

  const fetchJoinedRooms = useCallback(async () => {
    if (!session) return;
    setJoinedRoomsLoading(true);
    try {
      const data = await gamedayFetch<{ rooms: JoinedRoom[] }>(
        "/api/gameday/my-rooms",
        {},
        { session }
      );
      setJoinedRooms(data.rooms);
    } catch {
      setJoinedRooms([]);
    } finally {
      setJoinedRoomsLoading(false);
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
      setSelectedRoomIds((current) =>
        current.filter((roomId) =>
          data.rooms.some(
            (room) =>
              room.id === roomId &&
              room.can_archive &&
              !room.archived_at &&
              room.status !== "finalized" &&
              room.status !== "final",
          ),
        ),
      );
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
      setJoinedRooms([]);
      return;
    }
    gamedayFetch<{ isHost: boolean }>("/api/gameday/is-host", {}, { session })
      .then((d) => {
        setIsHost(d.isHost);
        fetchJoinedRooms();
      })
      .catch(() => {
        setIsHost(false);
        setLoading(false);
        fetchJoinedRooms();
      });
  }, [authLoading, session, fetchJoinedRooms]);

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
  }, [authLoading, session, fetchFantasyLeagues]);

  const onRefresh = () => {
    setRefreshing(true);
    if (isHost) fetchRooms(true);
    fetchFantasyLeagues();
    fetchJoinedRooms().finally(() => setRefreshing(false));
  };

  const archiveRoom = async () => {
    if (archiveTargets.length === 0 || !session) return;
    const targets = archiveTargets;
    const action = archiveAction;
    setArchiveError(null);
    setArchivingRoomId(targets.length > 1 ? "bulk" : targets[0].id);
    try {
      let changedIds: string[];
      if (action === "restore") {
        const target = targets[0];
        await gamedayFetch(
          `/api/gameday/rooms/${target.id}/restore`,
          { method: "PATCH", body: JSON.stringify({}) },
          { session },
        );
        changedIds = [target.id];
      } else if (targets.length > 1) {
        const result = await gamedayFetch<{ archived_ids: string[] }>(
          "/api/gameday/rooms/archive-batch",
          {
            method: "PATCH",
            body: JSON.stringify({ room_ids: targets.map((room) => room.id) }),
          },
          { session },
        );
        changedIds = result.archived_ids;
      } else {
        const target = targets[0];
        await gamedayFetch(
          `/api/gameday/rooms/${target.id}/archive`,
          { method: "PATCH", body: JSON.stringify({}) },
          { session },
        );
        changedIds = [target.id];
      }
      const archivedAt = new Date().toISOString();
      setRooms((current) =>
        current.map((room) =>
          changedIds.includes(room.id)
            ? { ...room, archived_at: action === "archive" ? archivedAt : null }
            : room,
        ),
      );
      if (action === "archive") {
        setJoinedRooms((current) =>
          current.filter((room) => !changedIds.includes(room.room_id)),
        );
        queryClient.setQueriesData<{ rooms: JoinedRoom[] }>(
          { queryKey: ["gameday", "my-rooms"] },
          (current) =>
            current
              ? {
                  ...current,
                  rooms: current.rooms.filter((room) => !changedIds.includes(room.room_id)),
                }
              : current,
        );
        setSelectedRoomIds((current) =>
          current.filter((roomId) => !changedIds.includes(roomId)),
        );
      } else {
        void fetchJoinedRooms();
      }
      void queryClient.invalidateQueries({ queryKey: ["gameday", "my-rooms"] });
      void queryClient.invalidateQueries({ queryKey: ["gameday", "public-rooms"] });
      setArchiveTargets([]);
    } catch (err: any) {
      setArchiveError(err?.message ?? `Could not ${action} this room.`);
    } finally {
      setArchivingRoomId(null);
    }
  };

  function joinedRoomLabel(room: JoinedRoom): string {
    if (room.template_type === "nfl_sunday_slate") return "NFL Sunday Slate";
    if (room.template_type === "nfl_single_game") return "NFL Single Game";
    if (room.sport) return `${room.sport.toUpperCase()} Game Day`;
    return "Game Day";
  }

  function renderContinuePlaying() {
    if (!session || (!joinedRoomsLoading && joinedRooms.length === 0)) return null;
    return (
      <View style={styles.continueSection}>
        <Text style={styles.fantasySectionLabel}>Continue Playing</Text>
        {joinedRoomsLoading ? (
          <ActivityIndicator color={C.tint} size="small" style={{ alignSelf: "flex-start" }} />
        ) : (
          joinedRooms.map((room) => (
            <TouchableOpacity
              key={room.room_id}
              style={styles.continueCard}
              onPress={() => room.room_code && router.push(`/g/${room.room_code}` as never)}
              disabled={!room.room_code}
              activeOpacity={0.75}
            >
              <View style={styles.continueCardBody}>
                <Text style={styles.continueRoomName} numberOfLines={1}>{room.room_name}</Text>
                <Text style={styles.continueMeta}>
                  {joinedRoomLabel(room)}
                  {room.game_date ? ` · ${formatDate(room.game_date)}` : ""}
                  {" · Active"}
                </Text>
              </View>
              <Text style={styles.continueCta}>Continue →</Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    );
  }

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
            Get the room link from your host to join tonight’s picks.
          </Text>
        </View>
        {renderContinuePlaying()}
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
  const selectedRooms = rooms.filter(
    (room) =>
      selectedRoomIds.includes(room.id) &&
      room.can_archive &&
      !room.archived_at &&
      room.status !== "finalized" &&
      room.status !== "final",
  );

  return (
    <>
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

      {selectedRooms.length > 0 ? (
        <View style={styles.bulkArchiveBar}>
          <Text style={styles.bulkArchiveCount}>
            {selectedRooms.length} room{selectedRooms.length === 1 ? "" : "s"} selected
          </Text>
          <View style={styles.bulkArchiveActions}>
            <TouchableOpacity
              onPress={() => setSelectedRoomIds([])}
              style={styles.bulkClearButton}
              accessibilityRole="button"
            >
              <Text style={styles.bulkClearText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setArchiveError(null);
                setArchiveAction("archive");
                setArchiveTargets(selectedRooms);
              }}
              style={styles.bulkArchiveButton}
              accessibilityRole="button"
            >
              <Text style={styles.bulkArchiveButtonText}>
                Archive selected
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {renderContinuePlaying()}

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
          <View
            key={room.id}
            style={[styles.roomCard, room.archived_at ? styles.roomCardArchived : null]}
          >
            <TouchableOpacity
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

            {room.can_archive &&
            room.status !== "finalized" &&
            room.status !== "final" ? (
              <View style={styles.roomActionRow}>
                {room.archived_at ? (
                  <TouchableOpacity
                    style={styles.restoreAction}
                    onPress={() => {
                      setArchiveError(null);
                      setArchiveAction("restore");
                      setArchiveTargets([room]);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Restore ${room.room_name}`}
                  >
                    <Text style={styles.restoreActionText}>Restore room</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.selectRoomAction}
                      onPress={() =>
                        setSelectedRoomIds((current) =>
                          current.includes(room.id)
                            ? current.filter((id) => id !== room.id)
                            : current.length >= 50
                              ? current
                              : [...current, room.id],
                        )
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selectedRoomIds.includes(room.id) }}
                      accessibilityLabel={`Select ${room.room_name} for bulk archive`}
                    >
                      <View
                        style={[
                          styles.selectRoomCheckbox,
                          selectedRoomIds.includes(room.id) && styles.selectRoomCheckboxChecked,
                        ]}
                      >
                        {selectedRoomIds.includes(room.id) ? (
                          <Text style={styles.selectRoomCheckmark}>✓</Text>
                        ) : null}
                      </View>
                      <Text style={styles.selectRoomText}>Select</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.archiveAction}
                      onPress={() => {
                        setArchiveError(null);
                        setArchiveAction("archive");
                        setArchiveTargets([room]);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Archive ${room.room_name}`}
                    >
                      <Text style={styles.archiveActionText}>Archive room</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : null}
          </View>
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
      <Modal
        transparent
        animationType="fade"
        visible={archiveTargets.length > 0}
        onRequestClose={() => {
          if (!archivingRoomId) setArchiveTargets([]);
        }}
      >
        <View style={styles.archiveModalBackdrop}>
          <View style={styles.archiveModalCard}>
            <Text style={styles.archiveModalTitle}>
              {archiveAction === "restore"
                ? "Restore this room?"
                : archiveTargets.length > 1
                  ? `Archive ${archiveTargets.length} rooms?`
                  : "Archive this room?"}
            </Text>
            <Text style={styles.archiveModalBody}>
              {archiveAction === "restore"
                ? `${archiveTargets[0]?.room_name} will return to active room lists. Its history and picks have been retained.`
                : archiveTargets.length > 1
                  ? "These rooms will disappear from Live Now and Continue Playing for everyone. Their histories and picks will be retained."
                  : `${archiveTargets[0]?.room_name} will disappear from Live Now and Continue Playing for everyone. Its room history and picks will be retained.`}
            </Text>
            {archiveAction === "archive" && archiveTargets.length > 1 ? (
              <ScrollView style={styles.archiveModalRoomList}>
                <Text style={styles.archiveModalRoomNames}>
                  {archiveTargets.map((room) => `• ${room.room_name}`).join("\n")}
                </Text>
              </ScrollView>
            ) : null}
            {archiveError ? <Text style={styles.archiveModalError}>{archiveError}</Text> : null}
            <View style={styles.archiveModalActions}>
              <TouchableOpacity
                style={styles.archiveCancelButton}
                onPress={() => setArchiveTargets([])}
                disabled={!!archivingRoomId}
                accessibilityRole="button"
              >
                <Text style={styles.archiveCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.archiveConfirmButton, archivingRoomId && styles.archiveConfirmDisabled]}
                onPress={archiveRoom}
                disabled={!!archivingRoomId}
                accessibilityRole="button"
              >
                {archivingRoomId ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.archiveConfirmText}>
                    {archiveAction === "restore"
                      ? "Restore room"
                      : archiveTargets.length > 1
                        ? "Archive rooms"
                        : "Archive room"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
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
  bulkArchiveBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  bulkArchiveCount: { color: C.text, fontSize: 14, fontWeight: "600", flex: 1 },
  bulkArchiveActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  bulkClearButton: { paddingVertical: 8, paddingHorizontal: 10 },
  bulkClearText: { color: C.textSecondary, fontSize: 13, fontWeight: "600" },
  bulkArchiveButton: {
    backgroundColor: "#dc2626",
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  bulkArchiveButtonText: { color: "#fff", fontSize: 13, fontWeight: "700" },

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
  archiveAction: {
    borderWidth: 1,
    borderColor: "#ef4444",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  archiveActionText: { color: "#ef4444", fontSize: 13, fontWeight: "700" },
  roomActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  selectRoomAction: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 6 },
  selectRoomCheckbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: C.textMuted,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  selectRoomCheckboxChecked: { backgroundColor: C.tint, borderColor: C.tint },
  selectRoomCheckmark: { color: "#fff", fontSize: 14, fontWeight: "800", lineHeight: 17 },
  selectRoomText: { color: C.textSecondary, fontSize: 13, fontWeight: "600" },
  restoreAction: {
    borderWidth: 1,
    borderColor: C.tint,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  restoreActionText: { color: C.tint, fontSize: 13, fontWeight: "700" },
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

  archiveModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  archiveModalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 20,
  },
  archiveModalTitle: { color: C.text, fontSize: 20, fontWeight: "700", marginBottom: 10 },
  archiveModalBody: { color: C.textSecondary, fontSize: 14, lineHeight: 21 },
  archiveModalRoomNames: {
    color: C.text,
    fontSize: 13,
    lineHeight: 19,
    paddingVertical: 10,
  },
  archiveModalRoomList: {
    maxHeight: 180,
    marginTop: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  archiveModalError: { color: "#f87171", fontSize: 13, marginTop: 10 },
  archiveModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
  },
  archiveCancelButton: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  archiveCancelText: { color: C.text, fontSize: 14, fontWeight: "600" },
  archiveConfirmButton: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#dc2626",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  archiveConfirmDisabled: { opacity: 0.65 },
  archiveConfirmText: { color: "#fff", fontSize: 14, fontWeight: "700" },

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

  // Authenticated participant re-entry
  continueSection: { marginBottom: 20 },
  continueCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  continueCardBody: { flex: 1 },
  continueRoomName: { color: C.text, fontSize: 16, fontWeight: "700" },
  continueMeta: { color: C.textSecondary, fontSize: 13, marginTop: 5 },
  continueCta: { color: C.tint, fontSize: 14, fontWeight: "700" },

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
