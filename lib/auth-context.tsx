import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { runSchemaVerification } from "@/lib/verify-schema";
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const profileFetchedRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (__DEV__) console.log("[auth-context] getSession result:", s ? "session exists" : "no session");
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        if (__DEV__) console.log("[auth-context] onAuthStateChange:", event, s ? "session exists" : "no session");
        setSession(s);
        if (s?.user) {
          if (profileFetchedRef.current !== s.user.id) {
            fetchProfile(s.user.id);
          }
        } else {
          setProfile(null);
          setNeedsUsername(false);
          setProfileError(null);
          profileFetchedRef.current = null;
          setIsLoading(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function fetchProfile(userId: string) {
    profileFetchedRef.current = userId;
    setProfileError(null);
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Profile fetch timed out")), 30000)
      );
      const queryPromise = supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, email, created_at, updated_at")
        .eq("id", userId)
        .single();
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as Awaited<typeof queryPromise>;

      if (error) {
        if (error.code === "PGRST116") {
          setNeedsUsername(true);
          setProfile(null);
          // PGRST116 = no row found = needs username setup, keep ref set
        } else {
          setProfileError(error.message);
          setProfile(null);
          setNeedsUsername(false);
          // Clear ref so next auth event can retry the fetch
          profileFetchedRef.current = null;
        }
      } else if (data) {
        const fetched = data as Profile;
        setProfile((prev) => ({
          ...fetched,
          display_name: fetched.display_name ?? prev?.display_name ?? null,
        }));
        setNeedsUsername(false);
        setProfileError(null);
        void supabase.rpc("update_last_seen").then(() => {}, () => {});
        if (__DEV__) {
          runSchemaVerification().catch(() => {});
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load profile";
      setProfileError(message);
      // On a timeout, preserve whatever profile is already in state —
      // wiping it would erase optimistic updates and cause name reversion.
      // Only clear profile on definitive auth/permission errors.
      if (message !== "Profile fetch timed out") {
        setProfile(null);
      }
      profileFetchedRef.current = null;
    } finally {
      setIsLoading(false);
    }
  }

  function retryProfileFetch() {
    const userId = session?.user?.id;
    if (userId) {
      profileFetchedRef.current = null;
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
    profileFetchedRef.current = null;
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
