import { useEffect } from "react";
import { StyleSheet, Text, View, ActivityIndicator, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const params = useLocalSearchParams();

  useEffect(() => {
    handleCallback();
  }, []);

  async function handleCallback() {
    try {
      let handled = false;

      if (Platform.OS === "web") {
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        if (hash) {
          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          if (accessToken && refreshToken) {
            if (__DEV__) console.log("[auth-callback] Setting session from hash tokens");
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) {
              if (__DEV__) console.log("[auth-callback] setSession error:", error.message);
            } else {
              handled = true;
            }
          }
        }
      }

      if (!handled) {
        const url = await Linking.getInitialURL();
        if (url) {
          if (__DEV__) console.log("[auth-callback] Incoming URL received");
          handled = await handleUrl(url);
        }
      }

      if (!handled) {
        const code = params.code as string | undefined;
        if (code) {
          if (__DEV__) console.log("[auth-callback] Exchanging code for session");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            if (__DEV__) console.log("[auth-callback] exchangeCode error:", error.message);
          } else {
            handled = true;
          }
        }
      }

      if (!handled) {
        const accessToken = params.access_token as string | undefined;
        const refreshToken = params.refresh_token as string | undefined;
        if (accessToken && refreshToken) {
          if (__DEV__) console.log("[auth-callback] Setting session from params");
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            if (__DEV__) console.log("[auth-callback] setSession error:", error.message);
          } else {
            handled = true;
          }
        }
      }

      if (!handled) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          if (__DEV__) console.log("[auth-callback] Already authenticated");
          handled = true;
        }
      }

      if (__DEV__) console.log("[auth-callback] Handled:", handled);

      setTimeout(() => {
        router.replace("/(tabs)");
      }, 500);
    } catch (e) {
      if (__DEV__) console.log("[auth-callback] Error:", e);
      setTimeout(() => {
        router.replace("/auth");
      }, 1000);
    }
  }

  async function handleUrl(url: string): Promise<boolean> {
    try {
      const parsed = Linking.parse(url);
      const queryParams = parsed.queryParams ?? {};

      const code = queryParams.code as string | undefined;
      if (code) {
        if (__DEV__) console.log("[auth-callback] Exchanging code from URL");
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) return true;
        if (__DEV__) console.log("[auth-callback] exchangeCode error:", error.message);
      }

      const accessToken = queryParams.access_token as string | undefined;
      const refreshToken = queryParams.refresh_token as string | undefined;
      if (accessToken && refreshToken) {
        if (__DEV__) console.log("[auth-callback] Setting session from URL params");
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) return true;
        if (__DEV__) console.log("[auth-callback] setSession error:", error.message);
      }

      if (url.includes("#")) {
        const hash = url.split("#")[1];
        const hashParams = new URLSearchParams(hash);
        const at = hashParams.get("access_token");
        const rt = hashParams.get("refresh_token");
        if (at && rt) {
          if (__DEV__) console.log("[auth-callback] Setting session from URL hash");
          const { error } = await supabase.auth.setSession({
            access_token: at,
            refresh_token: rt,
          });
          if (!error) return true;
        }
      }
    } catch (e) {
      if (__DEV__) console.log("[auth-callback] handleUrl error:", e);
    }
    return false;
  }

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
        <Text style={styles.text}>Signing you in...</Text>
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
  },
  text: {
    fontSize: 18,
    color: Colors.dark.text,
    fontWeight: "500" as const,
  },
});
