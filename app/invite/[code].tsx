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
import { storePendingInvite, consumePendingInvite } from "@/lib/pending-invite";
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

        <View style={styles.previewCard}>
          <Text style={styles.swaygerName}>{preview.title}</Text>
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

          {preview.description ? (
            <Text style={styles.description}>{preview.description}</Text>
          ) : null}

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
        </View>

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
            <Text style={styles.description}>{swayger.description}</Text>
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

        {canAccept && (
          <View style={styles.acceptSection}>
            <Text style={styles.acceptTitle}>Enter Your Pick</Text>
            <Text style={styles.acceptSubtitle}>What's your prediction?</Text>
            <TextInput
              style={styles.pickInput}
              placeholder="e.g. Chiefs win by 3+"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={opponentPick}
              onChangeText={setOpponentPick}
              editable={!anyPending}
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
