import { useState, useRef } from "react";
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
import { SwaygerData } from "@/types";
import Colors from "@/constants/colors";

export default function InviteScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [opponentPick, setOpponentPick] = useState("");
  const [joinedId, setJoinedId] = useState<string | null>(null);
  const [countering, setCountering] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const joinMutation = useMutation({
    mutationFn: () => {
      if (!code || !user) throw new Error("Missing code or user");
      return joinSwaygerByCode(code, user.id);
    },
    onSuccess: async (result) => {
      if (result.error) {
        showError(result.error);
        return;
      }
      if (result.swaygerId) {
        setJoinedId(result.swaygerId);
        queryClient.invalidateQueries({ queryKey: ["swaygers"] });
        const joined = await fetchSwayger(result.swaygerId);
        if (joined && joined.creator_id !== user?.id) {
          sendPushNotification(
            joined.creator_id,
            "Someone joined your Swayger! 👋",
            `Your Swayger "${joined.title}" has a challenger. Review and accept!`,
            { swayger_id: result.swaygerId }
          );
        }
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

  const isCreator = swayger?.creator_id === user?.id;
  const isOpponent = swayger?.opponent_id === user?.id;
  const canAccept = swayger && !isCreator && isOpponent && swayger.status === "pending_invite";

  const acceptMutation = useMutation({
    mutationFn: () => acceptSwayger(joinedId!, opponentPick, user?.id),
    onSuccess: (result) => {
      if (result.error) {
        showError(result.error);
        return;
      }
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
      if (result.error) {
        showError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["swaygers"] });
      if (swayger) {
        sendPushNotification(
          swayger.creator_id,
          "Invite declined",
          `Your Swayger "${swayger.title}" was declined.`,
          { swayger_id: swayger.id }
        );
      }
      router.back();
    },
    onError: () => showError("Failed to decline. Try again."),
  });

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

  if (!code || !user) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.accentGold} />
        <Text style={styles.infoText}>{!code ? "No invite code provided." : "Please sign in first."}</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.linkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!joinedId && !joinMutation.isPending && !joinMutation.isSuccess) {
    return (
      <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.title}>Join Swayger</Text>
        </View>
        <View style={styles.centered}>
          <Ionicons name="enter-outline" size={48} color={Colors.dark.tint} />
          <Text style={styles.codeDisplay}>{code}</Text>
          <Text style={styles.infoText}>Join this Swayger to see details and accept the wager.</Text>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.btnPressed]}
            onPress={() => joinMutation.mutate()}
          >
            <Ionicons name="enter-outline" size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Join Swayger</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (joinMutation.isPending || (joinedId && swaygerLoading)) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
        <Text style={styles.infoText}>Looking up Swayger...</Text>
      </View>
    );
  }

  if (!swayger) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.accentGold} />
        <Text style={styles.infoText}>Swayger not found for code "{code}".</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.linkText}>Go back</Text>
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
        <Pressable style={styles.backButton} onPress={() => router.back()}>
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

        {swayger.description && (
          <Text style={styles.description}>{swayger.description}</Text>
        )}

        <View style={styles.detailsGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Creator</Text>
            <Text style={styles.detailValue}>{creatorName}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Stake</Text>
            <Text style={styles.detailValue}>
              {swayger.stake_units} unit{swayger.stake_units !== 1 ? "s" : ""}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Creator's Pick</Text>
            <Text style={styles.detailValue}>{swayger.creator_pick || "—"}</Text>
          </View>
          {swayger.expires_at && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Expires</Text>
              <Text style={styles.detailValue}>{formatDateTime(swayger.expires_at)}</Text>
            </View>
          )}
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

      {swayger.opponent_id && !canAccept && (
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
  title: { fontSize: 24, fontWeight: "bold" as const, color: Colors.dark.text },
  codeDisplay: {
    fontSize: 32, fontWeight: "bold" as const, color: Colors.dark.tint, letterSpacing: 8,
  },
  infoText: { fontSize: 15, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 22 },
  linkText: { color: Colors.dark.tint, fontSize: 14 },
  primaryButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.dark.accent, paddingVertical: 16, borderRadius: 12, width: "100%",
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" as const },
  previewCard: {
    marginHorizontal: 24, backgroundColor: Colors.dark.surface, borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: Colors.dark.border, gap: 14,
  },
  swaygerName: { fontSize: 22, fontWeight: "bold" as const, color: Colors.dark.text },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.dark.surfaceLight,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  chipText: { fontSize: 13, color: Colors.dark.textSecondary },
  description: { fontSize: 14, color: Colors.dark.textSecondary, lineHeight: 20 },
  detailsGrid: { gap: 10 },
  detailItem: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  detailLabel: { fontSize: 13, color: Colors.dark.tabIconDefault, fontWeight: "500" as const },
  detailValue: { fontSize: 14, color: Colors.dark.text, fontWeight: "600" as const, textAlign: "right", flex: 1, marginLeft: 12 },
  acceptSection: { paddingHorizontal: 24, marginTop: 24, gap: 12 },
  acceptTitle: { fontSize: 18, fontWeight: "bold" as const, color: Colors.dark.text },
  acceptSubtitle: { fontSize: 14, color: Colors.dark.textSecondary },
  pickInput: {
    backgroundColor: Colors.dark.surface, borderWidth: 1, borderColor: Colors.dark.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: Colors.dark.text,
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
  btnPressed: { opacity: 0.8 },
  btnDisabled: { opacity: 0.5 },
  counterOfferButton: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const,
    gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.dark.tint, backgroundColor: "transparent",
  },
  counterOfferText: { color: Colors.dark.tint, fontSize: 14, fontWeight: "600" as const },
});
