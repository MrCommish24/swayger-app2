/**
 * app/fantasy/join/[leagueId]/[seasonId].tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Fantasy League Invite / Seat Claim Screen
 *
 * Public — no auth required to view this screen (whitelisted in useProtectedRoute).
 *
 * Flow:
 *   1. League info + seat list loads immediately (GET /join-info, no auth)
 *   2. If caller already has an active claim → redirect to hub silently
 *   3. Unauthenticated visitor sees an identity choice card at the top:
 *        [Sign In / Create Account]   [Continue as Guest]
 *   4. They pick their seat from the list
 *   5. Confirm → POST /claim → navigate to hub
 *
 * Identity modes:
 *   "account"  — tap "Sign In / Create Account" → navigate to /auth (join URL
 *                is saved as a pending redirect so they land back here after sign-in)
 *   "guest"    — uses durable device guest token (device-specific, no cross-device)
 *   "session"  — already signed in, skip the picker entirely
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useFantasyGuestToken } from "@/lib/use-fantasy-guest-token";
import {
  fantasyFetch,
  FANTASY_SPORTS,
  JoinInfo,
  JoinInfoSeat,
  ClaimSeatResponse,
} from "@/lib/fantasy-api";
import { PENDING_AUTH_REDIRECT_KEY } from "@/app/_layout";
import Colors from "@/constants/colors";

const C = Colors.dark;

const SPORT_EMOJI: Record<string, string> = Object.fromEntries(
  FANTASY_SPORTS.map((s) => [s.value, s.emoji])
);

type IdentityMode = "undecided" | "guest" | "account";

export default function JoinLeagueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();
  const { guestToken, guestTokenLoading } = useFantasyGuestToken();
  const { leagueId, seasonId } = useLocalSearchParams<{
    leagueId: string;
    seasonId: string;
  }>();

  const [joinInfo, setJoinInfo] = useState<JoinInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [identityMode, setIdentityMode] = useState<IdentityMode>("undecided");
  const [selectedSeat, setSelectedSeat] = useState<JoinInfoSeat | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Signed-in users skip the identity picker
  const effectiveMode: IdentityMode = session ? "account" : identityMode;
  const readyToClaim = effectiveMode !== "undecided";

  // ── Load join info ──────────────────────────────────────────────────────────
  const loadJoinInfo = useCallback(async () => {
    if (!leagueId || !seasonId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const auth = session
        ? { session }
        : guestToken
        ? { guestToken }
        : {};
      const data = await fantasyFetch<JoinInfo>(
        `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/join-info`,
        {},
        auth
      );
      setJoinInfo(data);

      // If caller already has an active claim, skip straight to hub
      if (data.my_seat) {
        router.replace(`/fantasy/${leagueId}/${seasonId}` as any);
      }
    } catch (e: any) {
      setLoadError(e.message ?? "Failed to load league info");
    } finally {
      setLoading(false);
    }
  }, [leagueId, seasonId, session, guestToken]);

  useEffect(() => {
    if (authLoading || guestTokenLoading) return;
    loadJoinInfo();
  }, [authLoading, guestTokenLoading, session?.access_token, guestToken, leagueId, seasonId]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleChooseAccount = async () => {
    // Save the join URL so auth redirects back here after sign-in
    const path = `/fantasy/join/${leagueId}/${seasonId}`;
    try { await AsyncStorage.setItem(PENDING_AUTH_REDIRECT_KEY, path); } catch {}
    router.push("/auth");
  };

  const handleChooseGuest = () => {
    setIdentityMode("guest");
    setClaimError(null);
  };

  const handleClaim = async () => {
    if (!selectedSeat || !readyToClaim) return;

    // "account" mode but no session yet → send to auth
    if (effectiveMode === "account" && !session) {
      await handleChooseAccount();
      return;
    }

    if (effectiveMode === "guest" && !guestToken) return; // guest token still loading

    setClaiming(true);
    setClaimError(null);
    try {
      const auth =
        session
          ? { session }
          : { guestToken: guestToken! };

      await fantasyFetch<ClaimSeatResponse>(
        `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/claim`,
        {
          method: "POST",
          body: JSON.stringify({ league_member_id: selectedSeat.league_member_id }),
        },
        auth
      );
      router.replace(`/fantasy/${leagueId}/${seasonId}` as any);
    } catch (e: any) {
      if (e.message?.includes("already been claimed") || e.message?.includes("seat_already_claimed")) {
        setClaimError("This seat has already been claimed by someone else.");
        setSelectedSeat(null);
        loadJoinInfo();
      } else {
        setClaimError(e.message ?? "Failed to claim seat. Please try again.");
      }
    } finally {
      setClaiming(false);
    }
  };

  // ── States ──────────────────────────────────────────────────────────────────

  if (authLoading || guestTokenLoading || (loading && !joinInfo)) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity style={styles.btn} onPress={loadJoinInfo}>
          <Text style={styles.btnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!joinInfo) return null;

  const { league, season, seats } = joinInfo;
  const sportEmoji = SPORT_EMOJI[league.sport] ?? "🏆";
  const sportLabel = league.sport.charAt(0).toUpperCase() + league.sport.slice(1);
  const availableSeats = seats.filter((s) => !s.is_claimed);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 48 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── League header ──────────────────────────────────────────────────── */}
      <View style={styles.leagueHeader}>
        <Text style={styles.sportEmoji}>{sportEmoji}</Text>
        <View style={styles.leagueHeaderText}>
          <Text style={styles.inviteEyebrow}>YOU'VE BEEN INVITED TO JOIN</Text>
          <Text style={styles.leagueName} numberOfLines={2}>
            {league.league_name}
          </Text>
          <Text style={styles.leagueMeta}>
            {sportLabel} · {season.season_year} Season
          </Text>
        </View>
      </View>

      {/* ── Reward ─────────────────────────────────────────────────────────── */}
      {season.default_reward_description && (
        <View style={styles.rewardCard}>
          <Text style={styles.rewardLabel}>WEEKLY REWARD</Text>
          <Text style={styles.rewardText}>
            {season.default_reward_amount_display
              ? `${season.default_reward_amount_display} — `
              : ""}
            {season.default_reward_description}
          </Text>
        </View>
      )}

      {/* ── Identity choice (unauthenticated only) ─────────────────────────── */}
      {!session && (
        <View style={styles.identityCard}>
          <Text style={styles.identityTitle}>How do you want to join?</Text>
          <Text style={styles.identitySubtitle}>
            Create a free account to access your league from any device, or jump in as a guest right now.
          </Text>

          <View style={styles.identityBtns}>
            {/* Account */}
            <TouchableOpacity
              style={[
                styles.identityBtn,
                effectiveMode === "account" && styles.identityBtnSelected,
              ]}
              onPress={handleChooseAccount}
              activeOpacity={0.8}
            >
              <Text style={styles.identityBtnIcon}>👤</Text>
              <Text style={[
                styles.identityBtnLabel,
                effectiveMode === "account" && styles.identityBtnLabelSelected,
              ]}>
                Sign In{"\n"}/ Sign Up
              </Text>
              <Text style={styles.identityBtnNote}>Cross-device</Text>
            </TouchableOpacity>

            {/* Guest */}
            <TouchableOpacity
              style={[
                styles.identityBtn,
                identityMode === "guest" && styles.identityBtnSelected,
              ]}
              onPress={handleChooseGuest}
              activeOpacity={0.8}
            >
              <Text style={styles.identityBtnIcon}>⚡</Text>
              <Text style={[
                styles.identityBtnLabel,
                identityMode === "guest" && styles.identityBtnLabelSelected,
              ]}>
                Continue{"\n"}as Guest
              </Text>
              <Text style={styles.identityBtnNote}>This device only</Text>
            </TouchableOpacity>
          </View>

          {identityMode === "guest" && (
            <Text style={styles.guestWarning}>
              Guest access is tied to this device. Sign in later to link your account and unlock cross-device access.
            </Text>
          )}
        </View>
      )}

      {/* ── Seat list ──────────────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>WHO ARE YOU IN THIS LEAGUE?</Text>
      <Text style={styles.sectionHint}>
        {readyToClaim
          ? "Tap your name to select your seat."
          : "Choose how you want to join above, then select your seat."}
      </Text>

      {claimError && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{claimError}</Text>
        </View>
      )}

      <View style={styles.seatsCard}>
        {seats.map((seat, i) => {
          const isSelected =
            selectedSeat?.league_member_id === seat.league_member_id;
          const isClaimed = seat.is_claimed;

          return (
            <TouchableOpacity
              key={seat.league_member_id ?? seat.season_member_id}
              style={[
                styles.seatRow,
                i > 0 && styles.seatRowBorder,
                isSelected && styles.seatRowSelected,
                (isClaimed || !readyToClaim) && styles.seatRowDimmed,
              ]}
              onPress={() => {
                if (isClaimed || !readyToClaim) return;
                setSelectedSeat(isSelected ? null : seat);
                setClaimError(null);
              }}
              disabled={isClaimed}
              activeOpacity={isClaimed || !readyToClaim ? 1 : 0.7}
            >
              <View style={styles.seatLeft}>
                <View
                  style={[
                    styles.radio,
                    isSelected && styles.radioSelected,
                    (isClaimed || !readyToClaim) && styles.radioDimmed,
                  ]}
                >
                  {isSelected && <View style={styles.radioDot} />}
                </View>

                <View style={styles.seatInfo}>
                  <Text
                    style={[
                      styles.seatName,
                      (isClaimed || !readyToClaim) && styles.seatNameDimmed,
                    ]}
                  >
                    {seat.display_name ?? "—"}
                  </Text>
                  {seat.team_name && (
                    <Text
                      style={[
                        styles.seatTeam,
                        (isClaimed || !readyToClaim) && styles.seatTeamDimmed,
                      ]}
                    >
                      {seat.team_name}
                    </Text>
                  )}
                </View>
              </View>

              {isClaimed && (
                <View style={styles.claimedBadge}>
                  <Text style={styles.claimedBadgeText}>Taken</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {availableSeats.length === 0 && (
        <Text style={styles.noSeatsText}>
          All seats in this league have been claimed.
        </Text>
      )}

      {/* ── Confirm ────────────────────────────────────────────────────────── */}
      {selectedSeat && readyToClaim && (
        <View style={styles.confirmCard}>
          <Text style={styles.confirmName}>{selectedSeat.display_name}</Text>
          {selectedSeat.team_name && (
            <Text style={styles.confirmTeam}>{selectedSeat.team_name}</Text>
          )}
          <Text style={styles.confirmLabel}>
            {identityMode === "guest"
              ? "Joining as guest (this device only)"
              : session
              ? `Joining as ${session.user.email}`
              : "Joining with account"}
          </Text>

          <TouchableOpacity
            style={[styles.claimBtn, claiming && styles.claimBtnDisabled]}
            onPress={handleClaim}
            disabled={claiming}
            activeOpacity={0.85}
          >
            {claiming ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.claimBtnText}>This Is Me — Join League</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setSelectedSeat(null)}
            style={styles.cancelLink}
          >
            <Text style={styles.cancelLinkText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 20 },
  center: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },

  // Header
  leagueHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 20,
  },
  sportEmoji: { fontSize: 44, marginTop: 2 },
  leagueHeaderText: { flex: 1 },
  inviteEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    color: C.tint,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  leagueName: { fontSize: 24, fontWeight: "800", color: C.text, lineHeight: 30 },
  leagueMeta: { fontSize: 13, color: C.textMuted, marginTop: 3 },

  // Reward
  rewardCard: {
    backgroundColor: "#1A1800",
    borderColor: C.accentGold,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  rewardLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: C.accentGold,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  rewardText: { color: C.text, fontSize: 14, lineHeight: 20 },

  // Identity card
  identityCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    marginBottom: 24,
    gap: 12,
  },
  identityTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: C.text,
  },
  identitySubtitle: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 18,
    marginTop: -4,
  },
  identityBtns: {
    flexDirection: "row",
    gap: 10,
  },
  identityBtn: {
    flex: 1,
    backgroundColor: C.surfaceLight,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 6,
  },
  identityBtnSelected: {
    borderColor: C.tint,
    backgroundColor: "#0D1235",
  },
  identityBtnIcon: { fontSize: 24 },
  identityBtnLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  identityBtnLabelSelected: { color: C.tint },
  identityBtnNote: {
    fontSize: 10,
    color: C.textMuted,
    textAlign: "center",
  },
  guestWarning: {
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 17,
    textAlign: "center",
    paddingHorizontal: 4,
  },

  // Seat list
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: C.textMuted,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sectionHint: { fontSize: 13, color: C.textSecondary, marginBottom: 14 },

  errorCard: {
    backgroundColor: "#2D0A0A",
    borderColor: C.danger,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { color: C.danger, fontSize: 13, textAlign: "center" },

  seatsCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    marginBottom: 20,
  },
  seatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "space-between",
  },
  seatRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  seatRowSelected: { backgroundColor: "#0F1535" },
  seatRowDimmed: { opacity: 0.45 },
  seatLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },

  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: C.tint },
  radioDimmed: { borderColor: C.textMuted },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.tint },

  seatInfo: { flex: 1 },
  seatName: { fontSize: 16, fontWeight: "600", color: C.text },
  seatNameDimmed: { color: C.textMuted },
  seatTeam: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  seatTeamDimmed: { color: C.textMuted },

  claimedBadge: {
    backgroundColor: C.surfaceLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  claimedBadgeText: { fontSize: 11, fontWeight: "700", color: C.textMuted },

  noSeatsText: {
    fontSize: 14,
    color: C.textMuted,
    textAlign: "center",
    marginVertical: 8,
  },

  // Confirm
  confirmCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.tint,
    padding: 20,
    gap: 6,
  },
  confirmName: { fontSize: 20, fontWeight: "800", color: C.text },
  confirmTeam: { fontSize: 14, color: C.textSecondary },
  confirmLabel: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 2,
    marginBottom: 10,
  },

  claimBtn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  claimBtnDisabled: { opacity: 0.6 },
  claimBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  cancelLink: { alignItems: "center", paddingVertical: 6 },
  cancelLinkText: { color: C.textMuted, fontSize: 14 },

  btn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
