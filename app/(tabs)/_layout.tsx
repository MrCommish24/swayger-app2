import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { fetchMySwaygers } from "@/lib/swayger";
import { SwaygerData } from "@/types";
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

function NativeTabLayout({ badgeCount }: { badgeCount: number }) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NativeTabs, Icon, Label } = require("expo-router/unstable-native-tabs");
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <Icon sf={{ default: "flame", selected: "flame.fill" }} />
          <Label>Swaygers</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="create">
          <Icon sf={{ default: "plus.circle", selected: "plus.circle.fill" }} />
          <Label>Create</Label>
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
    return <ClassicTabLayout badgeCount={badgeCount} />;
  }
}

function ClassicTabLayout({ badgeCount }: { badgeCount: number }) {
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
          title: "Swaygers",
          tabBarBadge: badgeCount > 0 ? badgeCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flash-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "Create",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" color={color} size={size} />
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
    </Tabs>
  );
}

export default function TabLayout() {
  const { user, profile } = useAuth();
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const { data: swaygers = [] } = useQuery<SwaygerData[]>({
    queryKey: ["swaygers", "mine", user?.id],
    queryFn: () => fetchMySwaygers(user!.id),
    enabled: !!user,
    staleTime: 30_000,
  });

  const badgeCount = swaygers.filter((s) => {
    if (s.status === "pending_invite" && s.creator_id !== user?.id) return true;
    if (s.status === "settlement_proposed") return true;
    return false;
  }).length;

  // ─── App-open feedback prompt ─────────────────────────────────────────────
  // Wait for profile to load, then check eligibility after a short delay so
  // the prompt doesn't interrupt the initial navigation render.
  //
  // To reset for testing: clear AsyncStorage key PROMPT_SHOWN_KEY, or bump
  // the key version in components/AppFeedbackModal.tsx.
  useEffect(() => {
    if (!profile?.created_at) return;

    const timer = setTimeout(async () => {
      const eligible = await shouldShowAppFeedbackPrompt(profile.created_at);
      if (eligible) {
        // Mark shown immediately so a re-render loop can't fire it twice
        await markAppFeedbackPromptShown();
        setShowFeedbackModal(true);
      }
    }, 2000); // 2-second delay — lets the home screen settle before prompting

    return () => clearTimeout(timer);
  }, [profile?.created_at]);
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {checkLiquidGlass() ? (
        <NativeTabLayout badgeCount={badgeCount} />
      ) : (
        <ClassicTabLayout badgeCount={badgeCount} />
      )}

      {/* App-open feedback prompt — shown once per device for existing users */}
      {showFeedbackModal && (
        <AppFeedbackModal onDone={() => setShowFeedbackModal(false)} />
      )}
    </>
  );
}
