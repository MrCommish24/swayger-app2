import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Share,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { gamedayFetch } from "@/lib/gameday-api";
import Colors from "@/constants/colors";
import { Analytics } from "@/lib/posthog";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import GameDayReceiptCard from "@/components/GameDayReceiptCard";

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
  room_code?: string | null;
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
  const { session, isLoading: authLoading } = useAuth();

  // Host status is resolved server-side via GET /api/gameday/is-host.
  // This means adding/removing emails from GAMEDAY_HOST_EMAILS on the server
  // takes effect immediately, and the check works identically on every device.
  const [isHost, setIsHost] = useState<boolean | null>(null);

  const [hostData, setHostData] = useState<HostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [localFinalized, setLocalFinalized] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Resolve host status from server once auth finishes initialising.
  // Using the backend endpoint means GAMEDAY_HOST_EMAILS is the single source of
  // truth and the check is identical regardless of device or browser.
  useEffect(() => {
    if (authLoading) return; // wait for AsyncStorage / Supabase to restore session
    if (!session) {
      // Auth is done loading but there's no session — not a host.
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

  // Use EXPO_PUBLIC_APP_URL when set (production), fall back to current origin
  // so share links always use the branded domain (https://swayger.app) in prod.
  const BASE_URL =
    process.env.EXPO_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "https://swayger.app");

  const roomUrl = `${BASE_URL}/gameday/${roomId}`;

  // Returns the short /g/:roomCode URL — uses configured public domain.
  const getShareUrl = useCallback(() => {
    const code = hostData?.room?.room_code;
    if (!code) return roomUrl;
    return `${BASE_URL}/g/${code}`;
  }, [hostData, roomUrl, BASE_URL]);

  const copyLink = () => {
    if (Platform.OS === "web" && typeof navigator !== "undefined") {
      navigator.clipboard.writeText(getShareUrl()).catch(() => {});
    }
  };

  const receiptRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const handleShareStandings = async () => {
    setSharing(true);
    try {
      if (Platform.OS === "web") {
        if (receiptRef.current) {
          const { default: html2canvas } = await import("html2canvas");
          const canvas = await html2canvas(
            receiptRef.current as unknown as HTMLElement,
            { useCORS: true, allowTaint: false, backgroundColor: "#0C1220", scale: 2, logging: false }
          );
          const dataUrl = canvas.toDataURL("image/png");
          const link = document.createElement("a");
          link.href = dataUrl;
          link.download = "game-day-standings.png";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } else {
        if (receiptRef.current) {
          const uri = await captureRef(receiptRef.current, { format: "png", quality: 1 });
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share Final Standings", UTI: "public.png" });
          } else {
            await Share.share({ url: uri });
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes("cancel")) console.warn("[gameday-host] share error:", msg);
    } finally {
      setSharing(false);
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
      if (data.room.status === "finalized") {
        setLocalFinalized(true);
      }
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to load host data");
    } finally {
      setLoading(false);
    }
  }, [roomId, session]);

  // Initial load: once we know the session and host status, fetch data.
  useEffect(() => {
    if (isHost === null) return; // still loading session
    if (!isHost) {
      setLoading(false);
      return;
    }
    fetchHostData();
  }, [isHost]);

  // Polling while confirmed host.
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
      const phase = hostData?.cards.find((c) => c.id === cardId)?.phase ?? "unknown";
      if (action === "open") Analytics.gamedayCardOpened(roomId!, cardId, phase);
      if (action === "lock") Analytics.gamedayCardLocked(roomId!, cardId, phase);
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

  const openFinalizeModal = () => setShowFinalizeModal(true);

  const doFinalize = async () => {
    setShowFinalizeModal(false);
    setLocalFinalized(true);
    Analytics.gamedayRoomFinalized(roomId!);
    setFinalizeError(null);
    setActionLoading("finalize");
    try {
      await gamedayFetch(
        `/api/gameday/rooms/${roomId}/finalize`,
        { method: "PATCH", body: JSON.stringify({}) },
        { session }
      );
      await fetchHostData();
    } catch (e: any) {
      setLocalFinalized(false);
      const raw: string = e.message ?? "Finalize failed";
      const clean = raw.startsWith("<!") || raw.startsWith("<") 
        ? "Could not reach the server. Check your connection and try again."
        : raw;
      setFinalizeError(clean);
    } finally {
      setActionLoading(null);
    }
  };

  const copyShareText = (phase: "pregame" | "halftime" | "fourth" | "final") => {
    const url = getShareUrl();
    const texts: Record<string, string> = {
      pregame: `Game Day Swayger is live for tonight. Make your picks before tipoff and track the leaderboard here:\n${url}`,
      halftime: `Halftime picks are live. Same room:\n${url}`,
      fourth: `4Q picks are live. Lock in here:\n${url}`,
      final: `Final Game Day Swayger standings are ready. See who won and who has receipts:\n${url}`,
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

  // ── Finalize readiness ───────────────────────────────────────────────────
  // A card must be locked or settled before finalization. Closed cards (not
  // yet opened) are excluded — they are not part of this game's flow.
  const activeCards = cards.filter((c) => c.status !== "closed");
  const openCards = activeCards.filter((c) => c.status === "open");
  const allProps = activeCards.flatMap((c) => c.gameday_props);
  const pendingProps = allProps.filter((p) => p.status === "pending");
  const cardsReady = openCards.length === 0;
  const propsReady = pendingProps.length === 0;
  const isReadyToFinalize = room.status !== "finalized" && cardsReady && propsReady;

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/gameday")}>
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
        {room.room_code ? (
          <>
            <Text style={styles.linkCode}>{getShareUrl()}</Text>
            <Text style={styles.linkCodeBadge}>{room.room_code}</Text>
          </>
        ) : (
          <Text style={styles.linkUrl} numberOfLines={1} ellipsizeMode="tail">
            {roomUrl}
          </Text>
        )}
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
        <TouchableOpacity
          style={styles.reminderBtn}
          onPress={() => copyShareText("final")}
        >
          <Text style={styles.reminderBtnText}>Copy Final Standings</Text>
        </TouchableOpacity>
      </View>

      {/* Pick cards */}
      {cards.map((card) => (
        <HostCard
          key={card.id}
          card={card}
          pickCounts={pick_counts}
          roomStatus={room.status}
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

      {/* Finalize / finalized state */}
      {room.status === "finalized" || localFinalized ? (
        <View style={styles.finalizedBanner}>
          <Text style={styles.finalizedTitle}>🏆 Standings Locked</Text>
          <Text style={styles.finalizedSub}>
            This room is finalized. Participants can see the final results.
          </Text>
          <View style={styles.sendOffRow}>
            <TouchableOpacity
              style={[styles.shareImgBtn, sharing && styles.btnDisabled]}
              onPress={handleShareStandings}
              disabled={sharing}
            >
              {sharing ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.shareImgBtnText}>📸 Share Image</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.copyLinkBtn} onPress={copyLink}>
              <Text style={styles.copyLinkText}>🔗 Copy Link</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.finalizeWrapper}>
          {finalizeError ? (
            <View style={styles.finalizeErrorBox}>
              <Text style={styles.finalizeErrorText}>⚠ {finalizeError}</Text>
              <TouchableOpacity onPress={() => setFinalizeError(null)}>
                <Text style={styles.finalizeErrorDismiss}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {!isReadyToFinalize && (
            <View style={styles.finalizeReadiness}>
              <Text style={styles.finalizeReadinessHint}>
                Finalize available after all active props are settled.
              </Text>
              {activeCards.length > 0 && (
                <Text style={styles.finalizeReadinessStat}>
                  Cards locked: {activeCards.length - openCards.length}/{activeCards.length}
                </Text>
              )}
              {allProps.length > 0 && (
                <Text style={styles.finalizeReadinessStat}>
                  Props settled: {allProps.length - pendingProps.length}/{allProps.length}
                </Text>
              )}
              {pendingProps.length > 0 && (
                <Text style={styles.finalizeReadinessStat}>
                  Pending props: {pendingProps.length}
                </Text>
              )}
            </View>
          )}
          <TouchableOpacity
            style={[
              styles.finalizeBtn,
              (!isReadyToFinalize || actionLoading === "finalize" || showFinalizeModal) && styles.btnDisabled,
            ]}
            onPress={openFinalizeModal}
            disabled={!isReadyToFinalize || actionLoading === "finalize" || showFinalizeModal}
          >
            {actionLoading === "finalize" ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={[styles.finalizeBtnText, !isReadyToFinalize && { color: C.textMuted }]}>
                Finalize Standings
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Participant room link */}
      <TouchableOpacity
        style={styles.viewParticipantBtn}
        onPress={() => router.push(`/gameday/${roomId}` as never)}
      >
        <Text style={styles.viewParticipantText}>View Participant Room →</Text>
      </TouchableOpacity>
    </ScrollView>

    {/* ── Finalize confirmation modal ─────────────────────────────────────── */}
    <Modal
      visible={showFinalizeModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowFinalizeModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Finalize Game Day Standings?</Text>
          <Text style={styles.modalBody}>
            Results will become read-only and participants will see the final leaderboard.
          </Text>
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setShowFinalizeModal(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalConfirmBtn} onPress={doFinalize}>
              <Text style={styles.modalConfirmText}>Finalize Standings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Off-screen receipt card — captured for sharing */}
    {(hostData?.room?.status === "finalized" || localFinalized) && hostData?.room ? (
      <View ref={receiptRef} collapsable={false} style={styles.hiddenReceipt}>
        <GameDayReceiptCard
          roomName={hostData.room.room_name}
          matchup={`${hostData.room.team_a_name} vs ${hostData.room.team_b_name}`}
          gameDate={hostData.room.game_date ?? null}
          leaderboard={hostData.leaderboard ?? []}
          myParticipantId={null}
          roomLink={
            hostData.room.room_code
              ? `swayger.app/g/${hostData.room.room_code}`
              : undefined
          }
        />
      </View>
    ) : null}
    </View>
  );
}

// ── Host Card ─────────────────────────────────────────────────────────────────

function HostCard({
  card,
  pickCounts,
  roomStatus,
  onOpen,
  onLock,
  onSettle,
  actionLoading,
}: {
  card: Card;
  pickCounts: Record<string, Record<string, number>>;
  roomStatus: string;
  onOpen: () => void;
  onLock: () => void;
  onSettle: (propId: string, answer: string) => void;
  actionLoading: string | null;
}) {
  // Track which settled prop the host has expanded for re-settlement
  const [editingPropId, setEditingPropId] = useState<string | null>(null);

  const isFinalized = roomStatus === "finalized";

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
        // Initial settle available on locked/settled cards for unsettled props
        const canSettle = card.status === "locked" || card.status === "settled";
        const isSettled = prop.status === "settled";
        const isEditingThis = editingPropId === prop.id;
        const isSettling = actionLoading === `settle-${prop.id}`;

        return (
          <View key={prop.id} style={styles.propSection}>
            <View style={styles.propHeaderRow}>
              <Text style={styles.propQuestion}>{prop.question}</Text>
              {/* Edit Result button — settled props only, not finalized */}
              {isSettled && !isFinalized && !isEditingThis && (
                <TouchableOpacity
                  style={styles.editResultBtn}
                  onPress={() => setEditingPropId(prop.id)}
                >
                  <Text style={styles.editResultText}>Edit Result</Text>
                </TouchableOpacity>
              )}
              {/* Cancel edit */}
              {isSettled && isEditingThis && (
                <TouchableOpacity
                  style={styles.cancelEditBtn}
                  onPress={() => setEditingPropId(null)}
                >
                  <Text style={styles.cancelEditText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Settled answer row */}
            {isSettled && (
              <View style={styles.settledRow}>
                <Text style={styles.settledAnswer}>✓ {prop.correct_answer}</Text>
                {isFinalized && (
                  <Text style={styles.finalizedProp}>FINAL</Text>
                )}
              </View>
            )}

            {/* Show answer options for:
                1. Unsettled props on locked/settled cards (initial settlement)
                2. Settled props that are being edited (re-settlement) */}
            {(canSettle && !isSettled) || (isSettled && isEditingThis) ? (
              <>
                {isEditingThis && (
                  <Text style={styles.editHint}>Select the correct answer:</Text>
                )}
                {prop.answer_options.map((ans) => {
                  const count = counts[ans] ?? 0;
                  const pct = totalPicks > 0 ? (count / totalPicks) * 100 : 0;
                  const isCurrentCorrect = prop.correct_answer === ans;

                  return (
                    <View key={ans} style={styles.propAnswerRow}>
                      <View style={styles.propAnswerLeft}>
                        <Text style={[
                          styles.propAns,
                          isCurrentCorrect && isSettled && { color: C.success },
                        ]}>
                          {ans}
                        </Text>
                        <View style={styles.barTrack}>
                          <View style={{ flex: 1, flexDirection: "row" }}>
                            <View
                              style={{
                                flex: Math.max(pct, 0),
                                height: 4,
                                borderRadius: 2,
                                backgroundColor: isCurrentCorrect ? C.success : C.tint,
                              }}
                            />
                            <View style={{ flex: Math.max(100 - pct, 0), height: 4 }} />
                          </View>
                        </View>
                      </View>
                      <Text style={styles.propCount}>{count}</Text>
                      <TouchableOpacity
                        style={[
                          styles.settleBtn,
                          isCurrentCorrect && isSettled && styles.settleBtnActive,
                        ]}
                        onPress={() => {
                          onSettle(prop.id, ans);
                          setEditingPropId(null);
                        }}
                        disabled={isSettling || !!actionLoading}
                      >
                        {isSettling ? (
                          <ActivityIndicator color={C.text} size="small" />
                        ) : (
                          <Text style={[
                            styles.settleBtnText,
                            isCurrentCorrect && isSettled && styles.settleBtnActiveText,
                          ]}>
                            {isCurrentCorrect && isSettled ? "✓ Current" : "✓ Correct"}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </>
            ) : null}

            {/* Pick distribution bars for closed/open cards (read-only) */}
            {!canSettle && prop.answer_options.map((ans) => {
              const count = counts[ans] ?? 0;
              const pct = totalPicks > 0 ? (count / totalPicks) * 100 : 0;
              return (
                <View key={ans} style={styles.propAnswerRow}>
                  <View style={styles.propAnswerLeft}>
                    <Text style={styles.propAns}>{ans}</Text>
                    <View style={styles.barTrack}>
                      <View style={{ flex: 1, flexDirection: "row" }}>
                        <View style={{ flex: Math.max(pct, 0), height: 4, borderRadius: 2, backgroundColor: C.tint }} />
                        <View style={{ flex: Math.max(100 - pct, 0), height: 4 }} />
                      </View>
                    </View>
                  </View>
                  <Text style={styles.propCount}>{count}</Text>
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
  linkCode: { fontSize: 13, color: C.text, marginBottom: 4 },
  linkCodeBadge: {
    alignSelf: "flex-start",
    backgroundColor: C.tint + "22",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "700",
    color: C.tint,
    letterSpacing: 1,
  },
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
  propHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  propQuestion: { flex: 1, fontSize: 13, fontWeight: "600", color: C.text },
  settledRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  settledAnswer: { fontSize: 13, color: C.success, fontWeight: "600" },
  finalizedProp: {
    fontSize: 10,
    fontWeight: "700",
    color: C.accentGold,
    letterSpacing: 1,
    backgroundColor: C.accentGold + "22",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  editResultBtn: {
    backgroundColor: C.surfaceLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  editResultText: { fontSize: 11, fontWeight: "600", color: C.tint },
  cancelEditBtn: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cancelEditText: { fontSize: 11, fontWeight: "600", color: C.textMuted },
  editHint: { fontSize: 12, color: C.textMuted, marginBottom: 8, fontStyle: "italic" },
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
  settleBtnActive: {
    backgroundColor: C.success + "22",
    borderColor: C.success + "66",
  },
  settleBtnActiveText: { color: C.success },

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

  // Finalize
  finalizeWrapper: { marginBottom: 12 },
  finalizeReadiness: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  finalizeReadinessHint: {
    fontSize: 13,
    color: C.textSecondary,
    fontWeight: "600",
    marginBottom: 4,
  },
  finalizeReadinessStat: {
    fontSize: 12,
    color: C.textMuted,
  },
  finalizeBtn: {
    backgroundColor: C.accentGold,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  finalizeBtnText: { color: "#000", fontSize: 15, fontWeight: "700" },
  finalizedBanner: {
    backgroundColor: C.accentGold + "18",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.accentGold + "44",
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 12,
    gap: 4,
  },
  finalizedTitle: { color: C.accentGold, fontSize: 16, fontWeight: "700", textAlign: "center", marginBottom: 2 },
  finalizedText: { color: C.accentGold, fontSize: 15, fontWeight: "700", textAlign: "center" },
  finalizedSub: { color: C.textSecondary, fontSize: 13, textAlign: "center", marginBottom: 10 },
  sendOffRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    width: "100%",
  },
  shareImgBtn: {
    flex: 1,
    backgroundColor: C.accentGold,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  shareImgBtnText: { color: "#000", fontSize: 13, fontWeight: "700" },
  copyLinkBtn: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  copyLinkText: { color: C.textSecondary, fontSize: 13, fontWeight: "600" },
  hiddenReceipt: {
    position: "absolute",
    top: -9999,
    left: 0,
  },
  finalizeErrorBox: {
    backgroundColor: C.danger + "18",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.danger + "44",
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    gap: 6,
  },
  finalizeErrorText: { color: C.danger, fontSize: 13, lineHeight: 18 },
  finalizeErrorDismiss: { color: C.textMuted, fontSize: 12, textDecorationLine: "underline" },

  // Finalize confirmation modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: C.text,
    marginBottom: 10,
    textAlign: "center",
  },
  modalBody: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: C.surfaceLight,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  modalCancelText: { color: C.text, fontSize: 14, fontWeight: "600" },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: C.accentGold,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalConfirmText: { color: "#000", fontSize: 14, fontWeight: "700" },

  btnDisabled: { opacity: 0.5 },

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
