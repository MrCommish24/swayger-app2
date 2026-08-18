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
import * as Clipboard from "expo-clipboard";
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
  finalizeDraftDay,
  getWeekStatus,
  getWeeklySummary,
  lockWeekly,
  unlockWeekly,
  finalizeWeekly,
  getSeasonStandings,
  FANTASY_PENDING_UPGRADE_KEY,
  FantasyPendingUpgrade,
  FANTASY_SPORTS,
  FantasySeasonDetail,
  FantasyParticipant,
  DraftDayStatus,
  WeeklyStatus,
  WeeklySummaryResponse,
  PastWeekSummary,
  SeasonStandings,
} from "@/lib/fantasy-api";

// ── Phase 5.3: Commissioner next-action helper ────────────────────────────────
// Derives the single most important commissioner action from current hub state.
// Used for visual hierarchy — does not hide any controls, only drives emphasis.
type CommissionerNextAction =
  | "create"           // no week yet, or previous week finalized — create next
  | "share"            // week open, early — primary job is getting people to play
  | "remind"           // week open, some have played, others haven't
  | "lock"             // everyone has played — ready to lock
  | "resolve"          // locked, no questions resolved yet
  | "continue_resolve" // locked, partially resolved
  | "finalize"         // all resolved — ready to finalize
  | "view_results";    // finalized

function getCommissionerNextAction(
  ws: WeeklySummaryResponse | undefined
): CommissionerNextAction | null {
  if (!ws) return null;
  if (ws.can_create_next) return "create";

  const cw = ws.current_week;
  if (!cw) return "create";
  if (cw.room_status === "finalized") return "view_results";

  if (cw.card_status === "locked") {
    if (cw.all_settled) return "finalize";
    if ((cw.settled_count ?? 0) > 0) return "continue_resolve";
    return "resolve";
  }

  // Open / picks active
  const eligible = cw.eligible_count ?? 0;
  const played   = cw.played_count   ?? 0;
  if (eligible > 0 && played >= eligible) return "lock";
  if (played > 0) return "remind";
  return "share";
}
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
// Phase 4C: finalized = room_status === 'finalized' (card stays 'locked', NOT 'settled').
// Settlement CTAs appear for the commissioner when the card is locked.
interface DraftDayCardProps {
  draftDay: import("@/lib/fantasy-api").DraftDayStatus | null | undefined;
  isCommissioner: boolean;
  canEdit:          boolean; // card is 'open' AND global pick_count === 0
  lockingDraftDay:  boolean;
  unlockingDraftDay: boolean;
  lockError:        string | null;
  /** Viewer's own pick count — drives the member CTA label. 0 = no picks yet. */
  myPickCount:      number;
  finalizingDraftDay: boolean;
  finalizeError:    string | null;
  onSetup:       () => void;
  onManage:      () => void;
  /** Navigate to the member play screen. */
  onPlay:        () => void;
  onLock:        () => void; // direct API call, no Alert — called after inline confirm
  onUnlock:      () => void;
  onResolve:     () => void; // navigate to settle screen
  onFinalize:    () => void; // call finalize API (after inline confirm)
  onViewResults: () => void; // navigate to results screen
}

function DraftDayCard({
  draftDay,
  isCommissioner,
  canEdit,
  lockingDraftDay,
  unlockingDraftDay,
  lockError,
  myPickCount,
  finalizingDraftDay,
  finalizeError,
  onSetup,
  onManage,
  onPlay,
  onLock,
  onUnlock,
  onResolve,
  onFinalize,
  onViewResults,
}: DraftDayCardProps) {
  const [confirmingLock, setConfirmingLock]         = React.useState(false);
  const [confirmingFinalize, setConfirmingFinalize] = React.useState(false);

  // Reset lock confirm when card becomes locked
  React.useEffect(() => {
    if (draftDay?.card_status === "locked") setConfirmingLock(false);
  }, [draftDay?.card_status]);

  // Reset finalize confirm after finalization completes
  React.useEffect(() => {
    if (draftDay?.room_status === "finalized") setConfirmingFinalize(false);
  }, [draftDay?.room_status]);

  // Not yet fetched — show nothing to avoid flicker
  if (draftDay === undefined) return null;

  // Phase 4C: finalized = room_status === 'finalized', NOT card_status === 'settled'
  const isFinalized = draftDay?.room_status === "finalized";
  const isLocked    = !isFinalized && draftDay?.card_status === "locked";
  const isPublished = !!draftDay;

  const settledCount  = draftDay?.settled_competition_count ?? 0;
  const totalComp     = draftDay?.prop_counts?.competition ?? 0;
  const allCompSettled = totalComp > 0 && settledCount === totalComp;

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

  // ── State: Finalized ─────────────────────────────────────────────────────
  if (isFinalized) {
    return (
      <View style={[styles.draftDayCard, styles.draftDayCardLocked]}>
        <View style={styles.draftDayHeader}>
          <Text style={styles.draftDayIcon}>🏆</Text>
          <View style={styles.draftDayHeaderText}>
            <Text style={styles.draftDayLabel}>DRAFT DAY SWAYGER</Text>
            <Text style={styles.draftDayTitle}>Results Ready</Text>
          </View>
          <View style={[styles.draftDayStatusBadge, { borderColor: C.accentGold }]}>
            <View style={[styles.draftDayStatusDot, { backgroundColor: C.accentGold }]} />
            <Text style={[styles.draftDayStatusText, { color: C.accentGold }]}>FINAL</Text>
          </View>
        </View>
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
        <View style={styles.draftDayActions}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: "#B45309" }]}
            onPress={onViewResults}
            activeOpacity={0.8}
          >
            <Text style={styles.btnText}>🏆  View Draft Day Results</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── State: Open or Locked (active) ───────────────────────────────────────
  const statusColor = isLocked ? C.accentGold : "#22c55e";
  const statusLabel = isLocked ? "LOCKED" : "READY";
  const cardTitle   = isLocked ? "Picks Locked" : "Draft Day Ready";

  return (
    <View style={[
      styles.draftDayCard,
      isLocked ? styles.draftDayCardLocked : styles.draftDayCardActive,
    ]}>
      {/* Header */}
      <View style={styles.draftDayHeader}>
        <Text style={styles.draftDayIcon}>{isLocked ? "🔒" : "📋"}</Text>
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

        {/* Member CTA — all members see this */}
        {isLocked ? (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: "#1A1500", borderWidth: 1, borderColor: C.accentGold }]}
            onPress={onPlay}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnText, { color: C.accentGold }]}>👁  View My Picks</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={onPlay} activeOpacity={0.8}>
            <Text style={styles.btnText}>
              {myPickCount > 0 ? "✏️  View / Update My Picks" : "🏈  Make My Picks"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Commissioner controls */}
        {isCommissioner && (
          <View style={{ gap: 8 }}>

            {/* Manage / View Draft Day — only when open */}
            {!isLocked && (
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={onManage}
                disabled={lockingDraftDay}
                activeOpacity={0.8}
              >
                <Text style={[styles.btnText, { color: C.tint }]}>
                  {canEdit ? "✏️  Manage Draft Day" : "👁  View Draft Day"}
                </Text>
              </TouchableOpacity>
            )}

            {/* Lock Picks (when open) */}
            {!isLocked && (
              <View style={styles.draftDayActionRow}>
                {!confirmingLock && (
                  <TouchableOpacity
                    style={[styles.btn, { flex: 1, backgroundColor: "#5B21B6" }, lockingDraftDay && { opacity: 0.5 }]}
                    onPress={() => setConfirmingLock(true)}
                    disabled={lockingDraftDay}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnText}>🔒  Lock Picks</Text>
                  </TouchableOpacity>
                )}
                {confirmingLock && (
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
                        style={[styles.btn, { flex: 1, backgroundColor: "#5B21B6" }, lockingDraftDay && { opacity: 0.5 }]}
                        onPress={onLock}
                        disabled={lockingDraftDay}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.btnText}>{lockingDraftDay ? "Locking…" : "🔒  Lock Picks"}</Text>
                      </TouchableOpacity>
                    </View>
                    {lockError && <Text style={styles.lockErrorText}>{lockError}</Text>}
                  </View>
                )}
              </View>
            )}

            {/* Settlement CTAs (when locked + room active) */}
            {isLocked && (
              <View style={{ gap: 8 }}>

                {/* Progress indicator */}
                {settledCount > 0 && !allCompSettled && (
                  <Text style={styles.settlementProgress}>
                    ⚖️  {settledCount} / {totalComp} questions resolved
                  </Text>
                )}

                {/* Resolve Draft Day / Continue Resolving */}
                {!allCompSettled && (
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: "#1D4ED8" }]}
                    onPress={onResolve}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnText}>
                      {settledCount === 0 ? "⚖️  Resolve Draft Day" : "⚖️  Continue Resolving"}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Finalize Draft Day — shown when all competition props settled */}
                {allCompSettled && !confirmingFinalize && (
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: "#16a34a" }, finalizingDraftDay && { opacity: 0.5 }]}
                    onPress={() => setConfirmingFinalize(true)}
                    disabled={finalizingDraftDay}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnText}>🏆  Finalize Draft Day</Text>
                  </TouchableOpacity>
                )}

                {/* Finalize inline confirm */}
                {allCompSettled && confirmingFinalize && (
                  <View style={styles.lockConfirmBox}>
                    <Text style={styles.lockConfirmTitle}>Finalize Draft Day?</Text>
                    <Text style={styles.lockConfirmBody}>
                      This permanently seals the leaderboard and reveals results to all members. Season Receipts will settle later.
                    </Text>
                    <View style={styles.lockConfirmButtons}>
                      <TouchableOpacity
                        style={[styles.btn, styles.btnSecondary, { flex: 1 }]}
                        onPress={() => { setConfirmingFinalize(false); }}
                        disabled={finalizingDraftDay}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.btnText, { color: C.tint }]}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btn, { flex: 1, backgroundColor: "#16a34a" }, finalizingDraftDay && { opacity: 0.5 }]}
                        onPress={onFinalize}
                        disabled={finalizingDraftDay}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.btnText}>{finalizingDraftDay ? "Finalizing…" : "🏆  Finalize"}</Text>
                      </TouchableOpacity>
                    </View>
                    {finalizeError && <Text style={styles.lockErrorText}>{finalizeError}</Text>}
                  </View>
                )}

                {/* Unlock Picks — only when no settlement has started */}
                {settledCount === 0 && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnSecondary, unlockingDraftDay && { opacity: 0.5 }]}
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
            )}

          </View>
        )}
      </View>
    </View>
  );
}

// ── PastWeekRow ───────────────────────────────────────────────────────────────
// Compact row for a finalized past weekly competition in the Past Swaygers list.
function PastWeekRow({
  label,
  onView,
}: {
  label: string;
  onView: () => void;
}) {
  return (
    <TouchableOpacity style={styles.pastWeekRow} onPress={onView} activeOpacity={0.8}>
      <Text style={styles.pastWeekIcon}>🏈</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.pastWeekTitle}>{label}</Text>
        <Text style={styles.pastWeekSub}>Final Results</Text>
      </View>
      <Text style={styles.pastWeekArrow}>View  ›</Text>
    </TouchableOpacity>
  );
}

// ── WeeklyCard ────────────────────────────────────────────────────────────────
// Renders the current weekly competition section on the hub.
// Phase 5.1: participation count, Played/Waiting list, Share Week, Share Reminder.
// Phase 5.2: fully dynamic weekNumber — no Week 1 hardcoding.
interface WeeklyCardProps {
  weekNumber:          number;
  weekly:              WeeklyStatus | null | undefined; // undefined = not yet fetched
  isCommissioner:      boolean;
  locking:             boolean;
  unlocking:           boolean;
  finalizing:          boolean;
  lockError:           string | null;
  finalizeError:       string | null;
  myPickCount:         number;
  onSetup:             () => void;
  onPlay:              () => void;
  onLock:              () => void;
  onUnlock:            () => void;
  onSettle:            () => void;
  onFinalize:          () => void;
  onViewResults:       () => void;
  onViewStandings:     () => void;
  // Phase 5.1
  onShare:             () => void;
  onShareReminder:     () => void;
  onCopyLink:          () => Promise<void>;
}

function WeeklyCard({
  weekNumber,
  weekly,
  isCommissioner,
  locking,
  unlocking,
  finalizing,
  lockError,
  finalizeError,
  myPickCount,
  onSetup,
  onPlay,
  onLock,
  onUnlock,
  onSettle,
  onFinalize,
  onViewResults,
  onViewStandings,
  onShare,
  onShareReminder,
  onCopyLink,
}: WeeklyCardProps) {
  const [confirmLock, setConfirmLock]           = React.useState(false);
  const [confirmFinalize, setConfirmFinalize]   = React.useState(false);
  const [showParticipants, setShowParticipants] = React.useState(false);
  // "copied" | "error" | null — auto-resets after 2 s
  const [copyFeedback, setCopyFeedback]         = React.useState<"copied" | "error" | null>(null);
  const copyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => { if (weekly?.card_status === "locked") setConfirmLock(false); }, [weekly?.card_status]);
  React.useEffect(() => { if (weekly?.room_status === "finalized") setConfirmFinalize(false); }, [weekly?.room_status]);

  if (weekly === undefined) return null;

  const isFinalized  = weekly?.room_status === "finalized";
  const isLocked     = !isFinalized && weekly?.card_status === "locked";
  const isPublished  = !!weekly;

  const settledCount  = weekly?.settled_count ?? 0;
  const totalCount    = weekly?.prop_count ?? 0;
  const allSettled    = totalCount > 0 && settledCount === totalCount;

  // ── Not yet published ───────────────────────────────────────────────────────
  if (!isPublished) {
    return (
      <View style={styles.draftDayCard}>
        <View style={styles.draftDayHeader}>
          <Text style={styles.draftDayIcon}>🏈</Text>
          <View style={styles.draftDayHeaderText}>
            <Text style={styles.draftDayLabel}>UPCOMING</Text>
            <Text style={styles.draftDayTitle}>Week {weekNumber} Swayger</Text>
          </View>
        </View>
        {isCommissioner ? (
          <TouchableOpacity style={styles.btn} onPress={onSetup} activeOpacity={0.8}>
            <Text style={styles.btnText}>Set Up Week {weekNumber}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.draftDayComingSoon}>
            Your commissioner is setting up Week {weekNumber} questions. Check back soon!
          </Text>
        )}
      </View>
    );
  }

  // ── Finalized ───────────────────────────────────────────────────────────────
  if (isFinalized) {
    return (
      <View style={[styles.draftDayCard, styles.draftDayCardLocked]}>
        <View style={styles.draftDayHeader}>
          <Text style={styles.draftDayIcon}>🏆</Text>
          <View style={styles.draftDayHeaderText}>
            <Text style={styles.draftDayLabel}>WEEK {weekNumber} SWAYGER</Text>
            <Text style={styles.draftDayTitle}>Results Ready</Text>
          </View>
          <View style={[styles.draftDayStatusBadge, { borderColor: C.accentGold }]}>
            <View style={[styles.draftDayStatusDot, { backgroundColor: C.accentGold }]} />
            <Text style={[styles.draftDayStatusText, { color: C.accentGold }]}>FINAL</Text>
          </View>
        </View>
        {/* Reward snapshot for finalized week */}
        {(weekly?.reward_description || weekly?.reward_amount_display) && (
          <View style={styles.weeklyRewardRow}>
            <Text style={styles.weeklyRewardText}>
              🏆&nbsp;
              {weekly?.reward_amount_display ? `${weekly.reward_amount_display} — ` : ""}
              {weekly?.reward_description}
            </Text>
          </View>
        )}
        <View style={styles.draftDayActions}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: "#B45309" }]}
            onPress={onViewResults}
            activeOpacity={0.8}
          >
            <Text style={styles.btnText}>🏆  View Week {weekNumber} Results</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary]}
            onPress={onViewStandings}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnText, { color: C.tint }]}>📊  Season Standings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Open or Locked ──────────────────────────────────────────────────────────
  const statusColor = isLocked ? C.accentGold : "#22c55e";
  const statusLabel = isLocked ? "LOCKED" : "OPEN";
  const cardTitle   = isLocked ? "Picks Locked" : `Week ${weekNumber} Ready`;

  return (
    <View style={[
      styles.draftDayCard,
      isLocked ? styles.draftDayCardLocked : styles.draftDayCardActive,
    ]}>
      {/* Header */}
      <View style={styles.draftDayHeader}>
        <Text style={styles.draftDayIcon}>{isLocked ? "🔒" : "🏈"}</Text>
        <View style={styles.draftDayHeaderText}>
          <Text style={styles.draftDayLabel}>WEEK {weekNumber} SWAYGER</Text>
          <Text style={styles.draftDayTitle}>{cardTitle}</Text>
        </View>
        <View style={[styles.draftDayStatusBadge, { borderColor: statusColor }]}>
          <View style={[styles.draftDayStatusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.draftDayStatusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Reward — shown when this week's room has a snapshotted reward */}
      {(weekly?.reward_description || weekly?.reward_amount_display) && (
        <View style={styles.weeklyRewardRow}>
          <Text style={styles.weeklyRewardText}>
            🏆&nbsp;
            {weekly?.reward_amount_display ? `${weekly.reward_amount_display} — ` : ""}
            {weekly?.reward_description}
          </Text>
        </View>
      )}

      {/* Prop count */}
      <View style={styles.draftDayCounts}>
        <View style={styles.draftDayCount}>
          <Text style={styles.draftDayCountNum}>{totalCount}</Text>
          <Text style={styles.draftDayCountLabel}>Week {weekNumber}{"\n"}Questions</Text>
        </View>
        {/* Participation stat — visible to all when published */}
        {(weekly?.eligible_count ?? 0) > 0 && (
          <View style={[styles.draftDayCount, { flex: 1 }]}>
            <Text style={styles.draftDayCountNum}>
              {weekly?.played_count ?? 0}
              <Text style={[styles.draftDayCountLabel, { fontSize: 14 }]}> / {weekly?.eligible_count ?? 0}</Text>
            </Text>
            <Text style={styles.draftDayCountLabel}>Have{"\n"}Played</Text>
          </View>
        )}
      </View>

      {/* Commissioner: Played / Waiting member list (expandable) */}
      {isCommissioner && (weekly?.participants_status?.length ?? 0) > 0 && (
        <View style={{ marginBottom: 4 }}>
          <TouchableOpacity
            style={styles.weeklyPartToggle}
            onPress={() => setShowParticipants((s) => !s)}
            activeOpacity={0.8}
          >
            <Text style={styles.weeklyPartToggleText}>
              {weekly!.played_count} played · {weekly!.waiting_count} waiting
            </Text>
            <Text style={styles.weeklyPartToggleArrow}>{showParticipants ? "▲" : "▼"}</Text>
          </TouchableOpacity>

          {showParticipants && (
            <View style={styles.weeklyPartList}>
              {/* Played */}
              {(weekly!.participants_status ?? []).filter((p) => p.has_played).length > 0 && (
                <View>
                  <Text style={styles.weeklyPartSectionHeader}>
                    PLAYED ({(weekly!.participants_status ?? []).filter((p) => p.has_played).length})
                  </Text>
                  {(weekly!.participants_status ?? [])
                    .filter((p) => p.has_played)
                    .map((p) => (
                      <View key={p.season_member_id} style={styles.weeklyPartItem}>
                        <Text style={styles.weeklyPartItemCheck}>✓</Text>
                        <Text style={styles.weeklyPartItemName}>{p.display_name ?? "Member"}</Text>
                      </View>
                    ))}
                </View>
              )}
              {/* Waiting */}
              {(weekly!.participants_status ?? []).filter((p) => !p.has_played).length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.weeklyPartSectionHeader}>
                    NOT PLAYED YET ({(weekly!.participants_status ?? []).filter((p) => !p.has_played).length})
                  </Text>
                  {(weekly!.participants_status ?? [])
                    .filter((p) => !p.has_played)
                    .map((p) => (
                      <View key={p.season_member_id} style={styles.weeklyPartItem}>
                        <Text style={styles.weeklyPartItemWait}>○</Text>
                        <Text style={[styles.weeklyPartItemName, { color: C.textSecondary }]}>
                          {p.display_name ?? "Member"}
                        </Text>
                      </View>
                    ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.draftDayActions}>
        {/* Member CTA */}
        {isLocked ? (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: "#1A1500", borderWidth: 1, borderColor: C.accentGold }]}
            onPress={onPlay}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnText, { color: C.accentGold }]}>👁  View My Picks</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={onPlay} activeOpacity={0.8}>
            <Text style={styles.btnText}>
              {myPickCount > 0 ? "✏️  View / Update My Picks" : "🏈  Make My Picks"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Commissioner controls */}
        {isCommissioner && (
          <View style={{ gap: 8 }}>
            {/* Share CTAs — visible while picks are OPEN */}
            {!isLocked && (
              <View style={{ gap: 8 }}>
                {/* Primary: Share Week N */}
                <TouchableOpacity
                  style={styles.weeklyShareBtn}
                  onPress={onShare}
                  activeOpacity={0.8}
                >
                  <Text style={styles.weeklyShareBtnText}>📣  Share Week {weekNumber}</Text>
                </TouchableOpacity>

                {/* Secondary row: Copy Link + Share Reminder */}
                <View style={styles.weeklySecondaryRow}>
                  <TouchableOpacity
                    style={styles.weeklySecondaryBtn}
                    onPress={async () => {
                      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
                      try {
                        await onCopyLink();
                        setCopyFeedback("copied");
                      } catch {
                        setCopyFeedback("error");
                      }
                      copyTimerRef.current = setTimeout(() => setCopyFeedback(null), 2000);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.weeklySecondaryBtnText}>
                      {copyFeedback === "copied" ? "✓ Link copied" :
                       copyFeedback === "error"  ? "⚠ Copy failed" :
                       "🔗  Copy Link"}
                    </Text>
                  </TouchableOpacity>

                  {(weekly?.waiting_count ?? 0) > 0 && (
                    <TouchableOpacity
                      style={styles.weeklySecondaryBtn}
                      onPress={onShareReminder}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.weeklySecondaryBtnText}>
                        🔔  Remind ({weekly?.waiting_count})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* Lock Picks (when open) — secondary action below Share */}
            {!isLocked && (
              <View style={styles.draftDayActionRow}>
                {!confirmLock && (
                  <TouchableOpacity
                    style={[styles.lockPicksBtn, locking && { opacity: 0.5 }]}
                    onPress={() => setConfirmLock(true)}
                    disabled={locking}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.lockPicksBtnText}>🔒  Lock Picks</Text>
                  </TouchableOpacity>
                )}
                {confirmLock && (
                  <View style={styles.lockConfirmBox}>
                    <Text style={styles.lockConfirmTitle}>Lock Week {weekNumber} picks?</Text>
                    <Text style={styles.lockConfirmBody}>
                      Members won't be able to change picks until you unlock.
                    </Text>
                    <View style={styles.lockConfirmButtons}>
                      <TouchableOpacity
                        style={[styles.btn, styles.btnSecondary, { flex: 1 }]}
                        onPress={() => setConfirmLock(false)}
                        disabled={locking}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.btnText, { color: C.tint }]}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btn, { flex: 1, backgroundColor: "#5B21B6" }, locking && { opacity: 0.5 }]}
                        onPress={onLock}
                        disabled={locking}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.btnText}>{locking ? "Locking…" : "🔒  Lock Picks"}</Text>
                      </TouchableOpacity>
                    </View>
                    {lockError && <Text style={styles.lockErrorText}>{lockError}</Text>}
                  </View>
                )}
              </View>
            )}

            {/* Settlement CTAs (when locked) */}
            {isLocked && (
              <View style={{ gap: 8 }}>
                {settledCount > 0 && !allSettled && (
                  <Text style={styles.settlementProgress}>
                    ⚖️  {settledCount} / {totalCount} questions resolved
                  </Text>
                )}

                {!allSettled && (
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: "#1D4ED8" }]}
                    onPress={onSettle}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnText}>
                      {settledCount === 0 ? "⚖️  Resolve Week " + weekNumber : "⚖️  Continue Resolving"}
                    </Text>
                  </TouchableOpacity>
                )}

                {allSettled && !confirmFinalize && (
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: "#16a34a" }, finalizing && { opacity: 0.5 }]}
                    onPress={() => setConfirmFinalize(true)}
                    disabled={finalizing}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnText}>🏆  Finalize Week {weekNumber}</Text>
                  </TouchableOpacity>
                )}

                {allSettled && confirmFinalize && (
                  <View style={styles.lockConfirmBox}>
                    <Text style={styles.lockConfirmTitle}>Finalize Week {weekNumber}?</Text>
                    <Text style={styles.lockConfirmBody}>
                      This permanently reveals results to all members.
                    </Text>
                    <View style={styles.lockConfirmButtons}>
                      <TouchableOpacity
                        style={[styles.btn, styles.btnSecondary, { flex: 1 }]}
                        onPress={() => setConfirmFinalize(false)}
                        disabled={finalizing}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.btnText, { color: C.tint }]}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btn, { flex: 1, backgroundColor: "#16a34a" }, finalizing && { opacity: 0.5 }]}
                        onPress={onFinalize}
                        disabled={finalizing}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.btnText}>{finalizing ? "Finalizing…" : "🏆  Finalize"}</Text>
                      </TouchableOpacity>
                    </View>
                    {finalizeError && <Text style={styles.lockErrorText}>{finalizeError}</Text>}
                  </View>
                )}

                {settledCount === 0 && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnSecondary, unlocking && { opacity: 0.5 }]}
                    onPress={onUnlock}
                    disabled={unlocking}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.btnText, { color: C.tint }]}>
                      {unlocking ? "Unlocking…" : "🔓  Unlock Picks"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
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

/** Direct link to the weekly pick screen. Used for commissioner re-engagement sharing. */
function buildWeekUrl(leagueId: string, seasonId: string, weekNumber: number): string {
  const path = `/fantasy/weeks/${leagueId}/${seasonId}/${weekNumber}/play`;
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
  const [draftDay, setDraftDay]                 = useState<DraftDayStatus | null | undefined>(undefined); // undefined=not yet fetched
  const [lockingDraftDay, setLockingDraftDay]   = useState(false);
  const [unlockingDraftDay, setUnlockingDraftDay] = useState(false);
  const [lockError, setLockError]               = useState<string | null>(null);
  const [finalizingDraftDay, setFinalizingDraftDay] = useState(false);
  const [finalizeError, setFinalizeError]           = useState<string | null>(null);
  // ── Phase 5.2: Weekly summary (all weeks — one request) ─────────────────────
  const [weeklySummary, setWeeklySummary]       = useState<WeeklySummaryResponse | null | undefined>(undefined);
  const [lockingWeekly, setLockingWeekly]       = useState(false);
  const [unlockingWeekly, setUnlockingWeekly]   = useState(false);
  const [weeklyLockError, setWeeklyLockError]   = useState<string | null>(null);
  const [finalizingWeekly, setFinalizingWeekly] = useState(false);
  const [weeklyFinalizeError, setWeeklyFinalizeError] = useState<string | null>(null);
  // Track initial mount so useFocusEffect doesn't double-fetch on first render
  const initialFocusRef = useRef(true);

  // Welcome banner: shown immediately after a successful claim (?joined=1)
  const [showWelcome, setShowWelcome] = useState(joined === "1");

  // Guest upgrade banner: shown in the main hub for device-only guests who are
  // past the initial welcome screen. Dismissible per-session (no DB needed).
  const [guestBannerDismissed, setGuestBannerDismissed] = useState(false);

  const fetchDetail = useCallback(
    async (quiet = false) => {
      if (!leagueId || !seasonId) return;
      if (!session && !guestToken) return;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const auth = session ? { session } : { guestToken: guestToken! };
        const [data, dd, ws] = await Promise.all([
          fantasyFetch<FantasySeasonDetail>(
            `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}`,
            {},
            auth
          ),
          getDraftDay(leagueId, seasonId, auth).catch(() => null),
          getWeeklySummary(leagueId, seasonId, auth).catch(() => null),
        ]);
        setDetail(data);
        setDraftDay(dd);
        setWeeklySummary(ws);
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

          {isGuest && viewer ? (
            // Guest welcome: lead with the upgrade benefit, CTAs in priority order
            <>
              <View style={styles.welcomeDivider} />
              <Text style={styles.welcomeUpgradeTitle}>
                Keep your league spot on any device
              </Text>
              <Text style={styles.welcomeUpgradeHint}>
                You're in as a guest. Connect a Swayger account so you can return to
                your Draft Day and weekly Swaygers even if you switch devices or
                clear your browser.
              </Text>
              <TouchableOpacity
                style={[styles.btn, { marginTop: 10, alignSelf: "stretch" as const }]}
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
                  // Return here after sign-in / account creation
                  await AsyncStorage.setItem(
                    PENDING_AUTH_REDIRECT_KEY,
                    `/fantasy/${leagueId}/${seasonId}?joined=1`
                  ).catch(() => {});
                  router.push("/auth");
                }}
              >
                <Text style={styles.btnText}>Save My Spot</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, { marginTop: 4, alignSelf: "stretch" as const }]}
                onPress={() => setShowWelcome(false)}
              >
                <Text style={[styles.btnText, { color: C.textSecondary }]}>
                  Maybe Later
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            // Authenticated member welcome: just open the league
            <TouchableOpacity
              style={[styles.btn, { marginTop: 16 }]}
              onPress={() => setShowWelcome(false)}
            >
              <Text style={styles.btnText}>Open My League</Text>
            </TouchableOpacity>
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

          {/* Guest upgrade banner — shown to device-only guests not on the welcome screen */}
          {isGuest && viewer && !guestBannerDismissed && (
            <View style={styles.guestBanner}>
              <View style={styles.guestBannerRow}>
                <View style={styles.guestBannerContent}>
                  <Text style={styles.guestBannerTitle}>🔐 Keep your league access</Text>
                  <Text style={styles.guestBannerBody}>
                    You're playing as a guest on this device. Connect an account to
                    keep your spot if you switch devices.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setGuestBannerDismissed(true)}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                >
                  <Text style={styles.guestBannerDismissIcon}>✕</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.guestBannerCTA}
                onPress={async () => {
                  if (guestToken && viewer?.league_member_id) {
                    await AsyncStorage.setItem(
                      FANTASY_PENDING_UPGRADE_KEY,
                      JSON.stringify({
                        guest_token:      guestToken,
                        league_member_id: viewer.league_member_id,
                      } satisfies FantasyPendingUpgrade)
                    ).catch(() => {});
                  }
                  await AsyncStorage.setItem(
                    PENDING_AUTH_REDIRECT_KEY,
                    `/fantasy/${leagueId}/${seasonId}`
                  ).catch(() => {});
                  router.push("/auth");
                }}
              >
                <Text style={styles.guestBannerCTAText}>Save My Spot</Text>
              </TouchableOpacity>
            </View>
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
              {isGuest && viewer && (
                <TouchableOpacity
                  style={styles.upgradeLink}
                  onPress={async () => {
                    // Store upgrade intent so the hub auto-upgrades the guest claim
                    // when the authenticated session is detected (shared-device safe).
                    await AsyncStorage.setItem(
                      FANTASY_PENDING_UPGRADE_KEY,
                      JSON.stringify({
                        guest_token:      guestToken,
                        league_member_id: viewer.league_member_id,
                      } satisfies FantasyPendingUpgrade)
                    ).catch(() => {});
                    await AsyncStorage.setItem(
                      PENDING_AUTH_REDIRECT_KEY,
                      `/fantasy/${leagueId}/${seasonId}`
                    ).catch(() => {});
                    router.push("/auth");
                  }}
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
            finalizingDraftDay={finalizingDraftDay}
            finalizeError={finalizeError}
            onSetup={() => router.push(`/fantasy/draft-day/${leagueId}/${seasonId}`)}
            onManage={() => router.push(`/fantasy/draft-day/${leagueId}/${seasonId}?manage=1`)}
            onPlay={() => router.push(`/fantasy/draft-day/${leagueId}/${seasonId}/play`)}
            onResolve={() => router.push(`/fantasy/draft-day/${leagueId}/${seasonId}/settle` as any)}
            onViewResults={() => router.push(`/fantasy/draft-day/${leagueId}/${seasonId}/results` as any)}
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
            onFinalize={async () => {
              if (!session || finalizingDraftDay) return;
              setFinalizeError(null);
              setFinalizingDraftDay(true);
              try {
                await finalizeDraftDay(leagueId, seasonId, { session });
                // Refresh hub state to show finalized room
                fetchDetail(true);
              } catch (e: any) {
                setFinalizeError(e.message?.includes("unsettled")
                  ? "Some questions are not yet resolved. Resolve all Draft Day questions first."
                  : "Failed to finalize. Please try again.");
                console.error("[hub] finalize draft day:", e.message);
              } finally {
                setFinalizingDraftDay(false);
              }
            }}
          />

          {/* ── Current Swayger (dynamic weekNumber) ─────────────────────── */}
          {weeklySummary !== undefined && (() => {
            const cw  = weeklySummary?.current_week ?? null;
            const wn  = cw?.week_number ?? 0;
            return (
              <>
                {cw && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 4, marginBottom: 10 }]}>
                      CURRENT SWAYGER
                    </Text>
                    <WeeklyCard
                      weekNumber={wn}
                      weekly={cw}
                      isCommissioner={isCommissioner}
                      locking={lockingWeekly}
                      unlocking={unlockingWeekly}
                      finalizing={finalizingWeekly}
                      lockError={weeklyLockError}
                      finalizeError={weeklyFinalizeError}
                      myPickCount={cw.my_pick_count ?? 0}
                      onSetup={() => router.push(`/fantasy/weeks/${leagueId}/${seasonId}/${wn}/setup` as any)}
                      onPlay={() => router.push(`/fantasy/weeks/${leagueId}/${seasonId}/${wn}/play` as any)}
                      onSettle={() => router.push(`/fantasy/weeks/${leagueId}/${seasonId}/${wn}/settle` as any)}
                      onViewResults={() => router.push(`/fantasy/weeks/${leagueId}/${seasonId}/${wn}/results` as any)}
                      onViewStandings={() => router.push(`/fantasy/standings/${leagueId}/${seasonId}` as any)}
                      onLock={async () => {
                        if (!session || lockingWeekly) return;
                        setWeeklyLockError(null);
                        setLockingWeekly(true);
                        try {
                          await lockWeekly(leagueId, seasonId, wn, { session });
                          setWeeklySummary((prev) => prev && prev.current_week ? {
                            ...prev,
                            current_week: { ...prev.current_week, card_status: "locked" as const },
                          } : prev);
                        } catch (e: any) {
                          setWeeklyLockError("Failed to lock. Please try again.");
                          console.error("[hub] lock weekly:", e.message);
                        } finally {
                          setLockingWeekly(false);
                        }
                      }}
                      onUnlock={async () => {
                        if (!session || unlockingWeekly) return;
                        setUnlockingWeekly(true);
                        try {
                          await unlockWeekly(leagueId, seasonId, wn, { session });
                          setWeeklySummary((prev) => prev && prev.current_week ? {
                            ...prev,
                            current_week: { ...prev.current_week, card_status: "open" as const },
                          } : prev);
                        } catch (e: any) {
                          const msg = e.message?.includes("settlement")
                            ? "Picks cannot be unlocked after settlement has started."
                            : `Failed to unlock Week ${wn}. Please try again.`;
                          Alert.alert("Cannot Unlock", msg);
                          console.error("[hub] unlock weekly:", e.message);
                        } finally {
                          setUnlockingWeekly(false);
                        }
                      }}
                      onFinalize={async () => {
                        if (!session || finalizingWeekly) return;
                        setWeeklyFinalizeError(null);
                        setFinalizingWeekly(true);
                        try {
                          await finalizeWeekly(leagueId, seasonId, wn, { session });
                          fetchDetail(true);
                        } catch (e: any) {
                          setWeeklyFinalizeError(e.message?.includes("unsettled")
                            ? "Some questions are not yet resolved."
                            : "Failed to finalize. Please try again.");
                          console.error("[hub] finalize weekly:", e.message);
                        } finally {
                          setFinalizingWeekly(false);
                        }
                      }}
                      onShare={async () => {
                        const url = buildWeekUrl(leagueId, seasonId, wn);
                        const hasDDFinalized = draftDay?.room_status === "finalized";
                        const message = hasDDFinalized
                          ? `Week ${wn} Swayger is live 🏈\n\nDraft Day is over. Now let's see who really knows this league.\n\nMake your picks before they lock:\n\n${url}`
                          : `Week ${wn} Swayger is live 🏈\n\nThink you know our league better than everyone else?\n\nMake your Week ${wn} picks before they lock.\n\n${url}`;
                        try {
                          await Share.share(Platform.OS === "ios" ? { message, url } : { message });
                        } catch { }
                      }}
                      onShareReminder={async () => {
                        const url     = buildWeekUrl(leagueId, seasonId, wn);
                        const waiting = cw.waiting_count ?? 0;
                        const people  = waiting === 1 ? "person hasn't" : "people haven't";
                        const message = `Week ${wn} Swayger reminder 👀\n\n${waiting} ${people} made their picks.\n\nStill time to make your Week ${wn} picks:\n\n${url}`;
                        try {
                          await Share.share(Platform.OS === "ios" ? { message, url } : { message });
                        } catch { }
                      }}
                      onCopyLink={async () => {
                        const url = buildWeekUrl(leagueId, seasonId, wn);
                        await Clipboard.setStringAsync(url);
                      }}
                    />
                  </>
                )}

                {/* NEXT UP — commissioner CTA when current week finalized (Phase 5.3) */}
                {weeklySummary?.can_create_next && isCommissioner && (
                  <View style={styles.nextUpSection}>
                    <Text style={styles.nextUpLabel}>NEXT UP</Text>
                    <View style={styles.nextUpCard}>
                      <View style={styles.nextUpCardHeader}>
                        <Text style={styles.nextUpIcon}>🏈</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.nextUpTitle}>
                            Week {weeklySummary.next_week_number} Swayger
                          </Text>
                          <Text style={styles.nextUpSub}>
                            Ready to set up your next weekly Swayger.
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.nextUpBtn}
                        onPress={() =>
                          router.push(
                            `/fantasy/weeks/${leagueId}/${seasonId}/${weeklySummary.next_week_number}/setup` as any
                          )
                        }
                        activeOpacity={0.8}
                      >
                        <Text style={styles.nextUpBtnText}>
                          Create Week {weeklySummary.next_week_number}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Past Swaygers — finalized weekly history (compact) */}
                {(weeklySummary?.past_weeks?.filter((w) => w.room_status === "finalized").length ?? 0) > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 16, marginBottom: 8 }]}>
                      PAST SWAYGERS
                    </Text>
                    <View style={styles.pastWeekList}>
                      {weeklySummary!.past_weeks
                        .filter((w) => w.room_status === "finalized")
                        .map((w) => (
                          <PastWeekRow
                            key={w.week_number}
                            label={`Week ${w.week_number}`}
                            onView={() => router.push(`/fantasy/weeks/${leagueId}/${seasonId}/${w.week_number}/results` as any)}
                          />
                        ))}
                    </View>
                  </>
                )}
              </>
            );
          })()}

          {/* ── Season Standings quick-access (once any competition finalized) ── */}
          {(draftDay?.room_status === "finalized" ||
            weeklySummary?.current_week?.room_status === "finalized" ||
            (weeklySummary?.past_weeks?.length ?? 0) > 0) && (
            <TouchableOpacity
              style={styles.inviteBtn}
              onPress={() => router.push(`/fantasy/standings/${leagueId}/${seasonId}` as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.inviteBtnIcon}>📊</Text>
              <View style={styles.inviteBtnText}>
                <Text style={styles.inviteBtnTitle}>Season Standings</Text>
                <Text style={styles.inviteBtnSub}>Cumulative leaderboard across all competitions</Text>
              </View>
              <Text style={styles.inviteBtnArrow}>›</Text>
            </TouchableOpacity>
          )}

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
  welcomeUpgradeTitle: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: C.text,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  welcomeUpgradeHint: {
    fontSize: 13,
    color: C.textMuted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },

  // Guest upgrade banner (non-welcome, dismissible per-session)
  guestBanner: {
    backgroundColor: "#1A1300",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#8B6914",
    padding: 14,
    marginBottom: 20,
    gap: 10,
  },
  guestBannerRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
  },
  guestBannerContent: { flex: 1 },
  guestBannerTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#D4A017",
    marginBottom: 4,
  },
  guestBannerBody: {
    fontSize: 12,
    color: C.textSecondary,
    lineHeight: 17,
  },
  guestBannerDismissIcon: {
    fontSize: 14,
    color: C.textMuted,
    fontWeight: "700" as const,
    paddingLeft: 4,
  },
  guestBannerCTA: {
    backgroundColor: "#8B6914",
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center" as const,
  },
  guestBannerCTAText: {
    color: "#fff",
    fontWeight: "700" as const,
    fontSize: 13,
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

  // Phase 6D: weekly room reward row (inside WeeklyCard)
  weeklyRewardRow: {
    backgroundColor: "#1a2840",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B45309",
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignSelf: "flex-start" as const,
  },
  weeklyRewardText: {
    color: "#FCD34D",
    fontSize: 13,
    fontWeight: "600" as const,
  },

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
  settlementProgress: { fontSize: 13, color: C.tint, fontWeight: "600", textAlign: "center" },

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

  // Past Swaygers compact list (Phase 5.2)
  pastWeekList: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    marginBottom: 12,
  },
  pastWeekRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  pastWeekIcon:  { fontSize: 20 },
  pastWeekTitle: { fontSize: 15, fontWeight: "600", color: C.text },
  pastWeekSub:   { fontSize: 12, color: C.textMuted, marginTop: 1 },
  pastWeekArrow: { fontSize: 13, color: C.tint, fontWeight: "600" },

  // NEXT UP section (Phase 5.3)
  nextUpSection: { marginBottom: 12 },
  nextUpLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "#22c55e",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  nextUpCard: {
    backgroundColor: "#071a0e",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#22c55e",
    padding: 16,
    gap: 12,
  },
  nextUpCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nextUpIcon:  { fontSize: 22 },
  nextUpTitle: { fontSize: 16, fontWeight: "800", color: C.text },
  nextUpSub:   { fontSize: 12, color: C.textMuted, marginTop: 2 },
  nextUpBtn: {
    backgroundColor: "#22c55e",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  nextUpBtnText: { color: "#000", fontWeight: "800", fontSize: 15 },

  // Lock Picks — secondary visual weight (Phase 5.3)
  lockPicksBtn: {
    flex: 1,
    backgroundColor: "transparent",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#5B21B6",
    paddingVertical: 11,
    alignItems: "center",
  },
  lockPicksBtnText: { color: "#a78bfa", fontWeight: "600", fontSize: 14 },

  // Weekly participation list (Phase 5.1)
  weeklyPartToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.background,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  weeklyPartToggleText: { fontSize: 13, color: C.textSecondary, fontWeight: "500" },
  weeklyPartToggleArrow: { fontSize: 11, color: C.textMuted },
  weeklyPartList: {
    backgroundColor: C.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    gap: 2,
  },
  weeklyPartSectionHeader: {
    fontSize: 10,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  weeklyPartItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  weeklyPartItemCheck: { fontSize: 14, color: "#22c55e", fontWeight: "700", width: 16 },
  weeklyPartItemWait:  { fontSize: 14, color: C.textMuted, width: 16 },
  weeklyPartItemName:  { fontSize: 13, color: C.text },

  // Weekly share buttons (Phase 5.1)
  weeklyShareBtn: {
    backgroundColor: "#0E7490",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    alignSelf: "stretch",
  },
  weeklyShareBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  weeklySecondaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  weeklySecondaryBtn: {
    flex: 1,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  weeklySecondaryBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: C.textSecondary,
  },

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
