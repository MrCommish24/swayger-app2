import { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  ActivityIndicator,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  joinSwaygerByCode,
  fetchSwayger,
  fetchParticipantProfiles,
  acceptSwayger,
  declineSwayger,
  displayStatus,
  categoryIcon,
} from "@/lib/swayger";
import { showError, showMessage, formatDateTime } from "@/lib/helpers";
import { sendPushNotification } from "@/lib/notifications";
import { storePendingInvite, consumePendingInvite, peekPendingInvite } from "@/lib/pending-invite";
import { getApiUrl } from "@/lib/query-client";
import { SwaygerData } from "@/types";
import Colors from "@/constants/colors";

interface InvitePreview {
  code: string;
  swayger_id: string;
  title: string;
  category: string;
  stake_units: number;
  creator_pick: string | null;
  description: string | null;
  expires_at: string | null;
  creator_id: string;
  creator_username: string | null;
  creator_display_name: string | null;
}

interface ChallengeNight {
  id: string;
  date: string;
  status: string;
  lock_time: string;
  props: Array<{ id: string; player: string; stat: string; line: number; status?: string }>;
}

function parseNightId(description: string | null): string | null {
  if (!description) return null;
  const match = description.match(/\[night:([^\]]+)\]/);
  return match ? match[1] : null;
}

function cleanDescription(description: string | null): string | null {
  if (!description) return null;
  return description.replace(/\[night:[^\]]+\]\s*/g, "").trim() || null;
}

function statLabel(stat: string): string {
  const map: Record<string, string> = {
    points: "PTS", rebounds: "REB", assists: "AST", steals: "STL",
    blocks: "BLK", threes: "3PM", turnovers: "TO",
  };
  return map[stat.toLowerCase()] || stat.toUpperCase().slice(0, 3);
}

async function fetchInvitePreview(code: string): Promise<InvitePreview | null> {
  try {
    const url = new URL(`/api/invite/${encodeURIComponent(code)}/preview`, getApiUrl());
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default function InviteScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, session, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [opponentPick, setOpponentPick] = useState("");
  const [joinedId, setJoinedId] = useState<string | null>(null);
  const [countering, setCountering] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const joinNotifiedRef = useRef(false);

  // ─── Preview fetch (no auth required) ────────────────────────────────────
  const { data: preview, isLoading: previewLoading } = useQuery<InvitePreview | null>({
    queryKey: ["invite-preview", code],
    queryFn: () => fetchInvitePreview(code!),
    enabled: !!code,
    staleTime: 30_000,
  });

  // ─── Authenticated join + swayger fetch ──────────────────────────────────
  const joinMutation = useMutation({
    mutationFn: () => {
      if (!code || !user) throw new Error("Missing code or user");
      return joinSwaygerByCode(code, user.id);
    },
    onSuccess: async (result) => {
      if (result.error) { showError(result.error); return; }
      if (result.swaygerId) {
        queryClient.invalidateQueries({ queryKey: ["swaygers"] });
        setJoinedId(result.swaygerId);
      }
    },
    onError: () => showError("Failed to join. Try again."),
  });

  const { data: swayger, isLoading: swaygerLoading } = useQuery<SwaygerData | null>({
    queryKey: ["invite-swayger", joinedId],
    queryFn: () => fetchSwayger(joinedId!),
    enabled: !!joinedId,
  });

  const { data: profiles } = useQuery({
    queryKey: ["invite-profiles", swayger?.creator_id, swayger?.opponent_id],
    queryFn: () => fetchParticipantProfiles(swayger!.creator_id, swayger!.opponent_id),
    enabled: !!swayger,
  });

  // ─── Picks Challenge context ───────────────────────────────────────────────
  const previewTitle = preview?.title ?? swayger?.title ?? "";
  const previewDescription = preview?.description ?? swayger?.description ?? null;
  const isPicksChallenge = previewTitle.startsWith("🎯 Picks Challenge");
  const challengeNightId = isPicksChallenge ? parseNightId(previewDescription) : null;

  const { data: challengeNightData } = useQuery<{ ok: boolean; night: ChallengeNight | null } | null>({
    queryKey: ["challenge-night", challengeNightId],
    queryFn: async () => {
      const url = new URL(`/api/props/night/${challengeNightId}`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!challengeNightId,
    staleTime: 60_000,
  });

  const challengeNight = challengeNightData?.night ?? null;
  const isNightLocked = challengeNight
    ? challengeNight.status !== "open" || new Date() >= new Date(challengeNight.lock_time)
    : false;

  const { data: userPicksData } = useQuery<{ ok: boolean; pick: { picks: unknown[] } | null } | null>({
    queryKey: ["my-picks-for-challenge", challengeNightId, user?.id],
    queryFn: async () => {
      const url = new URL("/api/props/my-picks", getApiUrl());
      url.searchParams.set("night_id", challengeNightId!);
      url.searchParams.set("user_id", user!.id);
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!challengeNightId && !!user?.id && isPicksChallenge,
    staleTime: 30_000,
  });
  const hasPicksForNight = !!userPicksData?.pick;

  async function handleGoMakePicks() {
    if (!code) return;
    await storePendingInvite({ code, intent: "picks_challenge" });
    router.push("/picks" as never);
  }

  async function handleSignInToMakePicks() {
    if (!code) return;
    await storePendingInvite({ code, intent: "picks_challenge" });
    router.replace("/auth");
  }

  // Auto-join when user lands on this screen authenticated (came back from auth).
  // Also clear any stored pending invite so it doesn't carry over to future sessions.
  useEffect(() => {
    if (user && !joinedId && !joinMutation.isPending && !joinMutation.isSuccess && code) {
      consumePendingInvite().catch(() => {});
      joinMutation.mutate();
    }
  }, [user, code]);

  // Pre-fill opponent pick for Picks Challenge swaygers
  const [opponentPickPrefilled, setOpponentPickPrefilled] = useState(false);
  useEffect(() => {
    if (!swayger || opponentPickPrefilled) return;
    if (swayger.title?.startsWith("🎯 Picks Challenge")) {
      setOpponentPick("I'll get more picks correct than you tonight 🎯");
      setOpponentPickPrefilled(true);
    }
  }, [swayger?.id, swayger?.title]);

  const isCreator = swayger?.creator_id === user?.id;
  const canAccept = swayger && !isCreator && swayger.status === "pending_invite";

  const acceptMutation = useMutation({
    mutationFn: () => acceptSwayger(joinedId!, opponentPick, user?.id),
    onSuccess: (result) => {
      if (result.error) { showError(result.error); return; }
      queryClient.invalidateQueries({ queryKey: ["swaygers"] });
      showMessage("Accepted!", "The Swayger is now active. Good luck!");
      if (swayger) {
        sendPushNotification(
          swayger.creator_id,
          "Challenge accepted! ⚡",
          `Your Swayger "${swayger.title}" is now active. Game on!`,
          { swayger_id: swayger.id }
        );
      }
      router.replace(`/swayger/${joinedId}?justAccepted=1`);
    },
    onError: () => showError("Failed to accept. Try again."),
  });

  const declineMutation = useMutation({
    mutationFn: () => declineSwayger(joinedId!),
    onSuccess: (result) => {
      if (result.error) { showError(result.error); return; }
      queryClient.invalidateQueries({ queryKey: ["swaygers"] });
      if (swayger) {
        sendPushNotification(
          swayger.creator_id,
          "Invite declined",
          `Your Swayger "${swayger.title}" was declined.`,
          { swayger_id: swayger.id }
        );
      }
      router.replace("/(tabs)");
    },
    onError: () => showError("Failed to decline. Try again."),
  });

  useEffect(() => {
    if (joinedId && !swaygerLoading && swayger === null && joinMutation.isSuccess) {
      router.replace(`/swayger/${joinedId}`);
    }
  }, [joinedId, swaygerLoading, swayger, joinMutation.isSuccess]);

  useEffect(() => {
    if (!swayger || !user || joinNotifiedRef.current) return;
    if (swayger.creator_id === user.id) return;
    joinNotifiedRef.current = true;
    sendPushNotification(
      swayger.creator_id,
      "Someone joined your Swayger! 👋",
      `Your Swayger "${swayger.title}" has a challenger. Review and accept!`,
      { swayger_id: swayger.id }
    );
  }, [swayger, user]);

  const anyPending = joinMutation.isPending || acceptMutation.isPending || declineMutation.isPending || countering;

  const handleCounter = async () => {
    if (!swayger || !joinedId) return;
    setCountering(true);
    try {
      const result = await declineSwayger(joinedId);
      if (result.error) { showError(result.error); setCountering(false); return; }
      queryClient.invalidateQueries({ queryKey: ["swaygers"] });
      const creatorName = profiles?.creator?.username || "";
      if (swayger.creator_id) {
        sendPushNotification(
          swayger.creator_id,
          "Counter offer incoming! 🔄",
          `Your opponent countered "${swayger.title}". Check the new proposal!`,
          { swayger_id: swayger.id }
        );
      }
      router.replace({
        pathname: "/(tabs)/create" as never,
        params: {
          counterTitle: swayger.title,
          counterCategory: swayger.category,
          counterDescription: swayger.description || "",
          counterStake: String(swayger.stake_units),
          counterOpponentUsername: creatorName,
        },
      } as never);
    } catch {
      showError("Failed to counter. Try again.");
      setCountering(false);
    }
  };

  // ─── Handle unauthenticated CTA ──────────────────────────────────────────
  async function handleSignInToAccept() {
    if (!code) return;
    await storePendingInvite({ code, intent: "accept" });
    router.replace("/auth");
  }

  async function handleSignInToDecline() {
    if (!code) return;
    await storePendingInvite({ code, intent: "view" });
    router.replace("/auth");
  }

  // ─── Loading states ───────────────────────────────────────────────────────
  if (!code) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.accentGold} />
        <Text style={styles.infoText}>No invite code provided.</Text>
        <Pressable onPress={() => router.replace("/(tabs)")}>
          <Text style={styles.linkText}>Go home</Text>
        </Pressable>
      </View>
    );
  }

  // Still checking auth state
  if (authLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
      </View>
    );
  }

  // ─── PREVIEW MODE (no session) ────────────────────────────────────────────
  if (!session) {
    if (previewLoading) {
      return (
        <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
          <Text style={styles.infoText}>Loading challenge...</Text>
        </View>
      );
    }

    if (!preview) {
      return (
        <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.accentGold} />
          <Text style={styles.infoText}>This invite isn't valid or has expired.</Text>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, { marginTop: 8 }, pressed && styles.btnPressed]}
            onPress={() => router.replace("/auth")}
          >
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </Pressable>
        </View>
      );
    }

    const creatorName = preview.creator_display_name || preview.creator_username || "Someone";

    return (
      <ScrollView
        style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Ionicons name="flash" size={22} color={Colors.dark.tint} />
          <Text style={styles.title}>You've Been Challenged</Text>
        </View>

        <View style={styles.challengerRow}>
          <View style={styles.challengerAvatar}>
            <Text style={styles.challengerInitial}>
              {creatorName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.challengerInfo}>
            <Text style={styles.challengerName}>{creatorName}</Text>
            <Text style={styles.challengerSub}>challenged you to a Swayger</Text>
          </View>
        </View>

        <View style={[styles.previewCard, isPicksChallenge && inviteStyles.picksCard]}>
          {isPicksChallenge && (
            <View style={inviteStyles.picksEyebrowRow}>
              <Text style={inviteStyles.picksEyebrow}>🎯 PICKS CHALLENGE</Text>
              <View style={inviteStyles.spBadge}>
                <Ionicons name="trophy-outline" size={11} color="#000" />
                <Text style={inviteStyles.spBadgeText}>{preview.stake_units} SP</Text>
              </View>
            </View>
          )}
          <Text style={styles.swaygerName}>{preview.title}</Text>
          {!isPicksChallenge && (
            <View style={styles.metaRow}>
              <View style={styles.chip}>
                <Ionicons
                  name={categoryIcon(preview.category) as keyof typeof Ionicons.glyphMap}
                  size={14}
                  color={Colors.dark.textSecondary}
                />
                <Text style={styles.chipText}>{preview.category}</Text>
              </View>
              <View style={[styles.chip, { backgroundColor: `${Colors.dark.accentGold}18` }]}>
                <Ionicons name="trophy-outline" size={12} color={Colors.dark.accentGold} />
                <Text style={[styles.chipText, { color: Colors.dark.accentGold }]}>
                  {preview.stake_units} SP on the line
                </Text>
              </View>
            </View>
          )}

          {isPicksChallenge ? (
            <Text style={styles.description}>
              {`${creatorName} thinks they'll out-pick you tonight. Whoever gets more NBA Playoff props correct wins ${preview.stake_units} SP.`}
            </Text>
          ) : preview.description ? (
            <Text style={styles.description}>{cleanDescription(preview.description)}</Text>
          ) : null}

          {isPicksChallenge && challengeNight && (
            <View style={inviteStyles.propsTeaser}>
              <Text style={inviteStyles.propsTeaserLabel}>Tonight's Props</Text>
              <View style={inviteStyles.propsGrid}>
                {challengeNight.props.filter(p => p.status !== "voided").slice(0, 4).map((prop) => (
                  <View key={prop.id} style={inviteStyles.propChip}>
                    <Text style={inviteStyles.propChipPlayer} numberOfLines={1}>{prop.player}</Text>
                    <Text style={inviteStyles.propChipLine}>{statLabel(prop.stat)} {prop.line}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {!isPicksChallenge && (
            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Their Pick</Text>
                <Text style={styles.detailValue}>{preview.creator_pick || "—"}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Stake</Text>
                <Text style={styles.detailValue}>{preview.stake_units} Swayger Points</Text>
              </View>
              {preview.expires_at ? (
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Expires</Text>
                  <Text style={styles.detailValue}>{formatDateTime(preview.expires_at)}</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {isPicksChallenge && isNightLocked ? (
          <View style={inviteStyles.lockedBox}>
            <Ionicons name="lock-closed" size={20} color={Colors.dark.textSecondary} />
            <Text style={inviteStyles.lockedTitle}>This challenge is closed</Text>
            <Text style={inviteStyles.lockedSub}>Picks locked at tip-off. This one's done.</Text>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, { marginTop: 8 }, pressed && styles.btnPressed]}
              onPress={() => router.replace("/auth")}
            >
              <Text style={styles.primaryButtonText}>Sign In to Swayger</Text>
            </Pressable>
          </View>
        ) : isPicksChallenge ? (
          <View style={inviteStyles.picksCta}>
            <View style={inviteStyles.stepsRow}>
              <View style={inviteStyles.stepItem}>
                <View style={inviteStyles.stepNum}><Text style={inviteStyles.stepNumText}>1</Text></View>
                <Text style={inviteStyles.stepLabel}>Lock in tonight's picks</Text>
              </View>
              <View style={inviteStyles.stepDivider} />
              <View style={inviteStyles.stepItem}>
                <View style={[inviteStyles.stepNum, inviteStyles.stepNumFaded]}><Text style={inviteStyles.stepNumText}>2</Text></View>
                <Text style={[inviteStyles.stepLabel, { color: Colors.dark.textSecondary }]}>Accept the challenge</Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [inviteStyles.makePicksBtn, pressed && { opacity: 0.85 }]}
              onPress={handleSignInToMakePicks}
            >
              <Ionicons name="basketball-outline" size={20} color="#000000" />
              <Text style={inviteStyles.makePicksBtnText}>Make Tonight's Picks →</Text>
            </Pressable>
            <Text style={inviteStyles.picksChallengeHint}>
              Sign in to compete — then come back to accept
            </Text>
          </View>
        ) : (
        <View style={styles.previewCta}>
          <Text style={styles.previewCtaHint}>Sign in to accept or decline this challenge</Text>
          <Pressable
            style={({ pressed }) => [styles.acceptButton, pressed && styles.btnPressed]}
            onPress={handleSignInToAccept}
          >
            <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
            <Text style={styles.acceptButtonText}>Accept Challenge</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.declineButton, pressed && styles.btnPressed]}
            onPress={handleSignInToDecline}
          >
            <Text style={styles.declineButtonText}>Decline</Text>
          </Pressable>
        </View>
        )}

        <View style={styles.brandFooter}>
          <Ionicons name="flash" size={14} color={Colors.dark.tabIconDefault} />
          <Text style={styles.brandFooterText}>Powered by Swayger — settle it for real.</Text>
        </View>
      </ScrollView>
    );
  }

  // ─── AUTHENTICATED MODE ───────────────────────────────────────────────────
  if (!joinedId && !joinMutation.isPending && !joinMutation.isSuccess) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
        <Text style={styles.infoText}>Looking up Swayger...</Text>
      </View>
    );
  }

  if (joinMutation.isPending || (joinedId && swaygerLoading)) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
        <Text style={styles.infoText}>Loading Swayger...</Text>
      </View>
    );
  }

  if (!swayger) {
    if (joinedId) {
      return (
        <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
          <Text style={styles.infoText}>Loading Swayger...</Text>
        </View>
      );
    }
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.accentGold} />
        <Text style={styles.infoText}>Swayger not found for code "{code}".</Text>
        <Pressable onPress={() => router.replace("/(tabs)")}>
          <Text style={styles.linkText}>Go home</Text>
        </Pressable>
      </View>
    );
  }

  const st = displayStatus(swayger.status);
  const creatorName = profiles?.creator?.display_name || profiles?.creator?.username || "Unknown";

  return (
    <KeyboardAvoidingView
      style={styles.kavWrapper}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        ref={scrollRef}
        style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.replace("/(tabs)")}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.title}>Swayger Invite</Text>
        </View>

        <View style={styles.previewCard}>
          <Text style={styles.swaygerName}>{swayger.title}</Text>
          <View style={styles.metaRow}>
            <View style={styles.chip}>
              <Ionicons
                name={categoryIcon(swayger.category) as keyof typeof Ionicons.glyphMap}
                size={14}
                color={Colors.dark.textSecondary}
              />
              <Text style={styles.chipText}>{swayger.category}</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: `${st.color}15` }]}>
              <Ionicons name="radio-button-on" size={10} color={st.color} />
              <Text style={[styles.chipText, { color: st.color }]}>{st.label}</Text>
            </View>
          </View>

          {swayger.description ? (
            <Text style={styles.description}>{cleanDescription(swayger.description)}</Text>
          ) : null}

          <View style={styles.detailsGrid}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Creator</Text>
              <Text style={styles.detailValue}>{creatorName}</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Stake</Text>
              <Text style={styles.detailValue}>{swayger.stake_units} Swayger Points</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Creator's Pick</Text>
              <Text style={styles.detailValue}>{swayger.creator_pick || "—"}</Text>
            </View>
            {swayger.expires_at ? (
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Expires</Text>
                <Text style={styles.detailValue}>{formatDateTime(swayger.expires_at)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {canAccept && isPicksChallenge && isNightLocked && (
          <View style={inviteStyles.lockedBox}>
            <Ionicons name="lock-closed" size={20} color={Colors.dark.textSecondary} />
            <Text style={inviteStyles.lockedTitle}>This challenge is closed</Text>
            <Text style={inviteStyles.lockedSub}>
              Picks locked at tip-off — you can't compete in this one.
            </Text>
          </View>
        )}

        {canAccept && isPicksChallenge && !isNightLocked && !hasPicksForNight && (
          <View style={inviteStyles.picksCta}>
            <Text style={inviteStyles.makePicksTitle}>First, lock in tonight's picks</Text>
            <Text style={inviteStyles.makePicksSub}>
              Come back here after to accept the challenge. Your picks determine the winner.
            </Text>
            {challengeNight && (
              <View style={inviteStyles.propsTeaser}>
                <Text style={inviteStyles.propsTeaserLabel}>Tonight's Props</Text>
                <View style={inviteStyles.propsGrid}>
                  {challengeNight.props.filter(p => p.status !== "voided").slice(0, 4).map((prop) => (
                    <View key={prop.id} style={inviteStyles.propChip}>
                      <Text style={inviteStyles.propChipPlayer} numberOfLines={1}>{prop.player}</Text>
                      <Text style={inviteStyles.propChipLine}>{statLabel(prop.stat)} {prop.line}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            <Pressable
              style={({ pressed }) => [inviteStyles.makePicksBtn, pressed && { opacity: 0.85 }]}
              onPress={handleGoMakePicks}
            >
              <Ionicons name="basketball-outline" size={20} color="#000000" />
              <Text style={inviteStyles.makePicksBtnText}>Make Tonight's Picks →</Text>
            </Pressable>
          </View>
        )}

        {canAccept && (!isPicksChallenge || (isPicksChallenge && !isNightLocked && hasPicksForNight)) && (
          <View style={styles.acceptSection}>
            {isPicksChallenge && (
              <View style={inviteStyles.picksReadyBanner}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.dark.success} />
                <Text style={inviteStyles.picksReadyText}>Your picks are in — ready to accept!</Text>
              </View>
            )}
            <Text style={styles.acceptTitle}>{isPicksChallenge ? "Confirm your entry" : "Enter Your Pick"}</Text>
            <Text style={styles.acceptSubtitle}>{isPicksChallenge ? "Your pick is pre-filled — just tap Accept." : "What's your prediction?"}</Text>
            <TextInput
              style={styles.pickInput}
              placeholder="e.g. Chiefs win by 3+"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={opponentPick}
              onChangeText={setOpponentPick}
              editable={!anyPending && !isPicksChallenge}
              maxLength={200}
              onFocus={() => {
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
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

        {swayger.opponent_id && !canAccept && !isCreator && (
          <View style={styles.acceptSection}>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.btnPressed]}
              onPress={() => router.replace(`/swayger/${joinedId}`)}
            >
              <Ionicons name="open-outline" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>View Swayger</Text>
            </Pressable>
          </View>
        )}

        {isCreator && (
          <View style={styles.acceptSection}>
            <Text style={styles.infoText}>This is your Swayger. Share the code with an opponent!</Text>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.btnPressed]}
              onPress={() => router.replace(`/swayger/${joinedId}`)}
            >
              <Text style={styles.primaryButtonText}>View Details</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  kavWrapper: { flex: 1, backgroundColor: Colors.dark.background },
  container: { flex: 1, backgroundColor: Colors.dark.background },
  scrollContent: { paddingBottom: 140 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 40 },

  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 24 },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.surface,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontFamily: "BarlowCondensed_800ExtraBold", fontSize: 26, color: Colors.dark.text, letterSpacing: 0.5 },

  challengerRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    marginHorizontal: 24, marginBottom: 20,
  },
  challengerAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.dark.accent,
    alignItems: "center", justifyContent: "center",
  },
  challengerInitial: { fontFamily: "BarlowCondensed_800ExtraBold", fontSize: 22, color: "#FFFFFF" },
  challengerInfo: { flex: 1 },
  challengerName: { fontFamily: "BarlowCondensed_800ExtraBold", fontSize: 18, color: Colors.dark.text },
  challengerSub: { fontFamily: "DMSans_400Regular", fontSize: 13, color: Colors.dark.textSecondary, marginTop: 2 },

  previewCard: {
    marginHorizontal: 24, backgroundColor: Colors.dark.surface, borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: Colors.dark.border, gap: 14,
  },
  swaygerName: { fontFamily: "BarlowCondensed_800ExtraBold", fontSize: 22, color: Colors.dark.text, letterSpacing: 0.3 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.dark.surfaceLight,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  chipText: { fontFamily: "DMSans_500Medium", fontSize: 13, color: Colors.dark.textSecondary },
  description: { fontFamily: "DMSans_400Regular", fontSize: 14, color: Colors.dark.textSecondary, lineHeight: 20 },
  detailsGrid: { gap: 10 },
  detailItem: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  detailLabel: { fontFamily: "DMSans_500Medium", fontSize: 13, color: Colors.dark.tabIconDefault },
  detailValue: { fontFamily: "DMSans_500Medium", fontSize: 14, color: Colors.dark.text, textAlign: "right", flex: 1, marginLeft: 12 },

  previewCta: { paddingHorizontal: 24, marginTop: 28, gap: 12 },
  previewCtaHint: {
    fontFamily: "DMSans_400Regular", fontSize: 13, color: Colors.dark.tabIconDefault,
    textAlign: "center", marginBottom: 4,
  },

  acceptSection: { paddingHorizontal: 24, marginTop: 24, gap: 12 },
  acceptTitle: { fontFamily: "BarlowCondensed_800ExtraBold", fontSize: 20, color: Colors.dark.text },
  acceptSubtitle: { fontFamily: "DMSans_400Regular", fontSize: 14, color: Colors.dark.textSecondary },
  pickInput: {
    fontFamily: "DMSans_400Regular",
    backgroundColor: Colors.dark.surface, borderWidth: 1, borderColor: Colors.dark.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: Colors.dark.text,
  },
  actionRow: { flexDirection: "row", gap: 12 },
  acceptButton: {
    flex: 2, backgroundColor: "#22C55E", flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 12,
  },
  acceptButtonText: { fontFamily: "BarlowCondensed_800ExtraBold", color: "#FFFFFF", fontSize: 18, letterSpacing: 1 },
  declineButton: {
    flex: 1, borderWidth: 1, borderColor: "#EF4444", alignItems: "center",
    justifyContent: "center", paddingVertical: 16, borderRadius: 12,
  },
  declineButtonText: { fontFamily: "DMSans_500Medium", color: "#EF4444", fontSize: 15 },
  btnPressed: { opacity: 0.8 },
  btnDisabled: { opacity: 0.5 },
  counterOfferButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.dark.tint, backgroundColor: "transparent",
  },
  counterOfferText: { fontFamily: "DMSans_500Medium", color: Colors.dark.tint, fontSize: 14 },

  primaryButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.dark.accent, paddingVertical: 16, borderRadius: 12, width: "100%",
  },
  primaryButtonText: { fontFamily: "BarlowCondensed_800ExtraBold", color: "#FFFFFF", fontSize: 18, letterSpacing: 1 },

  infoText: { fontFamily: "DMSans_400Regular", fontSize: 15, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 22 },
  linkText: { fontFamily: "DMSans_500Medium", color: Colors.dark.tint, fontSize: 14 },

  brandFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, marginTop: 32, marginBottom: 8, opacity: 0.5,
  },
  brandFooterText: { fontFamily: "DMSans_400Regular", fontSize: 12, color: Colors.dark.tabIconDefault },
});

const NBA_GOLD = "#FFC72C";

const inviteStyles = StyleSheet.create({
  picksCard: {
    borderColor: NBA_GOLD,
    borderWidth: 1.5,
    backgroundColor: "rgba(255,199,44,0.05)",
  },
  picksEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  picksEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: NBA_GOLD,
    letterSpacing: 1.2,
  },
  spBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: NBA_GOLD,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  spBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#000000",
  },
  propsTeaser: {
    marginTop: 12,
    gap: 8,
  },
  propsTeaserLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  propsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  propChip: {
    width: "47%",
    backgroundColor: Colors.dark.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 10,
    gap: 3,
  },
  propChipPlayer: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  propChipLine: {
    fontSize: 12,
    color: NBA_GOLD,
    fontWeight: "600",
  },
  lockedBox: {
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  lockedTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  lockedSub: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  picksCta: {
    gap: 14,
    marginBottom: 16,
  },
  stepsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  stepItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: NBA_GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumFaded: {
    backgroundColor: Colors.dark.border,
  },
  stepNumText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#000000",
  },
  stepDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.dark.border,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  makePicksBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: NBA_GOLD,
    borderRadius: 14,
    paddingVertical: 16,
  },
  makePicksBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#000000",
  },
  makePicksTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  makePicksSub: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  picksChallengeHint: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  picksReadyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16,185,129,0.1)",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.dark.success,
  },
  picksReadyText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.success,
  },
});
