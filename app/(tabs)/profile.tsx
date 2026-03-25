import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Share,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { showError, showMessage, getAvatarColor } from "@/lib/helpers";
import Colors from "@/constants/colors";
import type { Profile } from "@/types";
import { verifyGameplaySchema } from "@/lib/verify-schema";
import { fetchMyBalance, claimBankruptcy } from "@/lib/swayger";
import FeedbackSheet from "@/components/FeedbackSheet";

interface SchemaCheck {
  name: string;
  status: "ok" | "missing" | "error";
  detail: string;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const router = useRouter();
  const { user, profile, setProfile, retryProfileFetch, isLoading, profileError, signOut } = useAuth();

  const [showEditName, setShowEditName] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const queryClient = useQueryClient();
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [devChecks, setDevChecks] = useState<SchemaCheck[]>([]);
  const [devLoading, setDevLoading] = useState(false);
  const [claimingBankruptcy, setClaimingBankruptcy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showFeedbackSheet, setShowFeedbackSheet] = useState(false);

  const INVITE_MESSAGE =
    "March Madness is here.\nI'm testing a new app where you can lock your champion, call upsets, and make friendly wagers with friends.\n\nNo real money — just bragging rights.\n\nCome make your picks: https://swayger-app.replit.app";

  async function handleInvite() {
    if (Platform.OS === "web") {
      await Clipboard.setStringAsync(INVITE_MESSAGE);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2500);
    } else {
      try {
        await Share.share({ message: INVITE_MESSAGE });
      } catch {
        // user dismissed share sheet — no action needed
      }
    }
  }

  const { data: balanceData, refetch: refetchBalance } = useQuery({
    queryKey: ["balance", user?.id],
    queryFn: () => fetchMyBalance(user!.id),
    enabled: !!user,
    staleTime: 0,
  });
  const spBalance = balanceData?.balance ?? null;
  const bankruptcyUsed = balanceData?.bankruptcyUsed ?? false;

  async function handleClaimBankruptcy() {
    setClaimingBankruptcy(true);
    try {
      const result = await claimBankruptcy();
      if (result.error) {
        showError(result.error);
      } else {
        showMessage(`Emergency refill applied — ${result.newBalance} SP added!`);
        refetchBalance();
        queryClient.invalidateQueries({ queryKey: ["balance", user?.id] });
      }
    } finally {
      setClaimingBankruptcy(false);
    }
  }

  const avatarSeed = profile?.username || user?.email || "?";
  const avatarColor = getAvatarColor(avatarSeed);
  const avatarInitial = (profile?.username || user?.email || "?")
    .charAt(0)
    .toUpperCase();

  async function runSchemaCheck() {
    setDevLoading(true);
    try {
      const results = await verifyGameplaySchema();
      setDevChecks(results);
    } finally {
      setDevLoading(false);
    }
  }

  function handleVersionLongPress() {
    if (!__DEV__) return;
    setShowDevPanel((v) => !v);
    if (!showDevPanel) runSchemaCheck();
  }

  function openEditName() {
    setDisplayNameDraft(profile?.display_name ?? "");
    setShowEditName(true);
  }

  function cancelEditName() {
    setShowEditName(false);
    setDisplayNameDraft("");
  }

  async function saveDisplayName() {
    if (!user) { showError("Not signed in"); return; }
    let currentProfile = profile;
    if (!currentProfile) {
      // Profile hasn't loaded yet — try a direct fetch inline
      try {
        const inlineTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 8000)
        );
        const result = await Promise.race([
          supabase.from("profiles").select("id, username, display_name, avatar_url, email, created_at, updated_at").eq("id", user.id).single(),
          inlineTimeout,
        ]);
        const { data } = result as { data: typeof profile; error: unknown };
        if (data) {
          currentProfile = data as typeof profile;
          setProfile(currentProfile);
        } else {
          showError("Profile not found. Please reload.");
          return;
        }
      } catch {
        showError("Network error — check your connection and try again.");
        return;
      }
    }
    const trimmed = displayNameDraft.trim();
    if (trimmed.length > 50) {
      showError("Display name must be 50 characters or less.");
      return;
    }
    const newDisplayName = trimmed || null;
    const previousProfile = currentProfile!;
    setProfile({ ...currentProfile!, display_name: newDisplayName });
    setShowEditName(false);
    setDisplayNameDraft("");
    setSavingName(true);
    try {
      let saveError: string | null = null;

      const { error: rpcErr } = await supabase.rpc("update_display_name", {
        p_display_name: trimmed,
      });

      if (rpcErr) {
        const { error: directErr } = await supabase
          .from("profiles")
          .update({ display_name: newDisplayName })
          .eq("id", user.id);
        if (directErr) {
          saveError = directErr.message || "Could not save display name.";
        }
      }

      if (saveError) {
        setProfile(previousProfile);
        showError(saveError);
        return;
      }

      const { data: refreshed } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, email, created_at, updated_at")
        .eq("id", user.id)
        .single();

      if (refreshed) {
        setProfile(refreshed as Profile);
      }

      showMessage("Saved", "Display name updated.");
    } catch {
      setProfile(previousProfile);
      showError("Something went wrong. Try again.");
    } finally {
      setSavingName(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      {/* Profile loading indicator */}
      {isLoading && !profile && user && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, margin: 12, opacity: 0.6 }}>
          <ActivityIndicator size="small" color={Colors.dark.tabIconDefault} />
          <Text style={{ color: Colors.dark.tabIconDefault, fontSize: 13, fontFamily: "Inter_400Regular" }}>Loading profile…</Text>
        </View>
      )}

      {/* Profile load failure banner */}
      {!isLoading && !profile && user && (
        <View style={{ backgroundColor: "#7f1d1d", margin: 12, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="warning-outline" size={18} color="#fca5a5" />
          <Text style={{ color: "#fca5a5", flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" }}>
            {profileError ? `Profile error: ${profileError}` : "Profile not loaded — tap to retry"}
          </Text>
          <Pressable onPress={retryProfileFetch} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 6 }}>
            <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Retry</Text>
          </Pressable>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* Identity block */}
        <View style={styles.identityBlock}>
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarInitial}>{avatarInitial}</Text>
          </View>
          <Text style={styles.username}>@{profile?.username ?? user?.email?.split("@")[0] ?? "…"}</Text>
          {profile?.display_name ? (
            <Text style={styles.displayNameText}>{profile.display_name}</Text>
          ) : (
            <Text style={styles.displayNameMuted}>No display name set</Text>
          )}
          {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
        </View>

        {/* Swayger Points balance card */}
        {spBalance !== null && (
          <View style={styles.spCard}>
            <View style={styles.spCardLeft}>
              <Ionicons name="wallet" size={22} color={Colors.dark.accentGold} />
              <View>
                <Text style={styles.spCardLabel}>Swayger Points</Text>
                <Text style={styles.spCardBalance}>{spBalance.toLocaleString()} SP</Text>
              </View>
            </View>
            {spBalance === 0 && !bankruptcyUsed && (
              <Pressable
                style={({ pressed }) => [styles.bankruptcyBtn, pressed && { opacity: 0.75 }]}
                onPress={handleClaimBankruptcy}
                disabled={claimingBankruptcy}
              >
                {claimingBankruptcy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.bankruptcyBtnText}>Emergency Refill</Text>
                )}
              </Pressable>
            )}
            {bankruptcyUsed && (
              <View style={styles.bankruptcyUsedBadge}>
                <Text style={styles.bankruptcyUsedText}>Refill used</Text>
              </View>
            )}
          </View>
        )}

        {/* 2X Referral Reward badge */}
        {profile?.referral_reward_round && (
          <View style={styles.rewardBadge}>
            <Ionicons name="flash" size={18} color="#F5A623" />
            <View style={styles.rewardBadgeText}>
              <Text style={styles.rewardBadgeTitle}>2X Referral Reward Earned</Text>
              <Text style={styles.rewardBadgeSub}>
                {(() => {
                  const labels: Record<string, string> = {
                    "round-64": "Round of 64", "round-32": "Round of 32",
                    "sweet-16": "Sweet 16", "elite-8": "Elite Eight",
                    "final-four": "Final Four", "championship": "Championship",
                  };
                  return `Applied to your ${labels[profile.referral_reward_round] ?? profile.referral_reward_round} picks`;
                })()}
              </Text>
            </View>
          </View>
        )}

        {/* Account section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          {/* Display name row */}
          {!showEditName ? (
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={openEditName}
            >
              <Ionicons name="person-outline" size={20} color={Colors.dark.text} />
              <View style={styles.menuItemBody}>
                <Text style={styles.menuItemText}>Display Name</Text>
                {profile?.display_name ? (
                  <Text style={styles.menuItemSub}>{profile.display_name}</Text>
                ) : (
                  <Text style={[styles.menuItemSub, styles.menuItemSubMuted]}>Not set</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.dark.tabIconDefault} />
            </Pressable>
          ) : (
            <View style={styles.inlineForm}>
              <Text style={styles.inlineFormLabel}>Display Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Big Boss"
                placeholderTextColor={Colors.dark.tabIconDefault}
                value={displayNameDraft}
                onChangeText={setDisplayNameDraft}
                autoFocus
                maxLength={50}
                editable={!savingName}
                returnKeyType="done"
                onSubmitEditing={saveDisplayName}
              />
              <View style={styles.inlineFormButtons}>
                <Pressable
                  style={({ pressed }) => [styles.cancelBtn, pressed && styles.buttonPressed]}
                  onPress={isWeb ? undefined : cancelEditName}
                  onPressIn={isWeb ? cancelEditName : undefined}
                  disabled={savingName}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.saveButton,
                    pressed && styles.buttonPressed,
                    savingName && styles.buttonDisabled,
                  ]}
                  onPress={isWeb ? undefined : saveDisplayName}
                  onPressIn={isWeb ? saveDisplayName : undefined}
                  disabled={savingName}
                >
                  {savingName ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          <View style={styles.menuDivider} />

          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            onPress={() => router.push("/h2h")}
            testID="profile-h2h-records"
          >
            <Ionicons name="people-outline" size={20} color={Colors.dark.text} />
            <View style={styles.menuItemBody}>
              <Text style={styles.menuItemText}>Head to Head</Text>
              <Text style={styles.menuItemSub}>Your records vs. every opponent</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.dark.tabIconDefault} />
          </Pressable>

          <View style={styles.menuDivider} />

          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            onPress={() => setShowFeedbackSheet(true)}
            testID="profile-feedback"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.dark.text} />
            <View style={styles.menuItemBody}>
              <Text style={styles.menuItemText}>Send Feedback</Text>
              <Text style={styles.menuItemSub}>Tell us what's working or what should change</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.dark.tabIconDefault} />
          </Pressable>

          <View style={styles.menuDivider} />

          <Pressable
            style={({ pressed }) => [styles.inviteRow, pressed && styles.menuItemPressed]}
            onPress={handleInvite}
            testID="profile-invite-friends"
          >
            <View style={styles.inviteIconWrap}>
              <Ionicons name="person-add-outline" size={18} color="#E8590A" />
            </View>
            <View style={styles.menuItemBody}>
              <Text style={styles.inviteText}>
                {inviteCopied ? "Invite copied!" : "Invite Friends"}
              </Text>
              <Text style={styles.menuItemSub}>
                {inviteCopied
                  ? "Paste it anywhere — texts, Discord, socials"
                  : "Share Swayger with your crew"}
              </Text>
            </View>
            <Ionicons
              name={inviteCopied ? "checkmark-circle" : "share-outline"}
              size={18}
              color={inviteCopied ? "#22C55E" : "#E8590A"}
            />
          </Pressable>

        </View>

        {/* Bottom area */}
        <View style={[styles.bottomArea, { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 100 }]}>
          {__DEV__ && showDevPanel && (
            <View style={styles.devPanel}>
              <View style={styles.devPanelHeader}>
                <Ionicons name="construct-outline" size={14} color={Colors.dark.tint} />
                <Text style={styles.devPanelTitle}>Schema Health</Text>
                <Pressable onPress={runSchemaCheck} disabled={devLoading}>
                  <Ionicons
                    name="refresh-outline"
                    size={16}
                    color={devLoading ? Colors.dark.tabIconDefault : Colors.dark.tint}
                  />
                </Pressable>
              </View>
              {devLoading ? (
                <ActivityIndicator size="small" color={Colors.dark.tint} style={{ marginVertical: 8 }} />
              ) : (
                devChecks.map((check) => (
                  <View key={check.name} style={styles.devRow}>
                    <Ionicons
                      name={check.status === "ok" ? "checkmark-circle" : "close-circle"}
                      size={14}
                      color={check.status === "ok" ? "#22C55E" : "#EF4444"}
                    />
                    <Text style={styles.devCheckName} numberOfLines={1}>{check.name}</Text>
                    <Text
                      style={[styles.devBadge, check.status === "ok" ? styles.devBadgeOk : styles.devBadgeMissing]}
                    >
                      {check.status.toUpperCase()}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}

          <Pressable
            style={styles.versionRow}
            onLongPress={handleVersionLongPress}
            delayLongPress={800}
          >
            <Text style={styles.versionText}>Swayger v1.1</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.signOutButton, pressed && styles.buttonPressed]}
            onPress={signOut}
          >
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>

      <FeedbackSheet
        visible={showFeedbackSheet}
        onClose={() => setShowFeedbackSheet(false)}
        trigger="profile"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: { paddingHorizontal: 24, paddingVertical: 16 },
  title: { fontSize: 28, fontWeight: "bold" as const, color: Colors.dark.text },
  scrollContent: { flexGrow: 1 },

  identityBlock: {
    alignItems: "center",
    paddingHorizontal: 40,
    paddingVertical: 24,
    gap: 6,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  avatarInitial: { fontSize: 32, fontWeight: "700" as const, color: "#FFFFFF" },
  username: { fontSize: 20, fontWeight: "700" as const, color: Colors.dark.text },
  displayNameText: { fontSize: 16, color: Colors.dark.textSecondary },
  displayNameMuted: { fontSize: 15, color: Colors.dark.tabIconDefault, fontStyle: "italic" as const },
  email: { fontSize: 13, color: Colors.dark.tabIconDefault, marginTop: 2 },

  spCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginHorizontal: 24,
    marginBottom: 8,
    backgroundColor: `${Colors.dark.accentGold}10`,
    borderWidth: 1,
    borderColor: `${Colors.dark.accentGold}40`,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  spCardLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  spCardLabel: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.dark.accentGold,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  spCardBalance: {
    fontSize: 22,
    fontWeight: "800" as const,
    color: Colors.dark.text,
  },
  bankruptcyBtn: {
    backgroundColor: "#7C3AED",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: "center" as const,
  },
  bankruptcyBtnText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  bankruptcyUsedBadge: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  bankruptcyUsedText: {
    fontSize: 11,
    color: Colors.dark.tabIconDefault,
  },
  rewardBadge: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: "rgba(245,166,35,0.10)",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.30)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rewardBadgeText: { flex: 1 },
  rewardBadgeTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#F5A623",
  },
  rewardBadgeSub: {
    fontSize: 12,
    color: "#C8A84B",
    marginTop: 2,
  },
  section: { paddingHorizontal: 24, paddingTop: 8, gap: 12 },
  sectionTitle: {
    fontSize: 13, fontWeight: "600" as const, color: Colors.dark.tabIconDefault,
    textTransform: "uppercase" as const, letterSpacing: 1,
  },
  menuItem: {
    flexDirection: "row" as const, alignItems: "center", gap: 12,
    backgroundColor: Colors.dark.surface, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  menuItemPressed: { opacity: 0.7 },
  menuDivider: { height: 1, backgroundColor: Colors.dark.border, marginVertical: 6 },
  menuItemBody: { flex: 1, gap: 2 },
  menuItemText: { fontSize: 16, color: Colors.dark.text },
  menuItemSub: { fontSize: 13, color: Colors.dark.textSecondary },
  menuItemSubMuted: { color: Colors.dark.tabIconDefault, fontStyle: "italic" as const },

  inviteRow: {
    flexDirection: "row" as const, alignItems: "center", gap: 12,
    backgroundColor: "rgba(232,89,10,0.06)",
    borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: "rgba(232,89,10,0.25)",
  },
  inviteIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(232,89,10,0.12)",
    alignItems: "center" as const, justifyContent: "center" as const,
  },
  inviteText: {
    fontSize: 16, color: Colors.dark.text, fontWeight: "600" as const,
  },

  inlineForm: {
    backgroundColor: Colors.dark.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.dark.accent,
    padding: 16, gap: 12,
  },
  inlineFormLabel: {
    fontSize: 13, fontWeight: "600" as const, color: Colors.dark.tint,
    textTransform: "uppercase" as const, letterSpacing: 0.8,
  },
  inlineFormButtons: { flexDirection: "row" as const, gap: 12 },
  input: {
    backgroundColor: Colors.dark.background, borderWidth: 1, borderColor: Colors.dark.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: Colors.dark.text,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center",
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  cancelBtnText: { color: Colors.dark.textSecondary, fontSize: 15, fontWeight: "600" as const },
  saveButton: {
    flex: 1, backgroundColor: Colors.dark.accent, paddingVertical: 12,
    borderRadius: 10, alignItems: "center",
  },
  saveButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" as const },
  buttonPressed: { opacity: 0.7 },
  buttonDisabled: { opacity: 0.6 },

  successBanner: {
    flexDirection: "row" as const, alignItems: "center", gap: 8,
    backgroundColor: "rgba(34, 197, 94, 0.1)", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  successText: { color: "#22C55E", fontSize: 14, flex: 1 },

  bottomArea: { paddingHorizontal: 24, marginTop: "auto", paddingTop: 24, gap: 12 },
  versionRow: { alignItems: "center", paddingVertical: 4 },
  versionText: { fontSize: 12, color: Colors.dark.tabIconDefault },
  signOutButton: {
    flexDirection: "row" as const, alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 16, borderRadius: 12, borderWidth: 1, borderColor: "#EF4444",
  },
  signOutText: { color: "#EF4444", fontSize: 16, fontWeight: "600" as const },

  devPanel: {
    backgroundColor: "rgba(29,161,242,0.06)", borderWidth: 1,
    borderColor: "rgba(29,161,242,0.2)", borderRadius: 12, padding: 14, gap: 8,
  },
  devPanelHeader: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, marginBottom: 4 },
  devPanelTitle: {
    flex: 1, fontSize: 13, fontWeight: "700" as const, color: Colors.dark.tint,
    textTransform: "uppercase" as const, letterSpacing: 0.8,
  },
  devRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  devCheckName: { flex: 1, fontSize: 12, color: Colors.dark.textSecondary },
  devBadge: { fontSize: 10, fontWeight: "700" as const, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  devBadgeOk: { backgroundColor: "rgba(34,197,94,0.15)", color: "#22C55E" },
  devBadgeMissing: { backgroundColor: "rgba(239,68,68,0.15)", color: "#EF4444" },
});
