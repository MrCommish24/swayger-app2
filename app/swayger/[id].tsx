import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import {
  fetchSwayger,
  fetchSwaygerParticipants,
  fetchSettlementProposals,
  acceptSwayger,
  declineSwayger,
  cancelSwayger,
  proposeSettlement,
  confirmSettlement,
  createRematch,
  joinSwaygerByCode,
  displayStatus,
  displayOutcome,
  categoryIcon,
} from "@/lib/swayger";
import { useAuth } from "@/lib/auth-context";
import { showError, showMessage, formatDateTime } from "@/lib/helpers";
import {
  SwaygerData,
  SwaygerParticipantWithProfile,
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
      <Text style={styles.sectionTitle}>Invite Opponent</Text>
      <View style={styles.inviteRow}>
        <Text style={styles.inviteCode}>{inviteCode}</Text>
        <View style={styles.inviteButtons}>
          <Pressable
            style={({ pressed }) => [styles.copyButton, pressed && styles.btnPressed]}
            onPress={handleCopyCode}
          >
            <Ionicons
              name={codeCopied ? "checkmark" : "copy-outline"}
              size={16}
              color={codeCopied ? "#22C55E" : Colors.dark.tint}
            />
            <Text style={[styles.copyText, codeCopied && { color: "#22C55E" }]}>
              {codeCopied ? "Copied" : "Copy code"}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.copyButton, pressed && styles.btnPressed]}
            onPress={handleCopyLink}
          >
            <Ionicons
              name={linkCopied ? "checkmark" : "link-outline"}
              size={16}
              color={linkCopied ? "#22C55E" : Colors.dark.tint}
            />
            <Text style={[styles.copyText, linkCopied && { color: "#22C55E" }]}>
              {linkCopied ? "Copied" : "Copy link"}
            </Text>
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

function ParticipantItem({ member }: { member: SwaygerParticipantWithProfile }) {
  const profile = member.profiles;
  const displayName = profile?.display_name || profile?.username || "Unknown";
  const isCreator = member.role === "owner";

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
      <View style={[styles.memberRoleBadge, isCreator && styles.memberRoleBadgeCreator]}>
        <Text style={[styles.memberRoleText, isCreator && styles.memberRoleTextCreator]}>
          {isCreator ? "Creator" : "Opponent"}
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
  proposing,
  confirming,
}: {
  swayger: SwaygerData;
  proposals: SettlementProposal[];
  isCreator: boolean;
  userId: string;
  onPropose: (outcome: string) => void;
  onConfirm: (proposalId: string) => void;
  proposing: boolean;
  confirming: boolean;
}) {
  const outcomes = [
    { value: "creator", label: "Creator Wins", icon: "trophy" as const },
    { value: "opponent", label: "Opponent Wins", icon: "trophy-outline" as const },
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
            {displayOutcome(latestProposal.outcome)}
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
            <Pressable
              style={({ pressed }) => [
                styles.confirmButton,
                pressed && styles.btnPressed,
                confirming && styles.btnDisabled,
              ]}
              onPress={() => onConfirm(latestProposal.id)}
              disabled={confirming}
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
          )}

          {iProposed && (
            <Text style={styles.waitingText}>Waiting for opponent to confirm...</Text>
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

export default function SwaygerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [opponentPick, setOpponentPick] = useState("");

  const { data: swayger, isLoading: swaygerLoading } = useQuery<SwaygerData | null>({
    queryKey: ["swayger", id],
    queryFn: () => fetchSwayger(id!),
    enabled: !!id,
  });

  const { data: participants = [], isLoading: participantsLoading } =
    useQuery<SwaygerParticipantWithProfile[]>({
      queryKey: ["swayger-participants", id],
      queryFn: () => fetchSwaygerParticipants(id!),
      enabled: !!id,
    });

  const { data: proposals = [] } = useQuery<SettlementProposal[]>({
    queryKey: ["settlement-proposals", id],
    queryFn: () => fetchSettlementProposals(id!),
    enabled: !!id && (swayger?.status === "active" || swayger?.status === "settlement_proposed" || swayger?.status === "settled"),
  });

  const isCreator = swayger?.owner_id === user?.id;
  const isMember = participants.some((p) => p.user_id === user?.id);
  const status = swayger?.status || "pending_invite";
  const canAccept = !isCreator && isMember && status === "pending_invite" && !swayger?.opponent_id;
  const canJoin = !isMember && !isCreator && !!swayger && status === "pending_invite";
  const canCancel = isCreator && !["settled", "canceled", "declined"].includes(status);
  const canSettle = (status === "active" || status === "settlement_proposed") &&
    (isCreator || swayger?.opponent_id === user?.id);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["swayger", id] });
    queryClient.invalidateQueries({ queryKey: ["swayger-participants", id] });
    queryClient.invalidateQueries({ queryKey: ["settlement-proposals", id] });
    queryClient.invalidateQueries({ queryKey: ["swaygers"] });
  }

  const joinMutation = useMutation({
    mutationFn: () => joinSwaygerByCode(swayger!.invite_code, user!.id),
    onSuccess: (result) => {
      if (result.error) { showError(result.error); return; }
      invalidateAll();
    },
    onError: () => showError("Failed to join. Try again."),
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptSwayger(id!, opponentPick),
    onSuccess: (result) => {
      if (result.error) { showError(result.error); return; }
      setOpponentPick("");
      invalidateAll();
      showMessage("Accepted!", "The Swayger is now active. Good luck!");
    },
    onError: () => showError("Failed to accept. Try again."),
  });

  const declineMutation = useMutation({
    mutationFn: () => declineSwayger(id!),
    onSuccess: (result) => {
      if (result.error) { showError(result.error); return; }
      invalidateAll();
    },
    onError: () => showError("Failed to decline. Try again."),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelSwayger(id!),
    onSuccess: (result) => {
      if (result.error) { showError(result.error); return; }
      invalidateAll();
    },
    onError: () => showError("Failed to cancel. Try again."),
  });

  const proposeMutation = useMutation({
    mutationFn: (outcome: string) => proposeSettlement(id!, outcome),
    onSuccess: (result) => {
      if (result.error) { showError(result.error); return; }
      invalidateAll();
    },
    onError: () => showError("Failed to propose. Try again."),
  });

  const confirmMutation = useMutation({
    mutationFn: (proposalId: string) => confirmSettlement(id!, proposalId),
    onSuccess: (result) => {
      if (result.error) { showError(result.error); return; }
      invalidateAll();
      if (result.settled) {
        showMessage("Settled!", "This Swayger has been settled.");
      }
    },
    onError: () => showError("Failed to confirm. Try again."),
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

  const anyPending =
    joinMutation.isPending || acceptMutation.isPending || declineMutation.isPending ||
    cancelMutation.isPending || proposeMutation.isPending || confirmMutation.isPending ||
    rematchMutation.isPending;

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
          </View>
        </View>
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
            {swayger.stake_units || 1} unit{(swayger.stake_units || 1) !== 1 ? "s" : ""} at stake
          </Text>
        </View>
        {swayger.expires_at && (
          <View style={styles.expiryRow}>
            <Ionicons name="time-outline" size={14} color={Colors.dark.tabIconDefault} />
            <Text style={styles.expiryText}>Expires {formatDateTime(swayger.expires_at)}</Text>
          </View>
        )}
        {swayger.rematch_type && (
          <View style={styles.rematchBadge}>
            <Ionicons name="refresh" size={14} color={Colors.dark.tint} />
            <Text style={styles.rematchText}>
              {swayger.rematch_type === "double_or_nothing" ? "Double or Nothing" : "Run it Back"}
            </Text>
          </View>
        )}
      </View>

      {status === "settled" && swayger.settled_outcome && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Result</Text>
          <View style={styles.resultCard}>
            <Ionicons name="trophy" size={24} color={Colors.dark.accentGold} />
            <Text style={styles.resultText}>{displayOutcome(swayger.settled_outcome)}</Text>
          </View>
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
        </View>
      )}

      {canJoin && (
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [
              styles.acceptButton,
              pressed && styles.btnPressed,
              anyPending && styles.btnDisabled,
            ]}
            onPress={() => joinMutation.mutate()}
            disabled={anyPending}
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

      {canSettle && (
        <SettlementSection
          swayger={swayger}
          proposals={proposals}
          isCreator={isCreator}
          userId={user!.id}
          onPropose={(outcome) => proposeMutation.mutate(outcome)}
          onConfirm={(proposalId) => confirmMutation.mutate(proposalId)}
          proposing={proposeMutation.isPending}
          confirming={confirmMutation.isPending}
        />
      )}

      {status === "settled" && isCreator && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rematch</Text>
          <View style={styles.rematchRow}>
            <Pressable
              style={({ pressed }) => [
                styles.rematchButton,
                pressed && styles.btnPressed,
                anyPending && styles.btnDisabled,
              ]}
              onPress={() => rematchMutation.mutate("run_it_back")}
              disabled={anyPending}
            >
              <Ionicons name="refresh" size={18} color={Colors.dark.tint} />
              <Text style={styles.rematchButtonText}>Run it Back</Text>
              <Text style={styles.rematchStake}>{swayger.stake_units} units</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.rematchButton,
                styles.rematchButtonDouble,
                pressed && styles.btnPressed,
                anyPending && styles.btnDisabled,
              ]}
              onPress={() => rematchMutation.mutate("double_or_nothing")}
              disabled={anyPending}
            >
              <Ionicons name="flame" size={18} color={Colors.dark.accentGold} />
              <Text style={[styles.rematchButtonText, { color: Colors.dark.accentGold }]}>
                Double or Nothing
              </Text>
              <Text style={[styles.rematchStake, { color: Colors.dark.accentGold }]}>
                {(swayger.stake_units || 1) * 2} units
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {status === "declined" && (
        <View style={styles.section}>
          <View style={styles.statusBanner}>
            <Ionicons name="close-circle" size={18} color="#EF4444" />
            <Text style={styles.statusBannerText}>This Swayger was declined.</Text>
          </View>
        </View>
      )}

      {status === "canceled" && (
        <View style={styles.section}>
          <View style={styles.statusBanner}>
            <Ionicons name="ban-outline" size={18} color={Colors.dark.tabIconDefault} />
            <Text style={styles.statusBannerText}>This Swayger was canceled.</Text>
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

      {status === "pending_invite" && isCreator && (
        <InviteSection inviteCode={swayger.invite_code} />
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Participants</Text>
          <Text style={styles.participantCount}>{participants.length}</Text>
        </View>
        {participantsLoading ? (
          <ActivityIndicator color={Colors.dark.tint} style={{ marginVertical: 20 }} />
        ) : participants.length === 0 ? (
          <Text style={styles.emptyText}>No participants yet.</Text>
        ) : (
          <View style={styles.participantsList}>
            {participants.map((p) => (
              <ParticipantItem key={p.id} member={p} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  scrollContent: { paddingBottom: 100 },
  centered: { alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { fontSize: 16, color: Colors.dark.textSecondary },
  linkText: { color: Colors.dark.tint, fontSize: 14 },
  headerSection: { padding: 24, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.surface,
    alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  headerContent: { flex: 1, gap: 8 },
  swaygerTitle: { fontSize: 26, fontWeight: "bold" as const, color: Colors.dark.text },
  headerMeta: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.dark.surface, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  creatorChip: { backgroundColor: "rgba(245, 166, 35, 0.1)" },
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
  rematchBadge: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8,
    backgroundColor: "rgba(29, 161, 242, 0.08)", paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, alignSelf: "flex-start",
  },
  rematchText: { fontSize: 13, color: Colors.dark.tint, fontWeight: "500" as const },
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
  cancelButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#EF4444",
  },
  cancelButtonText: { color: "#EF4444", fontSize: 15, fontWeight: "600" as const },
  btnPressed: { opacity: 0.8 },
  btnDisabled: { opacity: 0.5 },
  inviteRow: {
    backgroundColor: Colors.dark.surface, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.dark.border, gap: 12,
  },
  inviteCode: {
    fontSize: 28, fontWeight: "bold" as const, color: Colors.dark.tint,
    letterSpacing: 6, textAlign: "center",
  },
  inviteButtons: { flexDirection: "row", justifyContent: "center", gap: 16 },
  copyButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12 },
  copyText: { fontSize: 14, color: Colors.dark.tint, fontWeight: "500" as const },
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
  waitingText: { fontSize: 13, color: Colors.dark.tabIconDefault, textAlign: "center", fontStyle: "italic" },
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
});
