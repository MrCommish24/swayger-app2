import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const PUSH_NUDGE_KEY = "swayger-push-nudge-v2-dismissed";
type PushNudgeState = "checking" | "granted" | "ios-no-pwa" | "needs-prompt" | "denied";

export function PushNotificationBanner() {
  const [nudgeState, setNudgeState] = useState<PushNudgeState>("checking");
  const [dismissed, setDismissed] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    try { if (window.localStorage.getItem(PUSH_NUDGE_KEY)) { setDismissed(true); return; } } catch {}

    const NotifAPI = (window as any).Notification;
    if (!NotifAPI) return;

    if (NotifAPI.permission === "granted") { setNudgeState("granted"); return; }
    if (NotifAPI.permission === "denied")  { setNudgeState("denied");  return; }

    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isPWA = window.matchMedia?.("(display-mode: standalone)").matches
      || !!(navigator as any).standalone;

    setNudgeState(isIOS && isSafari && !isPWA ? "ios-no-pwa" : "needs-prompt");
  }, []);

  function handleDismiss() {
    try { window.localStorage.setItem(PUSH_NUDGE_KEY, "1"); } catch {}
    setDismissed(true);
    setShowIOSGuide(false);
  }

  async function handleEnablePress() {
    if (nudgeState === "ios-no-pwa" || nudgeState === "denied") {
      setShowIOSGuide(true);
      return;
    }
    try {
      const w = window as any;
      if (w.OneSignal) {
        await w.OneSignal.User.PushSubscription.optIn();
        const perm = w.Notification?.permission;
        if (perm === "granted") setNudgeState("granted");
        else if (perm === "denied") setNudgeState("denied");
      } else if (w.Notification) {
        const result = await w.Notification.requestPermission();
        setNudgeState(result === "granted" ? "granted" : result === "denied" ? "denied" : "needs-prompt");
      }
    } catch (e) {
      console.error("[push-nudge] error:", e);
    }
  }

  if (Platform.OS !== "web") return null;
  if (nudgeState === "checking" || nudgeState === "granted" || dismissed) return null;

  if (showIOSGuide) {
    const steps = nudgeState === "denied"
      ? [
          "Tap the lock icon (🔒) in your browser's address bar",
          'Find "Notifications" and change it to "Allow"',
          "Reload the page — Swayger will register your device",
        ]
      : [
          "Open Swayger in Safari (not Chrome or another browser)",
          "Tap the Share icon ⎙ at the bottom of the screen",
          'Tap "Add to Home Screen" and confirm',
          "Open Swayger from the Home Screen icon",
          "Tap Allow when prompted",
        ];

    return (
      <View style={styles.banner}>
        <View style={styles.left}>
          <View style={styles.iconWrap}>
            <Ionicons name="information-circle-outline" size={20} color="#FFC72C" />
          </View>
          <View style={styles.body}>
            <Text style={styles.title}>
              {nudgeState === "denied" ? "Re-enable notifications" : "Enable on iPhone"}
            </Text>
            {steps.map((step, i) => (
              <Text key={i} style={[styles.sub, { marginTop: 4 }]}>
                {i + 1}. {step}
              </Text>
            ))}
          </View>
        </View>
        <Pressable onPress={handleDismiss} hitSlop={12} style={styles.closeBtn}>
          <Ionicons name="close" size={16} color={Colors.dark.textSecondary} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable onPress={handleEnablePress} style={styles.banner}>
      <View style={styles.left}>
        <View style={styles.iconWrap}>
          <Ionicons name="notifications-outline" size={20} color="#FFC72C" />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>Never miss a lock time</Text>
          <Text style={styles.sub}>
            {nudgeState === "denied"
              ? "Notifications are blocked. Tap to see how to re-enable them."
              : nudgeState === "ios-no-pwa"
              ? "Tap to see how to get pick alerts on your iPhone."
              : "Get pick reminders and score alerts straight to this device."}
          </Text>
          <Text style={styles.cta}>
            {nudgeState === "denied" || nudgeState === "ios-no-pwa"
              ? "See instructions →"
              : "Enable notifications →"}
          </Text>
        </View>
      </View>
      <Pressable onPress={handleDismiss} hitSlop={12} style={styles.closeBtn}>
        <Ionicons name="close" size={16} color={Colors.dark.textSecondary} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: "#FFC72C40",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  left: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFC72C18",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: { flex: 1, gap: 2 },
  title: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  sub: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    lineHeight: 17,
    marginTop: 2,
  },
  cta: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: "#FFC72C",
    marginTop: 6,
  },
  closeBtn: {
    padding: 2,
    flexShrink: 0,
  },
});
