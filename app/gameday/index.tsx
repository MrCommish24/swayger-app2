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
import Colors from "@/constants/colors";

const C = Colors.dark;

const GAMEDAY_HOST_EMAILS = ["darius@leagueswype.com"];

interface RoomSummary {
  id: string;
  room_name: string;
  team_a_name: string;
  team_b_name: string;
  game_date: string | null;
  status: "draft" | "active" | "final";
  created_at: string;
  participant_count: number;
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
  const { session } = useAuth();

  const isHost = session
    ? GAMEDAY_HOST_EMAILS.map((e) => e.toLowerCase()).includes(
        (session.user.email ?? "").toLowerCase()
      )
    : null;

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRooms = useCallback(async (quiet = false) => {
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
    } catch (e: any) {
      setError(e.message ?? "Failed to load rooms");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    if (isHost === null) return;
    if (isHost) {
      fetchRooms();
    } else {
      setLoading(false);
    }
  }, [isHost]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRooms(true);
  };

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

  // ── Non-host: just show a "enter room code" message ───────────────────
  if (isHost === false) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyIcon}>🏀</Text>
        <Text style={styles.emptyTitle}>Game Day Swayger</Text>
        <Text style={styles.emptySubtitle}>
          Get the room link from your host to join tonight's picks.
        </Text>
      </View>
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
      ) : (
        rooms.map((room) => (
          <TouchableOpacity
            key={room.id}
            style={styles.roomCard}
            onPress={() => router.push(`/gameday/${room.id}/host` as never)}
            activeOpacity={0.75}
          >
            <View style={styles.roomCardTop}>
              <Text style={styles.roomName} numberOfLines={1}>
                {room.room_name}
              </Text>
              <View style={[styles.statusBadge, { borderColor: STATUS_COLOR[room.status] }]}>
                <Text style={[styles.statusText, { color: STATUS_COLOR[room.status] }]}>
                  {STATUS_LABEL[room.status] ?? room.status}
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
            </View>

            <Text style={styles.enterHint}>Tap to open Host Control →</Text>
          </TouchableOpacity>
        ))
      )}
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
  enterHint: { fontSize: 12, color: C.tint, fontWeight: "600" },

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
});
