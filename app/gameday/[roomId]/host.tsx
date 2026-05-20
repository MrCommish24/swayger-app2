import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { gamedayFetch } from "@/lib/gameday-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

interface Prop {
  id: string;
  question: string;
  answer_options: string[];
  correct_answer: string | null;
  status: "pending" | "settled";
  display_order: number;
}

interface Card {
  id: string;
  title: string;
  phase: string;
  status: "closed" | "open" | "locked" | "settled";
  display_order: number;
  gameday_props: Prop[];
}

interface Room {
  id: string;
  room_name: string;
  team_a_name: string;
  team_b_name: string;
  team_a_star: string;
  team_b_star: string;
  status: string;
}

interface LbEntry {
  participant_id: string;
  display_name: string;
  game_day_sp: number;
  correct_picks: number;
  rank: number;
}

interface HostData {
  room: Room;
  cards: Card[];
  pick_counts: Record<string, Record<string, number>>;
  participant_count: number;
  leaderboard: LbEntry[];
}

export default function HostControlRoom() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [isHost, setIsHost] = useState<boolean | null>(null);
  const [hostData, setHostData] = useState<HostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const roomUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/gameday/${roomId}`
      : `https://www.swayger.app/gameday/${roomId}`;

  const copyLink = () => {
    if (Platform.OS === "web" && typeof navigator !== "undefined") {
      navigator.clipboard.writeText(roomUrl).catch(() => {});
    }
  };

  const fetchHostData = useCallback(async () => {
    if (!roomId || !session) return;
    try {
      const data = await gamedayFetch<HostData>(
        `/api/gameday/rooms/${roomId}/host-data`,
        {},
        { session }
      );
      setHostData(data);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to load host data");
    } finally {
      setLoading(false);
    }
  }, [roomId, session]);

  useEffect(() => {
    if (!session) return;
    gamedayFetch<{ isHost: boolean }>("/api/gameday/is-host", {}, { session })
      .then((r) => {
        setIsHost(r.isHost);
        if (r.isHost) fetchHostData();
        else setLoading(false);
      })
      .catch(() => {
        setIsHost(false);
        setLoading(false);
      });
  }, [session]);

  useEffect(() => {
    if (!isHost) return;
    pollingRef.current = setInterval(fetchHostData, 10_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isHost, fetchHostData]);

  const doCardAction = async (
    cardId: string,
    action: "open" | "lock"
  ) => {
    setActionLoading(`${action}-${cardId}`);
    try {
      await gamedayFetch(
        `/api/gameday/cards/${cardId}/${action}`,
        { method: "PATCH", body: JSON.stringify({}) },
        { session }
      );
      await fetchHostData();
    } catch (e: any) {
      alert(e.message ?? "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const doSettle = async (propId: string, correctAnswer: string) => {
    setActionLoading(`settle-${propId}`);
    try {
      await gamedayFetch(
        `/api/gameday/props/${propId}/settle`,
        {
          method: "PATCH",
          body: JSON.stringify({ correct_answer: correctAnswer }),
        },
        { session }
      );
      await fetchHostData();
    } catch (e: any) {
      alert(e.message ?? "Settle failed");
    } finally {
      setActionLoading(null);
    }
  };

  const copyShareText = (phase: "pregame" | "halftime" | "fourth" | "final") => {
    const texts: Record<string, string> = {
      pregame: `I made a Game Day Swayger room for tonight. Make your NBA picks before tipoff, track the leaderboard, and get receipts after the game. Join here: ${roomUrl}`,
      halftime: `Halftime picks are live. Same Swayger room. Takes 30 seconds. Locking at start of 3Q: ${roomUrl}`,
      fourth: `4Q clutch picks are live. Make your picks before they lock: ${roomUrl}`,
      final: `Final Game Day Swayger standings are ready. See who won and who has receipts: ${roomUrl}`,
    };
    if (Platform.OS === "web" && typeof navigator !== "undefined") {
      navigator.clipboard.writeText(texts[phase]).catch(() => {});
    }
  };

  // ── Loading / error / access states ─────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Sign in to access the host room.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace("/auth")}>
          <Text style={styles.btnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!isHost) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Host access only.</Text>
      </View>
    );
  }

  if (error || !hostData) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error ?? "No data"}</Text>
        <TouchableOpacity style={styles.btn} onPress={fetchHostData}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { room, cards, pick_counts, participant_count, leaderboard } = hostData;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.hostBadge}>
          <Text style={styles.hostBadgeText}>HOST CONTROL</Text>
        </View>
      </View>

      <Text style={styles.roomName}>{room.room_name}</Text>
      <Text style={styles.matchup}>
        {room.team_a_name} vs {room.team_b_name}
      </Text>
      <Text style={styles.stars}>
        {room.team_a_star} · {room.team_b_star}
      </Text>

      {/* Room link */}
      <View style={styles.linkBox}>
        <Text style={styles.linkLabel}>ROOM LINK</Text>
        <Text style={styles.linkUrl} numberOfLines={1} ellipsizeMode="tail">
          {roomUrl}
        </Text>
        <View style={styles.linkActions}>
          <TouchableOpacity style={styles.copyBtn} onPress={copyLink}>
            <Text style={styles.copyBtnText}>Copy Link</Text>
          </TouchableOpacity>
          <Text style={styles.participants}>
            {participant_count} participant{participant_count !== 1 ? "s" : ""}
          </Text>
        </View>
      </View>

      {/* Share reminder buttons */}
      <View style={styles.reminderRow}>
        <TouchableOpacity
          style={styles.reminderBtn}
          onPress={() => copyShareText("pregame")}
        >
          <Text style={styles.reminderBtnText}>Copy Pregame Invite</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.reminderBtn}
          onPress={() => copyShareText("halftime")}
        >
          <Text style={styles.reminderBtnText}>Copy Halftime Reminder</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.reminderBtn}
          onPress={() => copyShareText("fourth")}
        >
          <Text style={styles.reminderBtnText}>Copy 4Q Reminder</Text>
        </TouchableOpacity>
      </View>

      {/* Pick cards */}
      {cards.map((card) => (
        <HostCard
          key={card.id}
          card={card}
          pickCounts={pick_counts}
          onOpen={() => doCardAction(card.id, "open")}
          onLock={() => doCardAction(card.id, "lock")}
          onSettle={doSettle}
          actionLoading={actionLoading}
        />
      ))}

      {/* Leaderboard */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>LEADERBOARD</Text>
        {leaderboard.length === 0 ? (
          <Text style={styles.emptyText}>No scores yet</Text>
        ) : (
          leaderboard.map((entry) => (
            <View key={entry.participant_id} style={styles.lbRow}>
              <Text style={styles.lbRank}>#{entry.rank}</Text>
              <Text style={styles.lbName}>{entry.display_name}</Text>
              <Text style={styles.lbSP}>{entry.game_day_sp} SP</Text>
            </View>
          ))
        )}
      </View>

      {/* Participant room link */}
      <TouchableOpacity
        style={styles.viewParticipantBtn}
        onPress={() => router.push(`/gameday/${roomId}` as never)}
      >
        <Text style={styles.viewParticipantText}>View Participant Room →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Host Card ─────────────────────────────────────────────────────────────────

function HostCard({
  card,
  pickCounts,
  onOpen,
  onLock,
  onSettle,
  actionLoading,
}: {
  card: Card;
  pickCounts: Record<string, Record<string, number>>;
  onOpen: () => void;
  onLock: () => void;
  onSettle: (propId: string, answer: string) => void;
  actionLoading: string | null;
}) {
  const statusColor: Record<string, string> = {
    closed: C.textMuted,
    open: C.success,
    locked: C.accentGold,
    settled: C.textSecondary,
  };

  return (
    <View style={styles.hostCard}>
      <View style={styles.hostCardHeader}>
        <Text style={styles.cardTitle}>{card.title}</Text>
        <Text style={[styles.cardStatus, { color: statusColor[card.status] ?? C.textMuted }]}>
          {card.status.toUpperCase()}
        </Text>
      </View>

      {/* Card controls */}
      <View style={styles.cardControls}>
        {card.status === "closed" && (
          <TouchableOpacity
            style={styles.openBtn}
            onPress={onOpen}
            disabled={!!actionLoading}
          >
            {actionLoading === `open-${card.id}` ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.openBtnText}>Open Card</Text>
            )}
          </TouchableOpacity>
        )}
        {card.status === "open" && (
          <TouchableOpacity
            style={styles.lockBtn}
            onPress={onLock}
            disabled={!!actionLoading}
          >
            {actionLoading === `lock-${card.id}` ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.lockBtnText}>Lock Card</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Props */}
      {card.gameday_props.map((prop) => {
        const counts = pickCounts[prop.id] ?? {};
        const totalPicks = Object.values(counts).reduce((a, b) => a + b, 0);
        const canSettle =
          card.status === "locked" || card.status === "settled";

        return (
          <View key={prop.id} style={styles.propSection}>
            <Text style={styles.propQuestion}>{prop.question}</Text>
            {prop.status === "settled" ? (
              <Text style={styles.settledAnswer}>✓ {prop.correct_answer}</Text>
            ) : null}

            {prop.answer_options.map((ans) => {
              const count = counts[ans] ?? 0;
              const pct = totalPicks > 0 ? (count / totalPicks) * 100 : 0;
              const isSettling = actionLoading === `settle-${prop.id}`;

              return (
                <View key={ans} style={styles.propAnswerRow}>
                  <View style={styles.propAnswerLeft}>
                    <Text style={styles.propAns}>{ans}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${pct}%` as any,
                            backgroundColor:
                              prop.correct_answer === ans ? C.success : C.tint,
                          },
                        ]}
                      />
                    </View>
                  </View>
                  <Text style={styles.propCount}>{count}</Text>
                  {canSettle && prop.status !== "settled" ? (
                    <TouchableOpacity
                      style={styles.settleBtn}
                      onPress={() => onSettle(prop.id, ans)}
                      disabled={isSettling || !!actionLoading}
                    >
                      {isSettling ? (
                        <ActivityIndicator color={C.text} size="small" />
                      ) : (
                        <Text style={styles.settleBtnText}>✓ Correct</Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 16 },
  center: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  backText: { color: C.textSecondary, fontSize: 15 },
  hostBadge: {
    backgroundColor: C.accentGold + "22",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: C.accentGold + "44",
  },
  hostBadgeText: {
    color: C.accentGold,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  roomName: { fontSize: 22, fontWeight: "700", color: C.text, marginBottom: 4 },
  matchup: { fontSize: 15, color: C.tint, fontWeight: "600", marginBottom: 2 },
  stars: { fontSize: 13, color: C.textMuted, marginBottom: 20 },

  // Link box
  linkBox: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 12,
  },
  linkLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  linkUrl: { fontSize: 13, color: C.textSecondary, marginBottom: 10 },
  linkActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  copyBtn: {
    backgroundColor: C.tint,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  copyBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  participants: { fontSize: 13, color: C.textSecondary },

  // Reminders
  reminderRow: { gap: 8, marginBottom: 20 },
  reminderBtn: {
    backgroundColor: C.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  reminderBtnText: { color: C.textSecondary, fontSize: 13, fontWeight: "500" },

  // Host card
  hostCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 16,
  },
  hostCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: C.text },
  cardStatus: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  cardControls: { marginBottom: 12 },
  openBtn: {
    backgroundColor: C.success,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  openBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  lockBtn: {
    backgroundColor: C.accentGold,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  lockBtnText: { color: "#000", fontSize: 14, fontWeight: "700" },

  // Props
  propSection: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  propQuestion: { fontSize: 13, fontWeight: "600", color: C.text, marginBottom: 10 },
  settledAnswer: { fontSize: 13, color: C.success, fontWeight: "600", marginBottom: 8 },
  propAnswerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  propAnswerLeft: { flex: 1 },
  propAns: { fontSize: 13, color: C.text, marginBottom: 4 },
  barTrack: {
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: { height: 4, borderRadius: 2, minWidth: 2 },
  propCount: {
    fontSize: 13,
    fontWeight: "700",
    color: C.textSecondary,
    minWidth: 22,
    textAlign: "right",
  },
  settleBtn: {
    backgroundColor: C.surfaceLight,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  settleBtnText: { color: C.text, fontSize: 12, fontWeight: "600" },

  // Leaderboard
  section: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: C.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 6,
    gap: 8,
  },
  lbRank: { fontSize: 12, fontWeight: "700", color: C.textMuted, width: 28 },
  lbName: { flex: 1, fontSize: 14, color: C.text },
  lbSP: { fontSize: 14, fontWeight: "700", color: C.accentGold },
  emptyText: { fontSize: 14, color: C.textMuted },

  viewParticipantBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 8,
  },
  viewParticipantText: { color: C.textSecondary, fontSize: 14, fontWeight: "500" },

  // Misc
  btn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  errorText: { color: C.danger, fontSize: 15, textAlign: "center" },
});
