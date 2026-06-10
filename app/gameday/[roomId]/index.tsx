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
  Share,
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
import { Analytics, detectEntrySource, detectUtmCampaign, GDRoomCtx, GDParticipantCtx } from "@/lib/posthog";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import GameDayReceiptCard from "@/components/GameDayReceiptCard";

const C = Colors.dark;
const GUEST_KEY = (roomId: string) => `gd_guest_${roomId}`;

// ── Shared helpers ────────────────────────────────────────────────────────────

function fmtMmSs(totalSecs: number): string {
  const s = Math.max(0, totalSecs);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

interface TimelineItem {
  key: "pregame" | "halftime" | "fourth" | "final";
  label: string;
  status: "open" | "locked" | "settled" | "coming_up" | "finalized";
}

function computeTimeline(cards: GDCard[], isFinalized: boolean): TimelineItem[] {
  const byPhase = (p: GDCard["phase"]) => cards.find((c) => c.phase === p);
  const statusFor = (p: GDCard["phase"]): TimelineItem["status"] => {
    const c = byPhase(p);
    if (!c || c.status === "closed") return "coming_up";
    if (c.status === "open") return "open";
    if (c.status === "locked") return "locked";
    return isFinalized ? "finalized" : "settled";
  };
  return [
    { key: "pregame", label: "Pregame Picks", status: statusFor("pregame") },
    { key: "halftime", label: "Halftime Picks", status: statusFor("halftime") },
    { key: "fourth", label: "4Q Clutch Picks", status: statusFor("fourth") },
    { key: "final", label: "Final Receipts", status: isFinalized ? "finalized" : "coming_up" },
  ];
}

function getNextWindow(
  cards: GDCard[],
  isFinalized: boolean,
  myPicks: Record<string, string>
): { headline: string; sub: string } {
  if (isFinalized) return { headline: "🏆 Receipts are in.", sub: "View final standings below." };

  const pregame = cards.find((c) => c.phase === "pregame");
  const halftime = cards.find((c) => c.phase === "halftime");
  const fourth = cards.find((c) => c.phase === "fourth");

  if (pregame?.status === "open")
    return { headline: "🟢 Pregame Picks are open.", sub: "Lock in before tipoff." };
  if (halftime?.status === "open")
    return { headline: "🟢 Halftime Picks are live.", sub: "Make your second-half calls now." };
  if (fourth?.status === "open")
    return { headline: "🟢 4Q Clutch Picks are live.", sub: "Last window to move up before receipts drop." };

  const pregameLocked = pregame?.status === "locked" || pregame?.status === "settled";
  const halftimeLocked = halftime?.status === "locked" || halftime?.status === "settled";
  const fourthLocked = fourth?.status === "locked" || fourth?.status === "settled";

  const missedPregame =
    pregameLocked &&
    !(pregame?.gameday_props ?? []).some((p) => myPicks[p.id] !== undefined);
  const missedHalftime =
    halftimeLocked &&
    !(halftime?.gameday_props ?? []).some((p) => myPicks[p.id] !== undefined);

  if (pregameLocked && halftime?.status === "closed") {
    return missedPregame
      ? { headline: "⏳ Pregame Picks are locked.", sub: "You can still join Halftime and 4Q picks when they open." }
      : { headline: "⏳ Next up: Halftime Picks.", sub: "Check back at halftime to make your second-half calls." };
  }
  if (halftimeLocked && fourth?.status === "closed") {
    return missedHalftime
      ? { headline: "⏳ Halftime Picks are locked.", sub: "4Q Clutch Picks are still coming. Check back near the 4th quarter." }
      : { headline: "⏳ Next up: 4Q Clutch Picks.", sub: "Check back near the start of the 4th quarter." };
  }
  if (pregameLocked && halftimeLocked && fourthLocked) {
    return { headline: "📊 Receipts are being tallied.", sub: "Check back soon for final standings." };
  }
  return {
    headline: "⏳ No picks are open right now.",
    sub: "Stay close — the first pick window will open before tipoff.",
  };
}

function getCountdownCopy(
  phase: string,
  type: string,
  secsLeft: number,
  expired: boolean
): { headline: string; sub: string; timer: string } {
  const pl = phase === "pregame" ? "Pregame Picks" : phase === "halftime" ? "Halftime Picks" : "4Q Clutch Picks";
  if (expired) {
    return {
      headline: `${pl} window update expected now.`,
      sub: "Check the room — the host is opening or locking the window.",
      timer: "",
    };
  }
  const t = fmtMmSs(secsLeft);
  if (type === "opens_soon") {
    return {
      headline: `${pl} expected soon.`,
      sub: "Host is opening this window soon. Stay close — picks are coming.",
      timer: `Expected in ~${t}`,
    };
  }
  return {
    headline: `${pl} lock soon.`,
    sub:
      phase === "pregame"
        ? "Get your picks in before tipoff."
        : phase === "halftime"
        ? "Get your second-half picks in now."
        : "Get your picks in before the window closes.",
    timer: `${t} left to submit your picks`,
  };
}

export default function GameDayRoomScreen() {
  const { roomId, from } = useLocalSearchParams<{ roomId: string; from?: string }>();
  const router = useRouter();
  const fromCaptain = from === "captain";
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
  // Tracks whether pendingPicks has been seeded with real server picks for the current card.
  // Resets when the card changes. Used to handle the guest-session race: the first fetchRoom
  // may fire before guestSessionId loads from localStorage, returning empty my_picks. When
  // a subsequent fetch returns real picks, we need to re-seed even though the card ID hasn't changed.
  const picksSeededRef = useRef(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const receiptRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [countdownSecsLeft, setCountdownSecsLeft] = useState(0);

  // Countdown timer: ticks every second while an active notice exists
  useEffect(() => {
    const endsAtStr = roomData?.room.countdown_ends_at;
    if (!endsAtStr) { setCountdownSecsLeft(0); return; }
    const tick = () =>
      setCountdownSecsLeft(Math.floor((Date.parse(endsAtStr) - Date.now()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [roomData?.room.countdown_ends_at]);

  // Load guest session from localStorage on mount
  useEffect(() => {
    if (!roomId) return;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const stored = window.localStorage.getItem(GUEST_KEY(roomId));
      if (stored) setGuestSessionId(stored);
    }
  }, [roomId]);

  const hasTrackedView = useRef(false);
  const hasTrackedFinalStandings = useRef(false);
  // Detected once on mount from URL params / referrer — never changes mid-session.
  const entrySourceRef = useRef<string>(detectEntrySource());
  const utmCampaignRef = useRef<string | undefined>(detectUtmCampaign());
  const hasTrackedLeaderboard = useRef(false);

  // Build PostHog room context from the latest roomData snapshot.
  const buildRoomCtx = (data: GDRoomResponse | null): GDRoomCtx => ({
    room_id: roomId ?? "",
    room_code: data?.room.room_code,
    room_source: data?.room.source ?? "unknown",
    room_status: data?.room.status,
  });

  // Build PostHog participant context from roomData + auth session.
  const buildParticipantCtx = (data: GDRoomResponse | null): GDParticipantCtx | null => {
    const p = data?.participant;
    if (!p) return null;
    return {
      participant_id: p.id,
      participant_type: p.is_guest ? "guest" : "user",
      is_guest: p.is_guest,
      is_logged_in: !!session,
      user_id: session?.user?.id ?? null,
    };
  };

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
      const roomCode = data.room.room_code ?? undefined;
      if (!hasTrackedView.current) {
        hasTrackedView.current = true;
        Analytics.gamedayRoomViewed(
          buildRoomCtx(data),
          data.room.room_name,
          entrySourceRef.current,
          buildParticipantCtx(data),
          utmCampaignRef.current
        );
      }
      if (data.room.status === "finalized" && !hasTrackedFinalStandings.current) {
        hasTrackedFinalStandings.current = true;
        Analytics.gamedayFinalStandingsViewed(
          buildRoomCtx(data),
          entrySourceRef.current,
          buildParticipantCtx(data)
        );
        // Also log to gameday_events (fire-and-forget, never blocks render)
        gamedayFetch(
          `/api/gameday/rooms/${roomId}/final-standings-viewed`,
          { method: "POST", body: JSON.stringify({}) },
          { session, guestSessionId }
        ).catch(() => {});
      }

      // Sync pendingPicks from the server when:
      //   a) A different card is now open (card switch or first load), OR
      //   b) The server now has real picks for us but we haven't seeded them yet.
      //      This handles the guest-session race where the first fetchRoom fires before
      //      guestSessionId is loaded from localStorage (so my_picks comes back empty),
      //      and the subsequent fetch actually returns the user's saved picks — but the
      //      card ID hasn't changed, so the old "card changed" check would skip re-seeding.
      const newOpenCard = (data.cards as GDCard[]).find((c) => c.status === "open");
      const newOpenCardId = newOpenCard?.id ?? null;
      const cardChanged = newOpenCardId !== openCardIdRef.current;
      const serverHasPicksForUs = newOpenCard != null && Object.keys(data.my_picks).length > 0;

      if (cardChanged || (serverHasPicksForUs && !picksSeededRef.current)) {
        if (cardChanged) {
          openCardIdRef.current = newOpenCardId;
          picksSeededRef.current = false; // reset seed-tracking for the new card
        }
        if (newOpenCard) {
          // Seed pendingPicks with whatever the server has saved for this card.
          const seeded: Record<string, string> = {};
          newOpenCard.gameday_props.forEach((p) => {
            if (data.my_picks[p.id]) seeded[p.id] = data.my_picks[p.id];
          });
          // Mark as seeded only when we actually got real picks from the server.
          if (Object.keys(seeded).length > 0) picksSeededRef.current = true;
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

  const BASE_URL =
    process.env.EXPO_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "https://swayger.app");

  const handleShareStandings = async () => {
    const shareMethod = Platform.OS === "web" ? "download_image" : "native_share";
    Analytics.gamedayStandingsShared(
      buildRoomCtx(roomData),
      entrySourceRef.current,
      shareMethod,
      buildParticipantCtx(roomData),
      false
    );
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
      if (!msg.toLowerCase().includes("cancel")) console.warn("[gameday] share error:", msg);
    } finally {
      setSharing(false);
    }
  };

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

  // Once-per-session leaderboard view — fires when leaderboard data first arrives.
  // Guarded by ref so polling never re-fires it.
  useEffect(() => {
    if (!hasTrackedLeaderboard.current && leaderboard.length > 0 && roomData) {
      hasTrackedLeaderboard.current = true;
      const openCard = (roomData.cards as GDCard[]).find((c) => c.status === "open");
      const settledPropCount = (roomData.cards as GDCard[])
        .flatMap((c) => c.gameday_props)
        .filter((p) => p.status === "settled").length;
      Analytics.gamedayLeaderboardViewed(
        buildRoomCtx(roomData),
        entrySourceRef.current,
        {
          participant_id: roomData.participant?.id,
          participant_type: roomData.participant
            ? roomData.participant.is_guest
              ? "guest"
              : "user"
            : undefined,
          leaderboard_available: true,
          participant_count: roomData.participant_count,
          settled_prop_count: settledPropCount,
          current_open_card_phase: openCard?.phase,
        }
      );
    }
  }, [leaderboard, roomData]);

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
      Analytics.gamedayJoined(
        buildRoomCtx(roomData),
        "user",
        entrySourceRef.current,
        buildParticipantCtx(roomData),
        utmCampaignRef.current
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
      // Persist to localStorage first — always set before state updates.
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.localStorage.setItem(GUEST_KEY(roomId), gsId);
      }
      // Update guestSessionId in state — this causes fetchRoom (a useCallback)
      // to be recreated with the correct ID on the next render, which triggers
      // a fresh room fetch that includes the participant header.
      setGuestSessionId(gsId);
      // Directly patch roomData with the participant we already have from the
      // join response. We cannot call fetchRoom() here because it still closes
      // over the old guestSessionId (null) — the state update above has not
      // been applied yet. Calling fetchRoom() with the stale closure would
      // return participant:null and the join-detection useEffect would bounce
      // the user back to the join screen.
      setRoomData((prev) =>
        prev ? { ...prev, participant: result.participant } : prev
      );
      setJoinStep(null);
      // At this point roomData still has the old participant (null), but we
      // already patched it via setRoomData above. Build a lightweight ctx
      // directly so we don't rely on the stale roomData closure value.
      Analytics.gamedayJoined(
        {
          room_id: roomId ?? "",
          room_code: roomData?.room.room_code,
          room_source: roomData?.room.source ?? "unknown",
          room_status: roomData?.room.status,
        },
        "guest",
        entrySourceRef.current,
        {
          participant_id: result.participant.id,
          participant_type: "guest",
          is_guest: true,
          is_logged_in: false,
        },
        utmCampaignRef.current
      );
      console.log("[gameday] guest joined, session stored:", gsId.slice(0, 8) + "...");
    } catch (e: any) {
      console.error("[gameday] guest join failed:", e.message);
      setJoinError(e.message);
    } finally {
      setJoining(false);
    }
  };

  const handleSubmitPicks = async (openCard: GDCard) => {
    if (!roomId) return;
    if (roomData?.room.archived_at) {
      setPickError("This room is no longer active.");
      return;
    }
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
      Analytics.gamedayPickSubmitted(
        buildRoomCtx(roomData),
        openCard.phase,
        openCard.gameday_props.length,
        submittedCardId === openCard.id,
        entrySourceRef.current,
        buildParticipantCtx(roomData),
        utmCampaignRef.current
      );
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

  // ── Archived room — show inactive message, block all actions ─────────────
  if (room.archived_at) {
    return (
      <View style={[styles.joinContainer, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}>
        <Text style={styles.joinLogo}>SWAYGER</Text>
        <Text style={styles.joinHeading}>Room No Longer Active</Text>
        <Text style={styles.joinSub}>
          This Game Day room is no longer accepting participants or picks.
        </Text>
      </View>
    );
  }

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

  const myLbEntry = participant ? leaderboard.find((e) => e.participant_id === participant.id) : undefined;
  const myFinalRank = myLbEntry?.rank ?? null;
  const myFinalSp = myLbEntry?.game_day_sp ?? null;
  const myIsWinner = myLbEntry ? myLbEntry.rank === 1 : null;
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
        {fromCaptain && (
          <TouchableOpacity
            style={styles.captainReturnBtn}
            onPress={() => router.push(`/gameday/${roomId}/captain` as never)}
          >
            <Text style={styles.captainReturnBtnText}>← Captain Center</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.logoSmall}>SWAYGER</Text>
        <Text style={styles.roomName}>{room.room_name}</Text>
        <Text style={styles.matchup}>
          {room.team_a_name} vs {room.team_b_name}
        </Text>
        <Text style={styles.groupChatNote}>
          Keep talking in your group chat. Swayger tracks the picks, leaderboard, and receipts.
        </Text>
      </View>

      {/* Countdown banner */}
      {(() => {
        const cdPhase = room?.countdown_phase;
        const cdType = room?.countdown_type;
        const cdEndsAt = room?.countdown_ends_at;
        if (!cdPhase || !cdType || !cdEndsAt || isFinalized) return null;
        if (countdownSecsLeft < -120) return null;
        const expired = countdownSecsLeft <= 0;
        const { headline, sub, timer } = getCountdownCopy(cdPhase, cdType, countdownSecsLeft, expired);
        const isUrgent = cdType === "locks_soon" && !expired;
        return (
          <View style={[styles.cdBanner, isUrgent ? styles.cdBannerUrgent : styles.cdBannerInfo]}>
            <Text style={styles.cdBannerHeadline}>{cdType === "locks_soon" ? "⏱ " : "📣 "}{headline}</Text>
            <Text style={styles.cdBannerSub}>{sub}</Text>
            {timer ? <Text style={styles.cdBannerTimer}>{timer}</Text> : null}
            <Text style={styles.cdBannerNote}>Host notice · Picks do not automatically open or lock</Text>
          </View>
        );
      })()}

      {/* Finalized banner + share CTAs */}
      {isFinalized ? (
        <View style={styles.finalizedBanner}>
          <Text style={styles.finalizedTitle}>🏆 Final Standings</Text>
          <Text style={styles.finalizedSub}>
            This room is locked. All picks are revealed and results are final.
          </Text>
          <View style={styles.shareRow}>
            <TouchableOpacity
              style={[styles.shareImgBtn, sharing && styles.btnDisabled]}
              onPress={handleShareStandings}
              disabled={sharing}
            >
              {sharing ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.shareImgBtnText}>📸 Share Standings</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.copyLinkBtn}
              onPress={() => {
                const link = room?.room_code
                  ? `${BASE_URL}/g/${room.room_code}`
                  : `${BASE_URL}/gameday/${roomId}`;
                if (Platform.OS === "web" && typeof navigator !== "undefined") {
                  navigator.clipboard.writeText(link).catch(() => {});
                }
              }}
            >
              <Text style={styles.copyLinkText}>🔗 Copy Link</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Open card — only shown while room is live */}
      {openCard ? (
        <PickCard
          card={openCard}
          myPicks={pendingPicks}
          serverPicks={my_picks}
          onSelect={(propId, answer) =>
            setPendingPicks((prev) => ({ ...prev, [propId]: answer }))
          }
          onSubmit={() => handleSubmitPicks(openCard)}
          submitting={submittingPicks}
          pickError={pickError}
          hasSubmitted={hasSubmittedOpenCard}
        />
      ) : null}

      {/* Next Pick Window callout — shown when no card is open */}
      {!openCard && !isFinalized ? (() => {
        const nw = getNextWindow(cards, isFinalized, my_picks);
        return (
          <View style={styles.nextWindowCard}>
            <Text style={styles.nextWindowHeadline}>{nw.headline}</Text>
            <Text style={styles.nextWindowSub}>{nw.sub}</Text>
          </View>
        );
      })() : null}

      {/* Game Day Timeline */}
      {!isFinalized && (
        <View style={styles.timelineSection}>
          <Text style={styles.timelineSectionLabel}>GAME DAY TIMELINE</Text>
          {computeTimeline(cards, isFinalized).map((item) => {
            const statusLabel =
              item.status === "open" ? "Open Now" :
              item.status === "locked" ? "Locked" :
              (item.status === "settled" || item.status === "finalized") ?
                (item.key === "final" ? "Ready" : "Settled") :
              "Coming Up";
            const statusColor =
              item.status === "open" ? "#22c55e" :
              item.status === "locked" ? C.textMuted :
              (item.status === "settled" || item.status === "finalized") ?
                (item.key === "final" ? C.accentGold : C.tint) :
              C.textSecondary;
            return (
              <View key={item.key} style={[styles.timelineRow, item.status === "open" && styles.timelineRowActive]}>
                <View style={[styles.timelineDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.timelineLabel, item.status === "open" && styles.timelineLabelActive]}>
                  {item.label}
                </Text>
                <View style={[styles.timelineStatusBadge, { borderColor: statusColor }]}>
                  <Text style={[styles.timelineStatusText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

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

      {/* Next Game Day CTA — only on finalized rooms */}
      {isFinalized && (
        <NextGameDayCTA
          roomId={roomId ?? ""}
          roomCode={room.room_code}
          roomSource={room.source ?? "unknown"}
          entrySource={entrySourceRef.current}
          participantId={participant?.id}
          participantType={participant?.is_guest ? "guest" : "user"}
          isGuest={participant?.is_guest ?? true}
          userEmail={session?.user?.email ?? null}
          finalRank={myFinalRank}
          finalSp={myFinalSp}
          isWinner={myIsWinner}
          session={session}
          guestSessionId={guestSessionId}
        />
      )}

      {/* Off-screen receipt card — captured for sharing */}
      {isFinalized && room ? (
        <View
          ref={receiptRef}
          collapsable={false}
          style={styles.hiddenReceipt}
        >
          <GameDayReceiptCard
            roomName={room.room_name}
            matchup={`${room.team_a_name} vs ${room.team_b_name}`}
            gameDate={room.game_date ?? null}
            leaderboard={leaderboard}
            myParticipantId={participant?.id ?? null}
            roomLink={
              room.room_code
                ? `swayger.app/g/${room.room_code}`
                : undefined
            }
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

// ── Next Game Day CTA ─────────────────────────────────────────────────────────

function NextGameDayCTA({
  roomId,
  roomCode,
  roomSource,
  entrySource,
  participantId,
  participantType,
  isGuest,
  userEmail,
  finalRank,
  finalSp,
  isWinner,
  session,
  guestSessionId,
}: {
  roomId: string;
  roomCode?: string | null;
  roomSource?: string;
  entrySource: string;
  participantId?: string;
  participantType?: string;
  isGuest?: boolean;
  userEmail?: string | null;
  finalRank?: number | null;
  finalSp?: number | null;
  isWinner?: boolean | null;
  session: unknown;
  guestSessionId: string | null;
}) {
  const [ctaState, setCtaState] = useState<"idle" | "email_input" | "submitted">("idle");
  const [ctaEmail, setCtaEmail] = useState("");
  const [ctaLoading, setCtaLoading] = useState(false);

  const roomCtx: GDRoomCtx = { room_id: roomId, room_code: roomCode, room_source: roomSource };
  const participantCtx: GDParticipantCtx = {
    participant_id: participantId,
    participant_type: participantType,
    is_guest: isGuest,
  };
  const hasLoggedInEmail = !isGuest && !!userEmail;

  const handleNotifyMe = () => {
    Analytics.gamedayNextRoomCtaClicked(
      roomCtx,
      entrySource,
      participantCtx,
      finalRank ?? null,
      finalSp ?? null,
      isWinner ?? null
    );
    if (hasLoggedInEmail) {
      submitInterest(userEmail!);
    } else {
      setCtaState("email_input");
    }
  };

  const submitInterest = async (emailToUse: string) => {
    setCtaLoading(true);
    try {
      await gamedayFetch(
        `/api/gameday/rooms/${roomId}/next-room-interest`,
        {
          method: "POST",
          body: JSON.stringify({
            email: emailToUse || undefined,
            participant_id: participantId,
            participant_type: participantType,
            room_code: roomCode,
            entry_source: entrySource,
            final_rank: finalRank,
            final_sp: finalSp,
            is_winner: isWinner,
          }),
        },
        { session: session as never, guestSessionId }
      );
    } catch {
      // fail silently — still show success
    } finally {
      setCtaLoading(false);
    }
    Analytics.gamedayNextRoomInterestSubmitted(
      roomCtx,
      entrySource,
      !!emailToUse,
      participantCtx,
      finalRank ?? null,
      finalSp ?? null,
      isWinner ?? null
    );
    setCtaState("submitted");
  };

  if (ctaState === "submitted") {
    return (
      <View style={styles.nextRoomCta}>
        <Text style={styles.nextRoomSuccess}>✓ You're on the list for the next Game Day room.</Text>
      </View>
    );
  }

  return (
    <View style={styles.nextRoomCta}>
      <Text style={styles.nextRoomTitle}>Want in on the next Game Day room?</Text>
      <Text style={styles.nextRoomBody}>We'll let you know when the next room goes live.</Text>
      {ctaState === "idle" ? (
        <>
          <TouchableOpacity style={styles.nextRoomBtn} onPress={handleNotifyMe} disabled={ctaLoading}>
            <Text style={styles.nextRoomBtnText}>Notify Me Next Game</Text>
          </TouchableOpacity>
          <Text style={styles.nextRoomHelper}>No spam. Just Game Day drops.</Text>
        </>
      ) : (
        <>
          <TextInput
            style={styles.nextRoomInput}
            placeholder="your@email.com"
            placeholderTextColor={C.textMuted}
            value={ctaEmail}
            onChangeText={setCtaEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[
              styles.nextRoomBtn,
              (!ctaEmail.includes("@") || ctaLoading) && styles.nextRoomBtnDisabled,
            ]}
            onPress={() => ctaEmail.includes("@") && submitInterest(ctaEmail)}
            disabled={!ctaEmail.includes("@") || ctaLoading}
          >
            {ctaLoading ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.nextRoomBtnText}>I'm In</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ── Pick Card ─────────────────────────────────────────────────────────────────

function PickCard({
  card,
  myPicks,
  serverPicks,
  onSelect,
  onSubmit,
  submitting,
  pickError,
  hasSubmitted,
}: {
  card: GDCard;
  myPicks: Record<string, string>;
  serverPicks: Record<string, string>;
  onSelect: (propId: string, answer: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  pickError: string | null;
  hasSubmitted: boolean;
}) {
  const answered = card.gameday_props.filter((p) => myPicks[p.id]).length;
  const total = card.gameday_props.length;
  const allAnswered = answered === total;

  // True when the user has submitted previously AND has made a local change that
  // differs from what's saved on the server — the amber reminder banner appears.
  const hasUnsavedChanges =
    hasSubmitted &&
    card.gameday_props.some(
      (p) => myPicks[p.id] !== undefined && myPicks[p.id] !== serverPicks[p.id]
    );

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
            ✓ Picks locked in. Green = confirmed. You can update until this card locks.
          </Text>
        </View>
      ) : null}

      {/* Unsaved-change reminder — amber, only when a pick was changed post-submit */}
      {hasUnsavedChanges ? (
        <View style={styles.updateReminderBanner}>
          <Text style={styles.updateReminderText}>
            ⚠️ You changed a pick — tap "Update my picks →" to save it.
          </Text>
        </View>
      ) : null}

      {card.gameday_props.map((prop) => (
        <PropPicker
          key={prop.id}
          prop={prop}
          selected={myPicks[prop.id]}
          serverPick={serverPicks[prop.id]}
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
          hasUnsavedChanges && styles.submitBtnUpdate,
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
  serverPick,
  onSelect,
}: {
  prop: GDProp;
  selected: string | undefined;
  serverPick: string | undefined;
  onSelect: (ans: string) => void;
}) {
  return (
    <View style={styles.propBlock}>
      <Text style={styles.propQuestion}>{prop.question}</Text>
      <View style={styles.optionsRow}>
        {prop.answer_options.map((ans) => {
          const isSelected = selected === ans;
          // Confirmed = saved to server and unchanged locally (green)
          const isConfirmed = isSelected && serverPick === ans;
          // Pending = locally selected but differs from what's on the server (blue)
          const isPending = isSelected && !isConfirmed;
          return (
            <TouchableOpacity
              key={ans}
              style={[
                styles.optionBtn,
                isConfirmed && styles.optionBtnConfirmed,
                isPending && styles.optionBtnActive,
              ]}
              onPress={() => onSelect(ans)}
              activeOpacity={0.75}
            >
              <Text style={[
                styles.optionText,
                isConfirmed && styles.optionTextConfirmed,
                isPending && styles.optionTextActive,
              ]}>
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
  optionBtnConfirmed: { borderColor: C.success, backgroundColor: C.success + "22" },
  optionText: { color: C.textSecondary, fontSize: 13, fontWeight: "500" },
  optionTextActive: { color: C.tint, fontWeight: "700" },
  optionTextConfirmed: { color: C.success, fontWeight: "700" },

  // Submit
  submitBtn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  submitBtnUpdate: { backgroundColor: "#F5A623" },
  submitBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Unsaved-change reminder banner (amber — appears when picks changed post-submit)
  updateReminderBanner: {
    backgroundColor: "#F5A62318",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F5A62355",
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  updateReminderText: { fontSize: 13, color: "#F5A623", fontWeight: "600" },

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
    marginBottom: 12,
  },
  shareRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    width: "100%",
  },
  shareImgBtn: {
    flex: 1,
    backgroundColor: "#F5A623",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  shareImgBtnText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "700",
  },
  copyLinkBtn: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  copyLinkText: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  hiddenReceipt: {
    position: "absolute",
    top: -9999,
    left: 0,
  },

  // Captain return link
  captainReturnBtn: {
    alignSelf: "flex-start" as const,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: `${C.tint}18`,
    borderWidth: 1,
    borderColor: C.tint,
    marginBottom: 4,
  },
  captainReturnBtnText: {
    color: C.tint,
    fontSize: 13,
    fontWeight: "600" as const,
  },

  // Countdown banner
  cdBanner: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  cdBannerInfo: { backgroundColor: `${C.tint}15`, borderColor: C.tint },
  cdBannerUrgent: { backgroundColor: `${C.danger}18`, borderColor: C.danger },
  cdBannerHeadline: {
    color: C.text,
    fontSize: 15,
    fontWeight: "700" as const,
    marginBottom: 4,
  },
  cdBannerSub: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  cdBannerTimer: {
    color: C.text,
    fontSize: 14,
    fontWeight: "600" as const,
    marginBottom: 4,
  },
  cdBannerNote: {
    color: C.textMuted,
    fontSize: 11,
    marginTop: 2,
  },

  // Next Pick Window callout
  nextWindowCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  nextWindowHeadline: {
    color: C.text,
    fontSize: 16,
    fontWeight: "700" as const,
    marginBottom: 6,
  },
  nextWindowSub: {
    color: C.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },

  // Game Day Timeline
  timelineSection: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  timelineSectionLabel: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  timelineRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 8,
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  timelineRowActive: {
    backgroundColor: `${C.tint}10`,
    marginHorizontal: -4,
    paddingHorizontal: 8,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
    flexShrink: 0,
  },
  timelineLabel: {
    flex: 1,
    color: C.textSecondary,
    fontSize: 14,
    fontWeight: "500" as const,
  },
  timelineLabelActive: {
    color: C.text,
    fontWeight: "700" as const,
  },
  timelineStatusBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  timelineStatusText: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.3,
  },

  // Next Game Day CTA
  nextRoomCta: {
    backgroundColor: `${C.tint}12`,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${C.tint}40`,
    padding: 18,
    marginTop: 16,
    alignItems: "center" as const,
  },
  nextRoomTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: C.text,
    textAlign: "center" as const,
    marginBottom: 6,
  },
  nextRoomBody: {
    fontSize: 13,
    color: C.textSecondary,
    textAlign: "center" as const,
    lineHeight: 18,
    marginBottom: 14,
  },
  nextRoomBtn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
    alignItems: "center" as const,
    width: "100%" as unknown as number,
  },
  nextRoomBtnDisabled: {
    opacity: 0.45,
  },
  nextRoomBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700" as const,
  },
  nextRoomHelper: {
    marginTop: 8,
    fontSize: 11,
    color: C.textMuted,
  },
  nextRoomInput: {
    width: "100%" as unknown as number,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: C.text,
    marginBottom: 10,
  },
  nextRoomSuccess: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: C.success,
    textAlign: "center" as const,
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
