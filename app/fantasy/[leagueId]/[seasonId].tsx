/**
 * app/fantasy/[leagueId]/[seasonId].tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Fantasy League Hub — role-aware season overview (Phase 3 + 4A).
 *
 * Features:
 *   • MY TEAM card — viewer's seat (if they have an active claim)
 *   • Commissioner-only claim-status column: "Joined" / "Waiting" per seat
 *   • Invite Members share button — commissioner only
 *   • Draft Day Swayger card — Set Up / Published / Locked states
 *   • Guest post-claim welcome banner (shows when ?joined=1 in URL)
 *   • Intent-based guest → auth claim upgrade (explicit opt-in only)
 *   • "Back to Swayger" + "Create Account" CTAs for guest viewers
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Alert,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Share,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { PENDING_AUTH_REDIRECT_KEY } from "@/app/_layout";
import { useFantasyGuestToken } from "@/lib/use-fantasy-guest-token";
import {
  fantasyFetch,
  upgradeGuestClaim,
  getDraftDay,
  lockDraftDay,
  unlockDraftDay,
  FANTASY_PENDING_UPGRADE_KEY,
  FantasyPendingUpgrade,
  FANTASY_SPORTS,
  FantasySeasonDetail,
  FantasyParticipant,
  DraftDayStatus,
} from "@/lib/fantasy-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

// ── DraftDayCard ─────────────────────────────────────────────────────────────
// Renders the Draft Day section of the hub.
//
// Lifecycle states:
//   unset      — no Draft Day published yet
//   open       — published; card_status = 'open' (Phase 4B: picks available)
//   locked     — card_status = 'locked' (commissioner locked picks)
//   finalized  — card_status = 'settled' (read-only)
//
// Commissioner actions:
//   unset            → Set Up Draft Day (navigates to setup wizard)
//   open + 0 picks   → Manage Draft Day (edit questions) + Lock Picks (inline confirm)
//   open + picks     → View Draft Day (read-only) + Lock Picks
//   locked           → View Draft Day (read-only) + Unlock Picks
//
// Lock Picks uses inline confirmation UI to avoid Alert.alert web limitations.
// "Open Draft Day" is disabled until Phase 4B member pick submission is built.
interface DraftDayCardProps {
  draftDay: import("@/lib/fantasy-api").DraftDayStatus | null | undefined;
  isCommissioner: boolean;
  canEdit:          boolean; // card is 'open' AND global pick_count === 0
  lockingDraftDay:  boolean;
  unlockingDraftDay: boolean;
  lockError:        string | null;
  /** Viewer's own pick count — drives the member CTA label. 0 = no picks yet. */
  myPickCount:      number;
  onSetup:   () => void;
  onManage:  () => void;
  /** Navigate to the member play screen. */
  onPlay:    () => void;
  onLock:    () => void; // direct API call, no Alert — called after inline confirm
  onUnlock:  () => void;
}

function DraftDayCard({
  draftDay,
  isCommissioner,
  canEdit,
  lockingDraftDay,
  unlockingDraftDay,
  lockError,
  myPickCount,
  onSetup,
  onManage,
  onPlay,
  onLock,
  onUnlock,
}: DraftDayCardProps) {
  const [confirmingLock, setConfirmingLock] = React.useState(false);

  // Reset inline confirm when lock succeeds (card becomes locked)
  React.useEffect(() => {
    if (draftDay?.card_status === "locked") setConfirmingLock(false);
  }, [draftDay?.card_status]);

  // Not yet fetched — show nothing to avoid flicker
  if (draftDay === undefined) return null;

  const isLocked    = draftDay?.card_status === "locked";
  const isFinalized = draftDay?.card_status === "settled";
  const isPublished = !!draftDay;

  // ── State: Not yet set up ─────────────────────────────────────────────────
  if (!isPublished) {
    return (
      <View style={styles.draftDayCard}>
        <View style={styles.draftDayHeader}>
          <Text style={styles.draftDayIcon}>📋</Text>
          <View style={styles.draftDayHeaderText}>
            <Text style={styles.draftDayLabel}>UPCOMING</Text>
            <Text style={styles.draftDayTitle}>Draft Day Swayger</Text>
          </View>
        </View>
        {isCommissioner ? (
          <TouchableOpacity style={styles.btn} onPress={onSetup} activeOpacity={0.8}>
            <Text style={styles.btnText}>Set Up Draft Day</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.draftDayComingSoon}>
            Your commissioner is setting up Draft Day questions. Check back soon!
          </Text>
        )}
      </View>
    );
  }

  // ── State: Published (open / locked / finalized) ──────────────────────────
  const statusColor = isLocked || isFinalized ? C.accentGold : "#22c55e";
  const statusLabel = isFinalized ? "FINAL" : isLocked ? "LOCKED" : "READY";
  const cardTitle   = isFinalized ? "Draft Day Complete" : isLocked ? "Picks Locked" : "Draft Day Ready";

  return (
    <View style={[
      styles.draftDayCard,
      isLocked || isFinalized ? styles.draftDayCardLocked : styles.draftDayCardActive,
    ]}>
      {/* Header */}
      <View style={styles.draftDayHeader}>
        <Text style={styles.draftDayIcon}>
          {isFinalized ? "🏆" : isLocked ? "🔒" : "📋"}
        </Text>
        <View style={styles.draftDayHeaderText}>
          <Text style={styles.draftDayLabel}>DRAFT DAY SWAYGER</Text>
          <Text style={styles.draftDayTitle}>{cardTitle}</Text>
        </View>
        <View style={[styles.draftDayStatusBadge, { borderColor: statusColor }]}>
          <View style={[styles.draftDayStatusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.draftDayStatusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Prop counts */}
      <View style={styles.draftDayCounts}>
        <View style={styles.draftDayCount}>
          <Text style={styles.draftDayCountNum}>{draftDay.prop_counts.competition}</Text>
          <Text style={styles.draftDayCountLabel}>Draft Day{"\n"}Picks</Text>
        </View>
        <View style={styles.draftDayCount}>
          <Text style={styles.draftDayCountNum}>{draftDay.prop_counts.season}</Text>
          <Text style={styles.draftDayCountLabel}>Season{"\n"}Receipts</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.draftDayActions}>

        {/* Member CTA — available to all recognised members (including commissioner) */}
        {isLocked ? (
          <TouchableOpacity
            style={[
              styles.btn,
              { backgroundColor: "#1A1500", borderWidth: 1, borderColor: C.accentGold },
            ]}
            onPress={onPlay}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnText, { color: C.accentGold }]}>
              👁  View My Picks
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={onPlay} activeOpacity={0.8}>
            <Text style={styles.btnText}>
              {myPickCount > 0 ? "✏️  View / Update My Picks" : "🏈  Make My Picks"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Commissioner controls */}
        {isCommissioner && !isFinalized && (
          <View style={{ gap: 8 }}>

            {/* Manage / View Draft Day */}
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={onManage}
              disabled={lockingDraftDay}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnText, { color: C.tint }]}>
                {canEdit && !isLocked ? "✏️  Manage Draft Day" : "👁  View Draft Day"}
              </Text>
            </TouchableOpacity>

            {/* Lock / Unlock row */}
            <View style={styles.draftDayActionRow}>

              {/* Lock Picks — inline confirm (avoids Alert.alert web bug) */}
              {!isLocked && !confirmingLock && (
                <TouchableOpacity
                  style={[
                    styles.btn,
                    { flex: 1, backgroundColor: "#5B21B6" },
                    lockingDraftDay && { opacity: 0.5 },
                  ]}
                  onPress={() => setConfirmingLock(true)}
                  disabled={lockingDraftDay}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnText}>🔒  Lock Picks</Text>
                </TouchableOpacity>
              )}

              {/* Inline confirmation state */}
              {!isLocked && confirmingLock && (
                <View style={styles.lockConfirmBox}>
                  <Text style={styles.lockConfirmTitle}>Lock Draft Day picks?</Text>
                  <Text style={styles.lockConfirmBody}>
                    Members won't be able to submit or change picks until you unlock them.
                  </Text>
                  <View style={styles.lockConfirmButtons}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnSecondary, { flex: 1 }]}
                      onPress={() => setConfirmingLock(false)}
                      disabled={lockingDraftDay}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.btnText, { color: C.tint }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.btn,
                        { flex: 1, backgroundColor: "#5B21B6" },
                        lockingDraftDay && { opacity: 0.5 },
                      ]}
                      onPress={onLock}
                      disabled={lockingDraftDay}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.btnText}>
                        {lockingDraftDay ? "Locking…" : "🔒  Lock Picks"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {lockError && (
                    <Text style={styles.lockErrorText}>{lockError}</Text>
                  )}
                </View>
              )}

              {/* Unlock Picks (only while locked) */}
              {isLocked && (
                <TouchableOpacity
                  style={[
                    styles.btn,
                    styles.btnSecondary,
                    { flex: 1 },
                    unlockingDraftDay && { opacity: 0.5 },
                  ]}
                  onPress={onUnlock}
                  disabled={unlockingDraftDay}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.btnText, { color: C.tint }]}>
                    {unlockingDraftDay ? "Unlocking…" : "🔓  Unlock Picks"}
                  </Text>
                </TouchableOpacity>
              )}

            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const SPORT_EMOJI: Record<string, string> = Object.fromEntries(
  FANTASY_SPORTS.map((s) => [s.value, s.emoji])
);

const STATUS_LABEL: Record<string, string> = {
  upcoming:  "Season Setup",
  active:    "In Season",
  completed: "Completed",
  archived:  "Archived",
};
const STATUS_COLOR: Record<string, string> = {
  upcoming:  C.textMuted,
  active:    "#22c55e",
  completed: C.textSecondary,
  archived:  C.textMuted,
};

function buildInviteUrl(leagueId: string, seasonId: string): string {
  const path = `/fantasy/join/${leagueId}/${seasonId}`;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  return `${base}${path}`;
}

export default function LeagueHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();
  const { guestToken, guestTokenLoading } = useFantasyGuestToken();
  const { leagueId, seasonId, joined } = useLocalSearchParams<{
    leagueId: string;
    seasonId: string;
    joined?: string;
  }>();

  const [detail, setDetail]         = useState<FantasySeasonDetail | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [draftDay, setDraftDay]           = useState<DraftDayStatus | null | undefined>(undefined); // undefined=not yet fetched
  const [lockingDraftDay, setLockingDraftDay]   = useState(false);
  const [unlockingDraftDay, setUnlockingDraftDay] = useState(false);
  const [lockError, setLockError]         = useState<string | null>(null);
  // Track initial mount so useFocusEffect doesn't double-fetch on first render
  const initialFocusRef = useRef(true);

  // Welcome banner: shown immediately after a successful claim (?joined=1)
  const [showWelcome, setShowWelcome] = useState(joined === "1");

  const fetchDetail = useCallback(
    async (quiet = false) => {
      if (!leagueId || !seasonId) return;
      if (!session && !guestToken) return;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const auth = session ? { session } : { guestToken: guestToken! };
        const [data, dd] = await Promise.all([
          fantasyFetch<FantasySeasonDetail>(
            `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}`,
            {},
            auth
          ),
          getDraftDay(leagueId, seasonId, auth).catch(() => null),
        ]);
        setDetail(data);
        setDraftDay(dd);
      } catch (e: any) {
        setError(e.message ?? "Failed to load league");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session, guestToken, leagueId, seasonId]
  );

  useEffect(() => {
    if (authLoading || guestTokenLoading) return;
    if (!session && !guestToken) { setLoading(false); return; }
    fetchDetail();
  }, [authLoading, guestTokenLoading, session?.access_token, guestToken, leagueId, seasonId]);

  // Re-fetch quietly when the screen regains focus (e.g. navigating back from
  // the setup wizard after publishing). This is the root-cause fix for the
  // "Set Up Draft Day reappears after publish" bug — the hub was showing stale
  // state because Expo Router doesn't always remount a screen when
  // router.replace() navigates back to it.
  useFocusEffect(
    useCallback(() => {
      if (initialFocusRef.current) {
        initialFocusRef.current = false;
        return; // skip first focus — useEffect above handles initial load
      }
      if (authLoading || guestTokenLoading) return;
      if (!session && !guestToken) return;
      fetchDetail(true); // quiet refresh, no full-screen spinner
    }, [authLoading, guestTokenLoading, session?.access_token, guestToken, fetchDetail])
  );

  // Intent-based guest → auth upgrade.
  // Only fires when:
  //   1. A session just appeared (user signed in), AND
  //   2. A pending upgrade context was explicitly stored in AsyncStorage by the
  //      user tapping "Create Account / Sign In" from the welcome banner.
  //
  // A normal sign-in on a device with an old guest token does NOT trigger this
  // (no pending context → no upgrade). This prevents shared-device seat transfer.
  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FANTASY_PENDING_UPGRADE_KEY);
        if (!raw) return;
        const pending = JSON.parse(raw) as FantasyPendingUpgrade;
        // Clear immediately — even if the upgrade fails, don't retry silently
        await AsyncStorage.removeItem(FANTASY_PENDING_UPGRADE_KEY);
        await upgradeGuestClaim(pending.guest_token, pending.league_member_id, { session });
        // Refresh detail so viewer reflects the now-authenticated claim
        fetchDetail(true);
      } catch {
        // Non-critical — guest claim remains if upgrade fails; user can retry
      }
    })();
  }, [session?.access_token]); // intentionally excludes guestToken — must not fire on guestToken changes

  const onRefresh = () => {
    setRefreshing(true);
    fetchDetail(true);
  };

  const handleShare = async () => {
    if (!leagueId || !seasonId) return;
    try {
      const url = buildInviteUrl(leagueId, seasonId);
      await Share.share({ message: `Join my fantasy league on Swayger! ${url}`, url });
    } catch { /* user cancelled */ }
  };

  // ── Loading / auth guard ────────────────────────────────────────────────────
  if (authLoading || guestTokenLoading || (loading && !detail)) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  if (!session && !guestToken) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Sign in to view this league.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace("/auth")}>
          <Text style={styles.btnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => fetchDetail()}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={styles.linkText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!detail) return null;

  const { league, season, participants, viewer } = detail;
  const commissioner = participants.find((p) => p.role === "commissioner");
  const members = participants.filter((p) => p.role !== "commissioner");
  const orderedParticipants: FantasyParticipant[] = commissioner
    ? [commissioner, ...members]
    : participants;

  const sportEmoji   = SPORT_EMOJI[league.sport] ?? "🏆";
  const sportLabel   = league.sport.charAt(0).toUpperCase() + league.sport.slice(1);
  const statusLabel  = STATUS_LABEL[season.status] ?? season.status;
  const statusColor  = STATUS_COLOR[season.status] ?? C.textMuted;
  const isCommissioner = viewer?.role === "commissioner" || viewer?.role === "co_commissioner";
  const isGuest        = !session && !!guestToken;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.tint} />
      }
    >
      {/* ── Guest welcome banner (?joined=1) ──────────────────────────────── */}
      {showWelcome && viewer && (
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeEmoji}>🎉</Text>
          <Text style={styles.welcomeHeadline}>You're in!</Text>
          <Text style={styles.welcomeLeague}>{league.league_name}</Text>
          <Text style={styles.welcomeName}>{viewer.display_name}</Text>
          {viewer.team_name && (
            <Text style={styles.welcomeTeam}>{viewer.team_name}</Text>
          )}

          <TouchableOpacity
            style={[styles.btn, { marginTop: 16 }]}
            onPress={() => setShowWelcome(false)}
          >
            <Text style={styles.btnText}>Open My League</Text>
          </TouchableOpacity>

          {isGuest && viewer && (
            <>
              <View style={styles.welcomeDivider} />
              <Text style={styles.welcomeUpgradeHint}>
                Create a free account to access your league from any device.
              </Text>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, { marginTop: 10 }]}
                onPress={async () => {
                  // Record explicit upgrade intent BEFORE navigating to auth.
                  // The hub's useEffect reads this key when a session appears;
                  // an unrelated sign-in that never sets this key will NOT
                  // transfer the guest seat (shared-device safety).
                  await AsyncStorage.setItem(
                    FANTASY_PENDING_UPGRADE_KEY,
                    JSON.stringify({
                      guest_token:      guestToken,
                      league_member_id: viewer.league_member_id,
                    } satisfies FantasyPendingUpgrade)
                  ).catch(() => {});
                  // Return here after sign-in
                  await AsyncStorage.setItem(
                    PENDING_AUTH_REDIRECT_KEY,
                    `/fantasy/${leagueId}/${seasonId}?joined=1`
                  ).catch(() => {});
                  router.push("/auth");
                }}
              >
                <Text style={[styles.btnText, { color: C.tint }]}>
                  Create Account / Sign In
                </Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.backToSwayger}
            onPress={() => router.replace("/(tabs)")}
          >
            <Text style={styles.linkText}>← Back to Swayger</Text>
          </TouchableOpacity>
        </View>
      )}

      {!showWelcome && (
        <>
          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.linkText}>← Game Day</Text>
          </TouchableOpacity>

          {/* League header */}
          <View style={styles.leagueHeader}>
            <Text style={styles.sportEmoji}>{sportEmoji}</Text>
            <View style={styles.leagueHeaderText}>
              <Text style={styles.leagueName} numberOfLines={2}>
                {league.league_name}
              </Text>
              <Text style={styles.leagueMeta}>
                {sportLabel} · {season.season_year} Season
              </Text>
            </View>
            <View style={[styles.statusBadge, { borderColor: statusColor }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>

          {/* Commissioner: Invite Members button */}
          {isCommissioner && (
            <TouchableOpacity style={styles.inviteBtn} onPress={handleShare} activeOpacity={0.8}>
              <Text style={styles.inviteBtnIcon}>🔗</Text>
              <View style={styles.inviteBtnText}>
                <Text style={styles.inviteBtnTitle}>Invite Members</Text>
                <Text style={styles.inviteBtnSub}>Share the league join link</Text>
              </View>
              <Text style={styles.inviteBtnArrow}>›</Text>
            </TouchableOpacity>
          )}

          {/* Commissioner: Manage League button */}
          {isCommissioner && (
            <TouchableOpacity
              style={styles.inviteBtn}
              onPress={() => router.push(`/fantasy/manage/${leagueId}/${seasonId}` as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.inviteBtnIcon}>⚙</Text>
              <View style={styles.inviteBtnText}>
                <Text style={styles.inviteBtnTitle}>Manage League</Text>
                <Text style={styles.inviteBtnSub}>Edit members, names & teams</Text>
              </View>
              <Text style={styles.inviteBtnArrow}>›</Text>
            </TouchableOpacity>
          )}

          {/* My Team card */}
          {viewer && (
            <View style={[
              styles.myTeamCard,
              isCommissioner ? styles.myTeamCardCommissioner : styles.myTeamCardMember,
            ]}>
              <Text style={styles.myTeamLabel}>MY TEAM</Text>
              <Text style={styles.myTeamName}>{viewer.display_name ?? "—"}</Text>
              {viewer.team_name && (
                <Text style={styles.myTeamTeam}>{viewer.team_name}</Text>
              )}
              {isCommissioner && (
                <Text style={styles.myTeamRole}>
                  {viewer.role === "co_commissioner" ? "Co-Commissioner" : "Commissioner"}
                </Text>
              )}
              {isGuest && (
                <TouchableOpacity
                  style={styles.upgradeLink}
                  onPress={() => router.push("/auth")}
                >
                  <Text style={styles.upgradeLinkText}>
                    Sign in to keep your seat across devices →
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Weekly reward */}
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

          {/* Participants */}
          <Text style={styles.sectionLabel}>
            MANAGERS & TEAMS · {orderedParticipants.length}
          </Text>
          {isCommissioner && (
            <Text style={styles.sectionHint}>
              "Joined" = seat claimed · "Waiting" = not yet claimed
            </Text>
          )}

          <View style={styles.participantsCard}>
            {orderedParticipants.map((p, i) => {
              const isMe = viewer?.league_member_id === p.league_member_id;
              return (
                <View
                  key={p.season_member_id}
                  style={[
                    styles.participantRow,
                    i > 0 && styles.participantRowBorder,
                    isMe && styles.participantRowMe,
                  ]}
                >
                  <View style={styles.participantLeft}>
                    <Text style={[styles.participantName, isMe && styles.participantNameMe]}>
                      {p.display_name ?? "—"}
                      {isMe ? <Text style={styles.meBadge}> · You</Text> : null}
                    </Text>
                    {(p.role === "commissioner" || p.role === "co_commissioner") && (
                      <Text style={styles.commissionerBadge}>
                        {p.role === "co_commissioner" ? "Co-Commissioner" : "Commissioner"}
                      </Text>
                    )}
                    {p.team_name ? (
                      <Text style={styles.teamName}>{p.team_name}</Text>
                    ) : null}
                  </View>

                  {/* Claim status — commissioner-only */}
                  {isCommissioner && (
                    <View style={[
                      styles.claimBadge,
                      p.is_claimed ? styles.claimBadgeJoined : styles.claimBadgeWaiting,
                    ]}>
                      <Text style={[
                        styles.claimBadgeText,
                        p.is_claimed ? styles.claimBadgeTextJoined : styles.claimBadgeTextWaiting,
                      ]}>
                        {p.is_claimed ? "Joined" : "Waiting"}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* ── Draft Day Swayger Card ──────────────────────────────────── */}
          <DraftDayCard
            draftDay={draftDay}
            isCommissioner={isCommissioner}
            canEdit={draftDay?.card_status === "open" && (draftDay?.pick_count ?? 0) === 0}
            lockingDraftDay={lockingDraftDay}
            unlockingDraftDay={unlockingDraftDay}
            lockError={lockError}
            myPickCount={draftDay?.my_pick_count ?? 0}
            onSetup={() => router.push(`/fantasy/draft-day/${leagueId}/${seasonId}`)}
            onManage={() => router.push(`/fantasy/draft-day/${leagueId}/${seasonId}?manage=1`)}
            onPlay={() => router.push(`/fantasy/draft-day/${leagueId}/${seasonId}/play`)}
            onLock={async () => {
              // Called after inline confirm — no Alert.alert (breaks on web)
              if (!session || lockingDraftDay) return;
              setLockError(null);
              setLockingDraftDay(true);
              try {
                await lockDraftDay(leagueId, seasonId, { session });
                setDraftDay((prev) =>
                  prev ? { ...prev, card_status: "locked" as const } : prev
                );
              } catch (e: any) {
                setLockError("Failed to lock. Please try again.");
                console.error("[hub] lock draft day:", e.message);
              } finally {
                setLockingDraftDay(false);
              }
            }}
            onUnlock={async () => {
              if (!session || unlockingDraftDay) return;
              setUnlockingDraftDay(true);
              try {
                await unlockDraftDay(leagueId, seasonId, { session });
                setDraftDay((prev) =>
                  prev ? { ...prev, card_status: "open" as const } : prev
                );
              } catch (e: any) {
                // Surface the reason if settlement has started
                const msg = e.message?.includes("settlement")
                  ? "Picks cannot be unlocked after settlement has started."
                  : "Failed to unlock Draft Day. Please try again.";
                Alert.alert("Cannot Unlock", msg);
                console.error("[hub] unlock draft day:", e.message);
              } finally {
                setUnlockingDraftDay(false);
              }
            }}
          />

          {/* Guest: back to Swayger home */}
          {isGuest && (
            <TouchableOpacity
              style={styles.backToSwayger}
              onPress={() => router.replace("/(tabs)")}
            >
              <Text style={styles.linkText}>← Back to Swayger</Text>
            </TouchableOpacity>
          )}
        </>
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

  // Welcome banner
  welcomeCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.tint,
    padding: 24,
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  welcomeEmoji:   { fontSize: 40, marginBottom: 4 },
  welcomeHeadline:{ fontSize: 26, fontWeight: "800", color: C.text },
  welcomeLeague:  { fontSize: 15, color: C.textMuted, marginTop: -2, marginBottom: 8 },
  welcomeName:    { fontSize: 20, fontWeight: "700", color: C.text },
  welcomeTeam:    { fontSize: 14, color: C.textSecondary },
  welcomeDivider: {
    height: 1,
    backgroundColor: C.border,
    alignSelf: "stretch",
    marginTop: 16,
    marginBottom: 4,
  },
  welcomeUpgradeHint: {
    fontSize: 13,
    color: C.textMuted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  backToSwayger: { marginTop: 14, alignItems: "center" },

  // Header
  backBtn: { marginBottom: 16 },
  leagueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 20,
  },
  sportEmoji: { fontSize: 40 },
  leagueHeaderText: { flex: 1 },
  leagueName: { fontSize: 22, fontWeight: "700", color: C.text, lineHeight: 28 },
  leagueMeta: { fontSize: 13, color: C.textMuted, marginTop: 2 },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  statusText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },

  // Invite button
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.tint,
    padding: 14,
    gap: 12,
    marginBottom: 16,
  },
  inviteBtnIcon:  { fontSize: 22 },
  inviteBtnText:  { flex: 1 },
  inviteBtnTitle: { fontSize: 15, fontWeight: "700", color: C.tint },
  inviteBtnSub:   { fontSize: 12, color: C.textMuted, marginTop: 1 },
  inviteBtnArrow: { fontSize: 22, color: C.tint, fontWeight: "300" },

  // My Team card
  myTeamCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    gap: 4,
  },
  myTeamCardCommissioner: { backgroundColor: "#0D1235", borderColor: C.tint },
  myTeamCardMember:       { backgroundColor: "#0A1F0A", borderColor: "#22c55e" },
  myTeamLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  myTeamName: { fontSize: 20, fontWeight: "700", color: C.text },
  myTeamTeam: { fontSize: 14, color: C.textSecondary },
  myTeamRole: { fontSize: 11, fontWeight: "700", color: C.tint, letterSpacing: 0.4, marginTop: 4 },
  upgradeLink: { marginTop: 8 },
  upgradeLinkText: { fontSize: 12, color: C.tint },

  // Reward
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

  // Participants
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 11,
    color: C.textMuted,
    marginBottom: 10,
  },
  participantsCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    marginBottom: 24,
  },
  participantRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  participantRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  participantRowMe: { backgroundColor: "#12121F" },
  participantLeft: { flex: 1, marginRight: 12 },
  participantName: { fontSize: 15, fontWeight: "600", color: C.text },
  participantNameMe: { color: C.tint },
  meBadge: { fontSize: 13, fontWeight: "400", color: C.textMuted },
  commissionerBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: C.tint,
    letterSpacing: 0.4,
    marginTop: 1,
  },
  teamName: { fontSize: 13, color: C.textSecondary, marginTop: 2 },

  // Claim status badges
  claimBadge: {
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    minWidth: 62,
    alignItems: "center",
  },
  claimBadgeJoined:  { backgroundColor: "#0A1F0A", borderColor: "#22c55e" },
  claimBadgeWaiting: { backgroundColor: C.surfaceLight, borderColor: C.border },
  claimBadgeText:    { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  claimBadgeTextJoined:  { color: "#22c55e" },
  claimBadgeTextWaiting: { color: C.textMuted },

    // Draft Day card
  draftDayCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    marginBottom: 16,
    gap: 12,
  },
  draftDayCardActive: { borderColor: C.tint, backgroundColor: "#06091A" },
  draftDayCardLocked: { borderColor: C.accentGold, backgroundColor: "#1A1500" },
  draftDayHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  draftDayIcon:   { fontSize: 28 },
  draftDayHeaderText: { flex: 1 },
  draftDayLabel:  { fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8 },
  draftDayTitle:  { fontSize: 17, fontWeight: "700", color: C.text },
  draftDayStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  draftDayStatusDot: { width: 6, height: 6, borderRadius: 3 },
  draftDayStatusText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  draftDayCounts: { flexDirection: "row", gap: 12 },
  draftDayCount: {
    flex: 1,
    backgroundColor: C.background,
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  draftDayCountNum:   { fontSize: 22, fontWeight: "700", color: C.text },
  draftDayCountLabel: { fontSize: 11, color: C.textMuted, textAlign: "center", lineHeight: 14 },
  draftDayActions: { gap: 8 },
  draftDayActionRow: { flexDirection: "row", gap: 8 },
  draftDayComingSoon: { fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 19, paddingVertical: 4 },

  // Inline lock confirmation (replaces Alert.alert — unreliable on web)
  lockConfirmBox: {
    backgroundColor: "#1a0a2e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#5B21B6",
    padding: 16,
    gap: 8,
  },
  lockConfirmTitle: { fontSize: 15, fontWeight: "700", color: C.text },
  lockConfirmBody:  { fontSize: 13, color: C.textSecondary, lineHeight: 18 },
  lockConfirmButtons: { flexDirection: "row", gap: 8, marginTop: 4 },
  lockErrorText: { fontSize: 12, color: C.danger, textAlign: "center", marginTop: 4 },

  // Shared
  btn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    alignSelf: "stretch",
  },
  btnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.tint,
  },
  btnDisabledSolid: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  btnText:   { color: "#fff", fontWeight: "700", fontSize: 15 },
  linkText:  { color: C.tint, fontSize: 14, fontWeight: "600" },
  errorText: { color: C.danger, fontSize: 14, textAlign: "center" },
});
