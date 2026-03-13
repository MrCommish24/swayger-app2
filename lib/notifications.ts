import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

export async function registerPushToken(): Promise<void> {
  if (Platform.OS === "web") return;

  try {
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

    const tokenData = await Notifications.getExpoPushTokenAsync();
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

export async function sendPushNotification(
  toUserId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  if (Platform.OS === "web") return;

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
