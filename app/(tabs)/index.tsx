import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  FlatList,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchMyWorkspaces, joinWorkspaceByCode } from "@/lib/workspace";
import { WorkspaceWithRole } from "@/types";
import Colors from "@/constants/colors";

function RoleBadge({ role }: { role: string }) {
  const isOwner = role === "owner";
  return (
    <View style={[styles.roleBadge, isOwner && styles.roleBadgeOwner]}>
      <Text style={[styles.roleBadgeText, isOwner && styles.roleBadgeTextOwner]}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </Text>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  const {
    data: workspaces = [],
    isLoading,
    error,
    refetch,
  } = useQuery<WorkspaceWithRole[]>({
    queryKey: ["workspaces", "mine", user?.id],
    queryFn: () => fetchMyWorkspaces(user!.id),
    enabled: !!user,
  });

  const joinMutation = useMutation({
    mutationFn: () => joinWorkspaceByCode(inviteCode, user!.id),
    onSuccess: (result) => {
      if (result.error) {
        setJoinError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setJoinModalVisible(false);
      setInviteCode("");
      setJoinError(null);
      if (result.workspaceId) {
        if (result.alreadyMember) {
          router.push(`/workspace/${result.workspaceId}`);
        } else {
          router.push(`/workspace/${result.workspaceId}`);
        }
      }
    },
    onError: () => {
      setJoinError("Something went wrong. Try again.");
    },
  });

  function handleJoinSubmit() {
    if (!inviteCode.trim()) {
      setJoinError("Please enter an invite code.");
      return;
    }
    setJoinError(null);
    joinMutation.mutate();
  }

  function renderWorkspaceCard({ item }: { item: WorkspaceWithRole }) {
    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => router.push(`/workspace/${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <RoleBadge role={item.role} />
        </View>
        <View style={styles.cardDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="trophy-outline" size={14} color={Colors.dark.textSecondary} />
            <Text style={styles.detailText}>{item.scoring_type}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Swayger</Text>
      </View>

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
          onPress={() => {
            setJoinModalVisible(true);
            setJoinError(null);
            setInviteCode("");
          }}
        >
          <Ionicons name="enter-outline" size={18} color={Colors.dark.tint} />
          <Text style={styles.actionButtonOutlineText}>Join</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.accentGold} />
          <Text style={styles.emptyText}>Could not load workspaces.</Text>
          <Pressable style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : workspaces.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={48} color={Colors.dark.tint} />
          <Text style={styles.emptyText}>No workspaces yet.</Text>
          <Text style={styles.emptySubtext}>
            Create a workspace or join one with an invite code.
          </Text>
        </View>
      ) : (
        <FlatList
          data={workspaces}
          keyExtractor={(item) => item.id}
          renderItem={renderWorkspaceCard}
          contentContainerStyle={styles.listContent}
          scrollEnabled={workspaces.length > 0}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={joinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setJoinModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setJoinModalVisible(false)}
        >
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>Join Workspace</Text>
            <Text style={styles.modalSubtitle}>
              Enter the invite code shared with you
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Invite code"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={inviteCode}
              onChangeText={(t) => {
                setInviteCode(t.toUpperCase());
                setJoinError(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
            />
            {joinError && <Text style={styles.modalError}>{joinError}</Text>}
            <Pressable
              style={({ pressed }) => [
                styles.modalButton,
                pressed && styles.actionButtonPressed,
                joinMutation.isPending && styles.buttonDisabled,
              ]}
              onPress={handleJoinSubmit}
              disabled={joinMutation.isPending}
            >
              {joinMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.modalButtonText}>Join</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.modalCancel}
              onPress={() => setJoinModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold" as const,
    color: Colors.dark.text,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: Colors.dark.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionButtonOutline: {
    flex: 1,
    backgroundColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.tint,
  },
  actionButtonPressed: {
    opacity: 0.8,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600" as const,
  },
  actionButtonOutlineText: {
    color: Colors.dark.tint,
    fontSize: 15,
    fontWeight: "600" as const,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
  },
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  retryText: {
    color: Colors.dark.tint,
    fontSize: 14,
    fontWeight: "600" as const,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardPressed: {
    opacity: 0.8,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600" as const,
    color: Colors.dark.text,
    flex: 1,
    marginRight: 8,
  },
  roleBadge: {
    backgroundColor: Colors.dark.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadgeOwner: {
    backgroundColor: "rgba(245, 166, 35, 0.15)",
  },
  roleBadgeText: {
    fontSize: 12,
    color: Colors.dark.tint,
    fontWeight: "600" as const,
  },
  roleBadgeTextOwner: {
    color: Colors.dark.accentGold,
  },
  cardDetails: {
    flexDirection: "row",
    gap: 16,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  modalContent: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 380,
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold" as const,
    color: Colors.dark.text,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  modalInput: {
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: Colors.dark.text,
    textAlign: "center",
    letterSpacing: 4,
    fontWeight: "600" as const,
  },
  modalError: {
    color: "#EF4444",
    fontSize: 13,
    textAlign: "center",
  },
  modalButton: {
    backgroundColor: Colors.dark.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600" as const,
  },
  modalCancel: {
    alignItems: "center",
    paddingVertical: 8,
  },
  modalCancelText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
  },
});
