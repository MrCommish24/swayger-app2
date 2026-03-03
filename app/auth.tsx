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
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { showError } from "@/lib/helpers";
import Colors from "@/constants/colors";

const RESEND_COOLDOWN_SECONDS = 30;

type AuthStep = "enter-email" | "enter-code" | "password-login";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [step, setStep] = useState<AuthStep>("enter-email");

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const getRedirectUrl = useCallback(() => {
    return Linking.createURL("auth-callback", { scheme: "swayger" });
  }, []);

  async function handleSendCode() {
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
        setStep("enter-code");
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setOtpCode("");
      }
    } catch {
      showError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    const trimmed = email.trim().toLowerCase();
    const code = otpCode.trim();
    if (!code || code.length < 6) {
      showError("Please enter the code from your email.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: trimmed,
        token: code,
        type: "email",
      });
      if (error) {
        showError(error.message);
      }
    } catch {
      showError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordSignIn() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      showError("Please enter your email address.");
      return;
    }
    if (!password) {
      showError("Please enter your password.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      });
      if (error) {
        showError(error.message);
      }
    } catch {
      showError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    await handleSendCode();
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <Ionicons name="flash" size={48} color={Colors.dark.tint} />
          <Text style={styles.title}>Swayger</Text>
          <Text style={styles.subtitle}>Sign in to get started</Text>

          {step === "enter-email" && (
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
                onPress={handleSendCode}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Send Sign-In Code</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.linkButton}
                onPress={() => setStep("password-login")}
              >
                <Text style={styles.linkText}>Sign in with password</Text>
              </Pressable>
            </View>
          )}

          {step === "enter-code" && (
            <View style={styles.form}>
              <View style={styles.sentContainer}>
                <Ionicons
                  name="mail-outline"
                  size={32}
                  color={Colors.dark.tint}
                />
                <Text style={styles.sentTitle}>Enter the code</Text>
                <Text style={styles.sentTo}>
                  We sent a code to {email}. Enter it below.
                </Text>
              </View>

              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="000000"
                placeholderTextColor={Colors.dark.tabIconDefault}
                value={otpCode}
                onChangeText={(text) =>
                  setOtpCode(text.replace(/[^0-9]/g, "").slice(0, 8))
                }
                keyboardType="number-pad"
                maxLength={8}
                editable={!loading}
                autoFocus
              />

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                  (loading || otpCode.length < 6) && styles.buttonDisabled,
                ]}
                onPress={handleVerifyCode}
                disabled={loading || otpCode.length < 6}
                testID="verify-code-button"
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Verify Code</Text>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && cooldown === 0 && styles.buttonPressed,
                  (cooldown > 0 || loading) && styles.buttonDisabled,
                ]}
                onPress={handleResend}
                disabled={cooldown > 0 || loading}
              >
                {cooldown > 0 ? (
                  <Text style={styles.secondaryButtonText}>
                    Resend in {cooldown}s
                  </Text>
                ) : (
                  <Text style={styles.secondaryButtonText}>Resend Code</Text>
                )}
              </Pressable>

              <Pressable
                style={styles.linkButton}
                onPress={() => {
                  setStep("enter-email");
                  setOtpCode("");
                  setCooldown(0);
                }}
              >
                <Text style={styles.linkText}>Use a different email</Text>
              </Pressable>
            </View>
          )}

          {step === "password-login" && (
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
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={Colors.dark.tabIconDefault}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password"
                editable={!loading}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                  loading && styles.buttonDisabled,
                ]}
                onPress={handlePasswordSignIn}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.linkButton}
                onPress={() => setStep("enter-email")}
              >
                <Text style={styles.linkText}>Use email code instead</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  scrollContent: {
    flexGrow: 1,
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
  codeInput: {
    textAlign: "center",
    fontSize: 24,
    letterSpacing: 8,
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
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.dark.tint,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: Colors.dark.tint,
    fontSize: 15,
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
