import { QueryClientProvider } from "@tanstack/react-query";
import {
  Stack,
  useRouter,
  useSegments,
  useRootNavigationState,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/lib/auth-context";

import Colors from "@/constants/colors";

SplashScreen.preventAutoHideAsync();

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

    if (!session && !inAuthGroup) {
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
  const { isLoading } = useAuth();

  useProtectedRoute();

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  return (
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
      <Stack.Screen
        name="invite/[code]"
        options={{ title: "Invite", presentation: "modal" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
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
  );
}
