import { useState, useEffect, useCallback } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { showError } from "@/lib/helpers";
import Colors from "@/constants/colors";

const RESEND_COOLDOWN_SECONDS = 30;

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const getRedirectUrl = useCallback(() => {
    return Linking.createURL("auth-callback");
  }, []);

  async function handleSendLink() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      showError("Please enter your email address.");
      return;
    }
    setLoading(true);
    try {
      const redirectTo = getRedirectUrl();
      if (__DEV__) console.log("[auth] Redirect URL:", redirectTo);

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: redirectTo,
        },
      });
      if (error) {
        showError(error.message);
      } else {
        setLinkSent(true);
        setCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } catch {
      showError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    await handleSendLink();
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        <Ionicons name="flash" size={48} color={Colors.dark.tint} />
        <Text style={styles.title}>Swayger</Text>
        <Text style={styles.subtitle}>Sign in to get started</Text>

        {!linkSent ? (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!loading}
            />
            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleSendLink}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Send Login Link</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.sentContainer}>
              <Ionicons name="mail-outline" size={32} color={Colors.dark.tint} />
              <Text style={styles.sentTitle}>Check your email</Text>
              <Text style={styles.sentTo}>
                We sent a login link to {email}. Tap the link in the email to sign in.
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && cooldown === 0 && styles.buttonPressed,
                cooldown > 0 && styles.buttonDisabled,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleResend}
              disabled={cooldown > 0 || loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : cooldown > 0 ? (
                <Text style={styles.buttonText}>Resend in {cooldown}s</Text>
              ) : (
                <Text style={styles.buttonText}>Resend Link</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.linkButton}
              onPress={() => {
                setLinkSent(false);
                setCooldown(0);
              }}
            >
              <Text style={styles.linkText}>Use a different email</Text>
            </Pressable>
          </View>
        )}
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
    fontSize: 32,
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
  sentContainer: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  sentTitle: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  sentTo: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
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
    alignItems: "center",
    paddingVertical: 8,
  },
  linkText: {
    color: Colors.dark.tint,
    fontSize: 14,
  },
});
