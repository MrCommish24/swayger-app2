import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { fetchWorkspace, fetchWorkspaceMembers } from "@/lib/workspace";
import { useAuth } from "@/lib/auth-context";
import { Workspace, WorkspaceMemberWithProfile } from "@/types";
import Colors from "@/constants/colors";

function InviteSection({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopyCode() {
    await Clipboard.setStringAsync(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Invite Code</Text>
      <View style={styles.inviteRow}>
        <Text style={styles.inviteCode}>{inviteCode}</Text>
        <Pressable
          style={({ pressed }) => [styles.copyButton, pressed && styles.copyButtonPressed]}
          onPress={handleCopyCode}
        >
          <Ionicons
            name={copied ? "checkmark" : "copy-outline"}
            size={18}
            color={copied ? "#4CAF50" : Colors.dark.tint}
          />
          <Text style={[styles.copyText, copied && { color: "#4CAF50" }]}>
            {copied ? "Copied" : "Copy"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function MemberItem({ member }: { member: WorkspaceMemberWithProfile }) {
  const profile = member.profiles;
  const displayName = profile?.display_name || profile?.username || "Unknown";
  const isOwner = member.role === "owner";

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
      <View style={[styles.memberRoleBadge, isOwner && styles.memberRoleBadgeOwner]}>
        <Text style={[styles.memberRoleText, isOwner && styles.memberRoleTextOwner]}>
          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
        </Text>
      </View>
    </View>
  );
}

export default function WorkspaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const {
    data: workspace,
    isLoading: wsLoading,
  } = useQuery<Workspace | null>({
    queryKey: ["workspace", id],
    queryFn: () => fetchWorkspace(id!),
    enabled: !!id,
  });

  const {
    data: members = [],
    isLoading: membersLoading,
  } = useQuery<WorkspaceMemberWithProfile[]>({
    queryKey: ["workspace-members", id],
    queryFn: () => fetchWorkspaceMembers(id!),
    enabled: !!id,
  });

  const isOwner = workspace?.owner_id === user?.id;

  if (wsLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
      </View>
    );
  }

  if (!workspace) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.accentGold} />
        <Text style={styles.errorText}>Workspace not found.</Text>
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
          <Text style={styles.workspaceName}>{workspace.name}</Text>
          <View style={styles.headerMeta}>
            <View style={styles.metaChip}>
              <Ionicons name="trophy-outline" size={14} color={Colors.dark.textSecondary} />
              <Text style={styles.metaText}>{workspace.scoring_type}</Text>
            </View>
            {isOwner && (
              <View style={[styles.metaChip, styles.ownerChip]}>
                <Ionicons name="shield-outline" size={14} color={Colors.dark.accentGold} />
                <Text style={[styles.metaText, { color: Colors.dark.accentGold }]}>Owner</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <InviteSection inviteCode={workspace.invite_code} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Members</Text>
          <Text style={styles.memberCount}>{members.length}</Text>
        </View>
        {membersLoading ? (
          <ActivityIndicator color={Colors.dark.tint} style={{ marginVertical: 20 }} />
        ) : members.length === 0 ? (
          <Text style={styles.emptyMembersText}>No members yet.</Text>
        ) : (
          <View style={styles.membersList}>
            {members.map((m) => (
              <MemberItem key={m.id} member={m} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.buttonsColumn}>
          {isOwner && (
            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              onPress={() => {}}
            >
              <Ionicons name="create-outline" size={20} color={Colors.dark.tint} />
              <Text style={styles.actionBtnText}>Edit Workspace</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.dark.tabIconDefault} />
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
            onPress={() => {}}
          >
            <Ionicons name="people-outline" size={20} color={Colors.dark.tint} />
            <Text style={styles.actionBtnText}>Manage Roster</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.dark.tabIconDefault} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionBtnPrimary, pressed && styles.actionBtnPressed]}
            onPress={() => {}}
          >
            <Ionicons name="play-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionBtnPrimaryText}>Start Weekly Session</Text>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
          </Pressable>
        </View>
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
  workspaceName: {
    fontSize: 26,
    fontWeight: "bold" as const,
    color: Colors.dark.text,
  },
  headerMeta: {
    flexDirection: "row",
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
  ownerChip: {
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
  memberCount: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
    marginBottom: 12,
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  inviteCode: {
    fontSize: 24,
    fontWeight: "bold" as const,
    color: Colors.dark.tint,
    letterSpacing: 4,
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
    fontSize: 14,
    color: Colors.dark.tint,
    fontWeight: "500" as const,
  },
  emptyMembersText: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
  },
  membersList: {
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
  memberRoleBadgeOwner: {
    backgroundColor: "rgba(245, 166, 35, 0.15)",
  },
  memberRoleText: {
    fontSize: 12,
    color: Colors.dark.tint,
    fontWeight: "600" as const,
  },
  memberRoleTextOwner: {
    color: Colors.dark.accentGold,
  },
  buttonsColumn: {
    gap: 10,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  actionBtnPrimary: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  actionBtnPressed: {
    opacity: 0.8,
  },
  actionBtnText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500" as const,
    color: Colors.dark.text,
  },
  actionBtnPrimaryText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#FFFFFF",
  },
});
