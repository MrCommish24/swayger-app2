import { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Platform,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { peekPendingInvite, consumePendingInvite } from "@/lib/pending-invite";
import { PENDING_AUTH_REDIRECT_KEY } from "@/app/_layout";

type CallbackStatus = "processing" | "success" | "error";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [status, setStatus] = useState<CallbackStatus>("processing");
  const [errorMsg, setErrorMsg] = useState("");
  const processedRef = useRef(false);

  useEffect(() => {
    processInitialUrl();

    const sub = Linking.addEventListener("url", (event) => {
      if (__DEV__) console.log("[auth-callback] URL event, has auth-callback:", event.url.includes("auth-callback"));
      if (!processedRef.current) {
        processUrl(event.url);
      }
    });

    return () => sub.remove();
  }, []);

  async function processInitialUrl() {
    try {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const fullUrl = window.location.href;
        if (__DEV__) console.log("[auth-callback] Web URL has hash:", fullUrl.includes("#"), "has code:", fullUrl.includes("code="));

        const hash = window.location.hash;
        if (hash) {
          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          if (accessToken && refreshToken) {
            await createSessionFromTokens(accessToken, refreshToken);
            return;
          }
        }

        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        if (code) {
          await exchangeCode(code);
          return;
        }
      }

      const initialUrl = await Linking.getInitialURL();
      if (__DEV__) console.log("[auth-callback] Initial URL present:", !!initialUrl, initialUrl ? "contains auth-callback:" + initialUrl.includes("auth-callback") : "");

      if (initialUrl) {
        await processUrl(initialUrl);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        if (__DEV__) console.log("[auth-callback] Already have session");
        setStatus("success");
        navigateHome();
        return;
      }

      setTimeout(async () => {
        if (processedRef.current) return;
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s) {
          setStatus("success");
          navigateHome();
        } else {
          setStatus("error");
          setErrorMsg("No authentication data received. Please try signing in again.");
        }
      }, 3000);
    } catch (e) {
      if (__DEV__) console.log("[auth-callback] processInitialUrl error:", e);
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  async function processUrl(url: string): Promise<void> {
    if (processedRef.current) return;

    try {
      const hasCode = url.includes("code=");
      const hasToken = url.includes("access_token");
      const hasHash = url.includes("#");
      if (__DEV__) console.log("[auth-callback] Processing URL - hasCode:", hasCode, "hasToken:", hasToken, "hasHash:", hasHash);

      if (hasHash) {
        const hashPart = url.split("#")[1];
        if (hashPart) {
          const hashParams = new URLSearchParams(hashPart);
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          if (accessToken && refreshToken) {
            await createSessionFromTokens(accessToken, refreshToken);
            return;
          }
        }
      }

      const parsed = Linking.parse(url);
      const qp = parsed.queryParams ?? {};

      if (qp.code) {
        await exchangeCode(qp.code as string);
        return;
      }

      if (qp.access_token && qp.refresh_token) {
        await createSessionFromTokens(qp.access_token as string, qp.refresh_token as string);
        return;
      }

      if (__DEV__) console.log("[auth-callback] No auth params found in URL");
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setStatus("success");
        navigateHome();
      } else {
        setStatus("error");
        setErrorMsg("Could not find authentication data. Please try again.");
      }
    } catch (e) {
      if (__DEV__) console.log("[auth-callback] processUrl error:", e);
      setStatus("error");
      setErrorMsg("Something went wrong while signing in.");
    }
  }

  async function exchangeCode(code: string) {
    processedRef.current = true;
    if (__DEV__) console.log("[auth-callback] Exchanging code for session...");

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      if (__DEV__) console.log("[auth-callback] exchangeCode error:", error.message);
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        if (__DEV__) console.log("[auth-callback] But session already exists, proceeding");
        setStatus("success");
        navigateHome();
      } else {
        setStatus("error");
        setErrorMsg(error.message);
      }
      return;
    }

    if (__DEV__) console.log("[auth-callback] Code exchange successful, session:", !!data.session);
    await verifyAndNavigate();
  }

  async function createSessionFromTokens(accessToken: string, refreshToken: string) {
    processedRef.current = true;
    if (__DEV__) console.log("[auth-callback] Setting session from tokens...");

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      if (__DEV__) console.log("[auth-callback] setSession error:", error.message);
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }

    if (__DEV__) console.log("[auth-callback] setSession successful, session:", !!data.session);
    await verifyAndNavigate();
  }

  async function verifyAndNavigate() {
    const { data: { session } } = await supabase.auth.getSession();
    if (__DEV__) console.log("[auth-callback] Verified session:", !!session, session?.user?.email ? "user: " + session.user.email.substring(0, 3) + "..." : "");

    if (session) {
      setStatus("success");
      navigateHome();
    } else {
      setStatus("error");
      setErrorMsg("Session was created but could not be verified. Tap continue below.");
    }
  }

  async function navigateHome() {
    // Clear any stale layout redirect — auth-callback owns navigation from here,
    // so we don't want _layout.tsx to re-redirect on the next sign-in.
    await AsyncStorage.removeItem(PENDING_AUTH_REDIRECT_KEY).catch(() => {});
    // Peek (don't consume) so the invite survives if username-setup is needed first
    const pending = await peekPendingInvite();
    setTimeout(() => {
      if (pending?.code) {
        router.replace(`/invite/${pending.code}` as never);
      } else {
        router.replace("/(tabs)");
      }
    }, 300);
  }

  function handleRetry() {
    processedRef.current = false;
    setStatus("processing");
    setErrorMsg("");
    processInitialUrl();
  }

  async function handleContinue() {
    await AsyncStorage.removeItem(PENDING_AUTH_REDIRECT_KEY).catch(() => {});
    const pending = await peekPendingInvite();
    if (pending?.code) {
      router.replace(`/invite/${pending.code}` as never);
    } else {
      router.replace("/(tabs)");
    }
  }

  function handleBackToSignIn() {
    router.replace("/auth");
  }

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}>
      <View style={styles.content}>
        {status === "processing" && (
          <>
            <ActivityIndicator size="large" color={Colors.dark.tint} />
            <Text style={styles.text}>Signing you in...</Text>
          </>
        )}

        {status === "success" && (
          <>
            <Ionicons name="checkmark-circle" size={48} color={Colors.dark.tint} />
            <Text style={styles.text}>Signed in!</Text>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={handleContinue}
            >
              <Text style={styles.buttonText}>Continue to Swayger</Text>
            </Pressable>
          </>
        )}

        {status === "error" && (
          <>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.accentGold} />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={handleRetry}
            >
              <Text style={styles.buttonText}>Try Again</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              onPress={handleContinue}
            >
              <Text style={styles.secondaryButtonText}>Continue to Swayger</Text>
            </Pressable>
            <Pressable style={styles.linkButton} onPress={handleBackToSignIn}>
              <Text style={styles.linkText}>Back to Sign In</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
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
    gap: 20,
    paddingHorizontal: 32,
  },
  text: {
    fontSize: 18,
    color: Colors.dark.text,
    fontWeight: "500" as const,
  },
  errorText: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  button: {
    backgroundColor: Colors.dark.accent,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: "center",
    width: "100%",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600" as const,
  },
  secondaryButton: {
    backgroundColor: Colors.dark.surface,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: "center",
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  secondaryButtonText: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: "600" as const,
  },
  linkButton: {
    paddingVertical: 8,
  },
  linkText: {
    color: Colors.dark.tint,
    fontSize: 14,
  },
});
