import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { getApiUrl } from "@/lib/query-client";

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

// ── Web: register OneSignal user (links browser to Supabase UUID) ─────────────
export async function registerOneSignalUser(userId: string): Promise<void> {
  if (Platform.OS !== "web") return;
  try {
    const w = window as any;
    w.OneSignalDeferred = w.OneSignalDeferred || [];
    w.OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        console.log("[notifications] OneSignal SDK ready, linking user:", userId.slice(0, 8));
        await OneSignal.login(userId);
        console.log("[notifications] OneSignal login OK");

        // In OneSignal Web SDK v16, requestPermission() only handles the browser
        // dialog. The actual push subscription is created via optIn(). If browser
        // permission is already granted, optIn() silently registers without prompting.
        const browserPermission = w.Notification?.permission;
        console.log("[notifications] Browser permission state:", browserPermission);
        if (browserPermission === "granted") {
          try {
            await OneSignal.User.PushSubscription.optIn();
            console.log("[notifications] Push subscription opted in (existing permission)");
          } catch (e) {
            console.error("[notifications] optIn error:", e);
          }
        }
      } catch (e) {
        console.error("[notifications] OneSignal login error:", e);
      }
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[notifications] registerOneSignalUser error:", msg);
  }
}

// ── Native: register Expo push token ─────────────────────────────────────────
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === "web") return;

  if (isExpoGo()) {
    console.log(
      "[notifications] Skipping push token registration — not supported in Expo Go on SDK 53+. " +
        "Use a development or production build to enable push notifications."
    );
    return;
  }

  try {
    const Notifications = require("expo-notifications");

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("[notifications] Permission not granted");
      return;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.log(
        "[notifications] No EAS projectId configured — push tokens require an EAS project. " +
          "Run `eas init` to set up."
      );
      return;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    const { error } = await supabase.from("push_tokens").upsert(
      { token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("[notifications] Failed to save push token:", error.message);
    } else {
      console.log("[notifications] Push token registered:", token.slice(0, 30) + "...");
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[notifications] registerPushToken error:", msg);
  }
}

// ── Send push notification ────────────────────────────────────────────────────
// On web: calls our server → OneSignal REST API (REST key stays server-side)
// On native: calls Expo Push API directly with token from Supabase
export async function sendPushNotification(
  toUserId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  // Web: route through server so the OneSignal REST key stays private
  if (Platform.OS === "web") {
    try {
      await fetch(new URL("/api/push/send", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId, title, body, data: data || {} }),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[notifications] web push error:", msg);
    }
    return;
  }

  if (isExpoGo()) return;

  try {
    const { data: token, error } = await supabase.rpc("get_push_token", {
      p_user_id: toUserId,
    });

    if (error || !token) return;

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data: data || {},
        sound: "default",
      }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[notifications] sendPushNotification error:", msg);
  }
}
