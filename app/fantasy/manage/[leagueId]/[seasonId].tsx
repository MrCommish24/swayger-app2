/**
 * app/fantasy/manage/[leagueId]/[seasonId].tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Commissioner-only Manage League screen.
 *
 * Features:
 *   • Members & Teams list with [Edit] per row
 *   • Edit member modal — display_name + team_name → one atomic PATCH
 *   • Add Member form — lifecycle-aware:
 *       No Draft Day / pick_count=0 → normal add (member eligible, snapshots updated)
 *       pick_count>0 / locked       → "Add to League Only" with explicit confirmation
 *
 * Auth: commissioner session required. Non-commissioners are redirected back.
 * Guests cannot access this screen (commissioner routes are auth-only).
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  Alert,
  View,
  Text,
  ScrollView,
  Share,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/lib/auth-context";
import {
  fantasyFetch,
  updateMember,
  updateLeagueName,
  archiveLeague,
  buildFantasyInviteUrl,
  createMemberRecoveryToken,
  revokeMemberRecoveryToken,
  type RecoveryTokenCreateResult,
  FantasyParticipant,
  FantasySeasonDetail,
  DraftDayStatus,
  getDraftDay,
} from "@/lib/fantasy-api";
import { FantasyInviteSheet } from "@/components/fantasy/FantasyInviteSheet";
import Colors from "@/constants/colors";

// ── Recovery URL helper ────────────────────────────────────────────────────────

function buildRecoveryUrl(rawToken: string): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/fantasy/recover/${rawToken}`;
  }
  return Linking.createURL(`fantasy/recover/${rawToken}`);
}

// ── Idempotency helpers ────────────────────────────────────────────────────────

/**
 * Generate a UUID v4 for idempotency keys.
 * Uses crypto.randomUUID() when available (React Native ≥0.73 / Expo SDK 50+),
 * falling back to a Math.random-based implementation for older environments.
 */
function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** AsyncStorage key for a pending Add Member idempotency key for this league+season. */
function addMemberIdemStorageKey(leagueId: string, seasonId: string): string {
  return `fantasy_add_member_idem_${leagueId}_${seasonId}`;
}

const C = Colors.dark;

// ── Types ──────────────────────────────────────────────────────────────────────

type DraftDayLifecycle =
  | "none"     // no Draft Day published
  | "open"     // published and open — new members are eligible + appended to answer choices
  | "locked"   // card locked — new members are league-only (not eligible for Draft Day)
  | "settled"; // card settled — new members are league-only

// ── Helpers ────────────────────────────────────────────────────────────────────

function getLifecycle(dd: DraftDayStatus | null | undefined): DraftDayLifecycle {
  if (!dd) return "none";
  if (dd.card_status === "settled") return "settled";
  if (dd.card_status === "locked") return "locked";
  // open regardless of pick_count — roster expansion is allowed while card is open
  return "open";
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ManageLeagueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();
  const { leagueId, seasonId } = useLocalSearchParams<{
    leagueId: string;
    seasonId: string;
  }>();

  // ── Data ─────────────────────────────────────────────────────────────────────
  const [detail, setDetail] = useState<FantasySeasonDetail | null>(null);
  const [draftDay, setDraftDay] = useState<DraftDayStatus | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Edit modal state ─────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<FantasyParticipant | null>(null);
  const [editName, setEditName] = useState("");
  const [editTeam, setEditTeam] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ── League name edit state ───────────────────────────────────────────────────
  const [leagueNameEditing, setLeagueNameEditing] = useState(false);
  const [leagueNameInput,   setLeagueNameInput]   = useState("");
  const [leagueNameSaving,  setLeagueNameSaving]  = useState(false);
  const [leagueNameError,   setLeagueNameError]   = useState<string | null>(null);

  // ── Archive state ─────────────────────────────────────────────────────────────
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [archiveError, setArchiveError]   = useState<string | null>(null);

  // ── Invite Sheet state (Phase 6F) ────────────────────────────────────────────
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);

  // ── Recovery token state ──────────────────────────────────────────────────────
  const [recoveryTarget,  setRecoveryTarget]  = useState<FantasyParticipant | null>(null);
  const [recoveryStep,    setRecoveryStep]    = useState<"confirm" | "result">("confirm");
  const [recoveryResult,  setRecoveryResult]  = useState<RecoveryTokenCreateResult | null>(null);
  const [recoverySaving,  setRecoverySaving]  = useState(false);
  const [recoveryError,   setRecoveryError]   = useState<string | null>(null);
  const [recoveryCopied,  setRecoveryCopied]  = useState(false);

  // ── Add member state ─────────────────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addTeam, setAddTeam] = useState("");
  const [addConfirmLeagueOnly, setAddConfirmLeagueOnly] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  /**
   * Durable idempotency key for the current Add Member operation.
   * Generated once per intentional operation and persisted to AsyncStorage
   * so it survives a network timeout + retry or an app reload.
   * Cleared on confirmed success or intentional cancel.
   */
  const [addIdemKey, setAddIdemKey] = useState<string | null>(null);

  // ── Auth guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!session) router.replace("/auth");
  }, [authLoading, session]);

  // ── Data load ─────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!leagueId || !seasonId || !session) return;
    setLoading(true);
    setError(null);
    try {
      const [det, dd] = await Promise.all([
        fantasyFetch<FantasySeasonDetail>(
          `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}`,
          {},
          { session }
        ),
        getDraftDay(leagueId, seasonId, { session }).catch(() => null),
      ]);
      setDetail(det);
      setDraftDay(dd);

      // Redirect non-commissioners — commissioner auth is server-enforced too
      const role = det.viewer?.role;
      if (role !== "commissioner" && role !== "co_commissioner") {
        router.replace(`/fantasy/${leagueId}/${seasonId}` as any);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load league");
    } finally {
      setLoading(false);
    }
  }, [leagueId, seasonId, session]);

  useEffect(() => {
    if (authLoading) return;
    loadData();
  }, [authLoading, session?.access_token, leagueId, seasonId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ── Edit handlers ─────────────────────────────────────────────────────────────
  const openEdit = (p: FantasyParticipant) => {
    setEditTarget(p);
    setEditName(p.display_name ?? "");
    setEditTeam(p.team_name ?? "");
    setEditError(null);
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditName("");
    setEditTeam("");
    setEditError(null);
  };

  const handleSave = async () => {
    if (!editTarget || !session) return;
    if (!editName.trim()) { setEditError("Display name is required"); return; }
    if (!editTeam.trim()) { setEditError("Team name is required"); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateMember(leagueId, seasonId, editTarget.season_member_id, {
        display_name: editName.trim(),
        team_name:    editTeam.trim(),
      }, { session });
      closeEdit();
      loadData();
    } catch (e: any) {
      setEditError(e.message ?? "Failed to save changes");
    } finally {
      setEditSaving(false);
    }
  };

  // ── League name edit handlers ─────────────────────────────────────────────────
  const openLeagueNameEdit = () => {
    setLeagueNameInput(detail?.league?.league_name ?? "");
    setLeagueNameError(null);
    setLeagueNameEditing(true);
  };

  const cancelLeagueNameEdit = () => {
    setLeagueNameEditing(false);
    setLeagueNameInput("");
    setLeagueNameError(null);
  };

  const handleLeagueNameSave = async () => {
    if (!session) return;
    const trimmed = leagueNameInput.trim();
    if (!trimmed) { setLeagueNameError("League name cannot be blank"); return; }
    setLeagueNameSaving(true);
    setLeagueNameError(null);
    try {
      await updateLeagueName(leagueId, trimmed, { session });
      setLeagueNameEditing(false);
      loadData();
    } catch (e: any) {
      setLeagueNameError(e.message ?? "Failed to update league name");
    } finally {
      setLeagueNameSaving(false);
    }
  };

  // ── Recovery token handlers ───────────────────────────────────────────────────

  const openRecovery = (p: FantasyParticipant) => {
    setRecoveryTarget(p);
    setRecoveryStep("confirm");
    setRecoveryResult(null);
    setRecoveryError(null);
    setRecoveryCopied(false);
  };

  const closeRecovery = () => {
    setRecoveryTarget(null);
    setRecoveryStep("confirm");
    setRecoveryResult(null);
    setRecoveryError(null);
    setRecoveryCopied(false);
  };

  const handleCreateRecoveryToken = async () => {
    if (!session || !recoveryTarget) return;
    if (!recoveryTarget.league_member_id) return;
    setRecoverySaving(true);
    setRecoveryError(null);
    try {
      const result = await createMemberRecoveryToken(
        leagueId,
        seasonId,
        recoveryTarget.league_member_id,
        { session }
      );
      setRecoveryResult(result);
      setRecoveryStep("result");
    } catch (e: any) {
      setRecoveryError(e.message ?? "Failed to create recovery link");
    } finally {
      setRecoverySaving(false);
    }
  };

  const handleCopyRecoveryLink = async () => {
    if (!recoveryResult) return;
    const url = buildRecoveryUrl(recoveryResult.raw_token);
    try {
      await Clipboard.setStringAsync(url);
      setRecoveryCopied(true);
      setTimeout(() => setRecoveryCopied(false), 3000);
    } catch { /* clipboard unavailable */ }
  };

  const handleShareRecoveryLink = async () => {
    if (!recoveryResult) return;
    const url = buildRecoveryUrl(recoveryResult.raw_token);
    const name = recoveryTarget?.display_name ?? "your league member";
    try {
      await Share.share({
        message: `${name}, here's your one-time Swayger Fantasy recovery link:\n\n${url}\n\nThis link expires in 24 hours and can only be used once.`,
        url,
      });
    } catch { /* user cancelled */ }
  };

  // ── Archive handler ───────────────────────────────────────────────────────────
  const handleArchive = () => {
    if (!session || !detail) return;
    const leagueName = detail.league.league_name;
    Alert.alert(
      `Archive ${leagueName}?`,
      "This league will be removed from your active leagues.\n\nYour league history will be preserved.\n\nYou won't be able to create or run new Swaygers until the league is restored.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive League",
          style: "destructive",
          onPress: async () => {
            setArchiveSaving(true);
            setArchiveError(null);
            try {
              await archiveLeague(leagueId, { session });
              router.replace("/(tabs)");
            } catch (e: any) {
              setArchiveError(e.message ?? "Failed to archive league");
              setArchiveSaving(false);
            }
          },
        },
      ]
    );
  };

  // ── Add member handlers ───────────────────────────────────────────────────────
  const lifecycle = getLifecycle(draftDay);
  // Only locked / settled cards prevent Draft Day participation
  const needsLeagueOnlyConfirm = lifecycle === "locked" || lifecycle === "settled";

  /**
   * Opens the Add Member form.  Loads the pending idempotency key from
   * AsyncStorage (surviving a prior network timeout + app reload) or generates
   * a fresh UUID for this new intentional operation.
   */
  const openAdd = async () => {
    const storageKey = addMemberIdemStorageKey(leagueId, seasonId);
    let key = await AsyncStorage.getItem(storageKey).catch(() => null);
    if (!key) {
      key = generateUUID();
      AsyncStorage.setItem(storageKey, key).catch(() => {});
    }
    setAddIdemKey(key);
    setShowAdd(true);
    setAddName("");
    setAddTeam("");
    setAddConfirmLeagueOnly(false);
    setAddError(null);
    setAddSuccess(null);
  };

  /**
   * Closes the Add Member form after an intentional cancel.
   * Discards the pending idempotency key so the next openAdd generates a fresh one.
   */
  const closeAdd = () => {
    // Intentional cancel — discard the pending idempotency key.
    AsyncStorage.removeItem(addMemberIdemStorageKey(leagueId, seasonId)).catch(() => {});
    setAddIdemKey(null);
    setShowAdd(false);
    setAddName("");
    setAddTeam("");
    setAddConfirmLeagueOnly(false);
    setAddError(null);
    setAddSuccess(null);
  };

  const handleAdd = async () => {
    if (!session) return;
    if (!addName.trim()) { setAddError("Display name is required"); return; }
    if (!addTeam.trim()) { setAddError("Team name is required"); return; }
    if (needsLeagueOnlyConfirm && !addConfirmLeagueOnly) {
      setAddConfirmLeagueOnly(true);
      return;
    }

    // Defensive: ensure we always have a key even if openAdd's AsyncStorage read
    // was slow and the user somehow reached handleAdd without one.
    let idemKey = addIdemKey;
    if (!idemKey) {
      idemKey = generateUUID();
      setAddIdemKey(idemKey);
      AsyncStorage.setItem(addMemberIdemStorageKey(leagueId, seasonId), idemKey).catch(() => {});
    }

    setAddSaving(true);
    setAddError(null);
    try {
      const result = await fantasyFetch<{
        already_exists: boolean;
        draft_day_eligible: boolean;
        display_name?: string;
      }>(
        `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/participants`,
        {
          method: "POST",
          headers: {
            // Sent on every attempt; the server replays the original result on retry.
            "Idempotency-Key": idemKey,
          },
          body: JSON.stringify({ display_name: addName.trim(), team_name: addTeam.trim() }),
        },
        { session }
      );

      // Success — clear the pending key so the next Add Member gets a fresh one.
      AsyncStorage.removeItem(addMemberIdemStorageKey(leagueId, seasonId)).catch(() => {});
      setAddIdemKey(null);

      if (result.already_exists) {
        setAddSuccess(`${addName.trim()} is already in this league.`);
      } else if (!result.draft_day_eligible) {
        setAddSuccess(
          `${addName.trim()} has been added to the league. They will participate in future competitions — not the current Draft Day.`
        );
      } else {
        setAddSuccess(`${addName.trim()} has been added!`);
      }

      loadData();
    } catch (e: any) {
      // Do NOT clear the idempotency key on network failure — the same key will be
      // sent on the user's next retry, allowing the server to return the original
      // result if the transaction already committed.
      setAddError(e.message ?? "Failed to add member");
    } finally {
      setAddSaving(false);
      setAddConfirmLeagueOnly(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.btn} onPress={loadData}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!detail) return null;

  const { league, participants } = detail;
  const commissioner = participants.find((p) => p.role === "commissioner");
  const others = participants.filter((p) => p.role !== "commissioner");
  const ordered = commissioner ? [commissioner, ...others] : participants;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.linkText}>← League Hub</Text>
      </TouchableOpacity>

      <Text style={styles.title}>⚙ Manage League</Text>

      {/* ── League Details ───────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>LEAGUE DETAILS</Text>
      <View style={styles.membersCard}>
        <View style={[styles.memberRow]}>
          <View style={styles.memberLeft}>
            <Text style={styles.fieldLabel}>LEAGUE NAME</Text>
            {leagueNameEditing ? (
              <>
                <TextInput
                  style={[styles.input, { marginTop: 4 }]}
                  value={leagueNameInput}
                  onChangeText={setLeagueNameInput}
                  autoFocus
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={100}
                  placeholderTextColor={C.textMuted}
                />
                {leagueNameError && (
                  <Text style={[styles.fieldError, { marginTop: 4 }]}>{leagueNameError}</Text>
                )}
                <View style={[styles.addFormBtns, { marginTop: 10 }]}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnSecondary]}
                    onPress={cancelLeagueNameEdit}
                    disabled={leagueNameSaving}
                  >
                    <Text style={[styles.btnText, { color: C.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, leagueNameSaving && styles.btnDisabled]}
                    onPress={handleLeagueNameSave}
                    disabled={leagueNameSaving}
                  >
                    {leagueNameSaving
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.btnText}>Save</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <Text style={styles.memberName}>{league.league_name}</Text>
            )}
          </View>
          {!leagueNameEditing && (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={openLeagueNameEdit}
              activeOpacity={0.7}
            >
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Draft Day lifecycle notice ────────────────────────────────────── */}
      {lifecycle === "locked" && (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeText}>
            🔒 Draft Day is locked.
            New members can be added to the league but will NOT participate in the current Draft Day.
          </Text>
        </View>
      )}

      {/* ── Members & Teams ──────────────────────────────────────────────── */}
      <Text style={[styles.sectionLabel, { marginTop: 24 }]}>MEMBERS & TEAMS · {ordered.length}</Text>

      <View style={styles.membersCard}>
        {ordered.map((p, i) => (
          <View
            key={p.season_member_id}
            style={[styles.memberRow, i > 0 && styles.memberRowBorder]}
          >
            <View style={styles.memberLeft}>
              <Text style={styles.memberName}>
                {p.display_name ?? "—"}
                {(p.role === "commissioner" || p.role === "co_commissioner") && (
                  <Text style={styles.commBadge}>
                    {p.role === "co_commissioner" ? "  Co-Comm" : "  Comm"}
                  </Text>
                )}
              </Text>
              {p.team_name ? (
                <Text style={styles.memberTeam}>{p.team_name}</Text>
              ) : (
                <Text style={styles.memberTeamEmpty}>No team</Text>
              )}
              {/* Commissioner-only: claim type indicator (Phase 5.2.1) */}
              {p.claim_type === "guest" && (
                <Text style={styles.guestClaimBadge}>
                  Claimed as Guest · device-only access
                </Text>
              )}
              {p.claim_type === "account" && (
                <Text style={styles.accountClaimBadge}>
                  Claimed with account
                </Text>
              )}
              {p.is_claimed === false && (
                <Text style={styles.unclaimedBadge}>Not yet claimed</Text>
              )}
              {/* Recovery link — only for guest-claimed members (Phase 5.2.3) */}
              {p.claim_type === "guest" && (
                <TouchableOpacity
                  style={styles.recoverBtn}
                  onPress={() => openRecovery(p)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.recoverBtnText}>Help Recover Access</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => openEdit(p)}
              activeOpacity={0.7}
            >
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* ── Add Member / Paste Roster ────────────────────────────────────── */}
      {!showAdd ? (
        <View style={styles.addActions}>
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.8}>
            <Text style={styles.addBtnText}>+ Add Member</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pasteBtn}
            onPress={() =>
              router.push(
                `/fantasy/bulk-import/${leagueId}/${seasonId}?leagueName=${encodeURIComponent(detail?.league.league_name ?? "Your League")}` as any
              )
            }
            activeOpacity={0.8}
          >
            <Text style={styles.pasteBtnText}>📋 Paste League Roster</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.inviteActionBtn}
            onPress={() => setInviteSheetVisible(true)}
            activeOpacity={0.8}
            accessibilityLabel="Invite Your League"
          >
            <Text style={styles.inviteActionBtnText}>🔗 Invite Your League</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.addCard}>
          <Text style={styles.addTitle}>Add Member</Text>

          {addSuccess ? (
            <>
              <Text style={styles.successText}>{addSuccess}</Text>
              <TouchableOpacity style={styles.btn} onPress={closeAdd}>
                <Text style={styles.btnText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : addConfirmLeagueOnly ? (
            /* Explicit "Add to League Only" confirmation step */
            <>
              <View style={styles.confirmCard}>
                <Text style={styles.confirmTitle}>Add to League Only?</Text>
                <Text style={styles.confirmBody}>
                  Draft Day has already started. {addName.trim()} will be added to the league,
                  but they won't participate in the current Draft Day.
                  Existing picks are unaffected. They will participate normally in future competitions.
                </Text>
              </View>
              {addError && <Text style={styles.fieldError}>{addError}</Text>}
              <View style={styles.confirmBtns}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnSecondary]}
                  onPress={() => setAddConfirmLeagueOnly(false)}
                  disabled={addSaving}
                >
                  <Text style={[styles.btnText, { color: C.textSecondary }]}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, addSaving && styles.btnDisabled]}
                  onPress={handleAdd}
                  disabled={addSaving}
                >
                  {addSaving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.btnText}>Add to League Only</Text>}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            /* Normal add form */
            <>
              <Text style={styles.fieldLabel}>Display Name</Text>
              <TextInput
                style={styles.input}
                value={addName}
                onChangeText={setAddName}
                placeholder="e.g. Marcus"
                placeholderTextColor={C.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
              />
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Fantasy Team Name</Text>
              <TextInput
                style={styles.input}
                value={addTeam}
                onChangeText={setAddTeam}
                placeholder="e.g. The Monstars"
                placeholderTextColor={C.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
              />
              {addError && <Text style={styles.fieldError}>{addError}</Text>}
              {needsLeagueOnlyConfirm && (
                <Text style={styles.leagueOnlyHint}>
                  Draft Day is locked. This member will be added to the league only — they will participate in future competitions.
                </Text>
              )}
              <View style={styles.addFormBtns}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnSecondary]}
                  onPress={closeAdd}
                  disabled={addSaving}
                >
                  <Text style={[styles.btnText, { color: C.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, addSaving && styles.btnDisabled]}
                  onPress={handleAdd}
                  disabled={addSaving}
                >
                  {addSaving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.btnText}>
                        {needsLeagueOnlyConfirm ? "Add to League Only" : "Add Member"}
                      </Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

      {/* ── League Management (Archive) — primary commissioner only ────── */}
      {detail.viewer?.role === "commissioner" && (
        <View style={{ marginTop: 32, marginBottom: 8 }}>
          <Text style={styles.sectionLabel}>LEAGUE MANAGEMENT</Text>
          <View style={styles.archiveCard}>
            <Text style={styles.archiveCardTitle}>Archive League</Text>
            <Text style={styles.archiveCardBody}>
              Archive this league when you're finished with it.{"\n\n"}
              Your teams, picks, results, standings, rewards, and receipts will be preserved.
            </Text>
            {archiveError && (
              <Text style={styles.archiveErrorText}>{archiveError}</Text>
            )}
            <TouchableOpacity
              style={[styles.archiveBtn, archiveSaving && styles.btnDisabled]}
              onPress={handleArchive}
              disabled={archiveSaving}
            >
              {archiveSaving
                ? <ActivityIndicator color="#ef4444" size="small" />
                : <Text style={styles.archiveBtnText}>Archive League</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Invite Sheet (Phase 6F) ──────────────────────────────────────── */}
      {detail && (
        <FantasyInviteSheet
          visible={inviteSheetVisible}
          onClose={() => setInviteSheetVisible(false)}
          leagueName={`${detail.league.league_name} ${detail.season.season_year}`}
          inviteUrl={buildFantasyInviteUrl(leagueId, seasonId)}
        />
      )}

      {/* ── Recovery modal (Phase 5.2.3) ─────────────────────────────────── */}
      <Modal
        visible={recoveryTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={closeRecovery}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHandle} />

            {recoveryStep === "confirm" ? (
              <>
                <Text style={styles.modalTitle}>Help Recover Access</Text>
                <Text style={styles.modalSubtitle}>
                  This creates a one-time link that lets{" "}
                  <Text style={{ fontWeight: "700", color: C.text }}>
                    {recoveryTarget?.display_name ?? "this member"}
                  </Text>{" "}
                  sign in to Swayger and restore their Fantasy seat.
                  Their team, picks, and standings stay intact.
                </Text>

                <View style={styles.recoverWarningCard}>
                  <Text style={styles.recoverWarningText}>
                    ⚠️  Send this link directly to {recoveryTarget?.display_name ?? "the member"}.
                    Do not share it publicly — anyone with the link can claim this seat.
                  </Text>
                </View>

                <View style={styles.recoverInfoRow}>
                  <Text style={styles.recoverInfoItem}>Valid for 24 hours</Text>
                  <Text style={styles.recoverInfoDot}>·</Text>
                  <Text style={styles.recoverInfoItem}>Single use</Text>
                  <Text style={styles.recoverInfoDot}>·</Text>
                  <Text style={styles.recoverInfoItem}>Revocable</Text>
                </View>

                {recoveryError && (
                  <Text style={styles.fieldError}>{recoveryError}</Text>
                )}

                <TouchableOpacity
                  style={[styles.btn, { marginTop: 20 }, recoverySaving && styles.btnDisabled]}
                  onPress={handleCreateRecoveryToken}
                  disabled={recoverySaving}
                >
                  {recoverySaving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.btnText}>Create Recovery Link</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btn, styles.btnSecondary, { marginTop: 10 }]}
                  onPress={closeRecovery}
                  disabled={recoverySaving}
                >
                  <Text style={[styles.btnText, { color: C.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* Step 2 — result */
              <>
                <Text style={styles.modalTitle}>Link Ready 🔗</Text>
                <Text style={styles.modalSubtitle}>
                  Send this directly to{" "}
                  <Text style={{ fontWeight: "700", color: C.text }}>
                    {recoveryTarget?.display_name ?? "the member"}
                  </Text>
                  . It expires in 24 hours and can only be used once.
                </Text>

                {/* URL display */}
                <View style={styles.urlBox}>
                  <Text style={styles.urlText} selectable numberOfLines={2}>
                    {recoveryResult
                      ? buildRecoveryUrl(recoveryResult.raw_token)
                      : "—"}
                  </Text>
                </View>

                <View style={styles.recoverWarningCard}>
                  <Text style={styles.recoverWarningText}>
                    🔒  Do not post in the group chat. Send directly to{" "}
                    {recoveryTarget?.display_name ?? "the member"} only.
                  </Text>
                </View>

                <View style={styles.addFormBtns}>
                  <TouchableOpacity
                    style={[styles.btn, { flex: 1 }]}
                    onPress={handleCopyRecoveryLink}
                  >
                    <Text style={styles.btnText}>
                      {recoveryCopied ? "✓ Copied!" : "Copy Link"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnSecondary, { flex: 1 }]}
                    onPress={handleShareRecoveryLink}
                  >
                    <Text style={[styles.btnText, { color: C.textSecondary }]}>Share</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.btn, styles.btnSecondary, { marginTop: 10 }]}
                  onPress={closeRecovery}
                >
                  <Text style={[styles.btnText, { color: C.textSecondary }]}>Done</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Edit modal ───────────────────────────────────────────────────── */}
      <Modal
        visible={editTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={closeEdit}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHandle} />

            <Text style={styles.modalTitle}>Edit Member</Text>
            <Text style={styles.modalSubtitle}>
              Changes are applied immediately. Labels in active Draft Day picks are updated automatically.
            </Text>

            <Text style={styles.fieldLabel}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="Display name"
              placeholderTextColor={C.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Fantasy Team Name</Text>
            <TextInput
              style={styles.input}
              value={editTeam}
              onChangeText={setEditTeam}
              placeholder="Team name"
              placeholderTextColor={C.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
            />

            {editError && <Text style={styles.fieldError}>{editError}</Text>}

            <TouchableOpacity
              style={[styles.btn, { marginTop: 20 }, editSaving && styles.btnDisabled]}
              onPress={handleSave}
              disabled={editSaving}
            >
              {editSaving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.btnText}>Save Changes</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary, { marginTop: 10 }]}
              onPress={closeEdit}
              disabled={editSaving}
            >
              <Text style={[styles.btnText, { color: C.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 20 },
  center: {
    flex: 1, backgroundColor: C.background,
    alignItems: "center", justifyContent: "center",
    padding: 32, gap: 12,
  },

  backBtn: { marginBottom: 16 },
  linkText: { color: C.tint, fontSize: 14, fontWeight: "600" },

  title: { fontSize: 24, fontWeight: "800", color: C.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: C.textMuted, marginBottom: 24 },

  errorText: { color: "#ef4444", fontSize: 15, textAlign: "center" },

  noticeCard: {
    backgroundColor: "#1A1200",
    borderWidth: 1, borderColor: C.accentGold,
    borderRadius: 10, padding: 14, marginBottom: 20,
  },
  noticeText: { color: C.accentGold, fontSize: 13, lineHeight: 20 },

  sectionLabel: {
    fontSize: 11, fontWeight: "700",
    color: C.textMuted, letterSpacing: 0.8,
    marginBottom: 10,
  },

  membersCard: {
    backgroundColor: C.surface,
    borderRadius: 14, borderWidth: 1, borderColor: C.border,
    overflow: "hidden", marginBottom: 20,
  },
  memberRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
  },
  memberRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  memberLeft: { flex: 1, marginRight: 12 },
  memberName: { fontSize: 15, fontWeight: "600", color: C.text },
  commBadge: { fontSize: 12, fontWeight: "400", color: C.tint },
  memberTeam: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  memberTeamEmpty: { fontSize: 13, color: C.textMuted, marginTop: 2, fontStyle: "italic" },
  // Claim type badges (Phase 5.2.1 — commissioner-only visibility)
  guestClaimBadge: {
    fontSize: 11, fontWeight: "600" as const, color: "#B8860B", marginTop: 3,
  },
  accountClaimBadge: {
    fontSize: 11, fontWeight: "600" as const, color: C.tint, marginTop: 3,
  },
  unclaimedBadge: {
    fontSize: 11, fontWeight: "600" as const, color: C.textMuted, marginTop: 3,
  },

  editBtn: {
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7,
  },
  editBtnText: { fontSize: 13, fontWeight: "600", color: C.tint },

  addActions: { gap: 10, marginBottom: 24 },

  addBtn: {
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.tint,
    borderStyle: "dashed",
    borderRadius: 12, padding: 16,
    alignItems: "center",
  },
  addBtnText: { color: C.tint, fontSize: 15, fontWeight: "700" },

  pasteBtn: {
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 12, padding: 14,
    alignItems: "center",
  },
  pasteBtnText: { color: C.textSecondary, fontSize: 14, fontWeight: "600" },

  addCard: {
    backgroundColor: C.surface,
    borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 18, marginBottom: 24,
  },
  addTitle: { fontSize: 17, fontWeight: "700", color: C.text, marginBottom: 16 },

  successText: {
    color: "#22c55e", fontSize: 14, lineHeight: 20,
    marginBottom: 16,
  },

  confirmCard: {
    backgroundColor: "#1A1200",
    borderWidth: 1, borderColor: C.accentGold,
    borderRadius: 10, padding: 14, marginBottom: 16,
  },
  confirmTitle: { fontSize: 15, fontWeight: "700", color: C.accentGold, marginBottom: 6 },
  confirmBody: { fontSize: 13, color: C.text, lineHeight: 20 },
  confirmBtns: { flexDirection: "row", gap: 10 },

  fieldLabel: { fontSize: 12, fontWeight: "700", color: C.textMuted, letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: "#111",
    borderWidth: 1, borderColor: C.border,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: C.text,
  },
  fieldError: { color: "#ef4444", fontSize: 13, marginTop: 8 },

  leagueOnlyHint: {
    fontSize: 12, color: C.accentGold, lineHeight: 18, marginTop: 10,
  },

  addFormBtns: { flexDirection: "row", gap: 10, marginTop: 16 },

  btn: {
    flex: 1,
    backgroundColor: C.tint,
    borderRadius: 10, paddingVertical: 13,
    alignItems: "center",
  },
  btnSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: C.border },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Recovery (Phase 5.2.3)
  recoverBtn: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#B8860B",
    backgroundColor: "#1A1200",
  },
  recoverBtnText: {
    fontSize: 11, fontWeight: "700" as const, color: "#B8860B",
  },
  recoverWarningCard: {
    backgroundColor: "#1a120a",
    borderWidth: 1, borderColor: "#B8860B",
    borderRadius: 10, padding: 12,
    marginTop: 14, marginBottom: 8,
  },
  recoverWarningText: { color: "#B8860B", fontSize: 12, lineHeight: 18 },
  recoverInfoRow: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4,
  },
  recoverInfoItem: { color: C.textMuted, fontSize: 12 },
  recoverInfoDot: { color: C.border, fontSize: 12 },
  urlBox: {
    backgroundColor: "#0d0d0d",
    borderRadius: 8, borderWidth: 1, borderColor: C.border,
    padding: 12, width: "100%", marginBottom: 8,
  },
  urlText: {
    color: C.tint, fontSize: 12, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },

  // Invite action button (Phase 6F)
  inviteActionBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.tint,
    paddingVertical: 11,
    alignItems: "center" as const,
    backgroundColor: "transparent",
    marginTop: 4,
  },
  inviteActionBtnText: {
    color: C.tint,
    fontSize: 14,
    fontWeight: "600" as const,
  },

  // Archive section
  archiveCard: {
    backgroundColor: C.surface,
    borderRadius: 14, borderWidth: 1, borderColor: "#3f1010",
    padding: 18, gap: 10,
  },
  archiveCardTitle: {
    fontSize: 15, fontWeight: "700" as const, color: "#ef4444",
  },
  archiveCardBody: {
    fontSize: 13, color: C.textSecondary, lineHeight: 20,
  },
  archiveErrorText: {
    color: "#ef4444", fontSize: 13, marginTop: 4,
  },
  archiveBtn: {
    marginTop: 6,
    borderRadius: 10, borderWidth: 1, borderColor: "#ef4444",
    paddingVertical: 11, alignItems: "center" as const,
    backgroundColor: "transparent",
  },
  archiveBtnText: {
    color: "#ef4444", fontSize: 14, fontWeight: "700" as const,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: "center", marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: C.text, marginBottom: 6 },
  modalSubtitle: { fontSize: 13, color: C.textMuted, lineHeight: 18, marginBottom: 20 },
});
