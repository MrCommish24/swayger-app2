import { QueryClientProvider } from "@tanstack/react-query";
import {
  Stack,
  useRouter,
  useSegments,
  useRootNavigationState,
  usePathname,
  useGlobalSearchParams,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import Constants from "expo-constants";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import {
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
} from "@expo-google-fonts/barlow-condensed";
import {
  DMSans_400Regular,
  DMSans_500Medium,
} from "@expo-google-fonts/dm-sans";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ToastContainer from "@/components/ToastContainer";
import { queryClient } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { registerPushToken, registerOneSignalUser } from "@/lib/notifications";
import { identifyUser, resetUser, capture } from "@/lib/posthog";

import Colors from "@/constants/colors";

SplashScreen.preventAutoHideAsync();

export const PENDING_AUTH_REDIRECT_KEY = "swayger_pending_auth_redirect";

const inExpoGo = Constants.appOwnership === "expo";

if (Platform.OS !== "web" && !inExpoGo) {
  // Lazy require keeps the module from initializing in Expo Go (where it throws on import)
  const Notifications = require("expo-notifications");
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function useProtectedRoute() {
  const { session, isLoading, needsUsername, profileError } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const pathname = usePathname();
  const searchParams = useGlobalSearchParams();

  useEffect(() => {
    if (isLoading) return;
    if (!navigationState?.key) return;

    const inAuthGroup = segments[0] === "auth";
    const inUsernameSetup = segments[0] === "username-setup";
    const inAuthCallback = segments[0] === "auth-callback";
    const inMMPickLanding = segments[0] === "mm-pick";
    const inInvite = segments[0] === "invite"; // Preview-first: let invite screen handle its own auth
    const inPicks = segments[0] === "picks";   // Browse-first: auth wall fires at submit time

    if (inAuthCallback) return;
    if (inMMPickLanding) return;
    // Unauthenticated invite visitors get preview mode — no redirect to /auth.
    // Authenticated visitors with needsUsername still fall through to /username-setup.
    if (inInvite && !session) return;
    // Unauthenticated picks visitors can browse props — auth wall fires at submit time.
    if (inPicks && !session) return;

    if (!session && !inAuthGroup && !inAuthCallback) {
      // Save the intended destination so we can return there after sign-in.
      // Skip tab routes (profile, home, etc.) — they're always accessible after
      // login and restoring them just causes confusing landings on the wrong tab.
      const inTabsGroup = segments[0] === "(tabs)";
      const ignoredPaths = ["/", "/auth", "/username-setup", "/auth-callback"];
      if (!inTabsGroup && !ignoredPaths.includes(pathname)) {
        const paramEntries = Object.entries(searchParams).filter(
          ([k]) => k !== undefined && !["_sitemap"].includes(k)
        );
        const queryString = paramEntries
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join("&");
        const redirectPath = queryString ? `${pathname}?${queryString}` : pathname;
        AsyncStorage.setItem(PENDING_AUTH_REDIRECT_KEY, redirectPath).catch(() => {});
      }
      router.replace("/auth");
    } else if (session && needsUsername && !profileError && !inUsernameSetup) {
      router.replace("/username-setup");
    } else if (session && !needsUsername && (inAuthGroup || inUsernameSetup)) {
      // Returning user (already has username) — check for saved redirect
      AsyncStorage.getItem(PENDING_AUTH_REDIRECT_KEY)
        .then((redirect) => {
          AsyncStorage.removeItem(PENDING_AUTH_REDIRECT_KEY).catch(() => {});
          if (redirect) {
            router.replace(redirect as never);
          } else {
            router.replace("/(tabs)");
          }
        })
        .catch(() => router.replace("/(tabs)"));
    } else if (session && profileError && (inAuthGroup || inUsernameSetup)) {
      router.replace("/(tabs)");
    }
  }, [session, isLoading, needsUsername, profileError, segments, navigationState?.key]);
}

function RootLayoutNav() {
  const { isLoading, session, profile } = useAuth();

  useProtectedRoute();

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  // Identify as soon as we have a session — gives PostHog a user ID
  // to link events to even before the profile loads.
  useEffect(() => {
    if (session) {
      registerPushToken();
      if (Platform.OS === "web") {
        // Store userId in localStorage so the server-injected OneSignal init
        // script can call login() + optIn() without depending on this bundle.
        try { localStorage.setItem("swayger_uid", session.user.id); } catch (_) {}
        if (session.user.email) {
          try { localStorage.setItem("swayger_email", session.user.email); } catch (_) {}
        }
        // Dispatch event in case the OneSignal init callback has already run
        // and is now listening for late-arriving session data.
        try {
          window.dispatchEvent(
            new CustomEvent("swayger:session", {
              detail: { userId: session.user.id, email: session.user.email },
            })
          );
        } catch (_) {}
        registerOneSignalUser(session.user.id);
      }
      identifyUser(session.user.id, { email: session.user.email });
    } else {
      resetUser();
      if (Platform.OS === "web") {
        try { localStorage.removeItem("swayger_uid"); } catch (_) {}
        try { localStorage.removeItem("swayger_email"); } catch (_) {}
        try { localStorage.removeItem("swayger_username"); } catch (_) {}
      }
    }
  }, [session?.user?.id]);

  // Re-identify once the profile loads so PostHog gets username + display name.
  // This merges the anonymous pre-session events with the real person profile.
  useEffect(() => {
    if (session?.user?.id && profile) {
      identifyUser(session.user.id, {
        email: session.user.email,
        username: profile.username,
        display_name: profile.display_name ?? profile.username,
        $name: profile.display_name ?? profile.username,
        $email: session.user.email,
      });
      if (Platform.OS === "web") {
        // Store username so page-load OneSignal path can tag the user
        try { localStorage.setItem("swayger_username", profile.username ?? ""); } catch (_) {}
        // Re-dispatch with username so OneSignal tags are always up to date
        try {
          window.dispatchEvent(
            new CustomEvent("swayger:session", {
              detail: {
                userId: session.user.id,
                email: session.user.email,
                username: profile.username,
              },
            })
          );
        } catch (_) {}
      }
    }
  }, [profile?.username]);

  // Fire $pageview on every route change on web so PostHog DAU/WAU counts work.
  // The React Native SDK never auto-fires $pageview, but PostHog's built-in
  // DAU/WAU insights count $pageview by default.
  const pathname = usePathname();
  useEffect(() => {
    if (Platform.OS === "web") {
      capture("$pageview", { $current_url: window.location.href });
    }
  }, [pathname]);

  return (
    <>
      <Stack
        screenOptions={{
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: Colors.dark.background },
          headerTintColor: Colors.dark.text,
          contentStyle: { backgroundColor: Colors.dark.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="username-setup" options={{ headerShown: false }} />
        <Stack.Screen name="swayger/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="invite/[code]" options={{ headerShown: false }} />
        <Stack.Screen name="join" options={{ headerShown: false }} />
        <Stack.Screen name="h2h/index" options={{ headerShown: false }} />
        <Stack.Screen name="h2h/[opponentId]" options={{ headerShown: false }} />
        <Stack.Screen name="march-madness/index" options={{ headerShown: false }} />
        <Stack.Screen name="mm-pick/[matchupId]" options={{ headerShown: false }} />
        <Stack.Screen name="picks/index" options={{ headerShown: false }} />
        <Stack.Screen name="playoffs/index" options={{ headerShown: false }} />
        <Stack.Screen name="playoffs/bracket" options={{ headerShown: false }} />
        <Stack.Screen name="playoffs/leaderboard" options={{ headerShown: false }} />
      </Stack>
      <ToastContainer />
    </>
  );
}

export default function RootLayout() {
  // New Architecture (newArchEnabled: true) does not auto-register vector icon
  // fonts on native. Load Ionicons explicitly before any icons render.
  // On web, icons use CSS so we skip this (empty map resolves instantly).
  const [fontsLoaded, fontError] = useFonts({
    ...(Platform.OS === "web" ? {} : Ionicons.font),
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary onError={(err, stack) => console.error("[ErrorBoundary]", err.message, stack)}>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <AuthProvider>
                <RootLayoutNav />
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
