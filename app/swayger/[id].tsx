import { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Share,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import QRCode from "react-native-qrcode-svg";
import ReceiptCard from "@/components/ReceiptCard";
import StreakCelebrationModal from "@/components/StreakCelebrationModal";
import FightCardModal, { FightCardType } from "@/components/FightCardModal";
import {
  fetchSwayger,
  fetchSwaygerInvite,
  fetchParticipantProfiles,
  fetchHeadToHead,
  fetchSettlementProposals,
  acceptSwayger,
  declineSwayger,
  cancelSwayger,
  proposeSettlement,
  confirmSettlement,
  withdrawProposal,
  createRematch,
  displayStatus,
  displayOutcome,
  displayOutcomeForViewer,
  categoryIcon,
} from "@/lib/swayger";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { showError, showMessage, formatDate, formatDateTime } from "@/lib/helpers";
import { sendPushNotification } from "@/lib/notifications";
import {
  SwaygerData,
  SwaygerInvite,
  SettlementProposal,
} from "@/types";
import Colors from "@/constants/colors";

function StatusChip({ status }: { status: string }) {
  const s = displayStatus(status);
  return (
    <View style={[styles.metaChip, { backgroundColor: `${s.color}15` }]}>
      <Ionicons name="radio-button-on" size={10} color={s.color} />
      <Text style={[styles.metaText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

function buildInviteLink(inviteCode: string): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/join?code=${inviteCode}`;
  }
  return Linking.createURL(`/invite/${inviteCode}`);
}

function buildSwaygerLink(swaygerIdParam: string, baseUrl: string): string {
  return `${baseUrl}/swayger/${swaygerIdParam}`;
}

async function fetchAppBaseUrl(): Promise<string> {
  if (process.env.EXPO_PUBLIC_APP_URL) {
    return process.env.EXPO_PUBLIC_APP_URL;
  }
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }
  try {
    const { getApiUrl } = await import("@/lib/query-client");
    const res = await fetch(`${getApiUrl()}api/config`);
    const data = await res.json();
    if (data.appUrl) return data.appUrl;
  } catch {
  }
  const domain = (process.env.EXPO_PUBLIC_DOMAIN || "").replace(/:\d+$/, "");
  return domain ? `https://${domain}` : "";
}

function buildShareMessage(
  swaygerData: SwaygerData,
  challengerName: string,
  link: string
): string {
  const stake = swaygerData.stake_units;
  const stakeStr = `${stake} unit${stake !== 1 ? "s" : ""}`;
  const title = swaygerData.title;
  const category = swaygerData.category;

  if (swaygerData.rematch_type === "double_or_nothing") {
    return `${challengerName} isn't satisfied — they're coming for double. 🔥\n\nDouble or Nothing on "${title}"\n${category} · ${stakeStr} on the line\n\nYou accepting? ${link}`;
  }
  if (swaygerData.rematch_type === "run_it_back") {
    return `${challengerName} wants to run it back. 🔄\n\nRematch: "${title}"\n${category} · ${stakeStr}\n\nYou in? ${link}`;
  }
  return `${challengerName} just challenged you. ⚡\n\n"${title}"\n${category} · ${stakeStr}\n\nAccept the challenge: ${link}`;
}

function InviteSection({ inviteCode, swaygerName }: { inviteCode: string; swaygerName: string }) {
  const [linkCopied, setLinkCopied] = useState(false);
  const [inviteLink, setInviteLink] = useState(buildInviteLink(inviteCode));

  useEffect(() => {
    fetchAppBaseUrl().then((baseUrl) => {
      if (baseUrl) setInviteLink(`${baseUrl}/join?code=${inviteCode}`);
    });
  }, [inviteCode]);

  async function handleCopyLink() {
    await Clipboard.setStringAsync(inviteLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function handleShare() {
    const message = `Join my Swayger "${swaygerName}"!\n\nTap to join: ${inviteLink}\n\nOr enter code manually: ${inviteCode}`;
    try {
      await Share.share({ message, url: inviteLink });
    } catch {
      await Clipboard.setStringAsync(inviteLink);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Invite Opponent</Text>
      <View style={styles.inviteCard}>
        <Text style={styles.inviteCode}>{inviteCode}</Text>

        <View style={styles.qrContainer}>
          <View style={styles.qrWrapper}>
            <QRCode
              value={inviteLink}
              size={160}
              backgroundColor="#FFFFFF"
              color="#0B1120"
            />
          </View>
          <Text style={styles.qrHint}>Scan to open directly in Swayger</Text>
        </View>

        <View style={styles.inviteButtons}>
          <Pressable
            style={({ pressed }) => [styles.inviteActionBtn, pressed && styles.btnPressed]}
            onPress={handleCopyLink}
          >
            <Ionicons
              name={linkCopied ? "checkmark" : "link-outline"}
              size={18}
              color={linkCopied ? "#22C55E" : Colors.dark.tint}
            />
            <Text style={[styles.inviteActionText, linkCopied && { color: "#22C55E" }]}>
              {linkCopied ? "Copied!" : "Copy Link"}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.inviteActionBtn, styles.inviteShareBtn, pressed && styles.btnPressed]}
            onPress={handleShare}
          >
            <Ionicons name="share-outline" size={18} color="#FFFFFF" />
            <Text style={styles.inviteShareText}>Share Invite</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function PickCard({
  label,
  pick,
  isYou,
  waiting,
}: {
  label: string;
  pick: string | null;
  isYou: boolean;
  waiting?: boolean;
}) {
  return (
    <View style={[styles.pickCard, isYou && styles.pickCardYou]}>
      <View style={styles.pickHeader}>
        <Text style={styles.pickLabel}>{label}</Text>
        {isYou && (
          <View style={styles.youBadge}>
            <Text style={styles.youBadgeText}>You</Text>
          </View>
        )}
      </View>
      <Text style={[styles.pickText, waiting && styles.pickTextWaiting]}>
        {waiting ? "Waiting for pick..." : pick || "—"}
      </Text>
    </View>
  );
}

function ParticipantRow({
  profile,
  roleLabel,
  isCreatorRole,
}: {
  profile: { username: string; display_name: string | null; avatar_url: string | null } | null;
  roleLabel: string;
  isCreatorRole: boolean;
}) {
  const displayName = profile?.display_name || profile?.username || "Unknown";
  return (
    <View style={styles.memberRow}>
      <View style={styles.memberAvatar}>
        <Text style={styles.memberInitial}>
          {displayName.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{displayName}</Text>
        {profile?.username && (
          <Text style={styles.memberUsername}>@{profile.username}</Text>
        )}
      </View>
      <View style={[styles.memberRoleBadge, isCreatorRole && styles.memberRoleBadgeCreator]}>
        <Text style={[styles.memberRoleText, isCreatorRole && styles.memberRoleTextCreator]}>
          {roleLabel}
        </Text>
      </View>
    </View>
  );
}

function SettlementSection({
  swayger,
  proposals,
  isCreator,
  userId,
  onPropose,
  onConfirm,
  onWithdraw,
  proposing,
  confirming,
  withdrawing,
}: {
  swayger: SwaygerData;
  proposals: SettlementProposal[];
  isCreator: boolean;
  userId: string;
  onPropose: (outcome: string) => void;
  onConfirm: (proposalId: string) => void;
  onWithdraw: (proposalId: string) => void;
  proposing: boolean;
  confirming: boolean;
  withdrawing: boolean;
}) {
  const isOpponent = !isCreator && userId === swayger.opponent_id;
  const outcomes = [
    { value: "creator", label: isCreator ? "You Win" : "Creator Wins", icon: "trophy" as const },
    { value: "opponent", label: isOpponent ? "You Win" : "Opponent Wins", icon: "trophy-outline" as const },
    { value: "draw", label: "Draw", icon: "swap-horizontal" as const },
    { value: "no_contest", label: "No Contest", icon: "close-circle-outline" as const },
  ];

  const latestProposal = proposals.length > 0 ? proposals[0] : null;
  const iProposed = latestProposal?.proposed_by === userId;
  const needsMyConfirmation =
    latestProposal &&
    !iProposed &&
    ((isCreator && !latestProposal.creator_confirmed) ||
      (!isCreator && !latestProposal.opponent_confirmed));

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Settlement</Text>

      {latestProposal && (
        <View style={styles.proposalCard}>
          <View style={styles.proposalHeader}>
            <Ionicons name="document-text-outline" size={16} color={Colors.dark.tint} />
            <Text style={styles.proposalTitle}>
              {iProposed ? "You proposed" : "Opponent proposed"}
            </Text>
          </View>
          <Text style={styles.proposalOutcome}>
            {displayOutcomeForViewer(latestProposal.outcome, isCreator, isOpponent)}
          </Text>
          <View style={styles.confirmationRow}>
            <View style={styles.confirmChip}>
              <Ionicons
                name={latestProposal.creator_confirmed ? "checkmark-circle" : "ellipse-outline"}
                size={14}
                color={latestProposal.creator_confirmed ? "#22C55E" : Colors.dark.tabIconDefault}
              />
              <Text style={styles.confirmText}>Creator</Text>
            </View>
            <View style={styles.confirmChip}>
              <Ionicons
                name={latestProposal.opponent_confirmed ? "checkmark-circle" : "ellipse-outline"}
                size={14}
                color={latestProposal.opponent_confirmed ? "#22C55E" : Colors.dark.tabIconDefault}
              />
              <Text style={styles.confirmText}>Opponent</Text>
            </View>
          </View>

          {needsMyConfirmation && (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.confirmButton,
                  pressed && styles.btnPressed,
                  (confirming || withdrawing) && styles.btnDisabled,
                ]}
                onPress={() => onConfirm(latestProposal.id)}
                disabled={confirming || withdrawing}
              >
                {confirming ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                    <Text style={styles.confirmButtonText}>Confirm Settlement</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.counterButton,
                  pressed && styles.btnPressed,
                  (confirming || withdrawing) && styles.btnDisabled,
                ]}
                onPress={() => onWithdraw(latestProposal.id)}
                disabled={confirming || withdrawing}
              >
                {withdrawing ? (
                  <ActivityIndicator color={Colors.dark.tint} size="small" />
                ) : (
                  <>
                    <Ionicons name="swap-horizontal" size={18} color={Colors.dark.tint} />
                    <Text style={styles.counterButtonText}>Counter-propose</Text>
                  </>
                )}
              </Pressable>
            </>
          )}

          {iProposed && (
            <View style={styles.waitingRow}>
              <Ionicons name="time-outline" size={15} color={Colors.dark.tabIconDefault} />
              <Text style={styles.waitingText}>Waiting for opponent…</Text>
              <Pressable
                style={({ pressed }) => [styles.withdrawLink, pressed && { opacity: 0.5 }, withdrawing && styles.btnDisabled]}
                onPress={() => onWithdraw(latestProposal.id)}
                disabled={withdrawing}
              >
                {withdrawing
                  ? <ActivityIndicator size="small" color={Colors.dark.tint} />
                  : <Text style={styles.withdrawLinkText}>Withdraw</Text>
                }
              </Pressable>
            </View>
          )}
        </View>
      )}

      {!latestProposal && (
        <View style={styles.outcomeGrid}>
          {outcomes.map((o) => (
            <Pressable
              key={o.value}
              style={({ pressed }) => [
                styles.outcomeButton,
                pressed && styles.btnPressed,
                proposing && styles.btnDisabled,
              ]}
              onPress={() => onPropose(o.value)}
              disabled={proposing}
            >
              <Ionicons name={o.icon} size={20} color={Colors.dark.tint} />
              <Text style={styles.outcomeLabel}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// Tracks which swayger IDs have shown the fight card this session (survives navigation)
const shownFightCardIds = new Set<string>();

export default function SwaygerDetailScreen() {
  const { id, justAccepted } = useLocalSearchParams<{ id: string; justAccepted?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const [opponentPick, setOpponentPick] = useState("");
  const [countering, setCountering] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showStreakCelebration, setShowStreakCelebration] = useState(false);
  const [celebrationStreak, setCelebrationStreak] = useState(0);
  const [showFightCard, setShowFightCard] = useState(false);
  const [fightCardType, setFightCardType] = useState<FightCardType>("game_on");
  const [rematchSheetType, setRematchSheetType] = useState<"run_it_back" | "double_or_nothing" | null>(null);
  const [linkShared, setLinkShared] = useState(false);
  const [pokeSent, setPokeSent] = useState(false);
  const pendingStreakRef = useRef(0);

  async function pokeSwayger() {
    if (!swayger || !id) return;
    const baseUrl = await fetchAppBaseUrl();
    const link = buildSwaygerLink(id, baseUrl);
    const title = swayger.title;
    const message = status === "settlement_proposed"
      ? `Let's settle our Swayger — "${title}" 🏆\nOpen the app to agree on the outcome: ${link}`
      : `Time to settle our Swayger — "${title}" ⚡\nAre you ready to call it? ${link}`;
    try {
      if (Platform.OS === "web" && typeof window !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ title: "Swayger — time to settle up", text: message });
      } else if (Platform.OS === "web") {
        await (navigator as any).clipboard?.writeText(message).catch(() => {});
        setPokeSent(true);
        setTimeout(() => setPokeSent(false), 2500);
      } else {
        await Share.share({ message });
      }
    } catch {
      await (Platform.OS === "web"
        ? (navigator as any).clipboard?.writeText(message).catch(() => {})
        : Clipboard.setStringAsync(message));
      setPokeSent(true);
      setTimeout(() => setPokeSent(false), 2500);
    }
  }

  async function handleShareSwayger() {
    if (!swayger || !id) return;
    const baseUrl = await fetchAppBaseUrl();
    const link = buildSwaygerLink(id, baseUrl);
    const myName = profile?.display_name || profile?.username || "Someone";
    const message = buildShareMessage(swayger, myName, link);
    try {
      await Share.share({ message, url: link });
    } catch {
      await Clipboard.setStringAsync(link);
      setLinkShared(true);
      setTimeout(() => setLinkShared(false), 2000);
    }
  }

  function closeReceiptModal() {
    setShowReceiptModal(false);
    const pending = pendingStreakRef.current;
    if (pending >= 2) {
      pendingStreakRef.current = 0;
      setTimeout(() => {
        setCelebrationStreak(pending);
        setShowStreakCelebration(true);
      }, 350);
    }
  }
  const receiptRef = useRef<View>(null);
  const modalReceiptRef = useRef<View>(null);
  const prevStatusRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<ScrollView>(null);

  const { data: swayger, isLoading: swaygerLoading } = useQuery<SwaygerData | null>({
    queryKey: ["swayger", id],
    queryFn: () => fetchSwayger(id!),
    enabled: !!id,
  });

  const { data: invite } = useQuery<SwaygerInvite | null>({
    queryKey: ["swayger-invite", id],
    queryFn: () => fetchSwaygerInvite(id!),
    enabled: !!id,
  });

  const { data: profiles, isLoading: profilesLoading } = useQuery({
    queryKey: ["swayger-profiles", swayger?.creator_id, swayger?.opponent_id],
    queryFn: () => fetchParticipantProfiles(swayger!.creator_id, swayger!.opponent_id),
    enabled: !!swayger,
  });

  const h2hOpponentId = swayger
    ? swayger.creator_id === user?.id
      ? swayger.opponent_id
      : swayger.creator_id
    : null;

  const { data: h2h } = useQuery({
    queryKey: ["h2h", user?.id, h2hOpponentId],
    queryFn: () => fetchHeadToHead(user!.id, h2hOpponentId!),
    enabled: !!user?.id && !!h2hOpponentId,
  });

  const { data: proposals = [] } = useQuery<SettlementProposal[]>({
    queryKey: ["settlement-proposals", id],
    queryFn: () => fetchSettlementProposals(id!),
    enabled: !!id && (swayger?.status === "active" || swayger?.status === "settlement_proposed" || swayger?.status === "settled" || swayger?.status === "expired"),
  });

  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`swayger-detail-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swaygers", filter: `id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["swayger", id] });
          queryClient.invalidateQueries({ queryKey: ["swaygers"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settlement_proposals", filter: `swayger_id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["settlement-proposals", id] });
          queryClient.invalidateQueries({ queryKey: ["swayger", id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    const curr = swayger?.status;
    prevStatusRef.current = curr;
    if (prev !== undefined && prev !== "settled" && curr === "settled") {
      setTimeout(() => setShowReceiptModal(true), 400);
    }
    // Fight card: swayger just became active (someone accepted the invite)
    if (prev !== undefined && prev !== "active" && curr === "active" && id && !shownFightCardIds.has(id)) {
      shownFightCardIds.add(id);
      setTimeout(() => {
        setFightCardType("game_on");
        setShowFightCard(true);
      }, 350);
    }
  }, [swayger?.status]);

  // Fight card: first open of a rematch swayger (once profiles are loaded)
  useEffect(() => {
    if (!swayger?.rematch_type || !profiles || !id || shownFightCardIds.has(id)) return;
    if (!profiles.creator || !profiles.opponent) return;
    shownFightCardIds.add(id);
    setTimeout(() => {
      setFightCardType(swayger.rematch_type as FightCardType);
      setShowFightCard(true);
    }, 500);
  }, [swayger?.rematch_type, profiles]);

  // Fight card: opponent arrives after accepting (swayger already active on arrival)
  useEffect(() => {
    if (justAccepted !== "1" || !profiles || !id || shownFightCardIds.has(id)) return;
    if (!profiles.creator || !profiles.opponent) return;
    if (swayger?.status !== "active") return;
    shownFightCardIds.add(id);
    setTimeout(() => {
      setFightCardType("game_on");
      setShowFightCard(true);
    }, 500);
  }, [justAccepted, swayger?.status, profiles]);

  const isCreator = swayger?.creator_id === user?.id;
  const isOpponent = swayger?.opponent_id === user?.id;
  const status = swayger?.status || "pending_invite";
  const canAccept = !isCreator && isOpponent && status === "pending_invite";
  const canCancel =
    (isCreator && !["settled", "canceled", "declined", "expired", "invite_expired", "settlement_expired"].includes(status)) ||
    (isOpponent && ["active", "settlement_proposed"].includes(status));
  const canSettle = (status === "active" || status === "settlement_proposed") &&
    (isCreator || isOpponent);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["swayger", id] });
    queryClient.invalidateQueries({ queryKey: ["swayger-invite", id] });
    queryClient.invalidateQueries({ queryKey: ["swayger-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["settlement-proposals", id] });
    queryClient.invalidateQueries({ queryKey: ["swaygers"] });
  }

  async function shareReceipt() {
    if (!swayger?.settled_outcome) return;
    setIsSharing(true);
    try {
      const creatorName = profiles?.creator?.username || "Creator";
      const opponentName = profiles?.opponent?.username || "Opponent";

      if (Platform.OS === "web") {
        const winnerLabel =
          swayger.settled_outcome === "creator" ? `@${creatorName} wins`
          : swayger.settled_outcome === "opponent" ? `@${opponentName} wins`
          : swayger.settled_outcome === "draw" ? "Draw"
          : "No Contest";
        const textReceipt =
          `⚡ SWAYGER RECEIPT\n\n${swayger.title}\n\n` +
          `@${creatorName}: "${swayger.creator_pick}"\n` +
          `@${opponentName}: "${swayger.opponent_pick}"\n\n` +
          `🏆 ${winnerLabel}\n+${swayger.stake_units || 1} SP\n\n` +
          `Settled on Swayger`;
        await Share.share({ message: textReceipt });
        return;
      }

      const captureTarget = modalReceiptRef.current || receiptRef.current;
      if (!captureTarget) {
        showError("Receipt not ready yet. Try again.");
        return;
      }

      const uri = await captureRef(captureTarget, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Share your Swayger Receipt",
          UTI: "public.png",
        });
      } else {
        await Share.share({ message: `I won a Swayger! "${swayger.title}" — Settle it on Swayger!` });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes("cancel")) {
        showError("Could not share. Try again.");
      }
    } finally {
      setIsSharing(false);
    }
  }

  const acceptMutation = useMutation({
    mutationFn: () => acceptSwayger(id!, opponentPick, user?.id),
    onSuccess: (result) => {
      if (result.error) { showError(result.error); return; }
      setOpponentPick("");
      invalidateAll();
      showMessage("Accepted!", "The Swayger is now active. Good luck!");
      if (swayger) {
        sendPushNotification(
          swayger.creator_id,
          "Challenge accepted! ⚡",
          `Your Swayger "${swayger.title}" is now active. Game on!`,
          { swayger_id: swayger.id }
        );
      }
    },
    onError: () => showError("Failed to accept. Try again."),
  });

  const declineMutation = useMutation({
    mutationFn: () => declineSwayger(id!),
    onSuccess: (result) => {
      if (result.error) { showError(result.error); return; }
      invalidateAll();
      if (swayger) {
        sendPushNotification(
          swayger.creator_id,
          "Invite declined",
          `Your Swayger "${swayger.title}" was declined.`,
          { swayger_id: swayger.id }
        );
      }
    },
    onError: () => showError("Failed to decline. Try again."),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelSwayger(id!),
    onSuccess: (result) => {
      if (result.error) { showError(result.error); return; }
      invalidateAll();
      if (swayger?.opponent_id) {
        sendPushNotification(
          swayger.opponent_id,
          "Swayger canceled",
          `"${swayger.title}" was canceled by the creator.`,
          { swayger_id: swayger.id }
        );
      }
    },
    onError: () => showError("Failed to cancel. Try again."),
  });

  const proposeMutation = useMutation({
    mutationFn: (outcome: string) => proposeSettlement(id!, outcome, user?.id),
    onSuccess: (result) => {
      if (result.error) { showError(result.error); return; }
      invalidateAll();
      if (swayger) {
        const notifyId = isCreator ? swayger.opponent_id : swayger.creator_id;
        if (notifyId) {
          sendPushNotification(
            notifyId,
            "Settlement proposed 🤝",
            `Your opponent proposed a result for "${swayger.title}". Confirm or counter.`,
            { swayger_id: swayger.id }
          );
        }
      }
    },
    onError: () => showError("Failed to propose. Try again."),
  });

  const confirmMutation = useMutation({
    mutationFn: (proposalId: string) => confirmSettlement(id!, proposalId, user?.id),
    onSuccess: async (result, proposalId) => {
      if (result.error) { showError(result.error); return; }
      invalidateAll();
      if (result.settled) {
        showMessage("Settled!", "This Swayger has been settled.");
        // Check if the current user won and has a streak worth celebrating
        const proposal = proposals.find((p) => p.id === proposalId);
        const userWon = proposal && (
          (proposal.outcome === "creator" && isCreator) ||
          (proposal.outcome === "opponent" && isOpponent)
        );
        if (userWon && user) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("current_win_streak")
            .eq("id", user.id)
            .single();
          const streak = profileData?.current_win_streak ?? 0;
          if (streak >= 2) {
            pendingStreakRef.current = streak;
          }
        }
        if (swayger) {
          const notifyId = isCreator ? swayger.opponent_id : swayger.creator_id;
          if (notifyId) {
            sendPushNotification(
              notifyId,
              "Swayger settled! 🏆",
              `"${swayger.title}" has been settled. Check the result!`,
              { swayger_id: swayger.id }
            );
          }
        }
      } else if (swayger) {
        const notifyId = isCreator ? swayger.opponent_id : swayger.creator_id;
        if (notifyId) {
          sendPushNotification(
            notifyId,
            "Settlement confirmed ✅",
            `Your opponent confirmed the result for "${swayger.title}".`,
            { swayger_id: swayger.id }
          );
        }
      }
    },
    onError: () => showError("Failed to confirm. Try again."),
  });

  const withdrawMutation = useMutation({
    mutationFn: (proposalId: string) => withdrawProposal(id!, proposalId),
    onSuccess: (result) => {
      if (result.error) { showError(result.error); return; }
      invalidateAll();
      if (swayger) {
        const notifyId = isCreator ? swayger.opponent_id : swayger.creator_id;
        if (notifyId) {
          sendPushNotification(
            notifyId,
            "Settlement withdrawn 🔄",
            `Your opponent withdrew their settlement proposal for "${swayger.title}". Propose a new result.`,
            { swayger_id: swayger.id }
          );
        }
      }
    },
    onError: () => showError("Failed to withdraw proposal. Try again."),
  });

  const rematchMutation = useMutation({
    mutationFn: (type: "run_it_back" | "double_or_nothing") => createRematch(id!, type, user!.id),
    onSuccess: (result) => {
      if (result.error) { showError(result.error); return; }
      queryClient.invalidateQueries({ queryKey: ["swaygers"] });
      if (result.swayger) {
        router.push(`/swayger/${result.swayger.id}`);
      }
    },
    onError: () => showError("Failed to create rematch. Try again."),
  });

  async function handleCounter() {
    if (!swayger || !id) return;
    setCountering(true);
    try {
      await declineSwayger(id);
      sendPushNotification(
        swayger.creator_id,
        "Counter offer incoming! 🔄",
        `Your "${swayger.title}" invite was declined — a counter is on the way.`,
        { swayger_id: swayger.id }
      );
      router.replace({
        pathname: "/(tabs)/create" as never,
        params: {
          counterTitle: swayger.title,
          counterCategory: swayger.category,
          counterDescription: swayger.description || "",
          counterStake: String(swayger.stake_units),
          counterOpponentId: swayger.creator_id,
          counterOpponentUsername: profiles?.creator?.username || "",
        },
      });
    } catch {
      showError("Failed to send counter. Try again.");
      setCountering(false);
    }
  }

  const anyPending =
    acceptMutation.isPending || declineMutation.isPending || countering ||
    cancelMutation.isPending || proposeMutation.isPending || confirmMutation.isPending ||
    withdrawMutation.isPending || rematchMutation.isPending;

  if (swaygerLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
      </View>
    );
  }

  if (!swayger) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.accentGold} />
        <Text style={styles.errorText}>Swayger not found.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.linkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerSection}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.swaygerTitle}>{swayger.title}</Text>
          {swayger.rematch_type && (
            <View style={styles.rematchSubtitle}>
              <Ionicons name="refresh" size={12} color={Colors.dark.tint} />
              <Text style={styles.rematchSubtitleText}>
                {swayger.rematch_type === "double_or_nothing" ? "Double or Nothing" : "Rematch · Run it Back"}
              </Text>
            </View>
          )}
          <View style={styles.headerMeta}>
            <View style={styles.metaChip}>
              <Ionicons
                name={categoryIcon(swayger.category) as keyof typeof Ionicons.glyphMap}
                size={14}
                color={Colors.dark.textSecondary}
              />
              <Text style={styles.metaText}>{swayger.category || "Other"}</Text>
            </View>
            <StatusChip status={status} />
            {isCreator && (
              <View style={[styles.metaChip, styles.creatorChip]}>
                <Ionicons name="flash" size={14} color={Colors.dark.accentGold} />
                <Text style={[styles.metaText, { color: Colors.dark.accentGold }]}>Creator</Text>
              </View>
            )}
            {isOpponent && (
              <View style={[styles.metaChip, styles.opponentChip]}>
                <Ionicons name="shield-half-outline" size={14} color={Colors.dark.tint} />
                <Text style={[styles.metaText, { color: Colors.dark.tint }]}>Opponent</Text>
              </View>
            )}
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [styles.shareHeaderBtn, pressed && { opacity: 0.6 }]}
          onPress={handleShareSwayger}
        >
          <Ionicons
            name={linkShared ? "checkmark" : "share-outline"}
            size={20}
            color={linkShared ? "#22C55E" : Colors.dark.tint}
          />
        </Pressable>
      </View>

      {swayger.description && (
        <View style={styles.section}>
          <Text style={styles.descriptionText}>{swayger.description}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contract</Text>
        <View style={styles.contractGrid}>
          <PickCard
            label="Creator's Pick"
            pick={swayger.creator_pick}
            isYou={isCreator}
          />
          <PickCard
            label="Opponent's Pick"
            pick={swayger.opponent_pick}
            isYou={!isCreator && swayger.opponent_id === user?.id}
            waiting={!swayger.opponent_pick && status === "pending_invite"}
          />
        </View>
        <View style={styles.stakeRow}>
          <Ionicons name="flame-outline" size={18} color={Colors.dark.accentGold} />
          <Text style={styles.stakeText}>
            {swayger.stake_units || 1} Swayger Points at stake
          </Text>
        </View>
        <View style={styles.expiryRow}>
          <Ionicons name="calendar-outline" size={14} color={Colors.dark.tabIconDefault} />
          <Text style={styles.expiryText}>Created {formatDate(swayger.created_at)}</Text>
        </View>
        {status === "pending_invite" && swayger.expires_at && (
          <View style={styles.expiryRow}>
            <Ionicons name="time-outline" size={14} color={Colors.dark.tabIconDefault} />
            <Text style={styles.expiryText}>Expires {formatDateTime(swayger.expires_at)}</Text>
          </View>
        )}
        {(["active", "settlement_proposed", "settled"] as string[]).includes(status) && swayger.accepted_at && (
          <View style={styles.expiryRow}>
            <Ionicons name="flash-outline" size={14} color={Colors.dark.tabIconDefault} />
            <Text style={styles.expiryText}>Active since {formatDate(swayger.accepted_at)}</Text>
          </View>
        )}
        {status === "settlement_proposed" && (swayger as any).settlement_deadline && (() => {
          const deadline = new Date((swayger as any).settlement_deadline);
          const hoursLeft = (deadline.getTime() - Date.now()) / (1000 * 60 * 60);
          const isUrgent = hoursLeft < 48;
          return (
            <View style={styles.expiryRow}>
              <Ionicons name="hourglass-outline" size={14} color={isUrgent ? "#EF4444" : Colors.dark.tabIconDefault} />
              <Text style={[styles.expiryText, isUrgent && { color: "#EF4444" }]}>
                Settlement deadline: {formatDateTime((swayger as any).settlement_deadline)}
              </Text>
            </View>
          );
        })()}
      </View>

      {status === "settled" && swayger.settled_outcome && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Result</Text>
          <View style={styles.resultCard}>
            <Ionicons name="trophy" size={24} color={Colors.dark.accentGold} />
            <Text style={styles.resultText}>{displayOutcomeForViewer(swayger.settled_outcome, isCreator, isOpponent)}</Text>
          </View>
          {swayger.settled_at && (
            <View style={styles.expiryRow}>
              <Ionicons name="checkmark-circle-outline" size={14} color={Colors.dark.tabIconDefault} />
              <Text style={styles.expiryText}>Settled {formatDate(swayger.settled_at)}</Text>
            </View>
          )}
          {(isCreator || isOpponent) && (
            <Pressable
              style={({ pressed }) => [
                styles.shareReceiptBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={() => setShowReceiptModal(true)}
              testID="share-receipt-btn"
            >
              <Ionicons name="share-outline" size={18} color="#000000" />
              <Text style={styles.shareReceiptText}>Share Receipt</Text>
            </Pressable>
          )}
        </View>
      )}


      {canAccept && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Accept this Swayger</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your pick/prediction..."
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={opponentPick}
            onChangeText={setOpponentPick}
            editable={!anyPending}
            maxLength={200}
            onFocus={() => {
              setTimeout(() => {
                scrollRef.current?.scrollToEnd({ animated: true });
              }, 200);
            }}
          />
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [
                styles.acceptButton,
                pressed && styles.btnPressed,
                (anyPending || !opponentPick.trim()) && styles.btnDisabled,
              ]}
              onPress={() => acceptMutation.mutate()}
              disabled={anyPending || !opponentPick.trim()}
            >
              {acceptMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.acceptButtonText}>Accept</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.declineButton,
                pressed && styles.btnPressed,
                anyPending && styles.btnDisabled,
              ]}
              onPress={() => declineMutation.mutate()}
              disabled={anyPending}
            >
              {declineMutation.isPending ? (
                <ActivityIndicator color="#EF4444" size="small" />
              ) : (
                <Text style={styles.declineButtonText}>Decline</Text>
              )}
            </Pressable>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.counterOfferButton,
              pressed && styles.btnPressed,
              anyPending && styles.btnDisabled,
            ]}
            onPress={handleCounter}
            disabled={anyPending}
          >
            {countering ? (
              <ActivityIndicator color={Colors.dark.tint} size="small" />
            ) : (
              <>
                <Ionicons name="swap-horizontal" size={16} color={Colors.dark.tint} />
                <Text style={styles.counterOfferText}>Counter Offer</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      {canSettle && (
        <SettlementSection
          swayger={swayger}
          proposals={proposals}
          isCreator={isCreator}
          userId={user!.id}
          onPropose={(outcome) => proposeMutation.mutate(outcome)}
          onConfirm={(proposalId) => confirmMutation.mutate(proposalId)}
          onWithdraw={(proposalId) => withdrawMutation.mutate(proposalId)}
          proposing={proposeMutation.isPending}
          confirming={confirmMutation.isPending}
          withdrawing={withdrawMutation.isPending}
        />
      )}

      {(isCreator || isOpponent) && (status === "active" || status === "settlement_proposed") && (
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [styles.pokeBtn, pressed && styles.btnPressed]}
            onPress={pokeSwayger}
          >
            <Ionicons
              name={pokeSent ? "checkmark-circle-outline" : "hand-left-outline"}
              size={18}
              color={pokeSent ? "#22C55E" : Colors.dark.tint}
            />
            <Text style={[styles.pokeBtnText, pokeSent && { color: "#22C55E" }]}>
              {pokeSent
                ? "Link copied!"
                : status === "settlement_proposed"
                ? "Poke — Settle Up"
                : "Poke Opponent"}
            </Text>
          </Pressable>
        </View>
      )}

      {status === "settled" && (isCreator || isOpponent) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rematch</Text>
          <View style={styles.rematchRow}>
            <Pressable
              style={({ pressed }) => [
                styles.rematchButton,
                pressed && styles.btnPressed,
                anyPending && styles.btnDisabled,
              ]}
              onPress={() => setRematchSheetType("run_it_back")}
              disabled={anyPending}
            >
              <Ionicons name="refresh" size={18} color={Colors.dark.tint} />
              <Text style={styles.rematchButtonText}>Run it Back</Text>
              <Text style={styles.rematchStake}>{swayger.stake_units} SP</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.rematchButton,
                styles.rematchButtonDouble,
                pressed && styles.btnPressed,
                anyPending && styles.btnDisabled,
              ]}
              onPress={() => setRematchSheetType("double_or_nothing")}
              disabled={anyPending}
            >
              <Ionicons name="flame" size={18} color={Colors.dark.accentGold} />
              <Text style={[styles.rematchButtonText, { color: Colors.dark.accentGold }]}>
                Double or Nothing
              </Text>
              <Text style={[styles.rematchStake, { color: Colors.dark.accentGold }]}>
                {(swayger.stake_units || 1) * 2} SP
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {(isCreator || isOpponent) && (
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [styles.challengeElseBtn, pressed && styles.btnPressed]}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/create",
                params: {
                  counterTitle: swayger.title,
                  counterCategory: swayger.category || "Sports",
                  counterDescription: swayger.description || "",
                  counterStake: String(swayger.stake_units),
                  creatorPickPrefill: isCreator
                    ? swayger.creator_pick
                    : swayger.opponent_pick || "",
                  openChallenge: "true",
                },
              })
            }
          >
            <Ionicons name="person-add-outline" size={16} color={Colors.dark.tint} />
            <Text style={styles.challengeElseText}>Same Swayger, New Opponent</Text>
          </Pressable>
        </View>
      )}

      {status === "declined" && (
        <View style={styles.section}>
          <View style={styles.statusBanner}>
            <Ionicons name="close-circle" size={18} color="#EF4444" />
            <Text style={styles.statusBannerText}>
              {profiles?.opponent?.username
                ? `Declined by @${profiles.opponent.username}`
                : "This Swayger was declined."}
            </Text>
          </View>
        </View>
      )}

      {status === "canceled" && (
        <View style={styles.section}>
          <View style={styles.statusBanner}>
            <Ionicons name="ban-outline" size={18} color={Colors.dark.tabIconDefault} />
            <Text style={styles.statusBannerText}>
              {(() => {
                if (!swayger.cancelled_by) return "This Swayger was canceled.";
                if (swayger.cancelled_by === swayger.creator_id && profiles?.creator?.username)
                  return `Canceled by @${profiles.creator.username}`;
                if (swayger.cancelled_by === swayger.opponent_id && profiles?.opponent?.username)
                  return `Canceled by @${profiles.opponent.username}`;
                return "This Swayger was canceled.";
              })()}
            </Text>
          </View>
        </View>
      )}

      {status === "expired" && (
        <View style={styles.section}>
          <View style={styles.statusBanner}>
            <Ionicons name="time-outline" size={18} color={Colors.dark.accentGold} />
            <Text style={styles.statusBannerText}>
              No verdict reached — your Swayger Points were returned.
            </Text>
          </View>
        </View>
      )}

      {canCancel && (
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.btnPressed,
              anyPending && styles.btnDisabled,
            ]}
            onPress={() => cancelMutation.mutate()}
            disabled={anyPending}
          >
            {cancelMutation.isPending ? (
              <ActivityIndicator color="#EF4444" size="small" />
            ) : (
              <>
                <Ionicons name="close-outline" size={20} color="#EF4444" />
                <Text style={styles.cancelButtonText}>Cancel Swayger</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      {status === "pending_invite" && isCreator && swayger.source_swayger_id && swayger.opponent_id ? (
        <View style={styles.section}>
          <View style={styles.rematchWaitingCard}>
            <Ionicons name="time-outline" size={28} color={Colors.dark.tint} />
            <Text style={styles.rematchWaitingTitle}>Rematch Sent</Text>
            <Text style={styles.rematchWaitingText}>
              Waiting for{" "}
              <Text style={{ color: Colors.dark.text, fontWeight: "600" }}>
                {profiles?.opponent?.display_name || profiles?.opponent?.username
                  ? `@${profiles?.opponent?.username}`
                  : "your opponent"}
              </Text>{" "}
              to accept and enter their pick.
            </Text>
          </View>
        </View>
      ) : status === "pending_invite" && isCreator && invite?.invite_code ? (
        <InviteSection inviteCode={invite.invite_code} swaygerName={swayger.title} />
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Participants</Text>
        {profilesLoading ? (
          <ActivityIndicator color={Colors.dark.tint} style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.participantsList}>
            <ParticipantRow
              profile={profiles?.creator || null}
              roleLabel="Creator"
              isCreatorRole
            />
            {swayger.opponent_id && (
              <ParticipantRow
                profile={profiles?.opponent || null}
                roleLabel="Opponent"
                isCreatorRole={false}
              />
            )}
            {!swayger.opponent_id && (
              <Text style={styles.emptyText}>Waiting for opponent...</Text>
            )}
          </View>
        )}
      </View>

      {swayger.opponent_id && h2h && (
        <View style={styles.h2hSection}>
          <View style={styles.h2hHeader}>
            <Ionicons name="swap-horizontal" size={13} color={Colors.dark.textSecondary} />
            <Text style={styles.h2hTitle}>Head to Head</Text>
          </View>
          {h2h.myWins === 0 && h2h.theirWins === 0 && h2h.draws === 0 ? (
            <Text style={styles.h2hFirst}>First matchup — establish dominance ⚡</Text>
          ) : (
            <View>
              <View style={styles.h2hScoreboard}>
                <View style={styles.h2hSide}>
                  <Text style={[styles.h2hScore, h2h.myWins > h2h.theirWins && styles.h2hScoreWinner]}>{h2h.myWins}</Text>
                  <Text style={styles.h2hName}>You</Text>
                </View>
                <Text style={styles.h2hDash}>—</Text>
                <View style={styles.h2hSide}>
                  <Text style={[styles.h2hScore, h2h.theirWins > h2h.myWins && styles.h2hScoreWinner]}>{h2h.theirWins}</Text>
                  <Text style={styles.h2hName} numberOfLines={1}>
                    @{(isCreator ? profiles?.opponent : profiles?.creator)?.username || "Opponent"}
                  </Text>
                </View>
              </View>
              {h2h.draws > 0 && (
                <Text style={styles.h2hDraws}>{h2h.draws} draw{h2h.draws !== 1 ? "s" : ""}</Text>
              )}
            </View>
          )}
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>

      <Modal
        visible={showReceiptModal}
        transparent
        animationType="fade"
        onRequestClose={closeReceiptModal}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⚡ Swayger Settled!</Text>
              <Pressable
                style={styles.modalCloseBtn}
                onPress={closeReceiptModal}
              >
                <Ionicons name="close" size={22} color={Colors.dark.textSecondary} />
              </Pressable>
            </View>

            {swayger && swayger.settled_outcome && swayger.creator_pick && swayger.opponent_pick && (
              <View ref={modalReceiptRef} collapsable={false}>
                <ReceiptCard
                  title={swayger.title}
                  category={swayger.category || "Other"}
                  creatorUsername={profiles?.creator?.username || "Creator"}
                  creatorDisplayName={profiles?.creator?.display_name || null}
                  opponentUsername={profiles?.opponent?.username || "Opponent"}
                  opponentDisplayName={profiles?.opponent?.display_name || null}
                  creatorPick={swayger.creator_pick}
                  opponentPick={swayger.opponent_pick}
                  outcome={swayger.settled_outcome}
                  stakeUnits={swayger.stake_units || 1}
                />
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.modalShareBtn,
                pressed && styles.btnPressed,
                isSharing && styles.btnDisabled,
              ]}
              onPress={shareReceipt}
              disabled={isSharing}
            >
              {isSharing ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={20} color="#000000" />
                  <Text style={styles.modalShareText}>Share Receipt</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={styles.modalDismissBtn}
              onPress={closeReceiptModal}
            >
              <Text style={styles.modalDismissText}>Maybe later</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <StreakCelebrationModal
        visible={showStreakCelebration}
        streak={celebrationStreak}
        onDismiss={() => setShowStreakCelebration(false)}
      />

      <FightCardModal
        visible={showFightCard}
        type={fightCardType}
        creatorInitial={(profiles?.creator?.display_name || profiles?.creator?.username || "?").charAt(0)}
        opponentInitial={(profiles?.opponent?.display_name || profiles?.opponent?.username || "?").charAt(0)}
        creatorUsername={profiles?.creator?.username || "creator"}
        opponentUsername={profiles?.opponent?.username || "opponent"}
        stakeUnits={swayger?.stake_units || 1}
        onDismiss={() => setShowFightCard(false)}
      />

      <Modal
        visible={rematchSheetType !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setRematchSheetType(null)}
        statusBarTranslucent
      >
        {rematchSheetType !== null && swayger && (() => {
          const isDouble = rematchSheetType === "double_or_nothing";
          const sheetStake = isDouble ? (swayger.stake_units || 1) * 2 : swayger.stake_units;
          const myPick = isCreator ? swayger.creator_pick : swayger.opponent_pick;
          const opponentProfile = isCreator ? profiles?.opponent : profiles?.creator;
          const opponentId = isCreator ? swayger.opponent_id : swayger.creator_id;
          const opponentUsername = opponentProfile?.username || "opponent";
          const accentColor = isDouble ? Colors.dark.accentGold : Colors.dark.tint;

          return (
            <Pressable style={styles.sheetOverlay} onPress={() => setRematchSheetType(null)}>
              <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
                <View style={styles.sheetHandle} />

                <View style={styles.sheetHeader}>
                  <Ionicons
                    name={isDouble ? "flame" : "refresh"}
                    size={22}
                    color={accentColor}
                  />
                  <Text style={[styles.sheetTitle, { color: accentColor }]}>
                    {isDouble ? "Double or Nothing" : "Run it Back"}
                  </Text>
                </View>

                <View style={styles.sheetTerms}>
                  <Text style={styles.sheetSwaygerTitle} numberOfLines={2}>{swayger.title}</Text>

                  <View style={styles.sheetRow}>
                    <View style={styles.sheetChip}>
                      <Text style={styles.sheetChipLabel}>Category</Text>
                      <Text style={styles.sheetChipValue}>{swayger.category}</Text>
                    </View>
                    <View style={[styles.sheetChip, { borderColor: accentColor }]}>
                      <Text style={styles.sheetChipLabel}>Stake</Text>
                      <Text style={[styles.sheetChipValue, { color: accentColor }]}>{sheetStake} SP</Text>
                    </View>
                  </View>

                  <View style={styles.sheetRow}>
                    <View style={styles.sheetChip}>
                      <Text style={styles.sheetChipLabel}>Your pick</Text>
                      <Text style={styles.sheetChipValue} numberOfLines={1}>{myPick || "—"}</Text>
                    </View>
                    <View style={styles.sheetChip}>
                      <Text style={styles.sheetChipLabel}>vs</Text>
                      <Text style={styles.sheetChipValue}>@{opponentUsername}</Text>
                    </View>
                  </View>
                </View>

                <Pressable
                  style={({ pressed }) => [styles.sheetSendBtn, { backgroundColor: accentColor }, pressed && { opacity: 0.85 }]}
                  onPress={() => {
                    setRematchSheetType(null);
                    rematchMutation.mutate(rematchSheetType);
                  }}
                >
                  <Text style={[styles.sheetSendText, { color: isDouble ? "#000" : "#fff" }]}>Send it</Text>
                  <Ionicons name="arrow-forward" size={18} color={isDouble ? "#000" : "#fff"} />
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.sheetEditBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => {
                    setRematchSheetType(null);
                    router.push({
                      pathname: "/(tabs)/create" as never,
                      params: {
                        counterTitle: swayger.title,
                        counterCategory: swayger.category,
                        counterDescription: swayger.description || "",
                        counterStake: String(sheetStake),
                        lockedOpponentId: opponentId || "",
                        lockedOpponentUsername: opponentUsername,
                        sourceSwaygerIdForEdit: swayger.id,
                        rematchTypeForEdit: rematchSheetType,
                        creatorPickPrefill: myPick || "",
                      },
                    });
                  }}
                >
                  <Ionicons name="create-outline" size={16} color={Colors.dark.tint} />
                  <Text style={styles.sheetEditText}>Edit terms</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          );
        })()}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  scrollContent: { paddingBottom: 160 },
  centered: { alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { fontSize: 16, color: Colors.dark.textSecondary },
  linkText: { color: Colors.dark.tint, fontSize: 14 },
  headerSection: { padding: 24, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.surface,
    alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  shareHeaderBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.surface,
    alignItems: "center", justifyContent: "center", marginTop: 2,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  headerContent: { flex: 1, gap: 8 },
  swaygerTitle: { fontSize: 26, fontWeight: "bold" as const, color: Colors.dark.text },
  headerMeta: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.dark.surface, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  creatorChip: { backgroundColor: "rgba(245, 166, 35, 0.1)" },
  opponentChip: { backgroundColor: "rgba(99, 102, 241, 0.1)" },
  metaText: { fontSize: 13, color: Colors.dark.textSecondary },
  section: { paddingHorizontal: 24, marginBottom: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle: {
    fontSize: 14, fontWeight: "600" as const, color: Colors.dark.textSecondary,
    textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 12,
  },
  participantCount: { fontSize: 14, color: Colors.dark.tabIconDefault, marginBottom: 12 },
  descriptionText: { fontSize: 15, color: Colors.dark.textSecondary, lineHeight: 22 },
  contractGrid: { gap: 10 },
  pickCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  pickCardYou: { borderColor: Colors.dark.tint, backgroundColor: "rgba(29, 161, 242, 0.05)" },
  pickHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  pickLabel: { fontSize: 12, fontWeight: "600" as const, color: Colors.dark.tabIconDefault, textTransform: "uppercase" as const },
  youBadge: { backgroundColor: Colors.dark.tint, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  youBadgeText: { fontSize: 10, fontWeight: "bold" as const, color: "#FFFFFF" },
  pickText: { fontSize: 16, fontWeight: "500" as const, color: Colors.dark.text },
  pickTextWaiting: { color: Colors.dark.tabIconDefault, fontStyle: "italic" },
  stakeRow: {
    flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12,
    backgroundColor: "rgba(245, 166, 35, 0.08)", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "rgba(245, 166, 35, 0.2)",
  },
  stakeText: { fontSize: 15, color: Colors.dark.accentGold, fontWeight: "600" as const },
  expiryRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  expiryText: { fontSize: 13, color: Colors.dark.tabIconDefault },
  rematchSubtitle: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2, marginBottom: 2,
  },
  rematchSubtitleText: { fontSize: 13, color: Colors.dark.tint, fontWeight: "500" as const },
  rematchWaitingCard: {
    alignItems: "center", gap: 8, backgroundColor: "rgba(29, 161, 242, 0.06)",
    borderRadius: 14, padding: 20, borderWidth: 1, borderColor: "rgba(29, 161, 242, 0.15)",
  },
  rematchWaitingTitle: { fontSize: 17, fontWeight: "700" as const, color: Colors.dark.text },
  rematchWaitingText: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center" as const, lineHeight: 20 },
  resultCard: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(245, 166, 35, 0.1)",
    borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "rgba(245, 166, 35, 0.2)",
  },
  resultText: { fontSize: 18, fontWeight: "bold" as const, color: Colors.dark.accentGold },
  input: {
    backgroundColor: Colors.dark.surface, borderWidth: 1, borderColor: Colors.dark.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: Colors.dark.text,
    marginBottom: 12,
  },
  actionRow: { flexDirection: "row", gap: 12 },
  acceptButton: {
    flex: 2, backgroundColor: "#22C55E", flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 12,
  },
  acceptButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" as const },
  declineButton: {
    flex: 1, borderWidth: 1, borderColor: "#EF4444", alignItems: "center",
    justifyContent: "center", paddingVertical: 16, borderRadius: 12,
  },
  declineButtonText: { color: "#EF4444", fontSize: 15, fontWeight: "600" as const },
  counterOfferButton: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const,
    gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.dark.tint, marginTop: 8,
  },
  counterOfferText: { color: Colors.dark.tint, fontSize: 14, fontWeight: "600" as const },
  cancelButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#EF4444",
  },
  cancelButtonText: { color: "#EF4444", fontSize: 15, fontWeight: "600" as const },
  btnPressed: { opacity: 0.8 },
  btnDisabled: { opacity: 0.5 },
  inviteCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.dark.border, gap: 16, alignItems: "center" as const,
  },
  inviteCode: {
    fontSize: 28, fontWeight: "bold" as const, color: Colors.dark.tint,
    letterSpacing: 6, textAlign: "center" as const,
  },
  qrContainer: { alignItems: "center" as const, gap: 8 },
  qrWrapper: {
    backgroundColor: "#FFFFFF", padding: 12, borderRadius: 12,
  },
  qrHint: { fontSize: 12, color: Colors.dark.tabIconDefault },
  inviteButtons: { flexDirection: "row" as const, gap: 12, width: "100%" as const },
  inviteActionBtn: {
    flex: 1, flexDirection: "row" as const, alignItems: "center" as const,
    justifyContent: "center" as const, gap: 6, paddingVertical: 14, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.dark.border, backgroundColor: Colors.dark.surfaceLight,
  },
  inviteActionText: { fontSize: 14, color: Colors.dark.tint, fontWeight: "600" as const },
  inviteShareBtn: { backgroundColor: Colors.dark.accent, borderColor: Colors.dark.accent },
  inviteShareText: { fontSize: 14, color: "#FFFFFF", fontWeight: "600" as const },
  proposalCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.dark.border, gap: 10,
  },
  proposalHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  proposalTitle: { fontSize: 14, color: Colors.dark.textSecondary, fontWeight: "500" as const },
  proposalOutcome: { fontSize: 18, fontWeight: "bold" as const, color: Colors.dark.text },
  confirmationRow: { flexDirection: "row", gap: 16 },
  confirmChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  confirmText: { fontSize: 13, color: Colors.dark.textSecondary },
  confirmButton: {
    backgroundColor: "#22C55E", flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 10, marginTop: 4,
  },
  confirmButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" as const },
  counterButton: {
    backgroundColor: "transparent", flexDirection: "row" as const, alignItems: "center" as const,
    justifyContent: "center" as const, gap: 8, paddingVertical: 12, borderRadius: 10, marginTop: 4,
    borderWidth: 1, borderColor: Colors.dark.tint,
  },
  counterButtonText: { color: Colors.dark.tint, fontSize: 15, fontWeight: "600" as const },
  waitingRow: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const,
    gap: 8, marginTop: 6,
  },
  waitingText: { fontSize: 13, color: Colors.dark.tabIconDefault, fontStyle: "italic" as const },
  withdrawLink: { paddingVertical: 4, paddingHorizontal: 8 },
  withdrawLinkText: { fontSize: 13, color: Colors.dark.tint, textDecorationLine: "underline" as const },
  outcomeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  outcomeButton: {
    flexBasis: "47%", flexGrow: 1, backgroundColor: Colors.dark.surface, borderWidth: 1,
    borderColor: Colors.dark.border, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 12,
    alignItems: "center", gap: 6,
  },
  outcomeLabel: { fontSize: 13, color: Colors.dark.text, fontWeight: "500" as const, textAlign: "center" },
  rematchRow: { gap: 10 },
  rematchButton: {
    backgroundColor: Colors.dark.surface, borderWidth: 1, borderColor: Colors.dark.border,
    borderRadius: 12, padding: 16, flexDirection: "row", alignItems: "center", gap: 10,
  },
  rematchButtonDouble: { borderColor: "rgba(245, 166, 35, 0.3)" },
  rematchButtonText: { flex: 1, fontSize: 15, fontWeight: "600" as const, color: Colors.dark.tint },
  rematchStake: { fontSize: 13, color: Colors.dark.tabIconDefault, fontWeight: "500" as const },
  challengeElseBtn: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const,
    gap: 8, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.dark.tint,
    backgroundColor: "rgba(29, 161, 242, 0.07)",
  },
  challengeElseText: { fontSize: 15, color: Colors.dark.tint, fontWeight: "600" as const },
  pokeBtn: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const,
    gap: 8, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.dark.tint,
    backgroundColor: "rgba(29, 161, 242, 0.07)",
  },
  pokeBtnText: { fontSize: 15, color: Colors.dark.tint, fontWeight: "600" as const },
  statusBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dark.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  statusBannerText: { fontSize: 14, color: Colors.dark.textSecondary },
  emptyText: { fontSize: 14, color: Colors.dark.tabIconDefault },
  memberRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  memberAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.dark.surfaceLight,
    alignItems: "center", justifyContent: "center",
  },
  memberInitial: { fontSize: 16, fontWeight: "600" as const, color: Colors.dark.tint },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { fontSize: 15, fontWeight: "500" as const, color: Colors.dark.text },
  memberUsername: { fontSize: 12, color: Colors.dark.tabIconDefault },
  memberRoleBadge: {
    backgroundColor: Colors.dark.surfaceLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  memberRoleBadgeCreator: { backgroundColor: "rgba(245, 166, 35, 0.15)" },
  memberRoleText: { fontSize: 11, fontWeight: "600" as const, color: Colors.dark.tint },
  memberRoleTextCreator: { color: Colors.dark.accentGold },
  participantsList: { gap: 4 },
  h2hSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 14,
  },
  h2hHeader: { flexDirection: "row" as const, alignItems: "center" as const, gap: 5, marginBottom: 10 },
  h2hTitle: { fontSize: 11, fontWeight: "700" as const, color: Colors.dark.textSecondary, letterSpacing: 0.8, textTransform: "uppercase" as const },
  h2hFirst: { fontSize: 13, color: Colors.dark.textSecondary, fontStyle: "italic" as const },
  h2hScoreboard: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12 },
  h2hSide: { flex: 1, alignItems: "center" as const },
  h2hScore: { fontSize: 36, fontWeight: "800" as const, color: Colors.dark.textSecondary, lineHeight: 40 },
  h2hScoreWinner: { color: Colors.dark.tint },
  h2hName: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 2 },
  h2hDash: { fontSize: 20, fontWeight: "300" as const, color: Colors.dark.border },
  h2hDraws: { fontSize: 11, color: Colors.dark.tabIconDefault, marginTop: 8, textAlign: "center" as const },
  shareReceiptBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: Colors.dark.accentGold,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
  },
  shareReceiptText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#000000",
  },
  offScreenReceipt: {
    position: "absolute" as const,
    left: 10000,
    top: 0,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Colors.dark.background,
    borderRadius: 20,
    overflow: "hidden",
    gap: 0,
  },
  modalHeader: {
    flexDirection: "row" as const,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  modalShareBtn: {
    flexDirection: "row" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.dark.accentGold,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 16,
  },
  modalShareText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#000000",
  },
  modalDismissBtn: {
    alignItems: "center",
    paddingVertical: 16,
    paddingBottom: 20,
  },
  modalDismissText: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
  },
  sheetOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: Colors.dark.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 8,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.dark.border,
    alignSelf: "center", marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 20, fontWeight: "700" as const,
  },
  sheetTerms: {
    backgroundColor: Colors.dark.background, borderRadius: 14,
    padding: 14, gap: 10, marginBottom: 20,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  sheetSwaygerTitle: {
    fontSize: 16, fontWeight: "600" as const, color: Colors.dark.text, marginBottom: 4,
  },
  sheetRow: {
    flexDirection: "row" as const, gap: 10,
  },
  sheetChip: {
    flex: 1, backgroundColor: Colors.dark.surface, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: Colors.dark.border, gap: 2,
  },
  sheetChipLabel: {
    fontSize: 10, fontWeight: "600" as const, color: Colors.dark.tabIconDefault,
    textTransform: "uppercase" as const, letterSpacing: 0.6,
  },
  sheetChipValue: {
    fontSize: 14, fontWeight: "600" as const, color: Colors.dark.text,
  },
  sheetSendBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 16, borderRadius: 14, marginBottom: 12,
  },
  sheetSendText: {
    fontSize: 16, fontWeight: "700" as const, color: "#fff",
  },
  sheetEditBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  sheetEditText: {
    fontSize: 15, fontWeight: "600" as const, color: Colors.dark.tint,
  },
});
