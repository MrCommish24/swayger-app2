import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { Profile } from "@/types";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  needsUsername: boolean;
  profileError: string | null;
  setProfile: (profile: Profile | null) => void;
  setNeedsUsername: (val: boolean) => void;
  retryProfileFetch: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  needsUsername: false,
  profileError: null,
  setProfile: () => {},
  setNeedsUsername: () => {},
  retryProfileFetch: () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function extractAuthParams(url: string): { code?: string; accessToken?: string; refreshToken?: string } {
  try {
    const parsed = Linking.parse(url);
    const qp = parsed.queryParams ?? {};

    if (qp.code) {
      return { code: qp.code as string };
    }
    if (qp.access_token && qp.refresh_token) {
      return { accessToken: qp.access_token as string, refreshToken: qp.refresh_token as string };
    }

    if (url.includes("#")) {
      const hash = url.split("#")[1];
      const hashParams = new URLSearchParams(hash);
      const at = hashParams.get("access_token");
      const rt = hashParams.get("refresh_token");
      if (at && rt) {
        return { accessToken: at, refreshToken: rt };
      }
    }
  } catch (e) {
    if (__DEV__) console.log("[auth] extractAuthParams error:", e);
  }
  return {};
}

async function handleAuthUrl(url: string): Promise<boolean> {
  if (!url.includes("auth-callback")) return false;
  if (__DEV__) console.log("[auth] Handling auth callback URL");

  const params = extractAuthParams(url);

  if (params.code) {
    if (__DEV__) console.log("[auth] Exchanging code for session");
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      if (__DEV__) console.log("[auth] exchangeCode error:", error.message);
      return false;
    }
    return true;
  }

  if (params.accessToken && params.refreshToken) {
    if (__DEV__) console.log("[auth] Setting session from tokens");
    const { error } = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    });
    if (error) {
      if (__DEV__) console.log("[auth] setSession error:", error.message);
      return false;
    }
    return true;
  }

  if (__DEV__) console.log("[auth] No auth params found in URL");
  return false;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl && initialUrl.includes("auth-callback")) {
        if (__DEV__) console.log("[auth] Processing initial deep link");
        await handleAuthUrl(initialUrl);
      }

      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setIsLoading(false);
      }
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        if (s?.user) {
          fetchProfile(s.user.id);
        } else {
          setProfile(null);
          setNeedsUsername(false);
          setProfileError(null);
          setIsLoading(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const sub = Linking.addEventListener("url", async (event) => {
      if (__DEV__) console.log("[auth] Incoming URL event");
      await handleAuthUrl(event.url);
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") {
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      if (hash) {
        const hashParams = new URLSearchParams(hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      }
    }
  }, []);

  async function fetchProfile(userId: string) {
    setProfileError(null);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          setNeedsUsername(true);
          setProfile(null);
        } else {
          setProfileError(error.message);
          setProfile(null);
          setNeedsUsername(false);
        }
      } else if (data) {
        setProfile(data as Profile);
        setNeedsUsername(false);
        setProfileError(null);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load profile";
      setProfileError(message);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }

  function retryProfileFetch() {
    const userId = session?.user?.id;
    if (userId) {
      setIsLoading(true);
      fetchProfile(userId);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setNeedsUsername(false);
    setProfileError(null);
  }

  const user = session?.user ?? null;

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        isLoading,
        needsUsername,
        profileError,
        setProfile,
        setNeedsUsername,
        retryProfileFetch,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
