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
import { showError } from "@/lib/helpers";
import Colors from "@/constants/colors";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, profile, signOut } = useAuth();
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);

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
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
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

  return (
    <View
      style={[
        styles.container,
        { paddingTop: isWeb ? 67 : insets.top + 20 },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={40} color={Colors.dark.tint} />
          </View>

          {profile && (
            <View style={styles.info}>
              <Text style={styles.username}>@{profile.username}</Text>
              {profile.display_name && (
                <Text style={styles.displayName}>{profile.display_name}</Text>
              )}
            </View>
          )}

          {user && <Text style={styles.email}>{user.email}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          {passwordSet && (
            <View style={styles.successBanner}>
              <Ionicons
                name="checkmark-circle"
                size={18}
                color="#22C55E"
              />
              <Text style={styles.successText}>
                Password set! You can now sign in with email + password.
              </Text>
            </View>
          )}

          {!showSetPassword ? (
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
              ]}
              onPress={() => setShowSetPassword(true)}
            >
              <Ionicons
                name="key-outline"
                size={20}
                color={Colors.dark.text}
              />
              <Text style={styles.menuItemText}>
                {passwordSet ? "Change Password" : "Set Password"}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={Colors.dark.tabIconDefault}
              />
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
                  style={({ pressed }) => [
                    styles.cancelButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => {
                    setShowSetPassword(false);
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                  disabled={saving}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
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

        <View
          style={[
            styles.bottomArea,
            { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 100 },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.buttonPressed,
            ]}
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
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
    paddingVertical: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.surface,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  info: {
    alignItems: "center",
    gap: 4,
  },
  username: {
    fontSize: 20,
    fontWeight: "bold" as const,
    color: Colors.dark.text,
  },
  displayName: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
  email: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.dark.tabIconDefault,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  successText: {
    color: "#22C55E",
    fontSize: 14,
    flex: 1,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  menuItemPressed: {
    opacity: 0.7,
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    color: Colors.dark.text,
  },
  passwordForm: {
    gap: 12,
  },
  input: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.dark.text,
  },
  passwordButtons: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cancelButtonText: {
    color: Colors.dark.textSecondary,
    fontSize: 15,
    fontWeight: "600" as const,
  },
  saveButton: {
    flex: 1,
    backgroundColor: Colors.dark.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600" as const,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  bottomArea: {
    paddingHorizontal: 24,
    marginTop: "auto",
    paddingTop: 24,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  signOutText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "600" as const,
  },
});
