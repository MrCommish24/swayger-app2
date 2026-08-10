/**
 * app/fantasy/setup.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Commissioner setup wizard — Create Fantasy League
 *
 * Steps:
 *   0  League name + sport + commissioner display name
 *   1  Season year + optional weekly reward
 *   2  Members & Teams (table: name → team name)
 *   3  Submitting (progress screen)
 *   4  Complete (summary)
 *
 * On completion, calls:
 *   POST /api/fantasy/leagues/setup        (setup_fantasy_league RPC — atomic)
 *   POST …/seasons/:sid/participants × N   (add_fantasy_season_participant RPC — atomic each)
 *
 * The wizard accumulates all data client-side before any server call.
 * All submission happens atomically per-record server-side.
 * Duplicate-safe: RPCs return already_exists=true on retry.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import {
  fantasyFetch,
  SetupLeagueResponse,
  FantasySport,
  FANTASY_SPORTS,
} from "@/lib/fantasy-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParticipantRow {
  /** Local React key — never sent to server. */
  id: string;
  displayName: string;
  teamName: string;
  /** True only for the commissioner's pre-populated row. */
  isCommissioner?: boolean;
}

type Step = 0 | 1 | 2 | 3 | 4;

// ── Component ─────────────────────────────────────────────────────────────────

export default function FantasySetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();

  // ── Wizard step ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Step 0 — League ─────────────────────────────────────────────────────────
  const [leagueName, setLeagueName] = useState("");
  const [sport, setSport] = useState<FantasySport>("football");
  const [displayName, setDisplayName] = useState("");

  // ── Step 1 — Season ─────────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const [seasonYear, setSeasonYear] = useState(String(currentYear));
  const [rewardDescription, setRewardDescription] = useState("");
  const [rewardAmount, setRewardAmount] = useState("");

  // ── Step 2 — Members & Teams ────────────────────────────────────────────────
  const [participants, setParticipants] = useState<ParticipantRow[]>([
    { id: "commissioner", displayName: "", teamName: "", isCommissioner: true },
  ]);

  // ── Result ──────────────────────────────────────────────────────────────────
  const [setupResult, setSetupResult] = useState<SetupLeagueResponse | null>(null);

  // ── Derived validity ─────────────────────────────────────────────────────────
  const step0Valid = leagueName.trim().length > 0 && displayName.trim().length > 0;

  const parsedYear = Number(seasonYear);
  const step1Valid =
    seasonYear.trim().length > 0 &&
    !isNaN(parsedYear) &&
    Number.isInteger(parsedYear) &&
    parsedYear >= 1900 &&
    parsedYear <= 2100;

  const step2Valid =
    participants.length >= 2 &&
    participants.every((p) => p.displayName.trim().length > 0 && p.teamName.trim().length > 0);

  // ── Participant helpers ──────────────────────────────────────────────────────
  function updateParticipant(
    id: string,
    field: "displayName" | "teamName",
    value: string
  ) {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  }

  function addParticipant() {
    setParticipants((prev) => [
      ...prev,
      { id: String(Date.now()), displayName: "", teamName: "" },
    ]);
  }

  function removeParticipant(id: string) {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  }

  // ── Navigation ───────────────────────────────────────────────────────────────
  function goBack() {
    setError(null);
    if (step > 0 && step < 3) setStep((step - 1) as Step);
  }

  function goNext() {
    setError(null);
    if (step === 0) {
      // Pre-fill commissioner row with their display name (read-only in step 2)
      setParticipants((prev) =>
        prev.map((p) =>
          p.isCommissioner ? { ...p, displayName: displayName.trim() } : p
        )
      );
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      handleSubmit();
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!session) {
      setError("You must be signed in to create a Fantasy league.");
      return;
    }
    setError(null);
    setSubmitting(true);
    setStep(3);

    try {
      // 1. Create league + first season (atomic RPC).
      // On retry after a participant failure, setupResult is already set —
      // skip this call to prevent a duplicate league from being created.
      let setup = setupResult;
      if (!setup) {
        setup = await fantasyFetch<SetupLeagueResponse>(
          "/api/fantasy/leagues/setup",
          {
            method: "POST",
            body: JSON.stringify({
              league_name:           leagueName.trim(),
              sport,
              display_name:          displayName.trim(),
              season_year:           parsedYear,
              reward_description:    rewardDescription.trim() || undefined,
              reward_amount_display: rewardAmount.trim() || undefined,
            }),
          },
          { session }
        );
        setSetupResult(setup);
      }

      // 2. Add participants — commissioner first, then others
      const ordered = [
        ...participants.filter((p) => p.isCommissioner),
        ...participants.filter((p) => !p.isCommissioner),
      ];

      for (const p of ordered) {
        await fantasyFetch(
          `/api/fantasy/leagues/${setup.league_id}/seasons/${setup.season_id}/participants`,
          {
            method: "POST",
            body: JSON.stringify({
              display_name:      p.displayName.trim(),
              team_name:         p.teamName.trim(),
              // Commissioner: pass existing league_member_id so the RPC
              // skips creating a duplicate league_member row.
              ...(p.isCommissioner
                ? { league_member_id: setup.league_member_id }
                : {}),
            }),
          },
          { session }
        );
      }

      setStep(4);
    } catch (e: any) {
      setError(e.message ?? "Setup failed. Please try again.");
      // Return to members step so the commissioner can correct and retry.
      // The RPC is idempotent — already-created rows return already_exists=true.
      setStep(2);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Auth guard ───────────────────────────────────────────────────────────────
  // Show spinner while Supabase resolves the initial session to prevent
  // the "Sign in" screen from flashing briefly for authenticated users.
  if (authLoading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Sign in to create a Fantasy league.</Text>
        <TouchableOpacity style={[styles.btn, { marginTop: 20 }]} onPress={() => router.replace("/auth")}>
          <Text style={styles.btnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Header (steps 0–2) ───────────────────────────────────────── */}
        {step < 3 && (
          <>
            {step > 0 && (
              <TouchableOpacity style={styles.backBtn} onPress={goBack}>
                <Text style={styles.backText}>← Back</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.screenTitle}>Create Fantasy League</Text>
            <View style={styles.stepDots}>
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  style={[styles.stepDot, i <= step && styles.stepDotActive]}
                />
              ))}
            </View>
          </>
        )}

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {error !== null && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP 0 — League name + sport
        ════════════════════════════════════════════════════════════════ */}
        {step === 0 && (
          <View>
            <Text style={styles.stepTitle}>League Setup</Text>
            <Text style={styles.stepSubtitle}>
              Name your league, pick a sport, and enter your name as it will appear to other members.
            </Text>

            <Text style={styles.fieldLabel}>LEAGUE NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Food Pyramid Football"
              placeholderTextColor={C.textMuted}
              value={leagueName}
              onChangeText={setLeagueName}
              maxLength={100}
            />

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>YOUR NAME IN THIS LEAGUE</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Darius"
              placeholderTextColor={C.textMuted}
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={100}
            />
            <Text style={styles.fieldHint}>
              How you appear to other league members.
            </Text>

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>SPORT</Text>
            <View style={styles.sportRow}>
              {FANTASY_SPORTS.map((s) => (
                <TouchableOpacity
                  key={s.value}
                  style={[styles.sportBtn, sport === s.value && styles.sportBtnActive]}
                  onPress={() => setSport(s.value)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.sportBtnText,
                      sport === s.value && styles.sportBtnTextActive,
                    ]}
                  >
                    {s.emoji} {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.btn, { marginTop: 32 }, !step0Valid && styles.btnDisabled]}
              onPress={goNext}
              disabled={!step0Valid}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>Next: Season →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP 1 — Season year + reward
        ════════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>Season</Text>
            <Text style={styles.stepSubtitle}>
              Set up the first season for{" "}
              <Text style={{ color: C.text, fontWeight: "600" }}>{leagueName}</Text>.
            </Text>

            <Text style={styles.fieldLabel}>SEASON YEAR</Text>
            <TextInput
              style={styles.input}
              placeholder={String(currentYear)}
              placeholderTextColor={C.textMuted}
              value={seasonYear}
              onChangeText={setSeasonYear}
              keyboardType="number-pad"
              maxLength={4}
            />
            <Text style={styles.fieldHint}>
              The calendar year the season begins. {currentYear} NFL → {currentYear}.{" "}
              {currentYear}–{currentYear + 1} NBA → {currentYear}.
            </Text>

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>
              WEEKLY REWARD{" "}
              <Text style={{ color: C.textMuted, fontWeight: "400" }}>(optional)</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Dinner for the group"
              placeholderTextColor={C.textMuted}
              value={rewardDescription}
              onChangeText={setRewardDescription}
              maxLength={200}
            />
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="e.g. $50 per week"
              placeholderTextColor={C.textMuted}
              value={rewardAmount}
              onChangeText={setRewardAmount}
              maxLength={50}
            />

            <TouchableOpacity
              style={[styles.btn, { marginTop: 32 }, !step1Valid && styles.btnDisabled]}
              onPress={goNext}
              disabled={!step1Valid}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>Next: Members & Teams →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP 2 — Members & Teams table
        ════════════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <View>
            <Text style={styles.stepTitle}>Members & Teams</Text>
            <Text style={styles.stepSubtitle}>
              Enter each manager's name and their team. Your row is first.
            </Text>

            {/* Table header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableLabel, styles.colName]}>Name</Text>
              <Text style={[styles.tableLabel, styles.colTeam]}>Team Name</Text>
              <View style={styles.colRemove} />
            </View>

            {/* Participant rows */}
            {participants.map((p) => (
              <View key={p.id} style={styles.tableRow}>
                <TextInput
                  style={[
                    styles.tableInput,
                    styles.colName,
                    p.isCommissioner && styles.tableInputCommissioner,
                  ]}
                  placeholder="Name"
                  placeholderTextColor={C.textMuted}
                  value={p.displayName}
                  onChangeText={(v) => updateParticipant(p.id, "displayName", v)}
                  maxLength={100}
                  // Commissioner name is locked — it comes from step 0
                  editable={!p.isCommissioner}
                />
                <TextInput
                  style={[styles.tableInput, styles.colTeam]}
                  placeholder="Team name"
                  placeholderTextColor={C.textMuted}
                  value={p.teamName}
                  onChangeText={(v) => updateParticipant(p.id, "teamName", v)}
                  maxLength={100}
                />
                <View style={styles.colRemove}>
                  {!p.isCommissioner && (
                    <TouchableOpacity
                      onPress={() => removeParticipant(p.id)}
                      style={styles.removeBtn}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            {/* Add member */}
            <TouchableOpacity
              style={styles.addRowBtn}
              onPress={addParticipant}
              activeOpacity={0.75}
            >
              <Text style={styles.addRowBtnText}>+ Add member</Text>
            </TouchableOpacity>

            {participants.length < 2 && (
              <Text style={[styles.fieldHint, { textAlign: "center", marginBottom: 8 }]}>
                Add at least one other member.
              </Text>
            )}

            <TouchableOpacity
              style={[styles.btn, { marginTop: 8 }, !step2Valid && styles.btnDisabled]}
              onPress={goNext}
              disabled={!step2Valid}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>Review Setup →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP 3 — Submitting
        ════════════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <View style={[styles.centerBlock, { marginTop: 60 }]}>
            <ActivityIndicator color={C.tint} size="large" />
            <Text style={[styles.stepTitle, { marginTop: 20, textAlign: "center" }]}>
              Creating your league…
            </Text>
            <Text style={[styles.stepSubtitle, { textAlign: "center" }]}>
              Setting up {participants.length} member
              {participants.length !== 1 ? "s" : ""}.
            </Text>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP 4 — Complete
        ════════════════════════════════════════════════════════════════ */}
        {step === 4 && setupResult && (
          <View style={styles.centerBlock}>
            <Text style={styles.trophyEmoji}>🏆</Text>
            <Text style={styles.screenTitle}>{leagueName}</Text>
            <Text style={styles.stepSubtitle}>
              {FANTASY_SPORTS.find((s) => s.value === sport)?.emoji}{" "}
              {sport.charAt(0).toUpperCase() + sport.slice(1)} · {parsedYear} Season
            </Text>

            {/* Participant summary */}
            <View style={styles.summaryCard}>
              {participants.map((p, i) => (
                <View
                  key={p.id}
                  style={[styles.summaryRow, i > 0 && styles.summaryRowBorder]}
                >
                  <View style={styles.summaryLeft}>
                    <Text style={styles.summaryName}>{p.displayName}</Text>
                    {p.isCommissioner && (
                      <Text style={styles.commissionerBadge}>Commissioner</Text>
                    )}
                  </View>
                  <Text style={styles.summaryTeam}>{p.teamName}</Text>
                </View>
              ))}
            </View>

            {/* Reward (if set) */}
            {rewardDescription.trim() !== "" && (
              <View style={styles.rewardCard}>
                <Text style={styles.rewardLabel}>WEEKLY REWARD</Text>
                <Text style={styles.rewardText}>
                  {rewardAmount.trim() ? `${rewardAmount.trim()} — ` : ""}
                  {rewardDescription.trim()}
                </Text>
              </View>
            )}

            <Text style={[styles.fieldHint, { textAlign: "center", marginTop: 20 }]}>
              Draft Day and competition setup coming next.
            </Text>

            <TouchableOpacity
              style={[styles.btn, { marginTop: 24 }]}
              onPress={() =>
                router.replace(
                  `/fantasy/${setupResult!.league_id}/${setupResult!.season_id}` as never
                )
              }
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>Open My League →</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 20 },

  center: { alignItems: "center", justifyContent: "center" },
  centerBlock: { alignItems: "center" },

  // Header
  backBtn: { marginBottom: 16 },
  backText: { color: C.tint, fontSize: 16 },
  screenTitle: { fontSize: 24, fontWeight: "700", color: C.text, marginBottom: 8 },
  stepDots: { flexDirection: "row", gap: 6, marginBottom: 28 },
  stepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
  stepDotActive: { backgroundColor: C.tint },

  // Step copy
  stepTitle: { fontSize: 20, fontWeight: "700", color: C.text, marginBottom: 4 },
  stepSubtitle: { fontSize: 14, color: C.textSecondary, marginBottom: 24, lineHeight: 20 },

  // Error
  errorBox: {
    backgroundColor: "#2D1515",
    borderColor: C.danger,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: C.danger, fontSize: 14 },

  // Fields
  fieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: C.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  fieldHint: { fontSize: 12, color: C.textMuted, marginTop: 6, lineHeight: 17 },
  input: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 16,
  },

  // Sport selector
  sportRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  sportBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  sportBtnActive: { backgroundColor: C.tint, borderColor: C.tint },
  sportBtnText: { color: C.textSecondary, fontSize: 14, fontWeight: "600" },
  sportBtnTextActive: { color: "#fff" },

  // Members table
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  tableLabel: { fontSize: 11, fontWeight: "600", color: C.textMuted, letterSpacing: 0.5 },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  tableInput: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.text,
    fontSize: 15,
  },
  tableInputCommissioner: { borderColor: C.tint, color: C.text },
  colName:   { flex: 2 },
  colTeam:   { flex: 3 },
  colRemove: { width: 28, alignItems: "center" },

  addRowBtn: {
    paddingVertical: 13,
    alignItems: "center",
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 20,
    marginTop: 4,
  },
  addRowBtnText: { color: C.tint, fontSize: 15, fontWeight: "600" },
  removeBtn: { padding: 4 },
  removeBtnText: { color: C.textMuted, fontSize: 14 },

  // Primary button
  btn: {
    backgroundColor: C.tint,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
    width: "100%",
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  // Complete screen
  trophyEmoji: { fontSize: 52, marginBottom: 12 },
  summaryCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    width: "100%",
    marginTop: 16,
    overflow: "hidden",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
  },
  summaryRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  summaryLeft: { flex: 1, marginRight: 12 },
  summaryName: { color: C.text, fontSize: 15, fontWeight: "600" },
  commissionerBadge: { color: C.tint, fontSize: 11, fontWeight: "600", marginTop: 2 },
  summaryTeam: { color: C.textSecondary, fontSize: 14, flexShrink: 1 },

  rewardCard: {
    backgroundColor: "#1A1800",
    borderColor: C.accentGold,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    width: "100%",
    marginTop: 12,
  },
  rewardLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: C.accentGold,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  rewardText: { color: C.text, fontSize: 15, lineHeight: 21 },
});
