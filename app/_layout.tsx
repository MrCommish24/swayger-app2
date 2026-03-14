import { QueryClientProvider } from "@tanstack/react-query";
import {
  Stack,
  useRouter,
  useSegments,
  useRootNavigationState,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import Constants from "expo-constants";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ToastContainer from "@/components/ToastContainer";
import { queryClient } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { registerPushToken } from "@/lib/notifications";

import Colors from "@/constants/colors";

SplashScreen.preventAutoHideAsync();

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

  useEffect(() => {
    if (isLoading) return;
    if (!navigationState?.key) return;

    const inAuthGroup = segments[0] === "auth";
    const inUsernameSetup = segments[0] === "username-setup";
    const inAuthCallback = segments[0] === "auth-callback";

    if (inAuthCallback) return;

    if (!session && !inAuthGroup && !inAuthCallback) {
      router.replace("/auth");
    } else if (session && needsUsername && !profileError && !inUsernameSetup) {
      router.replace("/username-setup");
    } else if (session && !needsUsername && (inAuthGroup || inUsernameSetup)) {
      router.replace("/(tabs)");
    } else if (session && profileError && (inAuthGroup || inUsernameSetup)) {
      router.replace("/(tabs)");
    }
  }, [session, isLoading, needsUsername, profileError, segments, navigationState?.key]);
}

function RootLayoutNav() {
  const { isLoading, session } = useAuth();

  useProtectedRoute();

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  useEffect(() => {
    if (session) {
      registerPushToken();
    }
  }, [session?.user?.id]);

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
      </Stack>
      <ToastContainer />
    </>
  );
}

export default function RootLayout() {
  // New Architecture (newArchEnabled: true) does not auto-register vector icon
  // fonts on native. Load Ionicons explicitly before any icons render.
  // On web, icons use CSS so we skip this (empty map resolves instantly).
  const [fontsLoaded, fontError] = useFonts(
    Platform.OS === "web" ? {} : Ionicons.font
  );

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary onError={(err, stack) => console.error("[ErrorBoundary]", err.message, stack)}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <AuthProvider>
                <RootLayoutNav />
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
