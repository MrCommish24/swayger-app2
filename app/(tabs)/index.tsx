import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  SectionList,
  ActivityIndicator,
  ScrollView,
  Modal,
  Animated,
  Share,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useEffect, useState, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { formatDate, getAvatarColor } from "@/lib/helpers";
import { Analytics } from "@/lib/posthog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { getApiUrl } from "@/lib/query-client";
import {
  fetchMySwaygers,
  fetchMyBalance,
  displayStatus,
  categoryIcon,
} from "@/lib/swayger";
import { MARCH_MADNESS_ACTIVE } from "@/lib/march-madness";
import { NBA_PLAYOFFS_ACTIVE } from "@/lib/nba-playoffs";
import { SwaygerData } from "@/types";
import Colors from "@/constants/colors";
import { PushNotificationBanner } from "@/components/PushNotificationBanner";

const MM_ORANGE = "#E8590A";
const NBA_BLUE = "#1D428A";
const NBA_GOLD = "#FFC72C";
const SETTLE_ORANGE = "#F97316";
const SETTLE_RED = "#EF4444";

// ─── Per-page-load session tracking ───────────────────────────────────────────
// Resets when the page reloads/refreshes. Prevents the same modal from
// re-appearing within the same browser session (tab switch etc.)
const shownInSession = new Set<string>();

// 72h window for "newly accepted" challenge alerts
const ACCEPTED_WINDOW_MS = 72 * 60 * 60 * 1000;

// AsyncStorage key for permanently dismissed "accepted" notifications
const SEEN_ACCEPTED_KEY = "swayger:seen_accepted_notifications";

// ─── Results modal ────────────────────────────────────────────────────────────
// Fires once per session (first open after a resolved night, within 48h).
// If it fires, Swayger action modals are deferred to the bell.
let resultsShownThisSession = false;
const RESULTS_MODAL_KEY = (nightId: string) => `results_modal_shown_${nightId}`;

interface ResultsNightProp {
  id: string;
  player_name: string;
  stat_label: string;
  line: number;
  status: string;
  result: "over" | "under" | null;
}
interface ResultsNight {
  id: string;
  date: string;
  props: ResultsNightProp[];
}
interface ResultsPickEntry {
  prop_id: string;
  pick: "over" | "under";
}
interface ResultsPick {
  picks: ResultsPickEntry[];
  score: number;
  correct_count: number;
}

type ModalItem =
  | { kind: "settlement"; swayger: SwaygerData; opponentName: string }
  | { kind: "pending"; swayger: SwaygerData; opponentName: string }
  | { kind: "accepted"; swayger: SwaygerData; opponentName: string };

// ─── SwaygerActionModal ────────────────────────────────────────────────────────
function SwaygerActionModal({
  item,
  total,
  index,
  onDismiss,
  onAction,
}: {
  item: ModalItem;
  total: number;
  index: number;
  onDismiss: () => void;
  onAction: () => void;
}) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: false,
      damping: 22,
      stiffness: 180,
    }).start();
  }, []);

  const dismiss = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 500,
      duration: 220,
      useNativeDriver: false,
    }).start(onDismiss);
  }, [onDismiss]);

  const action = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 500,
      duration: 180,
      useNativeDriver: false,
    }).start(onAction);
  }, [onAction]);

  const isSettlement = item.kind === "settlement";
  const isPending = item.kind === "pending";
  const isPicksChallenge = item.swayger.title?.startsWith("🎯 Picks Challenge");

  const iconEmoji = isSettlement ? "🔥" : isPending ? "🤝" : "⚡";
  const iconBg = isSettlement
    ? "rgba(239,68,68,0.15)"
    : isPending
    ? "rgba(245,158,11,0.13)"
    : "rgba(255,199,44,0.12)";
  const iconBorder = isSettlement
    ? "rgba(239,68,68,0.4)"
    : isPending
    ? "rgba(245,158,11,0.4)"
    : "rgba(255,199,44,0.4)";
  const accentColor = isSettlement ? SETTLE_RED : isPending ? PENDING_AMBER : NBA_GOLD;
  const accentColorSoft = isSettlement ? SETTLE_ORANGE : isPending ? PENDING_AMBER : NBA_GOLD;

  const headline = isSettlement
    ? "Time to settle."
    : isPending
    ? "You've been challenged."
    : "Challenge accepted.";

  const subText = isSettlement
    ? `${item.opponentName} has called the result. Agree or push back — the Swayger's on the line.`
    : isPending
    ? isPicksChallenge
      ? `${item.opponentName} challenged you to a Picks Challenge. Accept to compete head-to-head tonight.`
      : `${item.opponentName} challenged you to a Swayger. Ready to compete?`
    : isPicksChallenge
    ? `${item.opponentName} accepted your Picks Challenge. Your picks compete head-to-head tonight.`
    : `${item.opponentName} is in. Your Swayger is live — it's game time.`;

  const ctaLabel = isSettlement ? "Settle Now" : isPending ? "View Challenge" : "View Swayger";
  const ctaIcon = isSettlement ? "checkmark-done-outline" : isPending ? "enter-outline" : "flash";
  const ctaTextColor = isSettlement || isPending ? "#FFFFFF" : "#000000";
  const dismissLabel = isSettlement ? "Remind me later" : "Dismiss";

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent>
      <Pressable style={modalStyles.backdrop} onPress={dismiss}>
        <Pressable onPress={(e) => e.stopPropagation()}>
        <Animated.View
          style={[
            modalStyles.sheet,
            { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Drag handle */}
          <View style={modalStyles.handle} />

          {/* Counter pill */}
          {total > 1 && (
            <View style={modalStyles.counterRow}>
              <View style={[modalStyles.counterPill, isSettlement && modalStyles.counterPillSettle]}>
                <Text style={modalStyles.counterText}>{index + 1} of {total}</Text>
              </View>
            </View>
          )}

          {/* Icon */}
          <View style={modalStyles.iconWrap}>
            <View style={[modalStyles.iconCircle, { backgroundColor: iconBg, borderColor: iconBorder }]}>
              <Text style={modalStyles.iconEmoji}>{iconEmoji}</Text>
            </View>
          </View>

          <Text style={[modalStyles.headline, { color: accentColor }]}>
            {headline}
          </Text>

          <Text style={modalStyles.sub}>{subText}</Text>

          {/* Swayger title card */}
          <View style={[modalStyles.titleCard, { borderColor: `${accentColor}4D` }]}>
            <Ionicons
              name={isPicksChallenge ? "basketball-outline" : "flash-outline"}
              size={14}
              color={accentColorSoft}
            />
            <Text style={modalStyles.titleCardText} numberOfLines={2}>
              {item.swayger.title}
            </Text>
            <View style={[modalStyles.spPill, { backgroundColor: `${accentColor}1A`, borderColor: `${accentColor}4D` }]}>
              <Text style={[modalStyles.spPillText, { color: accentColorSoft }]}>
                {item.swayger.stake_units} SP
              </Text>
            </View>
          </View>

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [
              modalStyles.ctaBtn,
              { backgroundColor: accentColor },
              pressed && { opacity: 0.88 },
            ]}
            onPress={action}
          >
            <Ionicons name={ctaIcon} size={18} color={ctaTextColor} />
            <Text style={[modalStyles.ctaText, { color: ctaTextColor }]}>
              {ctaLabel}
            </Text>
          </Pressable>

          {/* Dismiss */}
          <Pressable onPress={dismiss} hitSlop={8}>
            <Text style={modalStyles.dismissText}>{dismissLabel}</Text>
          </Pressable>
        </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── ResultsModal ──────────────────────────────────────────────────────────────
function ResultsModal({
  night,
  pick,
  onShare,
  onDismiss,
}: {
  night: ResultsNight;
  pick: ResultsPick;
  onShare: () => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: false,
      damping: 22,
      stiffness: 180,
    }).start();
  }, []);

  const dismiss = useCallback(() => {
    Animated.timing(slideAnim, { toValue: 500, duration: 220, useNativeDriver: false }).start(onDismiss);
  }, [onDismiss]);

  const share = useCallback(() => {
    Animated.timing(slideAnim, { toValue: 500, duration: 180, useNativeDriver: false }).start(onShare);
  }, [onShare]);

  const activePropCount = night.props.filter((p) => p.status !== "voided").length;

  const picksMap = useMemo(() => {
    const m: Record<string, "over" | "under"> = {};
    for (const p of pick.picks) m[p.prop_id] = p.pick;
    return m;
  }, [pick.picks]);

  const pickResults = useMemo(() =>
    night.props
      .filter((p) => p.status !== "voided" && picksMap[p.id])
      .map((p) => ({
        id: p.id,
        label: `${p.player_name} ${(picksMap[p.id] || "").toUpperCase()} ${p.line} ${p.stat_label.toLowerCase()}`,
        correct: p.result ? p.result === picksMap[p.id] : null,
      })),
    [night.props, picksMap]
  );

  const pct = activePropCount > 0 ? Math.round((pick.correct_count / activePropCount) * 100) : 0;
  const headline =
    pick.correct_count === activePropCount
      ? "Perfect night. 🔥"
      : pct >= 80
      ? "Locked in. 💪"
      : pct >= 60
      ? "Solid night."
      : "You played tonight.";

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent>
      <Pressable style={modalStyles.backdrop} onPress={dismiss}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View
            style={[
              modalStyles.sheet,
              { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={modalStyles.handle} />

            <View style={modalStyles.iconWrap}>
              <View style={[modalStyles.iconCircle, { backgroundColor: "rgba(255,199,44,0.12)", borderColor: "rgba(255,199,44,0.4)" }]}>
                <Text style={modalStyles.iconEmoji}>🏀</Text>
              </View>
            </View>

            <Text style={[modalStyles.headline, { color: NBA_GOLD }]}>{headline}</Text>

            <View style={resultsStyles.scorePill}>
              <Text style={resultsStyles.scoreMain}>
                {pick.correct_count}
                <Text style={resultsStyles.scoreDenom}>/{activePropCount}</Text>
              </Text>
              <Text style={resultsStyles.scoreLabel}>correct · {pick.score} pts</Text>
            </View>

            <View style={resultsStyles.pickList}>
              {pickResults.map((r) => (
                <View key={r.id} style={resultsStyles.pickRow}>
                  <Text style={resultsStyles.pickResult}>
                    {r.correct === true ? "✅" : r.correct === false ? "❌" : "–"}
                  </Text>
                  <Text style={resultsStyles.pickLabel} numberOfLines={1}>{r.label}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [
                modalStyles.ctaBtn,
                { backgroundColor: NBA_GOLD },
                pressed && { opacity: 0.88 },
              ]}
              onPress={share}
            >
              <Ionicons name="share-outline" size={18} color="#000000" />
              <Text style={[modalStyles.ctaText, { color: "#000000" }]}>Share Results</Text>
            </Pressable>

            <Pressable onPress={dismiss} hitSlop={8}>
              <Text style={modalStyles.dismissText}>Dismiss</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ChallengeCards({
  onPressPlayoffs,
  onPressPicks,
}: {
  onPressPlayoffs: () => void;
  onPressPicks: () => void;
}) {
  if (!NBA_PLAYOFFS_ACTIVE) return null;
  return (
    <View style={styles.nbaCard}>
      {/* Brand header */}
      <View style={styles.nbaCardHeader}>
        <Text style={styles.nbaCardEmoji}>🏀</Text>
        <View style={styles.nbaCardHeaderText}>
          <Text style={styles.nbaCardTitle}>NBA PLAYOFFS CHALLENGE</Text>
          <Text style={styles.nbaCardSub}>Series picks · Nightly props · Win $100</Text>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.nbaCardDivider} />

      {/* Two tappable modes */}
      <View style={styles.nbaCardModes}>
        <Pressable
          style={({ pressed }) => [styles.nbaMode, pressed && styles.nbaModePressed]}
          onPress={onPressPlayoffs}
        >
          <View style={styles.nbaModeIcon}>
            <Text style={styles.nbaModeEmoji}>🏆</Text>
          </View>
          <Text style={styles.nbaModeLabel}>Bracket</Text>
          <Text style={styles.nbaModeSub}>Pick series winners</Text>
          <View style={styles.nbaModeArrow}>
            <Text style={styles.nbaModeEnter}>Enter</Text>
            <Ionicons name="chevron-forward" size={14} color={NBA_GOLD} />
          </View>
        </Pressable>

        <View style={styles.nbaModeDivider} />

        <Pressable
          style={({ pressed }) => [styles.nbaMode, pressed && styles.nbaModePressed]}
          onPress={onPressPicks}
        >
          <View style={[styles.nbaModeIcon, styles.nbaModeIconPicks]}>
            <Text style={styles.nbaModeEmoji}>🎯</Text>
          </View>
          <Text style={styles.nbaModeLabel}>Picks</Text>
          <Text style={styles.nbaModeSub}>Nightly player props</Text>
          <View style={styles.nbaModeArrow}>
            <Text style={styles.nbaModeEnter}>Enter</Text>
            <Ionicons name="chevron-forward" size={14} color={NBA_GOLD} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const PENDING_AMBER = "#F59E0B";
const GOLD = "#F5A623";

// ─── LiveGameDayRooms ──────────────────────────────────────────────────────────
interface PublicGDRoom {
  id: string;
  room_name: string;
  team_a_name: string;
  team_b_name: string;
  game_date: string | null;
  status: string;
  room_code: string | null;
}

function LiveGameDayRooms() {
  const router = useRouter();

  const { data } = useQuery<{ rooms: PublicGDRoom[] }>({
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
  if (rooms.length === 0) return null;

  return (
    <View style={gdStyles.section}>
      <View style={gdStyles.header}>
        <View style={gdStyles.livePulse} />
        <Text style={gdStyles.headerLabel}>LIVE GAME DAY</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={gdStyles.scroll}
        bounces={false}
      >
        {rooms.map((room) => (
          <Pressable
            key={room.id}
            style={({ pressed }) => [gdStyles.card, pressed && gdStyles.cardPressed]}
            onPress={() => {
              router.push(`/gameday/${room.id}` as never);
            }}
          >
            <Text style={gdStyles.matchup} numberOfLines={1}>
              {room.team_a_name} vs {room.team_b_name}
            </Text>
            {room.game_date && (
              <Text style={gdStyles.date}>{room.game_date}</Text>
            )}
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

const gdStyles = StyleSheet.create({
  section: { marginBottom: 4 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  livePulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 1.2,
    color: Colors.dark.textSecondary,
  },
  scroll: { paddingHorizontal: 16, gap: 10 },
  card: {
    width: 200,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    gap: 4,
  },
  cardPressed: { opacity: 0.8 },
  matchup: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  date: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
  },
  statusText: {
    fontSize: 11,
    color: "#22C55E",
    fontWeight: "600" as const,
    flex: 1,
  },
  enterCta: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: Colors.dark.tint,
  },
});

function StatsStrip({
  swaygers,
  userId,
  spBalance,
}: {
  swaygers: SwaygerData[];
  userId: string;
  spBalance: number | null;
}) {
  const stats = useMemo(() => {
    const total = swaygers.length;
    const active = swaygers.filter(
      (s) => s.status === "active" || s.status === "settlement_proposed"
    ).length;

    const settled = swaygers.filter((s) => s.status === "settled");
    const decided = settled.filter(
      (s) => s.settled_outcome === "creator" || s.settled_outcome === "opponent"
    );
    const wins = decided.filter((s) => {
      const isCreator = s.creator_id === userId;
      const isOpponent = s.opponent_id === userId;
      return (
        (isCreator && s.settled_outcome === "creator") ||
        (isOpponent && s.settled_outcome === "opponent")
      );
    }).length;

    const winPct =
      decided.length > 0
        ? Math.round((wins / decided.length) * 100) + "%"
        : "—";

    return { total, active, winPct };
  }, [swaygers, userId]);

  return (
    <View style={styles.statsStrip}>
      <View style={styles.statTile}>
        <Text style={styles.statValue}>{stats.total}</Text>
        <Text style={styles.statLabel}>Total</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statTile}>
        <Text style={[styles.statValue, stats.active > 0 && styles.statValueActive]}>
          {stats.active}
        </Text>
        <Text style={styles.statLabel}>Active</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statTile}>
        <Text style={styles.statValue}>{stats.winPct}</Text>
        <Text style={styles.statLabel}>Win %</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statTile}>
        <Text style={[styles.statValue, styles.statValueSP]}>
          {spBalance !== null ? spBalance.toLocaleString() : "—"}
        </Text>
        <Text style={styles.statLabel}>Swayger Pts</Text>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [showNotifBanner, setShowNotifBanner] = useState<boolean>(false);

  useFocusEffect(useCallback(() => { Analytics.dashboardViewed(); }, []));

  // Check native Notification.permission — show banner if not yet asked
  useEffect(() => {
    if (!isWeb || !user) return;
    const w = window as any;
    if (typeof w.Notification === "undefined") return; // browser doesn't support notifications
    if (w.Notification.permission === "default") {
      setShowNotifBanner(true);
    }
  }, [isWeb, user?.id]);

  const {
    data: swaygers = [],
    isLoading,
    error,
    refetch,
  } = useQuery<SwaygerData[]>({
    queryKey: ["swaygers", "mine", user?.id],
    queryFn: () => fetchMySwaygers(user!.id),
    enabled: !!user,
  });

  const { data: balanceData } = useQuery({
    queryKey: ["balance", user?.id],
    queryFn: () => fetchMyBalance(user!.id),
    enabled: !!user,
    staleTime: 0,
  });
  const spBalance = balanceData?.balance ?? null;

  // ─── Last resolved night (for results modal) ─────────────────────────────────
  const { data: lastNightData } = useQuery({
    queryKey: ["props", "last-night", user?.id],
    queryFn: async () => {
      const url = new URL("/api/props/last-night", getApiUrl());
      if (user?.id) url.searchParams.set("user_id", user.id);
      const res = await fetch(url.toString());
      return res.json();
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  type FilterKey = "all" | "settling" | "active" | "pending" | "settled" | "other";
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  // ─── Action Modal state ──────────────────────────────────────────────────────
  const [modalQueue, setModalQueue] = useState<ModalItem[]>([]);
  const [modalIndex, setModalIndex] = useState(0);
  const [profileMap, setProfileMap] = useState<Map<string, string>>(new Map());
  const [modalSuppressed, setModalSuppressed] = useState(false);
  // swayger_id → proposed_by: tells the card whether it's "Your Turn" or "Awaiting Them"
  const [settlementProposerMap, setSettlementProposerMap] = useState<Map<string, string>>(new Map());
  // Swayger IDs whose "accepted" notification has been permanently seen (survives restarts)
  const [seenAcceptedIds, setSeenAcceptedIds] = useState<Set<string>>(new Set());
  const [seenAcceptedLoaded, setSeenAcceptedLoaded] = useState(false);
  const modalBuilt = useRef(false);

  // ─── Results modal state ──────────────────────────────────────────────────────
  const [resultsData, setResultsData] = useState<{ night: ResultsNight; pick: ResultsPick } | null>(null);
  const [resultsLoaded, setResultsLoaded] = useState(false);
  const resultsWillShow = useRef(false);

  // Load persisted "accepted" notification IDs once on mount.
  // Sets seenAcceptedLoaded=true when done (even if empty) so the queue
  // build effect knows it's safe to proceed.
  useEffect(() => {
    AsyncStorage.getItem(SEEN_ACCEPTED_KEY).then((raw) => {
      if (raw) {
        try {
          const ids: string[] = JSON.parse(raw);
          setSeenAcceptedIds(new Set(ids));
        } catch {}
      }
      setSeenAcceptedLoaded(true);
    });
  }, []);

  // Persist a single swayger ID as permanently seen for "accepted" notifications
  const markAcceptedSeen = useCallback(async (id: string) => {
    setSeenAcceptedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(SEEN_ACCEPTED_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  // Fetch display names for any user IDs we need in the modal
  const fetchProfileName = useCallback(async (uid: string): Promise<string> => {
    if (profileMap.has(uid)) return profileMap.get(uid)!;
    const { data } = await supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", uid)
      .single();
    const name = data?.display_name || data?.username || "Your opponent";
    setProfileMap((prev) => new Map(prev).set(uid, name));
    return name;
  }, [profileMap]);

  // Check whether the results modal should show this session.
  // Runs once lastNightData arrives (undefined = still loading, null = no data).
  // Sets resultsWillShow.current before setting resultsLoaded so the Swayger
  // queue build effect reads the correct value.
  useEffect(() => {
    if (lastNightData === undefined) return;
    (async () => {
      let should = false;
      if (
        lastNightData?.ok &&
        lastNightData.night &&
        lastNightData.pick &&
        lastNightData.night.status === "resolved"
      ) {
        const nightDate = new Date(lastNightData.night.date + "T12:00:00");
        const diffMs = Date.now() - nightDate.getTime();
        if (diffMs <= 48 * 60 * 60 * 1000) {
          const seen = await AsyncStorage.getItem(RESULTS_MODAL_KEY(lastNightData.night.id));
          if (!seen) {
            should = true;
            setResultsData({ night: lastNightData.night, pick: lastNightData.pick });
          }
        }
      }
      resultsWillShow.current = should;
      setResultsLoaded(true);
    })();
  }, [lastNightData]);

  // Build modal queue once after swaygers load.
  // Waits for seenAcceptedLoaded AND resultsLoaded so we know whether to
  // suppress auto-show (results modal takes priority this session).
  useEffect(() => {
    if (!user?.id || swaygers.length === 0 || modalBuilt.current || !seenAcceptedLoaded || !resultsLoaded) return;
    modalBuilt.current = true;

    (async () => {
      const now = Date.now();
      const items: ModalItem[] = [];

      // Priority 1: settlements where YOUR opponent proposed (you need to confirm).
      // Skip any where YOU are the proposer — you're just waiting, no action needed.
      const settlementSwaygers = swaygers.filter(
        (s) => s.status === "settlement_proposed" && !shownInSession.has(s.id)
      );
      if (settlementSwaygers.length > 0) {
        const { data: proposals } = await supabase
          .from("settlement_proposals")
          .select("swayger_id, proposed_by")
          .in("swayger_id", settlementSwaygers.map((s) => s.id))
          .order("created_at", { ascending: false });
        // Latest proposal per swayger
        const proposerMap = new Map<string, string>();
        for (const p of (proposals || [])) {
          if (!proposerMap.has(p.swayger_id)) proposerMap.set(p.swayger_id, p.proposed_by);
        }
        // Expose to state so cards can show "Your Turn" vs "Awaiting Them"
        setSettlementProposerMap(proposerMap);
        for (const s of settlementSwaygers) {
          if (proposerMap.get(s.id) === user.id) continue; // You proposed — skip
          const otherId = s.creator_id === user.id ? s.opponent_id : s.creator_id;
          const name = otherId ? await fetchProfileName(otherId) : "Your opponent";
          items.push({ kind: "settlement", swayger: s, opponentName: name });
          shownInSession.add(s.id);
        }
      }

      // Priority 2: pending invites waiting for YOU to accept
      const pendingInvites = swaygers.filter(
        (s) => s.status === "pending_invite" && s.creator_id !== user.id && !shownInSession.has(s.id)
      );
      for (const s of pendingInvites) {
        const name = s.creator_id ? await fetchProfileName(s.creator_id) : "Someone";
        items.push({ kind: "pending", swayger: s, opponentName: name });
        shownInSession.add(s.id);
      }

      // Priority 3: newly accepted challenges (within 72h).
      // Skip any the user has already permanently dismissed (persisted in AsyncStorage).
      const accepted = swaygers.filter(
        (s) =>
          s.status === "active" &&
          s.creator_id === user.id &&
          s.opponent_id !== null &&
          s.accepted_at !== null &&
          now - new Date(s.accepted_at).getTime() < ACCEPTED_WINDOW_MS &&
          !shownInSession.has(s.id) &&
          !seenAcceptedIds.has(s.id)
      );
      for (const s of accepted) {
        const name = s.opponent_id ? await fetchProfileName(s.opponent_id) : "Your opponent";
        items.push({ kind: "accepted", swayger: s, opponentName: name });
        shownInSession.add(s.id);
      }

      if (items.length > 0) {
        setModalQueue(items);
        // If the results modal is firing this session, defer Swayger modals
        // to the bell — don't chain them immediately after celebration.
        if (!resultsWillShow.current) {
          setModalIndex(0);
        }
        // else: modalIndex stays at items.length (past end) — bell is the trigger
      }
    })();
  }, [swaygers, user?.id, seenAcceptedLoaded, resultsLoaded]);

  const handleBellPress = useCallback(() => setModalIndex(0), []);

  const handleResultsDismiss = useCallback(async () => {
    if (!resultsData) return;
    await AsyncStorage.setItem(RESULTS_MODAL_KEY(resultsData.night.id), "1");
    resultsShownThisSession = true;
    setResultsData(null);
  }, [resultsData]);

  const handleResultsShare = useCallback(async () => {
    if (!resultsData) return;
    const { night, pick } = resultsData;
    const activePropCount = night.props.filter((p) => p.status !== "voided").length;
    const picksMap: Record<string, "over" | "under"> = {};
    for (const p of pick.picks) picksMap[p.prop_id] = p.pick;
    const dateStr = new Date(night.date + "T12:00:00").toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
    const lines: string[] = [`🏀 ${pick.correct_count}/${activePropCount} on Swayger Picks – ${dateStr}`];
    for (const prop of night.props) {
      if (prop.status === "voided") continue;
      const choice = picksMap[prop.id];
      if (!choice) continue;
      const emoji = choice === "over" ? "📈" : "📉";
      const label = `${prop.player_name} ${choice.toUpperCase()} ${prop.line} ${prop.stat_label.toLowerCase()}`;
      const correct = prop.result ? prop.result === choice : null;
      const result = correct === true ? "✅" : correct === false ? "❌" : "";
      lines.push(`${emoji} ${label} ${result}`);
    }
    lines.push(`\nThink you can beat that? 👉 https://www.swayger.app/picks`);
    const message = lines.join("\n");
    await AsyncStorage.setItem(RESULTS_MODAL_KEY(night.id), "1");
    resultsShownThisSession = true;
    setResultsData(null);
    try {
      await Share.share({ message });
    } catch {
      // user dismissed share sheet
    }
  }, [resultsData]);

  const OTHER_STATUSES = ["canceled", "declined", "expired", "invite_expired", "settlement_expired"];

  const counts = useMemo(() => ({
    all:      swaygers.length,
    settling: swaygers.filter((s) => s.status === "settlement_proposed").length,
    active:   swaygers.filter((s) => s.status === "active").length,
    pending:  swaygers.filter((s) => s.status === "pending_invite").length,
    settled:  swaygers.filter((s) => s.status === "settled").length,
    other:    swaygers.filter((s) => OTHER_STATUSES.includes(s.status)).length,
  }), [swaygers]);

  type SwaygerSection = { key: FilterKey; title: string; data: SwaygerData[] };

  const sections = useMemo((): SwaygerSection[] => {
    const byDate = (a: SwaygerData, b: SwaygerData) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

    const groups: SwaygerSection[] = [
      { key: "settling", title: "SETTLING", data: swaygers.filter((s) => s.status === "settlement_proposed").sort(byDate) },
      { key: "active",   title: "ACTIVE",   data: swaygers.filter((s) => s.status === "active").sort(byDate) },
      { key: "pending",  title: "PENDING",  data: swaygers.filter((s) => s.status === "pending_invite").sort(byDate) },
      { key: "settled",  title: "SETTLED",  data: swaygers.filter((s) => s.status === "settled").sort(byDate) },
      { key: "other",    title: "OTHER",    data: swaygers.filter((s) => OTHER_STATUSES.includes(s.status)).sort(byDate) },
    ];

    const visible = activeFilter === "all"
      ? groups
      : groups.filter((g) => g.key === activeFilter);

    return visible.filter((g) => g.data.length > 0);
  }, [swaygers, activeFilter]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`swayger-list-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swaygers" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["swaygers", "mine", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // ─── Modal handlers ───────────────────────────────────────────────────────────
  const currentModalItem = modalQueue.length > 0 ? modalQueue[modalIndex] : null;

  // "Remind me later" / "Dismiss" — advance the index.
  // For "accepted" notifications, also persist as permanently seen so they
  // never reappear after an app restart.
  const handleModalDismiss = useCallback(() => {
    if (currentModalItem?.kind === "accepted") {
      markAcceptedSeen(currentModalItem.swayger.id);
    }
    setModalIndex((i) => i + 1);
  }, [currentModalItem, markAcceptedSeen]);

  // "Settle Now" / "View Challenge" / "View Swayger"
  // Immediately suppress the modal overlay so the navigation target isn't
  // covered, remove the acted-on item from the queue (bell count drops),
  // and park the index at the end so nothing auto-shows on return.
  // For "accepted" notifications, also permanently mark as seen.
  const handleModalAction = useCallback(() => {
    if (!currentModalItem) return;
    const swayger = currentModalItem.swayger;
    if (currentModalItem.kind === "accepted") {
      markAcceptedSeen(swayger.id);
    }
    setModalSuppressed(true);
    const newQueue = modalQueue.filter((_, idx) => idx !== modalIndex);
    setModalQueue(newQueue);
    setModalIndex(newQueue.length); // park past end — no auto-show on return
    router.push(`/swayger/${swayger.id}`);
  }, [currentModalItem, modalIndex, modalQueue, markAcceptedSeen, router]);

  // Enable web push notifications — must call requestPermission synchronously
  // within the user gesture to satisfy Chrome's security requirement.
  const handleEnableNotifications = useCallback(async () => {
    const w = window as any;
    const userId = user?.id;
    setShowNotifBanner(false);
    try {
      // Step 1: Request browser permission synchronously within the gesture.
      // This is the only call Chrome allows outside a user activation context.
      let result: NotificationPermission = "default";
      if (w.Notification) {
        result = await w.Notification.requestPermission();
        console.log("[notifications] Notification.requestPermission result:", result);
      }

      if (result !== "granted" || !userId) return;

      // Step 2: Store userId so the server-injected OneSignal script can pick
      // it up, then fire swayger:permission — the init script listens for this
      // event and calls login() + optIn() to complete the subscription.
      try { localStorage.setItem("swayger_uid", userId); } catch (_) {}
      try {
        window.dispatchEvent(
          new CustomEvent("swayger:permission", { detail: { userId } })
        );
      } catch (_) {}
    } catch (e) {
      console.error("[notifications] handleEnableNotifications error:", e);
    }
  }, [user?.id]);

  // Re-enable the modal overlay when the user returns to this screen.
  // Does NOT auto-show anything — the bell is the only replay trigger.
  useFocusEffect(
    useCallback(() => {
      setModalSuppressed(false);
    }, [])
  );

  function renderSwaygerCard({ item }: { item: SwaygerData }) {
    const isSettling = item.status === "settlement_proposed";
    const iProposed = isSettling && settlementProposerMap.get(item.id) === user?.id;
    const st = displayStatus(item.status || "pending_invite");
    const isCreator = item.creator_id === user?.id;

    // Settling sub-state chip values
    const settlingColor = iProposed ? Colors.dark.textSecondary : SETTLE_ORANGE;
    const settlingLabel = iProposed ? "Awaiting Them" : "Your Turn";

    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => router.push(`/swayger/${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleGroup}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {item.rematch_type && (
              <View style={styles.rematchPill}>
                <Ionicons name="refresh" size={10} color={Colors.dark.tint} />
                <Text style={styles.rematchPillText}>
                  {item.rematch_type === "double_or_nothing" ? "Double or Nothing" : "Rematch"}
                </Text>
              </View>
            )}
          </View>
          <View style={[styles.roleBadge, isCreator && styles.roleBadgeCreator]}>
            <Text style={[styles.roleBadgeText, isCreator && styles.roleBadgeTextCreator]}>
              {isCreator ? "Creator" : "Opponent"}
            </Text>
          </View>
        </View>
        <View style={styles.cardDetails}>
          <View style={styles.detailRow}>
            <Ionicons
              name={categoryIcon(item.category) as keyof typeof Ionicons.glyphMap}
              size={14}
              color={Colors.dark.textSecondary}
            />
            <Text style={styles.detailText}>{item.category || "Other"}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="flame-outline" size={14} color={Colors.dark.accentGold} />
            <Text style={styles.detailText}>{item.stake_units || 1} SP</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="radio-button-on" size={10} color={isSettling ? settlingColor : st.color} />
            <Text style={[styles.detailText, { color: isSettling ? settlingColor : st.color }]}>
              {isSettling ? settlingLabel : st.label}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={14} color={Colors.dark.textSecondary} />
            <Text style={styles.detailText}>{formatDate(item.created_at)}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top + 20 }]}>

      {/* ─── Results Modal (celebration first) ───────────────────────────── */}
      {resultsData && (
        <ResultsModal
          night={resultsData.night}
          pick={resultsData.pick}
          onShare={handleResultsShare}
          onDismiss={handleResultsDismiss}
        />
      )}

      {/* ─── Action Modal ─────────────────────────────────────────────────── */}
      {!modalSuppressed && !resultsData && currentModalItem && (
        <SwaygerActionModal
          key={`modal-${modalIndex}-${currentModalItem.swayger.id}`}
          item={currentModalItem}
          total={modalQueue.length}
          index={modalIndex}
          onDismiss={handleModalDismiss}
          onAction={handleModalAction}
        />
      )}

      <View style={styles.header}>
        <Text style={styles.title}>My Swaygers</Text>
        <View style={styles.headerRight}>
          {user && modalQueue.length > 0 && (
            <Pressable onPress={handleBellPress} style={styles.bellButton} hitSlop={8}>
              <Ionicons name="notifications" size={22} color={PENDING_AMBER} />
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{modalQueue.length}</Text>
              </View>
            </Pressable>
          )}
          {user && (
            <Pressable
              style={styles.avatarPill}
              onPress={() => router.push("/(tabs)/profile")}
            >
              <View style={[styles.avatarCircle, { backgroundColor: getAvatarColor(profile?.username || user.email || "?") }]}>
                <Text style={styles.avatarInitial}>
                  {(profile?.display_name || profile?.username || user.email || "?").charAt(0).toUpperCase()}
                </Text>
              </View>
              {profile?.username ? (
                <Text style={styles.avatarUsername} numberOfLines={1}>
                  @{profile.username}
                </Text>
              ) : (
                <Text style={[styles.avatarUsername, { opacity: 0.5 }]} numberOfLines={1}>
                  {user.email?.split("@")[0] ?? "…"}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </View>

      {!isLoading && !error && user && (
        <StatsStrip swaygers={swaygers} userId={user.id} spBalance={spBalance} />
      )}


      {/* ─── Notification permission banner (web only) ────────────────────── */}
      {isWeb && showNotifBanner && (
        <Pressable style={styles.notifBanner} onPress={handleEnableNotifications}>
          <View style={styles.notifBannerIcon}>
            <Ionicons name="notifications" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.notifBannerBody}>
            <Text style={styles.notifBannerTitle}>Don't miss a challenge</Text>
            <Text style={styles.notifBannerSub}>Tap to enable push notifications</Text>
          </View>
          <View style={styles.notifBannerCta}>
            <Text style={styles.notifBannerCtaText}>Enable</Text>
          </View>
        </Pressable>
      )}

      <LiveGameDayRooms />

      <ChallengeCards
        onPressPlayoffs={() => router.push("/playoffs")}
        onPressPicks={() => router.push("/picks")}
      />

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
          onPress={() => router.push("/(tabs)/create")}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.actionButtonText}>Create</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionButtonOutline, pressed && styles.actionButtonPressed]}
          onPress={() => router.push("/join")}
        >
          <Ionicons name="enter-outline" size={18} color={Colors.dark.tint} />
          <Text style={styles.actionButtonOutlineText}>Join</Text>
        </Pressable>
      </View>

      {!isLoading && !error && swaygers.length > 0 && (
        <View style={styles.filterBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            bounces={false}
          >
            {(["all", "settling", "active", "pending", "settled", "other"] as FilterKey[]).map((key) => {
              const isActive = activeFilter === key;
              const label = key === "all" ? "All" : key.charAt(0).toUpperCase() + key.slice(1);
              const count = counts[key];
              return (
                <Pressable
                  key={key}
                  style={[styles.filterChip, isActive && styles.filterChipActive]}
                  onPress={() => setActiveFilter(key)}
                >
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                    {label}
                    <Text style={[styles.filterChipCount, isActive && styles.filterChipCountActive]}>
                      {" "}{count}
                    </Text>
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.accentGold} />
          <Text style={styles.emptyText}>Could not load swaygers.</Text>
          <Pressable style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : swaygers.length === 0 ? (
        <ScrollView
          style={styles.emptyStateScroll}
          contentContainerStyle={[
            styles.emptyStateContainer,
            { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.emptyStateLabel}>HOW IT WORKS</Text>

          {/* Step 1 — Active */}
          <View style={styles.sampleCard}>
            <View style={styles.sampleCardHeader}>
              <Text style={styles.sampleCardTitle}>Celtics win Game 7</Text>
              <View style={styles.sampleActivePill}>
                <Ionicons name="radio-button-on" size={9} color="#22C55E" />
                <Text style={styles.sampleActivePillText}>Active</Text>
              </View>
            </View>

            <View style={styles.samplePicksRow}>
              <View style={styles.samplePickCard}>
                <Text style={styles.samplePickName}>Darius</Text>
                <Text style={styles.samplePickValue}>Celtics 🍀</Text>
              </View>
              <View style={styles.sampleVsDivider}>
                <Text style={styles.sampleVsText}>VS</Text>
              </View>
              <View style={[styles.samplePickCard, styles.samplePickCardRight]}>
                <Text style={styles.samplePickName}>Mike</Text>
                <Text style={styles.samplePickValue}>Mavericks 🤠</Text>
              </View>
            </View>

            <View style={styles.sampleFooter}>
              <Ionicons name="flame-outline" size={13} color={Colors.dark.accentGold} />
              <Text style={styles.sampleFooterText}>5 Swayger Points at stake</Text>
            </View>
          </View>

          {/* Connector */}
          <View style={styles.sampleConnector}>
            <View style={styles.sampleConnectorLine} />
            <View style={styles.sampleConnectorBadge}>
              <Ionicons name="checkmark-done" size={12} color={Colors.dark.tint} />
              <Text style={styles.sampleConnectorText}>Both agreed</Text>
            </View>
            <View style={styles.sampleConnectorLine} />
          </View>

          {/* Step 2 — Settled */}
          <View style={[styles.sampleCard, styles.sampleCardSettled]}>
            <View style={styles.sampleCardHeader}>
              <Text style={styles.sampleCardTitle}>Celtics win Game 7</Text>
              <View style={styles.sampleSettledPill}>
                <Ionicons name="trophy" size={9} color={Colors.dark.accentGold} />
                <Text style={styles.sampleSettledPillText}>Settled</Text>
              </View>
            </View>

            <View style={styles.sampleResultRow}>
              <Ionicons name="trophy" size={20} color={Colors.dark.accentGold} />
              <Text style={styles.sampleResultText}>Darius wins · +5 SP</Text>
            </View>

            <View style={styles.sampleFooter}>
              <Ionicons name="person-outline" size={13} color={Colors.dark.tabIconDefault} />
              <Text style={styles.sampleFooterText}>Mike owes Darius 5 Swayger Points</Text>
            </View>
          </View>

          <Text style={styles.emptySubtext}>Pick a side. Challenge a friend. Settle it.</Text>

          <Pressable
            style={({ pressed }) => [styles.emptyCreateButton, pressed && styles.actionButtonPressed]}
            onPress={() => router.push("/(tabs)/create")}
          >
            <Ionicons name="flash" size={16} color="#FFFFFF" />
            <Text style={styles.emptyCreateButtonText}>Create Your First Swayger</Text>
          </Pressable>
        </ScrollView>
      ) : sections.length === 0 && swaygers.length > 0 ? (
        <View style={styles.centered}>
          <Ionicons name="filter-outline" size={40} color={Colors.dark.textSecondary} />
          <Text style={styles.emptyText}>No {activeFilter === "all" ? "" : activeFilter + " "}swaygers yet.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderSwaygerCard}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
              <Text style={styles.sectionHeaderCount}>{section.data.length}</Text>
            </View>
          )}
          ListHeaderComponent={() => (
            <View style={{ marginHorizontal: 16, marginTop: 8 }}>
              <PushNotificationBanner />
            </View>
          )}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  notifBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: Colors.dark.tint,
    borderRadius: 14,
  },
  notifBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  notifBannerBody: {
    flex: 1,
    gap: 2,
  },
  notifBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  notifBannerSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
  },
  notifBannerCta: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
  },
  notifBannerCtaText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.tint,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row" as const,
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontFamily: "BarlowCondensed_800ExtraBold", fontSize: 32, color: Colors.dark.text, textTransform: "uppercase" as const, letterSpacing: 1 },
  headerRight: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 12,
  },
  bellButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadge: {
    position: "absolute" as const,
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    lineHeight: 12,
  },
  avatarPill: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.surface,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  avatarUsername: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: Colors.dark.text,
    maxWidth: 100,
  },

  statsStrip: {
    flexDirection: "row" as const,
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingVertical: 14,
  },
  statTile: {
    flex: 1,
    alignItems: "center" as const,
    gap: 3,
  },
  statValue: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 24,
    color: Colors.dark.text,
  },
  statValueActive: {
    color: "#22C55E",
  },
  statValueSP: {
    color: Colors.dark.accentGold,
    fontSize: 18,
  },
  statLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 11,
    color: Colors.dark.tabIconDefault,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: 4,
  },

  mmBanner: {
    flexDirection: "row" as const,
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 24,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(232,89,10,0.10)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(232,89,10,0.35)",
  },
  mmReferralBanner: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 12,
    marginHorizontal: 24,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "rgba(255,140,0,0.13)",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255,140,0,0.45)",
  },
  mmReferralBannerActive: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 12,
    marginHorizontal: 24,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "rgba(255,140,0,0.20)",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255,140,0,0.60)",
  },
  mmReferralBannerText: { flex: 1, gap: 2 },
  mmReferralBannerTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#FF8C00",
  },
  mmReferralBannerSub: {
    fontSize: 12,
    color: "#D4884A",
    lineHeight: 17,
  },
  mmBannerLeft: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  mmBannerEmoji: {
    fontSize: 24,
  },
  mmBannerText: {
    gap: 1,
    flex: 1,
  },
  mmBannerTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  mmBannerSub: {
    fontSize: 12,
    color: "rgba(232,89,10,0.85)",
    fontWeight: "500" as const,
  },
  mmBannerArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(232,89,10,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  nbaCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(29,66,138,0.60)",
    backgroundColor: "rgba(29,66,138,0.14)",
    overflow: "hidden" as const,
  },
  nbaCardHeader: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  nbaCardEmoji: { fontSize: 22 },
  nbaCardHeaderText: { flex: 1, gap: 2 },
  nbaCardTitle: {
    fontSize: 13,
    fontWeight: "800" as const,
    color: NBA_GOLD,
    letterSpacing: 0.8,
  },
  nbaCardSub: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontWeight: "500" as const,
  },
  nbaCardDivider: {
    height: 1,
    backgroundColor: "rgba(29,66,138,0.45)",
    marginHorizontal: 0,
  },
  nbaCardModes: {
    flexDirection: "row" as const,
  },
  nbaMode: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 3,
  },
  nbaModePressed: {
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  nbaModeIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(29,66,138,0.35)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 6,
  },
  nbaModeIconPicks: {
    backgroundColor: "rgba(255,199,44,0.15)",
  },
  nbaModeEmoji: { fontSize: 17 },
  nbaModeLabel: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  nbaModeSub: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  nbaModeArrow: {
    position: "absolute" as const,
    bottom: 14,
    right: 14,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
  },
  nbaModeEnter: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: NBA_GOLD,
  },
  nbaModeDivider: {
    width: 1,
    backgroundColor: "rgba(29,66,138,0.45)",
    marginVertical: 12,
  },

  playoffsBannerTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  playoffsBannerSub: {
    fontSize: 12,
    color: "#FFC72C",
    fontWeight: "500" as const,
    marginTop: 1,
  },

  actions: { flexDirection: "row", gap: 12, paddingHorizontal: 24, marginBottom: 12 },
  filterBar: { marginBottom: 10, height: 42 },
  filterRow: { paddingLeft: 16, paddingRight: 20, gap: 8, alignItems: "center", height: 42 },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  filterChipText: { fontFamily: "DMSans_500Medium", fontSize: 13, color: Colors.dark.textSecondary },
  filterChipTextActive: { color: "#FFFFFF" },
  filterChipCount: { fontSize: 11, fontWeight: "500" as const, color: Colors.dark.textSecondary, opacity: 0.7 },
  filterChipCountActive: { color: "rgba(255,255,255,0.75)" },
  actionButton: {
    flex: 1, backgroundColor: Colors.dark.accent, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10,
  },
  actionButtonOutline: {
    flex: 1, backgroundColor: "transparent", flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.dark.tint,
  },
  actionButtonPressed: { opacity: 0.8 },
  actionButtonText: { fontFamily: "BarlowCondensed_700Bold", color: "#FFFFFF", fontSize: 16, letterSpacing: 1, textTransform: "uppercase" as const },
  actionButtonOutlineText: { fontFamily: "BarlowCondensed_700Bold", color: Colors.dark.tint, fontSize: 16, letterSpacing: 1, textTransform: "uppercase" as const },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyText: { fontSize: 16, color: Colors.dark.textSecondary, textAlign: "center" },
  emptySubtext: { fontSize: 14, color: Colors.dark.tabIconDefault, textAlign: "center" },

  emptyStateScroll: {
    flex: 1,
  },
  emptyStateContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 16,
  },
  emptyStateLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: Colors.dark.tint,
    letterSpacing: 1.5,
  },
  sampleCard: {
    width: "100%",
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 18,
    gap: 14,
  },
  sampleCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sampleCardTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Colors.dark.text,
    flex: 1,
    marginRight: 10,
  },
  sampleActivePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sampleActivePillText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: "#22C55E",
  },
  samplePicksRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  samplePickCard: {
    flex: 1,
    backgroundColor: "rgba(67, 97, 238, 0.07)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(67, 97, 238, 0.2)",
    padding: 12,
    gap: 4,
    alignItems: "center",
  },
  samplePickCardRight: {
    backgroundColor: "rgba(245, 166, 35, 0.07)",
    borderColor: "rgba(245, 166, 35, 0.2)",
  },
  samplePickName: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.dark.tabIconDefault,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  samplePickValue: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  sampleVsDivider: {
    alignItems: "center",
    justifyContent: "center",
  },
  sampleVsText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: Colors.dark.tabIconDefault,
    letterSpacing: 1,
  },
  sampleFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 2,
  },
  sampleFooterText: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    flex: 1,
  },
  sampleConnector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  sampleConnectorLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dark.border,
  },
  sampleConnectorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(67, 97, 238, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(67, 97, 238, 0.2)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sampleConnectorText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: Colors.dark.tint,
  },
  sampleCardSettled: {
    borderColor: "rgba(245, 166, 35, 0.25)",
    backgroundColor: "rgba(245, 166, 35, 0.04)",
  },
  sampleSettledPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sampleSettledPillText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: Colors.dark.accentGold,
  },
  sampleResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  sampleResultText: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Colors.dark.accentGold,
  },
  emptyCreateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.accent,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: 4,
  },
  emptyCreateButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600" as const,
  },
  retryButton: { paddingVertical: 8, paddingHorizontal: 20 },
  retryText: { color: Colors.dark.tint, fontSize: 14, fontWeight: "600" as const },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  sectionHeader: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 8,
    paddingTop: 20,
    paddingBottom: 8,
    paddingHorizontal: 2,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontFamily: "DMSans_500Medium",
    letterSpacing: 1.2,
    color: Colors.dark.textSecondary,
  },
  sectionHeaderCount: {
    fontSize: 11,
    fontFamily: "DMSans_500Medium",
    color: Colors.dark.textSecondary,
    opacity: 0.6,
  },
  card: {
    backgroundColor: Colors.dark.surface, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.dark.border,
    marginBottom: 12,
  },
  cardPressed: { opacity: 0.8 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  cardTitleGroup: { flex: 1, marginRight: 8, gap: 3 },
  cardTitle: { fontSize: 17, fontWeight: "600" as const, color: Colors.dark.text },
  rematchPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    alignSelf: "flex-start",
  },
  rematchPillText: { fontSize: 11, color: Colors.dark.tint, fontWeight: "600" as const },
  roleBadge: { backgroundColor: Colors.dark.surfaceLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  roleBadgeCreator: { backgroundColor: "rgba(245, 166, 35, 0.15)" },
  roleBadgeText: { fontSize: 12, color: Colors.dark.tint, fontWeight: "600" as const },
  roleBadgeTextCreator: { color: Colors.dark.accentGold },
  cardDetails: { flexDirection: "row", gap: 12, flexWrap: "wrap", rowGap: 4 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  detailText: { fontSize: 13, color: Colors.dark.textSecondary },
});

// ─── Modal styles ──────────────────────────────────────────────────────────────
const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#111827",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderBottomWidth: 0,
    alignItems: "center",
    gap: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginBottom: 4,
  },
  counterRow: {
    alignItems: "center",
  },
  counterPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "rgba(255,199,44,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,199,44,0.3)",
  },
  counterPillSettle: {
    backgroundColor: "rgba(239,68,68,0.1)",
    borderColor: "rgba(239,68,68,0.3)",
  },
  counterText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    letterSpacing: 0.5,
  },
  iconWrap: {
    alignItems: "center",
    marginTop: 4,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  iconEmoji: {
    fontSize: 34,
  },
  headline: {
    fontSize: 28,
    fontWeight: "900",
    color: NBA_GOLD,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 4,
  },
  titleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,199,44,0.2)",
    borderRadius: 14,
    padding: 12,
    width: "100%",
  },
  titleCardText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    lineHeight: 20,
  },
  spPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "rgba(255,199,44,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,199,44,0.3)",
  },
  spPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: NBA_GOLD,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 4,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "900",
    color: "#000000",
    letterSpacing: 0.2,
  },
  dismissText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    paddingVertical: 4,
    marginBottom: 4,
  },
});

const resultsStyles = StyleSheet.create({
  scorePill: {
    alignItems: "center",
    marginVertical: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: "rgba(255,199,44,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,199,44,0.22)",
    width: "100%",
  },
  scoreMain: {
    fontSize: 46,
    fontWeight: "800",
    color: NBA_GOLD,
    letterSpacing: -1,
    lineHeight: 52,
  },
  scoreDenom: {
    fontSize: 28,
    fontWeight: "500",
    color: "rgba(255,199,44,0.55)",
  },
  scoreLabel: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  pickList: {
    width: "100%",
    marginBottom: 16,
    gap: 8,
  },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pickResult: {
    fontSize: 15,
    width: 24,
    textAlign: "center",
  },
  pickLabel: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
});
