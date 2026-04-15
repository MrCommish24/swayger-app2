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

type AuthStep = "enter-email" | "enter-code" | "password-login" | "forgot-password" | "forgot-password-sent";

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

  async function handleForgotPassword() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      showError("Please enter your email address.");
      return;
    }
    setLoading(true);
    try {
      const redirectTo = getRedirectUrl();
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo,
      });
      if (error) {
        showError(error.message);
      } else {
        setStep("forgot-password-sent");
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <Ionicons name="flash" size={48} color={Colors.dark.tint} />
          <Text style={styles.title}>Swayger</Text>
          <Text style={styles.headline}>Think you're right? Swayger on it.</Text>
          <Text style={styles.tagline}>Friendly wagers. No real money. Just bragging rights.</Text>

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
                onPress={() => setStep("forgot-password")}
              >
                <Text style={styles.linkText}>Forgot password?</Text>
              </Pressable>
              <Pressable
                style={styles.linkButton}
                onPress={() => setStep("enter-email")}
              >
                <Text style={styles.linkText}>Use email code instead</Text>
              </Pressable>
            </View>
          )}

          {step === "forgot-password" && (
            <View style={styles.form}>
              <View style={styles.sentContainer}>
                <Ionicons
                  name="lock-open-outline"
                  size={32}
                  color={Colors.dark.tint}
                />
                <Text style={styles.sentTitle}>Reset Password</Text>
                <Text style={styles.sentTo}>
                  Enter your email and we'll send you a reset link.
                </Text>
              </View>
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
                autoFocus
              />
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                  loading && styles.buttonDisabled,
                ]}
                onPress={handleForgotPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Send Reset Link</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.linkButton}
                onPress={() => setStep("password-login")}
              >
                <Text style={styles.linkText}>Back to sign in</Text>
              </Pressable>
            </View>
          )}

          {step === "forgot-password-sent" && (
            <View style={styles.form}>
              <View style={styles.sentContainer}>
                <Ionicons
                  name="mail-outline"
                  size={32}
                  color={Colors.dark.tint}
                />
                <Text style={styles.sentTitle}>Check your email</Text>
                <Text style={styles.sentTo}>
                  We sent a password reset link to {email}. Click it to set a new password.
                </Text>
              </View>
              <Pressable
                style={styles.linkButton}
                onPress={() => setStep("enter-email")}
              >
                <Text style={styles.linkText}>Back to sign in</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* How It Works — visible below the fold, only on the entry step */}
        {step === "enter-email" && (
          <View style={styles.hiwSection}>
            <View style={styles.hiwDivider} />
            <Text style={styles.hiwHeading}>How It Works</Text>
            <View style={styles.hiwSteps}>
              <View style={styles.hiwStep}>
                <View style={styles.hiwNum}><Text style={styles.hiwNumText}>1</Text></View>
                <View style={styles.hiwStepBody}>
                  <Text style={styles.hiwStepTitle}>Set the Terms</Text>
                  <Text style={styles.hiwStepDesc}>Name the wager, bet Swayger Points, add a stake note, and lock in your pick.</Text>
                </View>
              </View>
              <View style={styles.hiwStep}>
                <View style={styles.hiwNum}><Text style={styles.hiwNumText}>2</Text></View>
                <View style={styles.hiwStepBody}>
                  <Text style={styles.hiwStepTitle}>Share Your Code</Text>
                  <Text style={styles.hiwStepDesc}>Send the 5-letter code to your opponent — they join and set their pick.</Text>
                </View>
              </View>
              <View style={styles.hiwStep}>
                <View style={styles.hiwNum}><Text style={styles.hiwNumText}>3</Text></View>
                <View style={styles.hiwStepBody}>
                  <Text style={styles.hiwStepTitle}>Winner Takes the Points</Text>
                  <Text style={styles.hiwStepDesc}>No real money — just Swayger Points, bragging rights, and whatever you put on the line.</Text>
                </View>
              </View>
            </View>
            <Pressable onPress={() => Linking.openURL("https://swayger-app.replit.app/privacy")}>
              <Text style={styles.privacyLink}>Privacy Policy</Text>
            </Pressable>
          </View>
        )}
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
  headline: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: Colors.dark.text,
    textAlign: "center" as const,
  },
  tagline: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center" as const,
    marginBottom: 16,
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
  hiwSection: {
    paddingHorizontal: 28,
    paddingBottom: 48,
  },
  hiwDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginBottom: 28,
  },
  hiwHeading: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: Colors.dark.tabIconDefault,
    textTransform: "uppercase" as const,
    letterSpacing: 1.2,
    marginBottom: 20,
    textAlign: "center" as const,
  },
  hiwSteps: {
    gap: 16,
    marginBottom: 28,
  },
  hiwStep: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 14,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 14,
    padding: 14,
  },
  hiwNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.dark.tint,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
    marginTop: 1,
  },
  hiwNumText: {
    fontSize: 14,
    fontWeight: "800" as const,
    color: "#FFFFFF",
  },
  hiwStepBody: {
    flex: 1,
    gap: 3,
  },
  hiwStepTitle: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  hiwStepDesc: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  privacyLink: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    textAlign: "center" as const,
    textDecorationLine: "underline" as const,
  },
});
