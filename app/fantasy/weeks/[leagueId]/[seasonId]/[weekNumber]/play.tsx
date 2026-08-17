/**
 * app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/play.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 5 — Member Weekly Pick Screen
 *
 * Mirrors Draft Day play.tsx:
 * - Creates participant on first visit (idempotent)
 * - Shows weekly competition props with answer options
 * - Submits picks optimistically, settles on success
 * - Shows stale-pick warnings for roster-target questions
 * - Read-only when card is locked
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { useFantasyGuestToken } from "@/lib/use-fantasy-guest-token";
import {
  getWeeklyPlay,
  submitWeeklyPick,
  WeeklyPlayState,
  DraftDayProp,
  DraftDayAnswerOption,
} from "@/lib/fantasy-api";
import { PENDING_AUTH_REDIRECT_KEY } from "@/app/_layout";
import Colors from "@/constants/colors";

const C = Colors.dark;

export default function WeeklyPlayScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();
  const { guestToken, guestTokenLoading }   = useFantasyGuestToken();
  const { leagueId, seasonId, weekNumber }  = useLocalSearchParams<{
    leagueId: string; seasonId: string; weekNumber: string;
  }>();

  const wn = parseInt(weekNumber ?? "1", 10);

  const [state, setState]           = useState<WeeklyPlayState | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [errorIsNonMember, setErrorIsNonMember] = useState(false);
  // propId → currently selected answerId (optimistic)
  const [picks, setPicks]           = useState<Record<string, string>>({});
  // propId → "saving" | "saved" | "error"
  const [pickStatus, setPickStatus] = useState<Record<string, string>>({});

  const auth = session ? { session } : guestToken ? { guestToken } : {};

  const load = useCallback(async () => {
    if (!leagueId || !seasonId || !wn) return;
    if (!session && !guestToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getWeeklyPlay(leagueId, seasonId, wn, auth);
      setState(data);
      setPicks(data.my_picks ?? {});
      setErrorIsNonMember(false);
    } catch (e: any) {
      const msg: string = e.message ?? "Failed to load Week picks";
      const isNonMember = msg.toLowerCase().includes("not a member") ||
                          msg.toLowerCase().includes("unauthorized");
      setError(msg);
      setErrorIsNonMember(isNonMember);
    } finally {
      setLoading(false);
    }
  }, [leagueId, seasonId, wn, session?.access_token, guestToken]);

  useEffect(() => {
    if (!authLoading && !guestTokenLoading) load();
  }, [authLoading, guestTokenLoading, load]);

  const handlePick = async (propId: string, answerId: string) => {
    if (!state || state.card_status !== "open") return;

    // Optimistic update
    setPicks(prev => ({ ...prev, [propId]: answerId }));
    setPickStatus(prev => ({ ...prev, [propId]: "saving" }));

    try {
      await submitWeeklyPick(leagueId, seasonId, wn, propId, answerId, auth);
      setPickStatus(prev => ({ ...prev, [propId]: "saved" }));
    } catch (e: any) {
      // Revert to previous pick
      setPicks(prev => {
        const next = { ...prev };
        if (state.my_picks[propId]) {
          next[propId] = state.my_picks[propId];
        } else {
          delete next[propId];
        }
        return next;
      });
      setPickStatus(prev => ({ ...prev, [propId]: "error" }));
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (authLoading || guestTokenLoading || loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  if (error) {
    // ── Non-member / lost-token guest recovery screen ─────────────────────────
    if (errorIsNonMember) {
      const handleSignIn = async () => {
        // Save the current week URL so auth-callback returns here after sign-in.
        const weekPath = `/fantasy/weeks/${leagueId}/${seasonId}/${wn}/play`;
        try { await AsyncStorage.setItem(PENDING_AUTH_REDIRECT_KEY, weekPath); } catch {}
        router.push("/auth");
      };

      // Deterministic Back — never router.back() since history may be empty
      // (user arrived via a shared Week link with no prior app history).
      const handleBack = () =>
        router.replace(`/fantasy/join/${leagueId}/${seasonId}` as any);

      return (
        <View style={[styles.center, { paddingTop: insets.top, paddingHorizontal: 24 }]}>
          <Text style={[styles.errorText, { fontSize: 32, marginBottom: 8 }]}>🏈</Text>
          <Text style={[styles.errorText, { marginBottom: 8, fontWeight: "700", fontSize: 17 }]}>
            You're not recognized for this league
          </Text>
          <Text style={[styles.errorText, { color: "#999", fontSize: 14, textAlign: "center", marginBottom: 8, lineHeight: 20 }]}>
            If you already joined this league as a guest, open this link on the same browser or device you originally used.
          </Text>
          <Text style={[styles.errorText, { color: "#999", fontSize: 14, textAlign: "center", marginBottom: 24, lineHeight: 20 }]}>
            If you connected your Swayger account, sign in to continue.
          </Text>

          {/* Sign In — primary recovery for authenticated users; hidden if already signed in */}
          {!session && (
            <TouchableOpacity
              style={[styles.btn, { marginBottom: 10, alignSelf: "stretch" }]}
              onPress={handleSignIn}
            >
              <Text style={styles.btnText}>Sign In</Text>
            </TouchableOpacity>
          )}

          {/* Join — for true non-members who have an available seat */}
          <TouchableOpacity
            style={[styles.outlineBtn, { marginBottom: 10 }]}
            onPress={() =>
              router.replace(`/fantasy/join/${leagueId}/${seasonId}?wn=${wn}` as any)
            }
          >
            <Text style={styles.outlineBtnText}>Join This League</Text>
          </TouchableOpacity>

          {/* Deterministic Back — never inert */}
          <TouchableOpacity onPress={handleBack}>
            <Text style={styles.linkText}>← Back to League</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // ── Generic error (network, server) ────────────────────────────────────────
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.btn} onPress={load}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace(`/fantasy/join/${leagueId}/${seasonId}` as any)
          }
          style={{ marginTop: 12 }}
        >
          <Text style={styles.linkText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!state) return null;

  const isFinalized = state.room_status === "finalized";
  const isLocked    = state.card_status === "locked" || state.card_status === "settled";
  const pickedCount = Object.keys(picks).length;
  const total       = state.props.length;
  const staleSet    = new Set(state.stale_pick_prop_ids ?? []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }]}
    >
      {/* Header */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.linkText}>← {state.league_name ?? "League"}</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.heading}>Week {wn} Swayger</Text>
        {isLocked && (
          <View style={styles.lockedBadge}>
            <Text style={styles.lockedBadgeText}>🔒 LOCKED</Text>
          </View>
        )}
      </View>

      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          {pickedCount} / {total} answered
        </Text>
        {!isLocked && pickedCount === total && total > 0 && (
          <Text style={styles.allDoneText}>✓ All picks in!</Text>
        )}
      </View>

      {/* Finalized banner — results ready */}
      {isFinalized && (
        <TouchableOpacity
          style={styles.finalizedBanner}
          onPress={() => router.replace(`/fantasy/weeks/${leagueId}/${seasonId}/${wn}/results` as any)}
          activeOpacity={0.85}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.finalizedBannerTitle}>🏆 Results are in!</Text>
            <Text style={styles.finalizedBannerSub}>Tap to see how everyone did</Text>
          </View>
          <Text style={{ color: "#FCD34D", fontSize: 18 }}>›</Text>
        </TouchableOpacity>
      )}

      {isLocked && !isFinalized && (
        <View style={styles.lockedBanner}>
          <Text style={styles.lockedBannerText}>
            🔒 Picks are locked. Your selections are final.
          </Text>
        </View>
      )}

      {/* Stale pick banner */}
      {!isLocked && staleSet.size > 0 && (
        <View style={styles.staleBanner}>
          <Text style={styles.staleBannerTitle}>⚠️ Roster Updated</Text>
          <Text style={styles.staleBannerBody}>
            A new member joined after you picked. Review highlighted questions and resubmit.
          </Text>
        </View>
      )}

      {/* Props */}
      {state.props.map((prop, i) => {
        const myPick   = picks[prop.id] ?? null;
        const isStale  = staleSet.has(prop.id);
        const status   = pickStatus[prop.id];

        return (
          <View
            key={prop.id}
            style={[styles.propCard, isStale && styles.propCardStale]}
          >
            <View style={styles.propHeader}>
              <Text style={styles.propNum}>Q{i + 1}</Text>
              <Text style={styles.propPts}>{prop.point_value} pt{prop.point_value !== 1 ? "s" : ""}</Text>
            </View>
            <Text style={styles.propQ}>{prop.question}</Text>

            {isStale && (
              <Text style={styles.staleHint}>⚠️ New member added — please resubmit</Text>
            )}

            <View style={styles.answers}>
              {(prop.answer_options ?? []).map((opt) => {
                const isSelected = myPick === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.answerBtn,
                      isSelected && styles.answerBtnSelected,
                      isLocked && styles.answerBtnLocked,
                    ]}
                    onPress={() => handlePick(prop.id, opt.id)}
                    disabled={isLocked}
                    activeOpacity={isLocked ? 1 : 0.7}
                  >
                    <Text style={[styles.answerText, isSelected && styles.answerTextSelected]}>
                      {opt.label}
                    </Text>
                    {isSelected && <Text style={styles.answerCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>

            {status === "saving" && <Text style={styles.savingText}>Saving…</Text>}
            {status === "error"  && <Text style={styles.saveErrorText}>Failed to save. Tap to retry.</Text>}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content:   { paddingHorizontal: 20 },
  center: {
    flex: 1, backgroundColor: C.background,
    alignItems: "center", justifyContent: "center", padding: 32, gap: 12,
  },
  backBtn: { marginBottom: 16 },
  header:  { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  heading: { fontSize: 22, fontWeight: "800", color: C.text, flex: 1 },
  lockedBadge: {
    backgroundColor: "#1A1500",
    borderRadius: 6, borderWidth: 1, borderColor: C.accentGold,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  lockedBadgeText: { fontSize: 11, fontWeight: "700", color: C.accentGold, letterSpacing: 0.3 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  progressText: { fontSize: 13, color: C.textMuted },
  allDoneText:  { fontSize: 13, color: "#22c55e", fontWeight: "700" },
  finalizedBanner: {
    backgroundColor: "#1A1200", borderRadius: 10, borderWidth: 1, borderColor: "#FCD34D",
    padding: 14, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 8,
  },
  finalizedBannerTitle: { fontSize: 15, fontWeight: "700", color: "#FCD34D" },
  finalizedBannerSub:   { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  lockedBanner: {
    backgroundColor: "#1A1500", borderRadius: 10, borderWidth: 1, borderColor: C.accentGold,
    padding: 12, marginBottom: 16,
  },
  lockedBannerText: { fontSize: 13, color: C.accentGold, fontWeight: "600", textAlign: "center" },
  staleBanner: {
    backgroundColor: "#1F1500", borderRadius: 10, borderWidth: 1, borderColor: "#F59E0B",
    padding: 12, marginBottom: 16, gap: 4,
  },
  staleBannerTitle: { fontSize: 14, fontWeight: "700", color: "#F59E0B" },
  staleBannerBody:  { fontSize: 13, color: C.textSecondary, lineHeight: 18 },
  propCard: {
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 16, marginBottom: 14, gap: 10,
  },
  propCardStale: { borderColor: "#F59E0B" },
  propHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  propNum:    { fontSize: 11, fontWeight: "700", color: C.textMuted, letterSpacing: 0.5 },
  propPts:    { fontSize: 11, fontWeight: "700", color: C.tint },
  propQ:      { fontSize: 16, fontWeight: "700", color: C.text, lineHeight: 22 },
  staleHint:  { fontSize: 12, color: "#F59E0B", fontWeight: "600" },
  answers:    { gap: 8 },
  answerBtn: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.background, borderRadius: 10, borderWidth: 1, borderColor: C.border,
    paddingVertical: 13, paddingHorizontal: 16,
  },
  answerBtnSelected: { backgroundColor: "#06091A", borderColor: C.tint },
  answerBtnLocked:   { opacity: 0.8 },
  answerText:        { flex: 1, fontSize: 14, fontWeight: "600", color: C.text },
  answerTextSelected:{ color: C.tint },
  answerCheck: { fontSize: 16, color: C.tint, fontWeight: "800", marginLeft: 8 },
  savingText:    { fontSize: 12, color: C.textMuted, textAlign: "right" },
  saveErrorText: { fontSize: 12, color: C.danger, textAlign: "right" },
  btn: {
    backgroundColor: C.tint, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 24,
    alignItems: "center", alignSelf: "stretch",
  },
  btnText:   { color: "#fff", fontWeight: "700", fontSize: 15 },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center" as const,
    alignSelf: "stretch" as const,
  },
  outlineBtnText: { color: C.text, fontWeight: "600", fontSize: 15 },
  linkText:  { color: C.tint, fontSize: 14, fontWeight: "600" },
  errorText: { color: C.danger, fontSize: 14, textAlign: "center" },
});
