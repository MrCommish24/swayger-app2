import { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { showError } from "@/lib/helpers";
import { validateUsername } from "@/lib/helpers";
import { Analytics } from "@/lib/posthog";
import { Profile } from "@/types";
import Colors from "@/constants/colors";
import type { PendingReferral } from "@/app/mm-pick/[matchupId]";
import { consumePendingInvite } from "@/lib/pending-invite";

const PENDING_REFERRAL_KEY = "swayger_pending_referral";

export default function UsernameSetupScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, setProfile, setNeedsUsername, signOut } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ── Funnel: new user reached username setup ───────────────────────────────
  useEffect(() => {
    Analytics.usernameSetupViewed();
  }, []);

  function handleUsernameChange(text: string) {
    const lower = text.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(lower);
    setValidationError(validateUsername(lower));
  }

  async function handleSubmit() {
    const err = validateUsername(username);
    if (err) {
      setValidationError(err);
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          username,
          display_name: displayName.trim() || null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          setValidationError("Username is already taken");
        } else {
          showError(error.message);
        }
      } else if (data) {
        // ── Funnel: signed_up — this screen only shows for brand-new users ──
        const provider = (user.app_metadata?.provider as string) ?? "email";
        const method = provider === "google" ? "google" : provider === "email" ? "otp" : provider;
        Analytics.signedUp(method);

        setProfile(data as Profile);
        setNeedsUsername(false);

        // 1. Check for a pending invite first (highest priority)
        try {
          const pendingInvite = await consumePendingInvite();
          if (pendingInvite?.code) {
            router.replace(`/invite/${pendingInvite.code}` as never);
            return;
          }
        } catch {
          // Non-blocking
        }

        // 2. Check for a pending referral from a matchup share link
        try {
          const raw = await AsyncStorage.getItem(PENDING_REFERRAL_KEY);
          if (raw && user) {
            const pending = JSON.parse(raw) as PendingReferral;
            await AsyncStorage.removeItem(PENDING_REFERRAL_KEY);
            const { error: rpcErr } = await supabase.rpc("record_mm_referral", {
              new_user_id: user.id,
              referral_code_in: pending.referralCode,
            });
            if (!rpcErr) {
              router.replace({
                pathname: "/march-madness/picks" as never,
                params: { roundId: pending.roundId },
              } as never);
              return;
            }
          }
        } catch {
          // Non-blocking — continue to normal post-signup flow
        }
      }
    } catch {
      showError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        <Ionicons name="person-add-outline" size={48} color={Colors.dark.tint} />
        <Text style={styles.title}>Choose a Username</Text>
        <Text style={styles.subtitle}>This is how others will find you</Text>

        <View style={styles.form}>
          <View>
            <TextInput
              style={[
                styles.input,
                validationError ? styles.inputError : null,
              ]}
              placeholder="username"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={username}
              onChangeText={handleUsernameChange}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              maxLength={20}
            />
            {validationError && (
              <Text style={styles.errorText}>{validationError}</Text>
            )}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Display name (optional)"
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={displayName}
            onChangeText={setDisplayName}
            editable={!loading}
            maxLength={50}
          />

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              (loading || !!validationError || username.length < 3) &&
                styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={loading || !!validationError || username.length < 3}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </Pressable>

          <Pressable style={styles.linkButton} onPress={signOut}>
            <Text style={styles.linkText}>Sign out</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold" as const,
    color: Colors.dark.text,
    marginTop: 12,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    marginBottom: 24,
  },
  form: {
    width: "100%",
    gap: 16,
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
  inputError: {
    borderColor: "#EF4444",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 13,
    marginTop: 6,
    marginLeft: 4,
  },
  button: {
    backgroundColor: Colors.dark.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600" as const,
  },
  linkButton: {
    alignItems: "center" as const,
    paddingVertical: 8,
  },
  linkText: {
    color: Colors.dark.tint,
    fontSize: 14,
  },
});
