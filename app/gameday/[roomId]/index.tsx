import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import {
  gamedayFetch,
  GDRoomResponse,
  GDCard,
  GDProp,
  GDParticipant,
  GDLeaderboardEntry,
} from "@/lib/gameday-api";
import Colors from "@/constants/colors";

const C = Colors.dark;
const GUEST_KEY = (roomId: string) => `gd_guest_${roomId}`;

export default function GameDayRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();

  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<GDRoomResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<GDLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Join / guest flow state
  const [joinStep, setJoinStep] = useState<"choose" | "name" | null>(null);
  const [guestName, setGuestName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Pick submission state
  const [pendingPicks, setPendingPicks] = useState<Record<string, string>>({});
  const [submittingPicks, setSubmittingPicks] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  // Track which card the user has successfully submitted picks for this session.
  const [submittedCardId, setSubmittedCardId] = useState<string | null>(null);
  // Ref to detect open-card changes so we can re-sync pendingPicks from the server.
  const openCardIdRef = useRef<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load guest session from localStorage on mount
  useEffect(() => {
    if (!roomId) return;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const stored = window.localStorage.getItem(GUEST_KEY(roomId));
      if (stored) setGuestSessionId(stored);
    }
  }, [roomId]);

  const fetchRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      const data = await gamedayFetch<GDRoomResponse>(
        `/api/gameday/rooms/${roomId}`,
        {},
        { session, guestSessionId }
      );
      setRoomData(data);
      setError(null);

      // Sync pendingPicks when the open card changes (new card) or on first load.
      // This pre-fills any picks already saved on the server so returning users
      // see their current selections and can update them while the card is open.
      const newOpenCard = (data.cards as GDCard[]).find((c) => c.status === "open");
      const newOpenCardId = newOpenCard?.id ?? null;
      if (newOpenCardId !== openCardIdRef.current) {
        openCardIdRef.current = newOpenCardId;
        if (newOpenCard) {
          // Seed pendingPicks with whatever the server has saved for this card.
          const seeded: Record<string, string> = {};
          newOpenCard.gameday_props.forEach((p) => {
            if (data.my_picks[p.id]) seeded[p.id] = data.my_picks[p.id];
          });
          setPendingPicks(seeded);
        } else {
          setPendingPicks({});
        }
      }

      // If participant was null before but now exists: clear join flow
      if (data.participant) setJoinStep(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to load room");
    } finally {
      setLoading(false);
    }
  }, [roomId, session, guestSessionId]);

  const fetchLeaderboard = useCallback(async () => {
    if (!roomId) return;
    try {
      const data = await gamedayFetch<{ leaderboard: GDLeaderboardEntry[] }>(
        `/api/gameday/rooms/${roomId}/leaderboard`
      );
      setLeaderboard(data.leaderboard);
    } catch { /* silent */ }
  }, [roomId]);

  // Initial load and polling
  useEffect(() => {
    fetchRoom();
    fetchLeaderboard();

    pollingRef.current = setInterval(() => {
      fetchRoom();
      fetchLeaderboard();
    }, 15_000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchRoom, fetchLeaderboard]);

  // Determine if user needs to join
  useEffect(() => {
    if (!roomData) return;
    if (roomData.participant) {
      setJoinStep(null);
      return;
    }
    // No participant found — show join prompt
    if (joinStep === null) setJoinStep("choose");
  }, [roomData]);

  // Auto-join logged-in users
  const autoJoinLoggedIn = useCallback(async () => {
    if (!roomId || !session) return;
    setJoining(true);
    try {
      await gamedayFetch(
        `/api/gameday/rooms/${roomId}/join`,
        { method: "POST", body: JSON.stringify({}) },
        { session }
      );
      await fetchRoom();
      setJoinStep(null);
    } catch (e: any) {
      setJoinError(e.message);
    } finally {
      setJoining(false);
    }
  }, [roomId, session]);

  const handleJoinAsGuest = async () => {
    if (!guestName.trim()) {
      setJoinError("Enter your name to join.");
      return;
    }
    if (!roomId) return;
    setJoining(true);
    setJoinError(null);
    try {
      const result = await gamedayFetch<{
        participant: GDParticipant;
        guest_session_id: string;
      }>(
        `/api/gameday/rooms/${roomId}/join`,
        {
          method: "POST",
          body: JSON.stringify({ display_name: guestName.trim() }),
        }
      );
      const gsId = result.guest_session_id;
      setGuestSessionId(gsId);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.localStorage.setItem(GUEST_KEY(roomId), gsId);
      }
      await fetchRoom();
      setJoinStep(null);
    } catch (e: any) {
      setJoinError(e.message);
    } finally {
      setJoining(false);
    }
  };

  const handleSubmitPicks = async (openCard: GDCard) => {
    if (!roomId) return;
    const propIds = openCard.gameday_props.map((p) => p.id);
    const missing = propIds.filter((id) => !pendingPicks[id]);
    if (missing.length > 0) {
      setPickError(`Make a pick for every question (${missing.length} remaining).`);
      return;
    }
    setPickError(null);
    setSubmittingPicks(true);
    try {
      for (const prop of openCard.gameday_props) {
        await gamedayFetch(
          `/api/gameday/props/${prop.id}/pick`,
          {
            method: "POST",
            body: JSON.stringify({ selected_answer: pendingPicks[prop.id] }),
          },
          { session, guestSessionId }
        );
      }
      setSubmittedCardId(openCard.id);
      await fetchRoom();
    } catch (e: any) {
      setPickError(e.message);
    } finally {
      setSubmittingPicks(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => fetchRoom()}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!roomData) return null;

  const { room, cards, participant, my_picks, revealed_picks } = roomData;

  const isFinalized = room.status === "finalized";

  // ── Join screen — skipped for finalized rooms so anyone can view results ──
  if (joinStep && !participant && !isFinalized) {
    return (
      <View style={[styles.joinContainer, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}>
        <Text style={styles.joinLogo}>SWAYGER</Text>
        <Text style={styles.joinHeading}>Join Game Day Swayger</Text>
        <Text style={styles.joinMatchup}>
          {room.team_a_name} vs {room.team_b_name}
        </Text>
        <Text style={styles.joinSub}>
          Make NBA picks, track the leaderboard, and see who walks away with the receipts.
        </Text>

        {joinStep === "choose" && (
          <View style={styles.joinButtons}>
            {session ? (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={autoJoinLoggedIn}
                disabled={joining}
              >
                {joining ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    Join as {profile?.display_name || profile?.username || "Player"}
                  </Text>
                )}
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => setJoinStep("name")}
            >
              <Text style={styles.primaryBtnText}>Continue as Guest</Text>
            </TouchableOpacity>
            {!session && (
              <TouchableOpacity
                style={styles.ghostBtn}
                onPress={() => {
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(
                      "swayger_pending_auth_redirect",
                      `/gameday/${roomId}`
                    );
                  }
                  router.push("/auth");
                }}
              >
                <Text style={styles.ghostBtnText}>Sign In / Create Account</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {joinStep === "name" && (
          <View style={styles.joinButtons}>
            <TextInput
              style={styles.nameInput}
              placeholder="Your name (e.g. Darius)"
              placeholderTextColor={C.textMuted}
              value={guestName}
              onChangeText={setGuestName}
              autoFocus
              onSubmitEditing={handleJoinAsGuest}
            />
            {joinError ? (
              <Text style={styles.joinError}>{joinError}</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.primaryBtn, joining && styles.btnDisabled]}
              onPress={handleJoinAsGuest}
              disabled={joining}
            >
              {joining ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>Join the Room →</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setJoinStep("choose")}>
              <Text style={styles.backLink}>← Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {joinError && joinStep !== "name" ? (
          <Text style={styles.joinError}>{joinError}</Text>
        ) : null}
      </View>
    );
  }

  // ── Main room view ─────────────────────────────────────────────────────────

  // Finalized rooms: show final results without any pick submission UI
  const openCard = isFinalized ? undefined : cards.find((c) => c.status === "open");
  // Has the user saved picks for this card (either this session or from a previous visit)?
  const hasSubmittedOpenCard =
    !!openCard &&
    (submittedCardId === openCard.id ||
      openCard.gameday_props.every((p) => my_picks[p.id] !== undefined));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 40,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.roomHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.logoSmall}>SWAYGER</Text>
        <Text style={styles.roomName}>{room.room_name}</Text>
        <Text style={styles.matchup}>
          {room.team_a_name} vs {room.team_b_name}
        </Text>
        <Text style={styles.groupChatNote}>
          Keep talking in your group chat. Swayger tracks the picks, leaderboard, and receipts.
        </Text>
      </View>

      {/* Finalized banner */}
      {isFinalized ? (
        <View style={styles.finalizedBanner}>
          <Text style={styles.finalizedTitle}>🏆 Final Standings</Text>
          <Text style={styles.finalizedSub}>
            This room is locked. All picks are revealed and results are final.
          </Text>
        </View>
      ) : null}

      {/* Open card — only shown while room is live */}
      {openCard ? (
        <PickCard
          card={openCard}
          myPicks={pendingPicks}
          onSelect={(propId, answer) =>
            setPendingPicks((prev) => ({ ...prev, [propId]: answer }))
          }
          onSubmit={() => handleSubmitPicks(openCard)}
          submitting={submittingPicks}
          pickError={pickError}
          hasSubmitted={hasSubmittedOpenCard}
        />
      ) : null}

      {/* No card open — only shown for live rooms */}
      {!openCard && !isFinalized ? (
        <View style={styles.waitingBanner}>
          <Text style={styles.waitingText}>
            No picks are open right now. Check the leaderboard and watch your group chat for the next drop.
          </Text>
        </View>
      ) : null}

      {/* Locked/settled cards — reveal */}
      {cards
        .filter((c) => c.status === "locked" || c.status === "settled")
        .map((card) => (
          <RevealCard
            key={card.id}
            card={card}
            myPicks={my_picks}
            revealedPicks={revealed_picks}
          />
        ))}

      {/* Leaderboard */}
      <LeaderboardSection leaderboard={leaderboard} myParticipantId={participant?.id} />
    </ScrollView>
  );
}

// ── Pick Card ─────────────────────────────────────────────────────────────────

function PickCard({
  card,
  myPicks,
  onSelect,
  onSubmit,
  submitting,
  pickError,
  hasSubmitted,
}: {
  card: GDCard;
  myPicks: Record<string, string>;
  onSelect: (propId: string, answer: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  pickError: string | null;
  hasSubmitted: boolean;
}) {
  const answered = card.gameday_props.filter((p) => myPicks[p.id]).length;
  const total = card.gameday_props.length;
  const allAnswered = answered === total;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.openBadge}>
          <Text style={styles.openBadgeText}>OPEN</Text>
        </View>
        <Text style={styles.cardTitle}>{card.title}</Text>
        <Text style={styles.cardProgress}>
          {answered}/{total} answered
        </Text>
      </View>

      {/* Submitted confirmation — visible once picks are saved */}
      {hasSubmitted ? (
        <View style={styles.submittedInline}>
          <Text style={styles.submittedInlineText}>
            ✓ Picks submitted. You can change them until this card locks.
          </Text>
        </View>
      ) : null}

      {card.gameday_props.map((prop) => (
        <PropPicker
          key={prop.id}
          prop={prop}
          selected={myPicks[prop.id]}
          onSelect={(ans) => onSelect(prop.id, ans)}
        />
      ))}

      {pickError ? (
        <Text style={styles.errorMsg}>{pickError}</Text>
      ) : null}

      <TouchableOpacity
        style={[
          styles.submitBtn,
          (submitting || (!hasSubmitted && !allAnswered)) && styles.btnDisabled,
        ]}
        onPress={onSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.submitBtnText}>
            {hasSubmitted ? "Update my picks →" : "Lock in my picks →"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function PropPicker({
  prop,
  selected,
  onSelect,
}: {
  prop: GDProp;
  selected: string | undefined;
  onSelect: (ans: string) => void;
}) {
  return (
    <View style={styles.propBlock}>
      <Text style={styles.propQuestion}>{prop.question}</Text>
      <View style={styles.optionsRow}>
        {prop.answer_options.map((ans) => {
          const active = selected === ans;
          return (
            <TouchableOpacity
              key={ans}
              style={[styles.optionBtn, active && styles.optionBtnActive]}
              onPress={() => onSelect(ans)}
              activeOpacity={0.75}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {ans}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Reveal Card ───────────────────────────────────────────────────────────────

function RevealCard({
  card,
  myPicks,
  revealedPicks,
}: {
  card: GDCard;
  myPicks: Record<string, string>;
  revealedPicks: Record<string, Record<string, string[]>>;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.openBadge, styles.lockedBadge]}>
          <Text style={styles.openBadgeText}>
            {card.status === "locked" ? "LOCKED" : "SETTLED"}
          </Text>
        </View>
        <Text style={styles.cardTitle}>{card.title}</Text>
        <Text style={styles.cardSubtitle}>Picks revealed</Text>
      </View>

      {card.gameday_props.map((prop) => {
        const myPick = myPicks[prop.id];
        const distribute = revealedPicks[prop.id] ?? {};
        const isSettled = prop.status === "settled";
        const correct = prop.correct_answer;

        return (
          <View key={prop.id} style={styles.revealProp}>
            <Text style={styles.propQuestion}>{prop.question}</Text>
            {isSettled && correct ? (
              <View style={styles.correctAnswerRow}>
                <Text style={styles.correctLabel}>✓ </Text>
                <Text style={styles.correctAnswer}>{correct}</Text>
              </View>
            ) : null}
            {prop.answer_options.map((ans) => {
              const pickers = distribute[ans] ?? [];
              const isMine = myPick === ans;
              const isWinner = isSettled && ans === correct;
              const isWrong = isSettled && isMine && ans !== correct;

              return (
                <View
                  key={ans}
                  style={[
                    styles.revealAnswer,
                    isWinner && styles.revealAnswerWinner,
                    isWrong && styles.revealAnswerWrong,
                  ]}
                >
                  <View style={styles.revealAnswerLeft}>
                    <Text
                      style={[
                        styles.revealAnswerText,
                        isWinner && styles.revealAnswerTextWinner,
                      ]}
                    >
                      {ans}
                      {isMine ? " (you)" : ""}
                    </Text>
                    {pickers.length > 0 ? (
                      <Text style={styles.revealPickers}>
                        {pickers.join(", ")}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.revealCount}>{pickers.length}</Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

function LeaderboardSection({
  leaderboard,
  myParticipantId,
}: {
  leaderboard: GDLeaderboardEntry[];
  myParticipantId?: string;
}) {
  if (leaderboard.length === 0) return null;

  return (
    <View style={styles.lbSection}>
      <Text style={styles.lbTitle}>Leaderboard</Text>
      {leaderboard.map((entry) => {
        const isMe = entry.participant_id === myParticipantId;
        return (
          <View
            key={entry.participant_id}
            style={[styles.lbRow, isMe && styles.lbRowMe]}
          >
            <Text style={styles.lbRank}>#{entry.rank}</Text>
            <Text style={[styles.lbName, isMe && styles.lbNameMe]}>
              {entry.display_name}
              {isMe ? " (you)" : ""}
              {entry.is_guest ? " · guest" : ""}
            </Text>
            <View style={styles.lbRight}>
              <Text style={styles.lbSP}>{entry.game_day_sp} SP</Text>
              <Text style={styles.lbStats}>
                {entry.correct_picks}✓
                {entry.pending_picks > 0 ? ` · ${entry.pending_picks} pending` : ""}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scrollContent: { paddingHorizontal: 16 },
  center: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },

  // Join screen
  joinContainer: {
    flex: 1,
    backgroundColor: C.background,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  joinLogo: {
    fontSize: 12,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 2,
    marginBottom: 32,
  },
  joinHeading: {
    fontSize: 26,
    fontWeight: "700",
    color: C.text,
    textAlign: "center",
    marginBottom: 8,
  },
  joinMatchup: {
    fontSize: 16,
    color: C.tint,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
  },
  joinSub: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 36,
    maxWidth: 320,
  },
  joinButtons: { width: "100%", maxWidth: 340, gap: 12 },
  primaryBtn: {
    backgroundColor: C.tint,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  ghostBtn: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  ghostBtnText: { color: C.textSecondary, fontSize: 15, fontWeight: "600" },
  nameInput: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backLink: { color: C.textMuted, textAlign: "center", fontSize: 14, paddingTop: 4 },
  joinError: { color: C.danger, fontSize: 13, textAlign: "center" },
  btnDisabled: { opacity: 0.5 },

  // Room header
  backBtn: { marginBottom: 12 },
  backBtnText: { color: C.textSecondary, fontSize: 15 },
  roomHeader: { marginBottom: 24 },
  logoSmall: {
    fontSize: 11,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 2,
    marginBottom: 8,
  },
  roomName: { fontSize: 22, fontWeight: "700", color: C.text, marginBottom: 4 },
  matchup: { fontSize: 15, color: C.tint, fontWeight: "600", marginBottom: 10 },
  groupChatNote: {
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 18,
    fontStyle: "italic",
  },

  // Cards
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: { marginBottom: 16 },
  openBadge: {
    backgroundColor: C.tint,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  lockedBadge: { backgroundColor: C.textMuted },
  openBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: C.text, marginBottom: 2 },
  cardSubtitle: { fontSize: 13, color: C.textMuted },
  cardProgress: { fontSize: 13, color: C.textSecondary },

  // Props
  propBlock: { marginBottom: 20 },
  propQuestion: { fontSize: 14, fontWeight: "600", color: C.text, marginBottom: 10, lineHeight: 20 },
  optionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionBtn: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  optionBtnActive: { borderColor: C.tint, backgroundColor: C.tint + "22" },
  optionText: { color: C.textSecondary, fontSize: 13, fontWeight: "500" },
  optionTextActive: { color: C.tint, fontWeight: "700" },

  // Submit
  submitBtn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  submitBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Submitted banner
  submittedBanner: {
    backgroundColor: C.success + "18",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.success + "44",
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  submittedTitle: { fontSize: 16, fontWeight: "700", color: C.success, marginBottom: 4 },
  submittedSub: { fontSize: 13, color: C.textSecondary },

  // Inline submitted confirmation (inside the pick card)
  submittedInline: {
    backgroundColor: C.success + "18",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.success + "44",
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  submittedInlineText: { fontSize: 13, color: C.success, fontWeight: "600" },

  // Waiting
  waitingBanner: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
  },
  waitingText: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 21,
  },

  // Reveal
  revealProp: { marginBottom: 20 },
  correctAnswerRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  correctLabel: { color: C.success, fontSize: 14, fontWeight: "700" },
  correctAnswer: { color: C.success, fontSize: 14, fontWeight: "700" },
  revealAnswer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 6,
  },
  revealAnswerWinner: { borderColor: C.success, backgroundColor: C.success + "14" },
  revealAnswerWrong: { borderColor: C.danger, backgroundColor: C.danger + "10" },
  revealAnswerLeft: { flex: 1 },
  revealAnswerText: { fontSize: 13, color: C.text, fontWeight: "600" },
  revealAnswerTextWinner: { color: C.success },
  revealPickers: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  revealCount: { fontSize: 14, fontWeight: "700", color: C.textSecondary, marginLeft: 8 },

  // Leaderboard
  lbSection: { marginTop: 12 },
  lbTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: C.text,
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 6,
    gap: 10,
  },
  lbRowMe: { borderColor: C.tint },
  lbRank: { fontSize: 13, fontWeight: "700", color: C.textMuted, width: 28 },
  lbName: { flex: 1, fontSize: 14, color: C.text, fontWeight: "500" },
  lbNameMe: { color: C.tint },
  lbRight: { alignItems: "flex-end" },
  lbSP: { fontSize: 14, fontWeight: "700", color: C.accentGold },
  lbStats: { fontSize: 11, color: C.textMuted },

  // Finalized room
  finalizedBanner: {
    backgroundColor: "#F5A62318",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F5A62344",
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  finalizedTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F5A623",
    marginBottom: 4,
  },
  finalizedSub: {
    fontSize: 13,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },

  // Misc
  errorText: { color: C.danger, fontSize: 15, textAlign: "center" },
  errorMsg: { color: C.danger, fontSize: 13, marginBottom: 12, textAlign: "center" },
  btn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
