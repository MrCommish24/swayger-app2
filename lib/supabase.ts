import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === "web") {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === "web") {
      try {
        localStorage.setItem(key, value);
      } catch {}
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === "web") {
      try {
        localStorage.removeItem(key);
      } catch {}
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

let supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
let supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (supabaseUrl && !supabaseUrl.startsWith("http") && supabaseAnonKey.startsWith("http")) {
  const temp = supabaseUrl;
  supabaseUrl = supabaseAnonKey;
  supabaseAnonKey = temp;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
