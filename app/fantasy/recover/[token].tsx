/**
 * app/fantasy/recover/[token].tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 5.2.3 — Commissioner-Assisted Member Recovery
 *
 * Flow:
 *   1. Screen loads → fetch public token info (GET /api/fantasy/recover/:token)
 *   2a. Token valid + NOT signed in → show context + "Sign In / Continue" button
 *   2b. Token valid + signed in → show context + "Restore Access" button
 *   3.  On "Restore Access" → POST /api/fantasy/recover/:token
 *   4.  Success / error screens
 *
 * The raw token travels ONLY in the URL path — never in localStorage, cookies,
 * or any persistent storage by this screen.  The PENDING_AUTH_REDIRECT_KEY in
 * AsyncStorage carries the path back after sign-in.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import {
  getMemberRecoveryInfo,
  redeemMemberRecoveryToken,
  type RecoveryTokenInfo,
  type RecoveryRedemptionResult,
} from "@/lib/fantasy-api";
import { PENDING_AUTH_REDIRECT_KEY } from "@/app/_layout";

// ── Types ─────────────────────────────────────────────────────────────────────

type ScreenState =
  | "loading"        // fetching token info
  | "invalid"        // 404 — link not found / malformed
  | "expired"        // token past expiry
  | "revoked"        // commissioner revoked it
  | "already_used"   // redeemed by someone else
  | "pre_auth"       // pending + user not signed in
  | "confirm"        // pending + user signed in → show context + confirm button
  | "redeeming"      // POST in flight
  | "success"        // redemption complete (new or idempotent)
  | "wrong_account"  // 409 — this account is already a member
  | "error";         // unexpected server error

// ── Helpers ───────────────────────────────────────────────────────────────────

function hoursUntil(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000));
}

function ExpiryBadge({ expiresAt }: { expiresAt: string }) {
  const h = hoursUntil(expiresAt);
  const label = h === 0 ? "Expires soon" : `Expires in ${h}h`;
  return <Text style={s.badge}>{label} · Single use</Text>;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RecoverScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useAuth();

  const [state, setState]           = useState<ScreenState>("loading");
  const [tokenInfo, setTokenInfo]   = useState<RecoveryTokenInfo | null>(null);
  const [result, setResult]         = useState<RecoveryRedemptionResult | null>(null);
  const [errorMsg, setErrorMsg]     = useState<string>("");

  // Prevent double-redemption across re-renders
  const attemptedRef = useRef(false);

  // ── Step 1: fetch token info ───────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const info = await getMemberRecoveryInfo(token);
        if (cancelled) return;
        setTokenInfo(info);

        if (info.status === "expired") { setState("expired"); return; }
        if (info.status === "revoked") { setState("revoked"); return; }
        if (info.status === "redeemed") { setState("already_used"); return; }

        // status === "pending" — decide auth branch
        setState(session ? "confirm" : "pre_auth");
      } catch (err: any) {
        if (cancelled) return;
        const code = err?.message?.includes("not_found") ? "invalid" : "error";
        setState(code as ScreenState);
        setErrorMsg(err?.message ?? "Unknown error");
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // intentionally omit `session` — auth branch resolved in Step 2

  // ── Step 2: upgrade pre_auth → confirm when session arrives ───────────────
  useEffect(() => {
    if (state === "pre_auth" && session) {
      setState("confirm");
    }
  }, [session, state]);

  // ── Redeem handler ────────────────────────────────────────────────────────
  const handleRedeem = useCallback(async () => {
    if (!session || !token || attemptedRef.current) return;
    attemptedRef.current = true;
    setState("redeeming");

    try {
      const r = await redeemMemberRecoveryToken(token, { session });
      setResult(r);
      setState("success");
    } catch (err: any) {
      attemptedRef.current = false; // allow retry on error
      const code: string = err?.message ?? "";
      if (
        code.includes("already connected to another member") ||
        code.includes("wrong_account")
      ) {
        setState("wrong_account");
        setErrorMsg(err.message);
      } else if (
        code.includes("expired") ||
        code.includes("revoked") ||
        code.includes("already been used")
      ) {
        setState("already_used");
        setErrorMsg(err.message);
      } else {
        setState("error");
        setErrorMsg(err.message ?? "Something went wrong.");
      }
    }
  }, [session, token]);

  // ── Sign-in redirect ──────────────────────────────────────────────────────
  const handleSignIn = useCallback(async () => {
    if (!token) return;
    const redirect = `/fantasy/recover/${token}`;
    await AsyncStorage.setItem(PENDING_AUTH_REDIRECT_KEY, redirect);
    router.push("/auth");
  }, [token]);

  // ── Render helpers ────────────────────────────────────────────────────────

  if (state === "loading") {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
      </View>
    );
  }

  if (state === "redeeming") {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
        <Text style={s.loadingLabel}>Restoring access…</Text>
      </View>
    );
  }

  if (state === "success" && result) {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <Text style={s.successIcon}>🎉</Text>
        <Text style={s.title}>You&apos;re back in</Text>

        {result.display_name ? (
          <Text style={s.heroName}>{result.display_name}</Text>
        ) : null}
        {result.team_name ? (
          <Text style={s.teamName}>{result.team_name}</Text>
        ) : null}
        {result.league_name ? (
          <Text style={s.leagueName}>{result.league_name}</Text>
        ) : null}

        <Text style={s.successBody}>
          Your team, picks, and standings are exactly as you left them.
        </Text>

        {result.already_redeemed_by_you && (
          <View style={s.infoBanner}>
            <Text style={s.infoText}>
              This link was already used to restore your access. No changes were made.
            </Text>
          </View>
        )}

        <Pressable
          style={s.primaryBtn}
          onPress={() =>
            router.replace(
              (result.season_id
                ? `/fantasy/${result.league_id}/${result.season_id}`
                : `/fantasy/${result.league_id}`) as any
            )
          }
        >
          <Text style={s.primaryBtnText}>Go to My League</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (state === "wrong_account") {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <Text style={s.errorIcon}>⚠️</Text>
        <Text style={s.title}>Wrong account</Text>
        <Text style={s.body}>
          The Swayger account you&apos;re signed into is already connected to a
          different member in this league.
        </Text>
        <Text style={s.body}>
          Sign out and sign in with the account that owns this recovery link,
          or ask your commissioner to generate a new link.
        </Text>
        <Pressable style={s.secondaryBtn} onPress={() => router.back()}>
          <Text style={s.secondaryBtnText}>Go Back</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (state === "expired") {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <Text style={s.errorIcon}>⏰</Text>
        <Text style={s.title}>Link expired</Text>
        <Text style={s.body}>
          This recovery link has expired (links are valid for 24 hours).
        </Text>
        <Text style={s.body}>Ask your commissioner to generate a new recovery link.</Text>
        <Pressable style={s.secondaryBtn} onPress={() => router.back()}>
          <Text style={s.secondaryBtnText}>Go Back</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (state === "revoked") {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <Text style={s.errorIcon}>🚫</Text>
        <Text style={s.title}>Link revoked</Text>
        <Text style={s.body}>
          This recovery link has been revoked by your commissioner.
        </Text>
        <Text style={s.body}>Ask your commissioner to generate a new recovery link.</Text>
        <Pressable style={s.secondaryBtn} onPress={() => router.back()}>
          <Text style={s.secondaryBtnText}>Go Back</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (state === "already_used") {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <Text style={s.errorIcon}>🔒</Text>
        <Text style={s.title}>Link already used</Text>
        <Text style={s.body}>
          This recovery link has already been redeemed. Each link can only be used once.
        </Text>
        <Text style={s.body}>
          If you still can&apos;t access your league, ask your commissioner to generate a
          new recovery link.
        </Text>
        <Pressable style={s.secondaryBtn} onPress={() => router.back()}>
          <Text style={s.secondaryBtnText}>Go Back</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (state === "invalid") {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <Text style={s.errorIcon}>❓</Text>
        <Text style={s.title}>Link not found</Text>
        <Text style={s.body}>
          This recovery link is invalid or has already expired. Ask your commissioner
          to generate a new one.
        </Text>
        <Pressable style={s.secondaryBtn} onPress={() => router.back()}>
          <Text style={s.secondaryBtnText}>Go Back</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (state === "error") {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <Text style={s.errorIcon}>⚠️</Text>
        <Text style={s.title}>Something went wrong</Text>
        <Text style={s.body}>{errorMsg || "An unexpected error occurred."}</Text>
        <Pressable
          style={s.secondaryBtn}
          onPress={() => {
            attemptedRef.current = false;
            setState("loading");
          }}
        >
          <Text style={s.secondaryBtnText}>Try Again</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ── pre_auth / confirm ────────────────────────────────────────────────────

  const info = tokenInfo;

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Text style={s.label}>RECOVER LEAGUE ACCESS</Text>

      {info?.league_name ? (
        <Text style={s.leagueName}>{info.league_name}</Text>
      ) : null}

      {info?.display_name ? (
        <Text style={s.heroName}>{info.display_name}</Text>
      ) : null}
      {info?.team_name ? (
        <Text style={s.teamName}>{info.team_name}</Text>
      ) : null}

      <View style={s.divider} />

      {state === "pre_auth" ? (
        <>
          <Text style={s.body}>
            Your commissioner created this one-time link to restore access to your
            Swayger Fantasy league.
          </Text>
          <Text style={s.body}>
            To protect your league history, sign in or create a Swayger account
            to continue. Your team, picks, and standings stay exactly as they are.
          </Text>

          {info?.expires_at ? <ExpiryBadge expiresAt={info.expires_at} /> : null}

          <Pressable style={s.primaryBtn} onPress={handleSignIn}>
            <Text style={s.primaryBtnText}>Sign In / Create Account</Text>
          </Pressable>
        </>
      ) : (
        /* state === "confirm" — user is already signed in */
        <>
          <Text style={s.body}>
            Tap below to restore access to this Fantasy seat with your current
            Swayger account. Your team, picks, and standings stay exactly as they are.
          </Text>

          {info?.expires_at ? <ExpiryBadge expiresAt={info.expires_at} /> : null}

          <Pressable style={s.primaryBtn} onPress={handleRedeem}>
            <Text style={s.primaryBtnText}>Restore My Access</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingLabel: {
    color: Colors.dark.tabIconDefault,
    fontSize: 15,
  },
  container: {
    flexGrow: 1,
    backgroundColor: Colors.dark.background,
    padding: 24,
    paddingTop: 48,
    alignItems: "center",
    gap: 12,
  },
  label: {
    color: Colors.dark.tabIconDefault,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.2,
    textAlign: "center",
    marginBottom: 8,
  },
  heroName: {
    color: Colors.dark.text,
    fontSize: 32,
    fontWeight: "700",
    textAlign: "center",
  },
  teamName: {
    color: Colors.dark.tint,
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  leagueName: {
    color: Colors.dark.tabIconDefault,
    fontSize: 15,
    textAlign: "center",
    marginBottom: 4,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 12,
  },
  body: {
    color: Colors.dark.tabIconDefault,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 360,
  },
  badge: {
    color: Colors.dark.tabIconDefault,
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "#2a2a2a",
    marginVertical: 8,
  },
  primaryBtn: {
    backgroundColor: Colors.dark.tint,
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 32,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#3a3a3a",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 32,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryBtnText: {
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: "600",
  },
  successIcon: { fontSize: 56, marginBottom: 8 },
  errorIcon:   { fontSize: 56, marginBottom: 8, marginTop: 24 },
  successBody: {
    color: Colors.dark.tabIconDefault,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 340,
    marginTop: 8,
  },
  infoBanner: {
    backgroundColor: "#1e2a1e",
    borderRadius: 10,
    padding: 14,
    maxWidth: 360,
    width: "100%",
    marginTop: 4,
  },
  infoText: {
    color: "#66bb6a",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
});
