import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setIsLoading(false);
      }
    });

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

    return () => subscription.unsubscribe();
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
