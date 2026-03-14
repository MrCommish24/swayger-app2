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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { showError, showMessage, getAvatarColor } from "@/lib/helpers";
import Colors from "@/constants/colors";
import { verifyGameplaySchema } from "@/lib/verify-schema";

interface SchemaCheck {
  name: string;
  status: "ok" | "missing" | "error";
  detail: string;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, profile, setProfile } = useAuth();

  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);

  const [showSetPassword, setShowSetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);

  const [showDevPanel, setShowDevPanel] = useState(false);
  const [devChecks, setDevChecks] = useState<SchemaCheck[]>([]);
  const [devLoading, setDevLoading] = useState(false);

  const avatarSeed = profile?.username || user?.email || "?";
  const avatarColor = getAvatarColor(avatarSeed);
  const avatarInitial = (profile?.display_name || profile?.username || user?.email || "?")
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

  function startEditDisplayName() {
    setDisplayNameDraft(profile?.display_name ?? "");
    setEditingDisplayName(true);
  }

  async function saveDisplayName() {
    if (!user || !profile) return;
    const trimmed = displayNameDraft.trim();
    if (trimmed.length > 50) {
      showError("Display name must be 50 characters or less.");
      return;
    }
    setSavingDisplayName(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: trimmed || null })
        .eq("id", user.id);
      if (error) {
        showError(error.message);
      } else {
        setProfile({ ...profile, display_name: trimmed || null });
        setEditingDisplayName(false);
        showMessage("Saved", "Display name updated.");
      }
    } catch {
      showError("Something went wrong. Try again.");
    } finally {
      setSavingDisplayName(false);
    }
  }

  async function handleSetPassword() {
    if (newPassword.length < 6) {
      showError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showError("Passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        showError(error.message);
      } else {
        setPasswordSet(true);
        setShowSetPassword(false);
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      showError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const { signOut } = useAuth();

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarInitial}>{avatarInitial}</Text>
          </View>

          {profile && (
            <View style={styles.info}>
              <Text style={styles.username}>@{profile.username}</Text>

              {editingDisplayName ? (
                <View style={styles.displayNameEdit}>
                  <TextInput
                    style={styles.displayNameInput}
                    value={displayNameDraft}
                    onChangeText={setDisplayNameDraft}
                    placeholder="Your display name"
                    placeholderTextColor={Colors.dark.tabIconDefault}
                    autoFocus
                    maxLength={50}
                    editable={!savingDisplayName}
                    returnKeyType="done"
                    onSubmitEditing={saveDisplayName}
                  />
                  <View style={styles.displayNameButtons}>
                    <Pressable
                      style={({ pressed }) => [styles.dnCancelBtn, pressed && styles.buttonPressed]}
                      onPress={() => setEditingDisplayName(false)}
                      disabled={savingDisplayName}
                    >
                      <Text style={styles.dnCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.dnSaveBtn,
                        pressed && styles.buttonPressed,
                        savingDisplayName && styles.buttonDisabled,
                      ]}
                      onPress={saveDisplayName}
                      disabled={savingDisplayName}
                    >
                      {savingDisplayName ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.dnSaveText}>Save</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.displayNameRow, pressed && styles.buttonPressed]}
                  onPress={startEditDisplayName}
                >
                  <Text style={styles.displayName}>
                    {profile.display_name || "Add display name"}
                  </Text>
                  <Ionicons
                    name="pencil-outline"
                    size={14}
                    color={Colors.dark.tabIconDefault}
                  />
                </Pressable>
              )}
            </View>
          )}

          {user && <Text style={styles.email}>{user.email}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          {passwordSet && (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
              <Text style={styles.successText}>
                Password set! You can now sign in with email + password.
              </Text>
            </View>
          )}

          {!showSetPassword ? (
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => setShowSetPassword(true)}
            >
              <Ionicons name="key-outline" size={20} color={Colors.dark.text} />
              <Text style={styles.menuItemText}>
                {passwordSet ? "Change Password" : "Set Password"}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.dark.tabIconDefault} />
            </Pressable>
          ) : (
            <View style={styles.passwordForm}>
              <TextInput
                style={styles.input}
                placeholder="New password (min 6 chars)"
                placeholderTextColor={Colors.dark.tabIconDefault}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
                editable={!saving}
              />
              <TextInput
                style={styles.input}
                placeholder="Confirm password"
                placeholderTextColor={Colors.dark.tabIconDefault}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                editable={!saving}
              />
              <View style={styles.passwordButtons}>
                <Pressable
                  style={({ pressed }) => [styles.cancelBtn, pressed && styles.buttonPressed]}
                  onPress={() => {
                    setShowSetPassword(false);
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                  disabled={saving}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.saveButton,
                    pressed && styles.buttonPressed,
                    saving && styles.buttonDisabled,
                  ]}
                  onPress={handleSetPassword}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save Password</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: { paddingHorizontal: 24, paddingVertical: 16 },
  title: { fontSize: 28, fontWeight: "bold" as const, color: Colors.dark.text },
  scrollContent: { flexGrow: 1 },
  content: { alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40, paddingVertical: 24 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  avatarInitial: { fontSize: 32, fontWeight: "700" as const, color: "#FFFFFF" },
  info: { alignItems: "center", gap: 6 },
  username: { fontSize: 20, fontWeight: "bold" as const, color: Colors.dark.text },
  displayNameRow: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  displayName: { fontSize: 16, color: Colors.dark.textSecondary },
  displayNameEdit: { gap: 8, alignItems: "stretch", width: "100%" as const },
  displayNameInput: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: Colors.dark.text,
    textAlign: "center" as const,
  },
  displayNameButtons: { flexDirection: "row" as const, gap: 10 },
  dnCancelBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  dnCancelText: { color: Colors.dark.textSecondary, fontSize: 14, fontWeight: "600" as const },
  dnSaveBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
    backgroundColor: Colors.dark.accent,
  },
  dnSaveText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" as const },
  email: { fontSize: 14, color: Colors.dark.tabIconDefault },
  section: { paddingHorizontal: 24, paddingTop: 16, gap: 12 },
  sectionTitle: { fontSize: 13, fontWeight: "600" as const, color: Colors.dark.tabIconDefault, textTransform: "uppercase" as const, letterSpacing: 1 },
  successBanner: { flexDirection: "row" as const, alignItems: "center", gap: 8, backgroundColor: "rgba(34, 197, 94, 0.1)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  successText: { color: "#22C55E", fontSize: 14, flex: 1 },
  menuItem: {
    flexDirection: "row" as const, alignItems: "center", gap: 12, backgroundColor: Colors.dark.surface,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: Colors.dark.border,
  },
  menuItemPressed: { opacity: 0.7 },
  menuItemText: { flex: 1, fontSize: 16, color: Colors.dark.text },
  passwordForm: { gap: 12 },
  input: {
    backgroundColor: Colors.dark.surface, borderWidth: 1, borderColor: Colors.dark.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: Colors.dark.text,
  },
  passwordButtons: { flexDirection: "row" as const, gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.dark.border },
  cancelBtnText: { color: Colors.dark.textSecondary, fontSize: 15, fontWeight: "600" as const },
  saveButton: { flex: 1, backgroundColor: Colors.dark.accent, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  saveButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" as const },
  buttonPressed: { opacity: 0.7 },
  buttonDisabled: { opacity: 0.6 },
  bottomArea: { paddingHorizontal: 24, marginTop: "auto", paddingTop: 24, gap: 12 },
  versionRow: { alignItems: "center", paddingVertical: 4 },
  versionText: { fontSize: 12, color: Colors.dark.tabIconDefault },
  signOutButton: {
    flexDirection: "row" as const, alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 16, borderRadius: 12, borderWidth: 1, borderColor: "#EF4444",
  },
  signOutText: { color: "#EF4444", fontSize: 16, fontWeight: "600" as const },
  devPanel: {
    backgroundColor: "rgba(29,161,242,0.06)",
    borderWidth: 1,
    borderColor: "rgba(29,161,242,0.2)",
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  devPanelHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 4,
  },
  devPanelTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700" as const,
    color: Colors.dark.tint,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  devRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  devCheckName: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  devBadge: {
    fontSize: 10,
    fontWeight: "700" as const,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  devBadgeOk: {
    backgroundColor: "rgba(34,197,94,0.15)",
    color: "#22C55E",
  },
  devBadgeMissing: {
    backgroundColor: "rgba(239,68,68,0.15)",
    color: "#EF4444",
  },
});
