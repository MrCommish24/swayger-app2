import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QrCodeSvg from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { gamedayFetch, GDRoomResponse, GDCard, GDLeaderboardEntry } from "@/lib/gameday-api";
import Colors from "@/constants/colors";
import { Analytics } from "@/lib/posthog";

const C = Colors.dark;

// ── Types ──────────────────────────────────────────────────────────────────────

interface CadenceCard {
  id: string;
  type: string;
  label: string;
  timing: string;
  message: string;
}

interface Moment {
  id: string;
  type: string;
  title: string;
  message: string;
}

// Maps message_type → message_category for PostHog analytics
const MESSAGE_CATEGORIES: Record<string, string> = {
  pregame_invite: "invite",
  halftime_heads_up: "reminder",
  halftime_live: "invite",
  fourth_heads_up: "reminder",
  fourth_live: "invite",
  final_standings: "final_receipt",
  picks_locked: "urgency",
  first_leaderboard_update: "leaderboard",
  leaderboard_snapshot: "leaderboard",
  current_leader: "leaderboard",
  tight_race: "leaderboard",
  comeback_window: "urgency",
  last_chance: "urgency",
  winner: "final_receipt",
  run_it_back: "run_it_back",
  generic_trash_talk: "trash_talk",
  quiet_room_nudge: "trash_talk",
  copy_public_link: "share_link",
  qr_viewed: "share_link",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_URL =
  process.env.EXPO_PUBLIC_APP_URL ??
  (typeof window !== "undefined" ? window.location.origin : "https://swayger.app");

function getPublicLink(room: { room_code?: string | null; id: string }): string {
  return room.room_code ? `${BASE_URL}/g/${room.room_code}` : `${BASE_URL}/gameday/${room.id}`;
}

function getCadenceCards(publicLink: string, winner?: GDLeaderboardEntry): CadenceCard[] {
  const winnerMsg = winner
    ? `Receipts are in.\n\n🏆 Tonight's Game Day Champ: ${winner.display_name} — ${winner.game_day_sp} SP\n\nFull standings:\n${publicLink}`
    : `Receipts are almost in. Final standings will show here after the room is finalized.`;

  return [
    {
      id: "pregame_invite",
      type: "pregame_invite",
      label: "🏀 Pregame Invite",
      timing: "15–30 min before tipoff",
      message: `Pregame is live. Make your Game Day Swayger picks before tipoff.\n\nTrack the leaderboard and collect receipts here:\n${publicLink}`,
    },
    {
      id: "halftime_heads_up",
      type: "halftime_heads_up",
      label: "⚡ Halftime Heads-Up",
      timing: "Near end of 2Q",
      message: `Heads up — Halftime picks are coming soon.\n\nDon't fall off the board.`,
    },
    {
      id: "halftime_live",
      type: "halftime_live",
      label: "🕐 Halftime Picks Live",
      timing: "Halftime",
      message: `Halftime picks are live.\n\nMake your second-half calls and see who moves up:\n<${publicLink}>`,
    },
    {
      id: "fourth_heads_up",
      type: "fourth_heads_up",
      label: "⏰ 4Q Heads-Up",
      timing: "Near end of 3Q",
      message: `4Q Clutch picks are coming soon.\n\nLast window to move up before receipts drop.`,
    },
    {
      id: "fourth_live",
      type: "fourth_live",
      label: "🔥 4Q Picks Live",
      timing: "Start of 4Q",
      message: `4Q Clutch picks are live.\n\nLock in here:\n<${publicLink}>`,
    },
    {
      id: "final_standings",
      type: "final_standings",
      label: "🏆 Final Standings",
      timing: "After room is finalized",
      message: winnerMsg,
    },
  ];
}

function getSuggestedMoments(
  roomStatus: string,
  isArchived: boolean,
  cards: GDCard[],
  leaderboard: GDLeaderboardEntry[]
): Moment[] {
  if (isArchived) return [];

  const moments: Moment[] = [];
  const isFinalized = roomStatus === "finalized";
  const activeCards = cards.filter((c) => c.status !== "closed");
  const lockedOrSettled = activeCards.filter(
    (c) => c.status === "locked" || c.status === "settled"
  );
  const allProps = activeCards.flatMap((c) => c.gameday_props);
  const settledProps = allProps.filter((p) => p.status === "settled");
  const fourthCard = cards.find((c) => c.phase === "fourth");
  const is4QOpen = fourthCard?.status === "open";
  const is4QActive =
    fourthCard &&
    (fourthCard.status === "open" ||
      fourthCard.status === "locked" ||
      fourthCard.status === "settled");

  const leader = leaderboard[0];
  const second = leaderboard[1];

  // 1. Picks Locked
  if (lockedOrSettled.length > 0) {
    moments.push({
      id: "picks_locked",
      type: "picks_locked",
      title: "🔒 Picks Locked",
      message: "Picks are locked. Receipts are live. Let's see who actually knows ball.",
    });
  }

  // 2. First Leaderboard Update — canonical type name for analytics
  if (settledProps.length > 0) {
    moments.push({
      id: "first_leaderboard_update",
      type: "first_leaderboard_update",
      title: "📊 First Leaderboard Update",
      message: "First leaderboard update is in. Somebody already has receipts.",
    });
  }

  // 3. Current Leader
  if (leader) {
    moments.push({
      id: "current_leader",
      type: "current_leader",
      title: "👑 Current Leader",
      message: `Current leader: ${leader.display_name} with ${leader.game_day_sp} SP. The room is officially on notice.`,
    });
  }

  // 4. Tight Race (within 20 SP)
  if (leader && second) {
    const gap = leader.game_day_sp - second.game_day_sp;
    if (gap <= 20) {
      moments.push({
        id: "tight_race",
        type: "tight_race",
        title: "⚡ Tight Race",
        message: `Only ${gap} SP separates first and second. One pick can flip the room.`,
      });
    }
  }

  // 5. Comeback Window (4Q phase active)
  if (!isFinalized && is4QActive) {
    moments.push({
      id: "comeback_window",
      type: "comeback_window",
      title: "⏰ Comeback Window",
      message: "Don't disappear now. 4Q picks can still flip the room.",
    });
  }

  // 6. Last Chance (4Q open)
  if (is4QOpen) {
    moments.push({
      id: "last_chance",
      type: "last_chance",
      title: "🚨 Last Chance",
      message: "Last window to move up before receipts drop.",
    });
  }

  // 7. Winner
  if (isFinalized && leader) {
    moments.push({
      id: "winner",
      type: "winner",
      title: "🏆 Winner / Champ Moment",
      message: `Receipts are in. Tonight's Game Day Champ is ${leader.display_name} with ${leader.game_day_sp} SP.`,
    });
  }

  // 8. Run It Back
  if (isFinalized) {
    moments.push({
      id: "run_it_back",
      type: "run_it_back",
      title: "🔄 Run It Back",
      message: "Champ has to defend the belt next game. Who's running it back?",
    });
  }

  // 9. Generic Trash Talk — always
  moments.push({
    id: "generic_trash_talk",
    type: "generic_trash_talk",
    title: "💀 Trash Talk",
    message: "Some of these picks are aging badly.",
  });

  // 10. Quiet Room Nudge — when not finalized
  if (!isFinalized) {
    moments.push({
      id: "quiet_room_nudge",
      type: "quiet_room_nudge",
      title: "🔇 Quiet Room Nudge",
      message: "Don't get quiet now. The board is still moving.",
    });
  }

  return moments;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CaptainCenter() {
  const { roomId, src } = useLocalSearchParams<{ roomId: string; src?: string }>();
  const insets = useSafeAreaInsets();

  // Derive how the captain got to this page from the ?src= URL param.
  const captainLinkSource: "host_panel" | "direct_link" | "unknown" =
    src === "host_panel" ? "host_panel" : src ? "direct_link" : "unknown";

  const [roomData, setRoomData] = useState<GDRoomResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<GDLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasTrackedView = useRef(false);

  const fetchData = useCallback(async () => {
    if (!roomId) return;
    try {
      const [roomRes, lbRes] = await Promise.all([
        gamedayFetch<GDRoomResponse>(`/api/gameday/rooms/${roomId}`),
        gamedayFetch<{ leaderboard: GDLeaderboardEntry[] }>(
          `/api/gameday/rooms/${roomId}/leaderboard`
        ).catch(() => ({ leaderboard: [] })),
      ]);
      setRoomData(roomRes);
      setLeaderboard(lbRes.leaderboard ?? []);
      setError(null);

      if (!hasTrackedView.current) {
        hasTrackedView.current = true;
        const openCard = roomRes.cards.find((c: any) => c.status === "open");
        Analytics.gamedayCaptainCenterViewed(
          {
            room_id: roomId,
            room_code: roomRes.room.room_code,
            room_source: roomRes.room.source ?? "unknown",
            room_status: roomRes.room.status,
          },
          {
            current_open_card_phase: openCard?.phase ?? null,
            participant_count: roomRes.participant_count,
            captain_link_source: captainLinkSource,
          }
        );
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load room");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchData();
    pollingRef.current = setInterval(fetchData, 20_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchData]);

  const copyMessage = useCallback(
    async (text: string, messageType: string, id: string) => {
      try {
        await Clipboard.setStringAsync(text);
      } catch {
        if (Platform.OS === "web" && typeof navigator !== "undefined") {
          navigator.clipboard.writeText(text).catch(() => {});
        }
      }
      setCopiedId(id);
      if (roomData) {
        const openCard = roomData.cards.find((c: any) => c.status === "open");
        Analytics.gamedayCaptainMessageCopied(
          {
            room_id: roomId ?? "",
            room_code: roomData.room.room_code,
            room_source: roomData.room.source ?? "unknown",
            room_status: roomData.room.status,
          },
          messageType,
          {
            message_category: MESSAGE_CATEGORIES[messageType] ?? "share_link",
            current_open_card_phase: openCard?.phase ?? null,
            participant_count: roomData.participant_count,
            leaderboard_available: leaderboard.length > 0,
            leader_name: leaderboard[0]?.display_name ?? null,
            leader_sp: leaderboard[0]?.game_day_sp ?? null,
          }
        );
      }
      setTimeout(
        () => setCopiedId((prev) => (prev === id ? null : prev)),
        2000
      );
    },
    [roomData, roomId, leaderboard]
  );

  // ── Loading / error ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  if (error || !roomData) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error ?? "Room not found"}</Text>
      </View>
    );
  }

  // ── Derived state ────────────────────────────────────────────────────────────

  const { room, cards, participant_count } = roomData;
  const isArchived = !!room.archived_at;
  const isFinalized = room.status === "finalized";
  const publicLink = getPublicLink(room);
  const qrUrl = `${publicLink}${publicLink.includes("?") ? "&" : "?"}src=qr`;

  const leader = leaderboard[0];
  const activeCards = cards.filter((c) => c.status !== "closed");
  const openCard = cards.find((c) => c.status === "open");
  const allProps = activeCards.flatMap((c) => c.gameday_props);
  const settledPropCount = allProps.filter((p) => p.status === "settled").length;
  const pendingPropCount = allProps.filter((p) => p.status === "pending").length;

  const cadenceCards = getCadenceCards(publicLink, leader);
  const suggestedMoments = getSuggestedMoments(
    room.status,
    isArchived,
    cards,
    leaderboard
  );

  const phaseLabel = (phase: string) => {
    if (phase === "pregame") return "Pregame Picks";
    if (phase === "halftime") return "Halftime Picks";
    if (phase === "fourth") return "4Q Clutch Picks";
    return phase;
  };

  // ── Copy button component ────────────────────────────────────────────────────

  const CopyBtn = ({
    text,
    type,
    id,
    label = "Copy",
    full = false,
  }: {
    text: string;
    type: string;
    id: string;
    label?: string;
    full?: boolean;
  }) => {
    const done = copiedId === id;
    return (
      <TouchableOpacity
        style={[styles.copyBtn, done && styles.copyBtnDone, full && styles.copyBtnFull]}
        onPress={() => copyMessage(text, type, id)}
      >
        <Text style={styles.copyBtnText}>{done ? "Copied!" : label}</Text>
      </TouchableOpacity>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 48 },
      ]}
    >
      {/* ── 1. Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.captainBadge}>CAPTAIN CENTER</Text>
        <Text style={styles.roomName}>{room.room_name}</Text>
        <Text style={styles.matchup}>
          {room.team_a_name} vs {room.team_b_name}
        </Text>
        {room.room_code && (
          <Text style={styles.roomCode}>Room Code: {room.room_code}</Text>
        )}
        <View style={styles.statusRow}>
          <Text
            style={[
              styles.statusBadge,
              isFinalized && styles.statusFinalized,
              isArchived && styles.statusArchived,
            ]}
          >
            {isArchived ? "ARCHIVED" : isFinalized ? "FINALIZED" : "ACTIVE"}
          </Text>
          {openCard && (
            <Text style={styles.phaseBadge}>
              {phaseLabel(openCard.phase)}
            </Text>
          )}
        </View>
        <Text style={styles.participantCount}>
          {participant_count} participant{participant_count !== 1 ? "s" : ""}
        </Text>
      </View>

      {/* ── Archived banner ─────────────────────────────────────────────────── */}
      {isArchived && (
        <View style={styles.archivedBanner}>
          <Text style={styles.archivedText}>
            This Game Day room is no longer active.
          </Text>
        </View>
      )}

      {/* ── 2. Share the Room ──────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SHARE THE ROOM</Text>
        <Text style={styles.sectionHint}>
          Let people join from the group chat, QR code, or link. Anyone with this link can join.
        </Text>

        <View style={styles.linkBox}>
          <Text style={styles.linkUrl} numberOfLines={1} ellipsizeMode="tail">
            {publicLink}
          </Text>
        </View>

        <View style={styles.btnRow}>
          <CopyBtn
            text={publicLink}
            type="copy_public_link"
            id="copy_public_link"
            label="Copy Link"
            full
          />
          {!isArchived && (
            <CopyBtn
              text={cadenceCards[0].message}
              type="pregame_invite"
              id="pregame_invite_quick"
              label="Copy Pregame Invite"
              full
            />
          )}
        </View>

        {/* QR Code */}
        {room.room_code && (
          <View style={styles.qrSection}>
            <TouchableOpacity
              style={styles.qrToggle}
              onPress={() => {
                const next = !showQr;
                setShowQr(next);
                if (next && roomData) {
                  const openCard = roomData.cards.find((c: any) => c.status === "open");
                  Analytics.gamedayCaptainMessageCopied(
                    {
                      room_id: roomId ?? "",
                      room_code: roomData.room.room_code,
                      room_source: roomData.room.source ?? "unknown",
                      room_status: roomData.room.status,
                    },
                    "qr_viewed",
                    {
                      message_category: "share_link",
                      current_open_card_phase: openCard?.phase ?? null,
                      participant_count: roomData.participant_count,
                      leaderboard_available: leaderboard.length > 0,
                      leader_name: leaderboard[0]?.display_name ?? null,
                      leader_sp: leaderboard[0]?.game_day_sp ?? null,
                    }
                  );
                }
              }}
            >
              <Text style={styles.qrToggleText}>
                {showQr ? "Hide QR Code" : "Show QR Code"}
              </Text>
            </TouchableOpacity>
            {showQr && (
              <View style={styles.qrWrap}>
                <View style={styles.qrCanvas}>
                  <QrCodeSvg
                    value={qrUrl}
                    size={200}
                    backgroundColor="#FFFFFF"
                    color="#000000"
                  />
                </View>
                <Text style={styles.qrSubText}>
                  Scans open {publicLink}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── 3. Game Day Cadence ─────────────────────────────────────────────── */}
      {!isArchived && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>GAME DAY CADENCE</Text>
          <Text style={styles.sectionHint}>
            Copy these into your group chat at the right moment.
          </Text>
          {cadenceCards.map((card) => (
            <View key={card.id} style={styles.messageCard}>
              <View style={styles.cardMeta}>
                <Text style={styles.cardLabel}>{card.label}</Text>
                <Text style={styles.cardTiming}>{card.timing}</Text>
              </View>
              <Text style={styles.messageText}>{card.message}</Text>
              <CopyBtn
                text={card.message}
                type={card.type}
                id={`cadence_${card.id}`}
                label="Copy Message"
                full
              />
            </View>
          ))}
        </View>
      )}

      {/* ── 4. Suggested Moments ────────────────────────────────────────────── */}
      {suggestedMoments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SUGGESTED MOMENTS</Text>
          <Text style={styles.sectionHint}>
            Paste these into the group chat to create energy and leaderboard moments.
          </Text>
          {suggestedMoments.map((moment) => (
            <View key={moment.id} style={styles.momentCard}>
              <Text style={styles.momentTitle}>{moment.title}</Text>
              <Text style={styles.messageText}>{moment.message}</Text>
              <CopyBtn
                text={moment.message}
                type={moment.type}
                id={`moment_${moment.id}`}
                label="Copy"
                full
              />
            </View>
          ))}
        </View>
      )}

      {/* ── 5. Leaderboard Summary ──────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>LEADERBOARD</Text>
        {settledPropCount === 0 ? (
          <Text style={styles.emptyText}>
            No settled picks yet. Leaderboard moments will appear after the first prop is scored.
          </Text>
        ) : (
          <>
            {leaderboard.slice(0, 5).map((entry, i) => (
              <View key={entry.participant_id} style={styles.lbRow}>
                <Text style={styles.lbRank}>#{i + 1}</Text>
                <Text style={styles.lbName}>{entry.display_name}</Text>
                <Text style={styles.lbSP}>{entry.game_day_sp} SP</Text>
              </View>
            ))}
            <Text style={styles.lbMeta}>
              {participant_count} participants · {settledPropCount} scored
              {pendingPropCount > 0 ? ` · ${pendingPropCount} pending` : ""}
            </Text>

            {/* Copy leaderboard messages */}
            <View style={styles.copyRowWrap}>
              {leader && (
                <CopyBtn
                  text={`${leader.display_name} is leading the room with ${leader.game_day_sp} SP.`}
                  type="current_leader"
                  id="lb_leader"
                  label="Copy Leader"
                />
              )}
              {leaderboard.length >= 3 && (
                <CopyBtn
                  text={`Current Top 3:\n${leaderboard
                    .slice(0, 3)
                    .map((e, i) => `${i + 1}. ${e.display_name} — ${e.game_day_sp} SP`)
                    .join("\n")}\n\nFull room:\n${publicLink}`}
                  type="leaderboard_snapshot"
                  id="lb_top3"
                  label="Copy Top 3"
                />
              )}
              {!isFinalized && (
                <CopyBtn
                  text={`This room is still open. Plenty of points left on the board:\n${publicLink}`}
                  type="leaderboard_snapshot"
                  id="lb_still_open"
                  label="Copy Still Open"
                />
              )}
            </View>
          </>
        )}
      </View>

      {/* ── 6. Final Receipts / Run It Back ─────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>FINAL RECEIPTS</Text>
        {!isFinalized ? (
          <Text style={styles.emptyText}>
            Final receipt messages will appear after standings are finalized.
          </Text>
        ) : (
          <>
            {leader && (
              <View style={styles.winnerBox}>
                <Text style={styles.winnerTitle}>🏆 {leader.display_name}</Text>
                <Text style={styles.winnerSP}>{leader.game_day_sp} SP</Text>
              </View>
            )}

            {leaderboard.slice(0, 3).length > 0 && (
              <View style={styles.top3Box}>
                {leaderboard.slice(0, 3).map((entry, i) => (
                  <View key={entry.participant_id} style={styles.lbRow}>
                    <Text style={styles.lbRank}>
                      {["🥇", "🥈", "🥉"][i]}
                    </Text>
                    <Text style={styles.lbName}>{entry.display_name}</Text>
                    <Text style={styles.lbSP}>{entry.game_day_sp} SP</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.finalActions}>
              <CopyBtn
                text={
                  leader
                    ? `Receipts are in.\n\n🏆 Tonight's Game Day Champ: ${leader.display_name} — ${leader.game_day_sp} SP\n\nTop 3:\n${leaderboard
                        .slice(0, 3)
                        .map(
                          (e, i) =>
                            `${i + 1}. ${e.display_name} — ${e.game_day_sp} SP`
                        )
                        .join("\n")}\n\nFull standings:\n${publicLink}`
                    : `Game Day receipts are in. Full standings:\n${publicLink}`
                }
                type="final_standings"
                id="final_standings_msg"
                label="📋 Copy Final Standings"
                full
              />
              <CopyBtn
                text="Champ has to defend the belt next game. Who's running it back?"
                type="run_it_back"
                id="run_it_back_msg"
                label="🔄 Copy Run It Back"
                full
              />
              <CopyBtn
                text={publicLink}
                type="final_standings"
                id="final_link"
                label={`View Standings → ${room.room_code ?? "link"}`}
                full
              />
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 16, gap: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: C.textSecondary, fontSize: 15, textAlign: "center", padding: 24 },

  // Header
  header: { marginBottom: 16 },
  captainBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: C.tint,
    letterSpacing: 1.5,
    backgroundColor: `${C.tint}22`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  roomName: { fontSize: 22, fontWeight: "700", color: C.text, marginBottom: 4 },
  matchup: { fontSize: 15, color: C.textSecondary, marginBottom: 6 },
  roomCode: { fontSize: 14, color: C.tint, fontWeight: "600", marginBottom: 8 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    color: "#4ADE80",
    backgroundColor: "#4ADE8022",
  },
  statusFinalized: { color: C.accentGold, backgroundColor: `${C.accentGold}22` },
  statusArchived: { color: C.textMuted, backgroundColor: `${C.textMuted}22` },
  phaseBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: C.tint,
    backgroundColor: `${C.tint}22`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  participantCount: { fontSize: 13, color: C.textMuted },

  // Archived
  archivedBanner: {
    backgroundColor: `${C.accentGold}22`,
    borderWidth: 1,
    borderColor: C.accentGold,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  archivedText: {
    color: C.accentGold,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },

  // Sections
  section: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  sectionHint: {
    fontSize: 13,
    color: C.textSecondary,
    marginBottom: 14,
    lineHeight: 19,
  },
  emptyText: {
    fontSize: 13,
    color: C.textMuted,
    fontStyle: "italic",
    lineHeight: 19,
  },

  // Link box
  linkBox: {
    backgroundColor: C.background,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  linkUrl: { fontSize: 13, color: C.tint },

  // Button row
  btnRow: { gap: 8 },

  // Copy buttons
  copyBtn: {
    backgroundColor: C.tint,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 2,
  },
  copyBtnFull: { alignSelf: "stretch" },
  copyBtnDone: { backgroundColor: "#4ADE80" },
  copyBtnText: { color: "#000", fontWeight: "700", fontSize: 13 },

  // Copy row (multiple small buttons)
  copyRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },

  // QR
  qrSection: { marginTop: 12 },
  qrToggle: {
    backgroundColor: `${C.tint}18`,
    borderRadius: 8,
    padding: 11,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.tint,
  },
  qrToggleText: { color: C.tint, fontWeight: "600", fontSize: 13 },
  qrWrap: { alignItems: "center", paddingTop: 16, gap: 10 },
  qrCanvas: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
  },
  qrSubText: { fontSize: 11, color: C.textMuted, textAlign: "center" },

  // Message cards
  messageCard: {
    backgroundColor: C.background,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  cardMeta: { marginBottom: 8 },
  cardLabel: { fontSize: 14, fontWeight: "700", color: C.text, marginBottom: 2 },
  cardTiming: { fontSize: 11, color: C.textMuted },
  messageText: {
    fontSize: 13,
    color: C.text,
    lineHeight: 20,
    marginBottom: 10,
  },

  // Moment cards (slightly distinct from cadence cards)
  momentCard: {
    backgroundColor: C.background,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  momentTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: C.text,
    marginBottom: 8,
  },

  // Leaderboard
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  lbRank: {
    fontSize: 14,
    fontWeight: "700",
    color: C.textMuted,
    width: 32,
  },
  lbName: { flex: 1, fontSize: 14, color: C.text, fontWeight: "500" },
  lbSP: { fontSize: 14, color: C.tint, fontWeight: "700" },
  lbMeta: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 10,
    marginBottom: 4,
  },

  // Final receipts
  winnerBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: `${C.accentGold}22`,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: C.accentGold,
    marginBottom: 12,
  },
  winnerTitle: { fontSize: 16, fontWeight: "700", color: C.accentGold },
  winnerSP: { fontSize: 20, fontWeight: "800", color: C.accentGold },
  top3Box: {
    backgroundColor: C.background,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
  },
  finalActions: { gap: 8 },
});
