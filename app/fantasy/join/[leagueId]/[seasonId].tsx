/**
 * app/fantasy/join/[leagueId]/[seasonId].tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Fantasy League Member Invite / Seat Claim Screen
 *
 * Public: league info loads without auth so the link is previewable.
 * Claiming: requires an authenticated session OR a durable guest token.
 *
 * Flow:
 *   1. Load join-info from GET /join-info (no auth)
 *   2. If my_seat ≠ null → caller already has a claim → skip to hub
 *   3. Show seat list — tap a seat to select it
 *   4. Confirm "This is me" → POST /claim
 *   5. On success → navigate to hub
 *
 * Guest vs auth:
 *   • Authenticated: claim is tied to user_id — recognized across all devices.
 *   • Guest: claim is tied to device guest_token — device-specific only.
 *     Guest sees an optional "Sign in for cross-device access" nudge.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import Colors from "@/constants/colors";

const C = Colors.dark;

const SPORT_EMOJI: Record<string, string> = Object.fromEntries(
  FANTASY_SPORTS.map((s) => [s.value, s.emoji])
);

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

  const [selectedSeat, setSelectedSeat] = useState<JoinInfoSeat | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // ── Load join info ──────────────────────────────────────────────────────────
  const loadJoinInfo = useCallback(async () => {
    if (!leagueId || !seasonId) return;
    setLoading(true);
    setLoadError(null);
    try {
      // Pass identity if available so server can detect existing claim
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

      // Auto-redirect if caller already has an active claim
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
    // Wait until both auth and guest token have resolved
    if (authLoading || guestTokenLoading) return;
    loadJoinInfo();
  }, [authLoading, guestTokenLoading, session?.access_token, guestToken, leagueId, seasonId]);

  // ── Claim ───────────────────────────────────────────────────────────────────
  const handleClaim = async () => {
    if (!selectedSeat || !joinInfo) return;

    // Must have some identity to claim
    if (!session && !guestToken) {
      router.push("/auth");
      return;
    }

    setClaiming(true);
    setClaimError(null);
    try {
      const auth = session ? { session } : { guestToken: guestToken! };
      const result = await fantasyFetch<ClaimSeatResponse>(
        `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/claim`,
        {
          method: "POST",
          body: JSON.stringify({ league_member_id: selectedSeat.league_member_id }),
        },
        auth
      );

      // Success — navigate to hub
      router.replace(`/fantasy/${leagueId}/${seasonId}` as any);
    } catch (e: any) {
      if (e.message?.includes("already been claimed")) {
        setClaimError("This seat has already been claimed by someone else.");
        setSelectedSeat(null);
        // Refresh to show updated claim status
        loadJoinInfo();
      } else {
        setClaimError(e.message ?? "Failed to claim seat. Please try again.");
      }
    } finally {
      setClaiming(false);
    }
  };

  // ── Loading state ───────────────────────────────────────────────────────────
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
  const hasIdentity = !!(session || guestToken);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
      ]}
    >
      {/* League header */}
      <View style={styles.leagueHeader}>
        <Text style={styles.sportEmoji}>{sportEmoji}</Text>
        <View style={styles.leagueHeaderText}>
          <Text style={styles.leagueName} numberOfLines={2}>
            {league.league_name}
          </Text>
          <Text style={styles.leagueMeta}>
            {season.season_year} {sportLabel}
          </Text>
        </View>
      </View>

      {/* Reward */}
      {season.default_reward_description && (
        <View style={styles.rewardCard}>
          <Text style={styles.rewardLabel}>WEEKLY SWAYGER REWARD</Text>
          <Text style={styles.rewardText}>
            {season.default_reward_amount_display
              ? `${season.default_reward_amount_display} — `
              : ""}
            {season.default_reward_description}
          </Text>
        </View>
      )}

      {/* Seat selection */}
      <Text style={styles.sectionLabel}>WHO ARE YOU?</Text>
      <Text style={styles.sectionHint}>
        Choose the league member that represents you.
      </Text>

      {/* Error */}
      {claimError && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{claimError}</Text>
        </View>
      )}

      <View style={styles.seatsCard}>
        {seats.map((seat, i) => {
          const isSelected = selectedSeat?.league_member_id === seat.league_member_id;
          const isClaimed = seat.is_claimed;
          const canSelect = !isClaimed;

          return (
            <TouchableOpacity
              key={seat.league_member_id ?? seat.season_member_id}
              style={[
                styles.seatRow,
                i > 0 && styles.seatRowBorder,
                isSelected && styles.seatRowSelected,
                isClaimed && styles.seatRowClaimed,
              ]}
              onPress={() => {
                if (!canSelect) return;
                setSelectedSeat(isSelected ? null : seat);
                setClaimError(null);
              }}
              disabled={isClaimed}
              activeOpacity={isClaimed ? 1 : 0.7}
            >
              <View style={styles.seatLeft}>
                {/* Selection indicator */}
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <View style={styles.radioDot} />}
                </View>

                <View style={styles.seatInfo}>
                  <Text style={[
                    styles.seatName,
                    isClaimed && styles.seatNameClaimed,
                  ]}>
                    {seat.display_name ?? "—"}
                  </Text>
                  {seat.team_name && (
                    <Text style={[
                      styles.seatTeam,
                      isClaimed && styles.seatTeamClaimed,
                    ]}>
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

      {/* Confirm section */}
      {selectedSeat && (
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>
            {selectedSeat.display_name} — {selectedSeat.team_name ?? "No team"}
          </Text>
          <Text style={styles.confirmSub}>This is me</Text>

          {!hasIdentity && (
            <Text style={styles.authNudge}>
              Sign in to claim this seat across all your devices, or continue as a guest (this device only).
            </Text>
          )}

          <View style={styles.confirmBtns}>
            {!session && (
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={() => router.push("/auth")}
              >
                <Text style={[styles.btnText, { color: C.tint }]}>Sign In First</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btn, claiming && styles.btnDisabled]}
              onPress={handleClaim}
              disabled={claiming}
            >
              {claiming ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnText}>
                  {session ? "Confirm — This Is Me" : "Continue as Guest"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Guest device notice */}
      {!session && guestToken && !selectedSeat && (
        <View style={styles.guestNotice}>
          <Text style={styles.guestNoticeText}>
            You're not signed in. Claiming a seat as a guest ties it to this device only.{" "}
            <Text style={{ color: C.tint }} onPress={() => router.push("/auth")}>
              Sign in
            </Text>{" "}
            for cross-device access.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

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

  leagueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 20,
  },
  sportEmoji: { fontSize: 44 },
  leagueHeaderText: { flex: 1 },
  leagueName: { fontSize: 24, fontWeight: "800", color: C.text, lineHeight: 30 },
  leagueMeta: { fontSize: 14, color: C.textMuted, marginTop: 3 },

  rewardCard: {
    backgroundColor: "#1A1800",
    borderColor: C.accentGold,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
  },
  rewardLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: C.accentGold,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  rewardText: { color: C.text, fontSize: 14, lineHeight: 20 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: C.textMuted,
    letterSpacing: 1,
    marginBottom: 4,
  },
  sectionHint: { fontSize: 13, color: C.textSecondary, marginBottom: 16 },

  errorCard: {
    backgroundColor: "#2D0A0A",
    borderColor: C.danger,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
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
  seatRowClaimed: { opacity: 0.45 },
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
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.tint },
  seatInfo: { flex: 1 },
  seatName: { fontSize: 16, fontWeight: "600", color: C.text },
  seatNameClaimed: { color: C.textMuted },
  seatTeam: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  seatTeamClaimed: { color: C.textMuted },
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
    marginTop: 8,
  },

  confirmCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.tint,
    padding: 20,
    gap: 8,
    marginBottom: 16,
  },
  confirmTitle: { fontSize: 18, fontWeight: "700", color: C.text },
  confirmSub: { fontSize: 13, color: C.textMuted, marginBottom: 4 },
  authNudge: { fontSize: 12, color: C.textSecondary, lineHeight: 17, marginBottom: 4 },
  confirmBtns: { gap: 10, marginTop: 4 },

  btn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  btnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.tint,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  guestNotice: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  guestNoticeText: { fontSize: 12, color: C.textMuted, lineHeight: 18, textAlign: "center" },
});
