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
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { fetchSwayger, fetchSwaygerParticipants, displayRole } from "@/lib/swayger";
import { useAuth } from "@/lib/auth-context";
import { SwaygerData, SwaygerParticipantWithProfile } from "@/types";
import Colors from "@/constants/colors";

function InviteSection({ inviteCode }: { inviteCode: string }) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  async function handleCopyCode() {
    await Clipboard.setStringAsync(inviteCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  async function handleCopyLink() {
    const link = Platform.OS === "web"
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
            style={({ pressed }) => [styles.copyButton, pressed && styles.copyButtonPressed]}
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
            style={({ pressed }) => [styles.copyButton, pressed && styles.copyButtonPressed]}
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
          {displayRole(member.role)}
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

  const {
    data: swayger,
    isLoading: swaygerLoading,
  } = useQuery<SwaygerData | null>({
    queryKey: ["swayger", id],
    queryFn: () => fetchSwayger(id!),
    enabled: !!id,
  });

  const {
    data: participants = [],
    isLoading: participantsLoading,
  } = useQuery<SwaygerParticipantWithProfile[]>({
    queryKey: ["swayger-participants", id],
    queryFn: () => fetchSwaygerParticipants(id!),
    enabled: !!id,
  });

  const isCreator = swayger?.owner_id === user?.id;

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
              <Ionicons name="american-football-outline" size={14} color={Colors.dark.textSecondary} />
              <Text style={styles.metaText}>{swayger.scoring_type || "NFL"}</Text>
            </View>
            <View style={styles.metaChip}>
              <Ionicons name="radio-button-on" size={10} color="#22C55E" />
              <Text style={styles.metaText}>Open</Text>
            </View>
            {isCreator && (
              <View style={[styles.metaChip, styles.creatorChip]}>
                <Ionicons name="flash" size={14} color={Colors.dark.accentGold} />
                <Text style={[styles.metaText, { color: Colors.dark.accentGold }]}>Creator</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <InviteSection inviteCode={swayger.invite_code} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Participants</Text>
          <Text style={styles.participantCount}>{participants.length}</Text>
        </View>
        {participantsLoading ? (
          <ActivityIndicator color={Colors.dark.tint} style={{ marginVertical: 20 }} />
        ) : participants.length === 0 ? (
          <Text style={styles.emptyParticipantsText}>No participants yet.</Text>
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
  emptyParticipantsText: {
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
  memberRoleText: {
    fontSize: 12,
    color: Colors.dark.tint,
    fontWeight: "600" as const,
  },
  memberRoleTextCreator: {
    color: Colors.dark.accentGold,
  },
});
