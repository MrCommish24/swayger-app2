import { Tabs, usePathname } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";

import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { isPublicHomepage } from "@/lib/public-homepage";
import PublicHomepage from "@/components/marketing/PublicHomepage";
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
          <Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
          <Label>1v1</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="fantasy">
          <Icon sf={{ default: "trophy", selected: "trophy.fill" }} />
          <Label>Fantasy</Label>
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
        tabBarInactiveTintColor: Colors.dark.textSecondary,
        tabBarLabelPosition: "below-icon",
        // The default label clips to the item's padded 54px width at 320px.
        // Keep the full label centered over its 64px touch target instead.
        tabBarLabel: ({ color, children }) => (
          <Text style={{
            fontFamily: "BarlowCondensed_700Bold",
            fontSize: 12,
            lineHeight: 16,
            color,
            width: 64,
            textAlign: "center",
          }}>{children}</Text>
        ),
        tabBarItemStyle: { minWidth: 0 },
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
          title: "1v1",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="fantasy"
        options={{
          title: "Fantasy",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy-outline" color={color} size={size} />
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
  const { profile, session, isLoading } = useAuth();
  const pathname = usePathname();
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

  // Keep the app navigator, dashboard queries and tab bar out of the public page.
  // Wait for session restoration so returning members never see a marketing flash.
  if (Platform.OS === "web" && pathname === "/" && isLoading) return null;
  if (isPublicHomepage(Platform.OS, pathname, !!session)) return <PublicHomepage />;

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
