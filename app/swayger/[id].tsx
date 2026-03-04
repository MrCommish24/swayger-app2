import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import {
  fetchSwayger,
  fetchSwaygerLegs,
  fetchSwaygerResponses,
  fetchSwaygerParticipants,
  acceptSwayger,
  declineSwayger,
  cancelSwayger,
  joinSwaygerByCode,
  displayRole,
  displayStatus,
  displayMarketType,
} from "@/lib/swayger";
import { useAuth } from "@/lib/auth-context";
import { showError } from "@/lib/helpers";
import {
  SwaygerData,
  SwaygerLeg,
  SwaygerResponse,
  SwaygerParticipantWithProfile,
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

function InviteSection({ inviteCode }: { inviteCode: string }) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  async function handleCopyCode() {
    await Clipboard.setStringAsync(inviteCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  async function handleCopyLink() {
    const link =
      Platform.OS === "web"
        ? window.location.href
        : `swayger://invite/${inviteCode}`;
    await Clipboard.setStringAsync(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Invite</Text>
      <View style={styles.inviteRow}>
        <Text style={styles.inviteCode}>{inviteCode}</Text>
        <View style={styles.inviteButtons}>
          <Pressable
            style={({ pressed }) => [
              styles.copyButton,
              pressed && styles.copyButtonPressed,
            ]}
            onPress={handleCopyCode}
          >
            <Ionicons
              name={codeCopied ? "checkmark" : "copy-outline"}
              size={16}
              color={codeCopied ? "#22C55E" : Colors.dark.tint}
            />
            <Text
              style={[styles.copyText, codeCopied && { color: "#22C55E" }]}
            >
              {codeCopied ? "Copied" : "Copy code"}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.copyButton,
              pressed && styles.copyButtonPressed,
            ]}
            onPress={handleCopyLink}
          >
            <Ionicons
              name={linkCopied ? "checkmark" : "link-outline"}
              size={16}
              color={linkCopied ? "#22C55E" : Colors.dark.tint}
            />
            <Text
              style={[styles.copyText, linkCopied && { color: "#22C55E" }]}
            >
              {linkCopied ? "Copied" : "Copy link"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function LegItem({ leg, index }: { leg: SwaygerLeg; index: number }) {
  return (
    <View style={styles.legCard}>
      <View style={styles.legHeader}>
        <Text style={styles.legNumber}>Leg {index + 1}</Text>
        <View style={styles.legMarketBadge}>
          <Text style={styles.legMarketText}>
            {displayMarketType(leg.market_type)}
          </Text>
        </View>
      </View>
      <Text style={styles.legSelection}>{leg.selection}</Text>
      {(leg.line || leg.odds) && (
        <View style={styles.legDetails}>
          {leg.line && (
            <View style={styles.legDetailChip}>
              <Text style={styles.legDetailLabel}>Line</Text>
              <Text style={styles.legDetailValue}>{leg.line}</Text>
            </View>
          )}
          {leg.odds && (
            <View style={styles.legDetailChip}>
              <Text style={styles.legDetailLabel}>Odds</Text>
              <Text style={styles.legDetailValue}>{leg.odds}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function ParticipantItem({
  member,
  responses,
}: {
  member: SwaygerParticipantWithProfile;
  responses: SwaygerResponse[];
}) {
  const profile = member.profiles;
  const displayName = profile?.display_name || profile?.username || "Unknown";
  const isCreator = member.role === "owner";

  const userResponse = responses.find((r) => r.user_id === member.user_id);
  let roleLabel = displayRole(member.role);
  if (userResponse?.response === "accepted" && !isCreator) {
    roleLabel = "Challenger";
  }

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
      <View
        style={[
          styles.memberRoleBadge,
          isCreator && styles.memberRoleBadgeCreator,
          userResponse?.response === "accepted" &&
            !isCreator &&
            styles.memberRoleBadgeChallenger,
          userResponse?.response === "declined" &&
            styles.memberRoleBadgeDeclined,
        ]}
      >
        <Text
          style={[
            styles.memberRoleText,
            isCreator && styles.memberRoleTextCreator,
            userResponse?.response === "accepted" &&
              !isCreator &&
              styles.memberRoleTextChallenger,
            userResponse?.response === "declined" &&
              styles.memberRoleTextDeclined,
          ]}
        >
          {userResponse?.response === "declined" ? "Declined" : roleLabel}
        </Text>
      </View>
    </View>
  );
}

export default function SwaygerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: swayger, isLoading: swaygerLoading } = useQuery<SwaygerData | null>({
    queryKey: ["swayger", id],
    queryFn: () => fetchSwayger(id!),
    enabled: !!id,
  });

  const { data: legs = [], isLoading: legsLoading } = useQuery<SwaygerLeg[]>({
    queryKey: ["swayger-legs", id],
    queryFn: () => fetchSwaygerLegs(id!),
    enabled: !!id,
  });

  const { data: responses = [] } = useQuery<SwaygerResponse[]>({
    queryKey: ["swayger-responses", id],
    queryFn: () => fetchSwaygerResponses(id!),
    enabled: !!id,
  });

  const { data: participants = [], isLoading: participantsLoading } =
    useQuery<SwaygerParticipantWithProfile[]>({
      queryKey: ["swayger-participants", id],
      queryFn: () => fetchSwaygerParticipants(id!),
      enabled: !!id,
    });

  const isCreator = swayger?.owner_id === user?.id;
  const isMember = participants.some((p) => p.user_id === user?.id);
  const status = swayger?.status || "open";
  const myResponse = responses.find((r) => r.user_id === user?.id);
  const canAcceptDecline =
    !isCreator && isMember && status === "open" && !myResponse;
  const canJoin = !isMember && !isCreator && !!swayger;
  const canCancel = isCreator && (status === "open" || status === "draft");

  const joinMutation = useMutation({
    mutationFn: () => joinSwaygerByCode(swayger!.invite_code, user!.id),
    onSuccess: (result) => {
      if (result.error) {
        showError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["swayger-participants", id] });
    },
    onError: () => showError("Failed to join. Try again."),
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptSwayger(id!),
    onSuccess: (result) => {
      if (result.error) {
        showError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["swayger", id] });
      queryClient.invalidateQueries({ queryKey: ["swayger-responses", id] });
      queryClient.invalidateQueries({ queryKey: ["swaygers"] });
    },
    onError: () => showError("Failed to accept. Try again."),
  });

  const declineMutation = useMutation({
    mutationFn: () => declineSwayger(id!),
    onSuccess: (result) => {
      if (result.error) {
        showError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["swayger-responses", id] });
    },
    onError: () => showError("Failed to decline. Try again."),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelSwayger(id!),
    onSuccess: (result) => {
      if (result.error) {
        showError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["swayger", id] });
      queryClient.invalidateQueries({ queryKey: ["swaygers"] });
    },
    onError: () => showError("Failed to cancel. Try again."),
  });

  const anyMutationPending =
    joinMutation.isPending ||
    acceptMutation.isPending ||
    declineMutation.isPending ||
    cancelMutation.isPending;

  if (swaygerLoading) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { paddingTop: isWeb ? 67 : insets.top },
        ]}
      >
        <ActivityIndicator size="large" color={Colors.dark.tint} />
      </View>
    );
  }

  if (!swayger) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { paddingTop: isWeb ? 67 : insets.top },
        ]}
      >
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={Colors.dark.accentGold}
        />
        <Text style={styles.errorText}>Swayger not found.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.linkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerSection}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.swaygerTitle}>{swayger.name}</Text>
          <View style={styles.headerMeta}>
            <View style={styles.metaChip}>
              <Ionicons
                name="american-football-outline"
                size={14}
                color={Colors.dark.textSecondary}
              />
              <Text style={styles.metaText}>
                {swayger.scoring_type || "NFL"}
              </Text>
            </View>
            <StatusChip status={status} />
            {isCreator && (
              <View style={[styles.metaChip, styles.creatorChip]}>
                <Ionicons
                  name="flash"
                  size={14}
                  color={Colors.dark.accentGold}
                />
                <Text
                  style={[styles.metaText, { color: Colors.dark.accentGold }]}
                >
                  Creator
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {swayger.stake_text && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stake</Text>
          <View style={styles.stakeCard}>
            <Ionicons
              name="flame-outline"
              size={18}
              color={Colors.dark.accentGold}
            />
            <Text style={styles.stakeText}>{swayger.stake_text}</Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Picks</Text>
          <Text style={styles.participantCount}>
            {legs.length} leg{legs.length !== 1 ? "s" : ""}
          </Text>
        </View>
        {legsLoading ? (
          <ActivityIndicator
            color={Colors.dark.tint}
            style={{ marginVertical: 20 }}
          />
        ) : legs.length === 0 ? (
          <Text style={styles.emptyText}>No picks added yet.</Text>
        ) : (
          <View style={styles.legsList}>
            {legs.map((leg, i) => (
              <LegItem key={leg.id} leg={leg} index={i} />
            ))}
          </View>
        )}
      </View>

      {canJoin && status === "open" && (
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [
              styles.acceptButton,
              pressed && styles.btnPressed,
              anyMutationPending && styles.btnDisabled,
            ]}
            onPress={() => joinMutation.mutate()}
            disabled={anyMutationPending}
          >
            {joinMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="enter-outline" size={20} color="#FFFFFF" />
                <Text style={styles.acceptButtonText}>Join this Swayger</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      {(canAcceptDecline || myResponse?.response === "declined") && (
        <View style={styles.section}>
          {myResponse?.response === "declined" ? (
            <View style={styles.declinedBanner}>
              <Ionicons name="close-circle" size={18} color="#EF4444" />
              <Text style={styles.declinedText}>
                You declined this Swayger
              </Text>
            </View>
          ) : (
            <View style={styles.actionRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.acceptButton,
                  pressed && styles.btnPressed,
                  anyMutationPending && styles.btnDisabled,
                ]}
                onPress={() => acceptMutation.mutate()}
                disabled={anyMutationPending}
              >
                {acceptMutation.isPending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color="#FFFFFF"
                    />
                    <Text style={styles.acceptButtonText}>
                      Accept Swayger
                    </Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.declineButton,
                  pressed && styles.btnPressed,
                  anyMutationPending && styles.btnDisabled,
                ]}
                onPress={() => declineMutation.mutate()}
                disabled={anyMutationPending}
              >
                {declineMutation.isPending ? (
                  <ActivityIndicator color="#EF4444" size="small" />
                ) : (
                  <Text style={styles.declineButtonText}>Decline</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
      )}

      {canCancel && (
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.btnPressed,
              anyMutationPending && styles.btnDisabled,
            ]}
            onPress={() => cancelMutation.mutate()}
            disabled={anyMutationPending}
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

      <InviteSection inviteCode={swayger.invite_code} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Participants</Text>
          <Text style={styles.participantCount}>{participants.length}</Text>
        </View>
        {participantsLoading ? (
          <ActivityIndicator
            color={Colors.dark.tint}
            style={{ marginVertical: 20 }}
          />
        ) : participants.length === 0 ? (
          <Text style={styles.emptyText}>No participants yet.</Text>
        ) : (
          <View style={styles.participantsList}>
            {participants.map((p) => (
              <ParticipantItem
                key={p.id}
                member={p}
                responses={responses}
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
  linkText: {
    color: Colors.dark.tint,
    fontSize: 14,
  },
  headerSection: {
    padding: 24,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  headerContent: {
    flex: 1,
    gap: 8,
  },
  swaygerTitle: {
    fontSize: 26,
    fontWeight: "bold" as const,
    color: Colors.dark.text,
  },
  headerMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  creatorChip: {
    backgroundColor: "rgba(245, 166, 35, 0.1)",
  },
  metaText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  participantCount: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
    marginBottom: 12,
  },
  stakeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(245, 166, 35, 0.08)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.2)",
  },
  stakeText: {
    fontSize: 15,
    color: Colors.dark.accentGold,
    fontWeight: "500" as const,
    flex: 1,
  },
  legsList: {
    gap: 10,
  },
  legCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 8,
  },
  legHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  legNumber: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.dark.tint,
  },
  legMarketBadge: {
    backgroundColor: Colors.dark.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  legMarketText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontWeight: "500" as const,
  },
  legSelection: {
    fontSize: 16,
    fontWeight: "500" as const,
    color: Colors.dark.text,
  },
  legDetails: {
    flexDirection: "row",
    gap: 12,
  },
  legDetailChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legDetailLabel: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
  },
  legDetailValue: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  acceptButton: {
    flex: 2,
    backgroundColor: "#22C55E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  acceptButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600" as const,
  },
  declineButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
  },
  declineButtonText: {
    color: "#EF4444",
    fontSize: 15,
    fontWeight: "600" as const,
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  cancelButtonText: {
    color: "#EF4444",
    fontSize: 15,
    fontWeight: "600" as const,
  },
  btnPressed: {
    opacity: 0.8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  declinedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 12,
    padding: 14,
  },
  declinedText: {
    color: "#EF4444",
    fontSize: 14,
    fontWeight: "500" as const,
  },
  inviteRow: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 12,
  },
  inviteCode: {
    fontSize: 28,
    fontWeight: "bold" as const,
    color: Colors.dark.tint,
    letterSpacing: 6,
    textAlign: "center",
  },
  inviteButtons: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.surfaceLight,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  copyButtonPressed: {
    opacity: 0.7,
  },
  copyText: {
    fontSize: 13,
    color: Colors.dark.tint,
    fontWeight: "500" as const,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
  },
  participantsList: {
    gap: 8,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderRadius: 10,
    padding: 12,
    gap: 12,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInitial: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.dark.tint,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "500" as const,
    color: Colors.dark.text,
  },
  memberUsername: {
    fontSize: 13,
    color: Colors.dark.tabIconDefault,
  },
  memberRoleBadge: {
    backgroundColor: Colors.dark.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  memberRoleBadgeCreator: {
    backgroundColor: "rgba(245, 166, 35, 0.15)",
  },
  memberRoleBadgeChallenger: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
  },
  memberRoleBadgeDeclined: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  memberRoleText: {
    fontSize: 12,
    color: Colors.dark.tint,
    fontWeight: "600" as const,
  },
  memberRoleTextCreator: {
    color: Colors.dark.accentGold,
  },
  memberRoleTextChallenger: {
    color: "#3B82F6",
  },
  memberRoleTextDeclined: {
    color: "#EF4444",
  },
});
