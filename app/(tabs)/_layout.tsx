import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import SwaygerMark from "@/components/SwaygerMark";

import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import AppFeedbackModal, {
  shouldShowAppFeedbackPrompt,
  markAppFeedbackPromptShown,
} from "@/components/AppFeedbackModal";

// Safely check for liquid glass — expo-glass-effect requires a custom native build
// and is not available in Expo Go, so we lazy-require to avoid a top-level crash.
function checkLiquidGlass(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("expo-glass-effect");
    return mod.isLiquidGlassAvailable?.() ?? false;
  } catch {
    return false;
  }
}

function NativeTabLayout() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NativeTabs, Icon, Label } = require("expo-router/unstable-native-tabs");
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <Icon sf={{ default: "tv", selected: "tv.fill" }} />
          <Label>Game Day</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="challenges">
          <Icon sf={{ default: "flame", selected: "flame.fill" }} />
          <Label>Swaygers</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="leaderboard">
          <Icon sf={{ default: "trophy", selected: "trophy.fill" }} />
          <Label>Leaderboard</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          <Icon sf={{ default: "person", selected: "person.fill" }} />
          <Label>Profile</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  } catch {
    return <ClassicTabLayout />;
  }
}

function ClassicTabLayout() {
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.dark.tint,
        tabBarInactiveTintColor: Colors.dark.tabIconDefault,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : Colors.dark.surface,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: Colors.dark.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.dark.surface }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Game Day",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="tv-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="challenges"
        options={{
          title: "Swaygers",
          tabBarIcon: ({ color, size }) => (
            <SwaygerMark color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Leaderboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
      {/* create.tsx stays routable via router.push("/(tabs)/create") but is not a visible tab */}
      <Tabs.Screen
        name="create"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { profile } = useAuth();
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // ─── App-open feedback prompt ─────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.created_at) return;

    const timer = setTimeout(async () => {
      const eligible = await shouldShowAppFeedbackPrompt(profile.created_at);
      if (eligible) {
        await markAppFeedbackPromptShown();
        setShowFeedbackModal(true);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [profile?.created_at]);
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {checkLiquidGlass() ? (
        <NativeTabLayout />
      ) : (
        <ClassicTabLayout />
      )}

      {/* App-open feedback prompt — shown once per device for existing users */}
      {showFeedbackModal && (
        <AppFeedbackModal onDone={() => setShowFeedbackModal(false)} />
      )}
    </>
  );
}
