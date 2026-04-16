import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "swayger_pending_invite";

export interface PendingInvite {
  code: string;
  intent: "accept" | "view";
}

export async function storePendingInvite(invite: PendingInvite): Promise<void> {
  const value = JSON.stringify(invite);
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        sessionStorage.setItem(STORAGE_KEY, value);
      } catch {}
    }
    await AsyncStorage.setItem(STORAGE_KEY, value);
  } catch {}
}

export async function consumePendingInvite(): Promise<PendingInvite | null> {
  try {
    let raw: string | null = null;

    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) sessionStorage.removeItem(STORAGE_KEY);
      } catch {}
    }

    if (!raw) {
      raw = await AsyncStorage.getItem(STORAGE_KEY);
    }

    if (raw) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return JSON.parse(raw) as PendingInvite;
    }
  } catch {}
  return null;
}

export async function peekPendingInvite(): Promise<PendingInvite | null> {
  try {
    let raw: string | null = null;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try { raw = sessionStorage.getItem(STORAGE_KEY); } catch {}
    }
    if (!raw) raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PendingInvite;
  } catch {}
  return null;
}
