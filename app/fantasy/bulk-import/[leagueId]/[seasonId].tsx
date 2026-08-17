/**
 * app/fantasy/bulk-import/[leagueId]/[seasonId].tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Commissioner-only Paste League Roster screen.
 *
 * Flow:
 *   Step 1 (paste)   → multiline text area → "Review Import"
 *   Step 2 (review)  → editable table, duplicate/existing flags, "Add N Members"
 *   Step 3 (results) → per-row success/failure, Done or Retry failed rows
 *
 * Auth: commissioner session required.
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import {
  fantasyFetch,
  batchImportParticipants,
  type FantasySeasonDetail,
  type BatchMemberResult,
} from "@/lib/fantasy-api";
import {
  parsePasteText,
  applyExistingLeagueFlags,
  rowIsValid,
  rowHasWarning,
  countValid,
  countErrors,
  type ParsedRow,
} from "@/lib/bulk-import-parser";
import Colors from "@/constants/colors";

const C = Colors.dark;

// ── UUID helper (same as manage screen) ───────────────────────────────────────

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "paste" | "review" | "submitting" | "results";

interface ReviewRow extends ParsedRow {
  /** True if this row was successfully submitted in a prior partial submission */
  submitted: boolean;
  /** Result from a prior submission attempt */
  submitResult: BatchMemberResult | null;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function BulkImportScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();
  const { leagueId, seasonId } = useLocalSearchParams<{
    leagueId: string;
    seasonId: string;
  }>();

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !session) router.replace("/auth");
  }, [authLoading, session]);

  // ── League data (for duplicate detection against existing members) ──────────
  const [existingNames, setExistingNames] = useState<string[]>([]);
  const [existingTeams, setExistingTeams] = useState<string[]>([]);
  const [commName, setCommName]           = useState<string | null>(null);
  const [commTeam, setCommTeam]           = useState<string | null>(null);
  const [loadingLeague, setLoadingLeague] = useState(true);

  useEffect(() => {
    if (!session || !leagueId || !seasonId) return;
    fantasyFetch<FantasySeasonDetail>(
      `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}`,
      {},
      { session }
    ).then((det) => {
      const myRole = det.viewer?.role;
      // Redirect non-commissioners
      if (myRole !== "commissioner" && myRole !== "co_commissioner") {
        router.replace(`/fantasy/${leagueId}/${seasonId}` as any);
        return;
      }
      setExistingNames(det.participants.map((p) => p.display_name ?? "").filter(Boolean));
      setExistingTeams(det.participants.map((p) => p.team_name   ?? "").filter(Boolean));
      const comm = det.participants.find((p) => p.role === "commissioner");
      setCommName(comm?.display_name ?? null);
      setCommTeam(comm?.team_name    ?? null);
    }).catch(() => {}).finally(() => setLoadingLeague(false));
  }, [session, leagueId, seasonId]);

  // ── Step / state ───────────────────────────────────────────────────────────
  const [step, setStep]           = useState<Step>("paste");
  const [pasteText, setPasteText] = useState("");
  const [rows, setRows]           = useState<ReviewRow[]>([]);
  const [batchKey, setBatchKey]   = useState<string>(() => generateUUID());
  /** True once a submission has been attempted — any row edit after this needs a fresh key */
  const wasSubmitted = useRef(false);

  // ── Step 1 → Step 2 (parse + review) ─────────────────────────────────────

  const handleReview = () => {
    const parsed = parsePasteText(pasteText);
    const flagged = applyExistingLeagueFlags(
      parsed, existingNames, existingTeams, commName, commTeam
    );
    const reviewRows: ReviewRow[] = flagged.map((r) => ({
      ...r,
      submitted:    false,
      submitResult: null,
    }));
    setRows(reviewRows);
    setStep("review");
  };

  // ── Review helpers ─────────────────────────────────────────────────────────

  const updateRow = (id: string, field: "display_name" | "team_name", value: string) => {
    // Any edit after a submission attempt → fresh batch key to avoid hash conflict
    if (wasSubmitted.current) {
      setBatchKey(generateUUID());
      wasSubmitted.current = false;
    }
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated: ReviewRow = {
          ...r,
          [field]:      value,
          nameError:    field === "display_name" ? (value.trim() ? null : "Member name required") : r.nameError,
          teamError:    field === "team_name"    ? (value.trim() ? null : "Team name required")   : r.teamError,
          submitResult: null, // clear prior result so row is re-submittable
        };
        // Re-apply existing-league flags on the updated value
        const updatedName = field === "display_name" ? value : r.display_name;
        const updatedTeam = field === "team_name"    ? value : r.team_name;
        updated.existingNameWarning = existingNames.some(
          (n) => n.toLowerCase() === updatedName.trim().toLowerCase()
        );
        updated.existingTeamWarning = !!updatedTeam.trim() && existingTeams.some(
          (t) => t.toLowerCase() === updatedTeam.trim().toLowerCase()
        );
        updated.commissionerMatch =
          commName !== null &&
          updatedName.trim().toLowerCase() === commName.toLowerCase() &&
          (commTeam === null || updatedTeam.trim().toLowerCase() === commTeam.toLowerCase());
        return updated;
      })
    );
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  // ── Step 2 → Step 3 (submit) ───────────────────────────────────────────────

  const pendingRows = rows.filter((r) => !r.submitted && rowIsValid(r));
  const errorRows   = rows.filter((r) => !rowIsValid(r));
  const canSubmit   = pendingRows.length > 0 && errorRows.length === 0 && !authLoading;

  const handleSubmit = async () => {
    if (!session || pendingRows.length === 0) return;
    setStep("submitting");
    wasSubmitted.current = true;

    try {
      const members = pendingRows.map((r) => ({
        display_name: r.display_name.trim(),
        team_name:    r.team_name.trim(),
      }));

      // Derive a sub-batch key scoped to the current pending indices
      // so that "retry remaining failed rows" gets a different key slot.
      const res = await batchImportParticipants(
        leagueId, seasonId, batchKey, members, { session }
      );

      // Map results back onto rows by matching pending row order
      setRows((prev) => {
        const newRows = [...prev];
        let ri = 0;
        for (let i = 0; i < newRows.length; i++) {
          const row = newRows[i];
          if (row.submitted || !rowIsValid(row)) continue;
          const result = res.results[ri];
          ri++;
          if (!result) continue;
          newRows[i] = {
            ...row,
            submitted:    result.status !== "failed",
            submitResult: result,
          };
        }
        return newRows;
      });

      setStep("results");
    } catch (e: any) {
      setStep("review");
      Alert.alert("Import Error", e.message ?? "Failed to import members. Please try again.");
    }
  };

  // ── Return to manage ───────────────────────────────────────────────────────

  const handleDone = () => {
    router.replace(`/fantasy/manage/${leagueId}/${seasonId}` as any);
  };

  // ── Retry failed rows ──────────────────────────────────────────────────────

  const handleRetryFailed = () => {
    // Clear results for failed rows and go back to review
    setBatchKey(generateUUID());
    wasSubmitted.current = false;
    setRows((prev) =>
      prev.map((r) =>
        r.submitResult?.status === "failed"
          ? { ...r, submitted: false, submitResult: null }
          : r
      )
    );
    setStep("review");
  };

  // ── Render guards ──────────────────────────────────────────────────────────

  if (authLoading || loadingLeague) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  // ── Render: submitting ─────────────────────────────────────────────────────
  if (step === "submitting") {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
        <Text style={styles.loadingText}>Adding members…</Text>
      </View>
    );
  }

  // ── Render: results ────────────────────────────────────────────────────────
  if (step === "results") {
    const successRows = rows.filter((r) => r.submitted);
    const failedRows  = rows.filter((r) => r.submitResult?.status === "failed");

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
          ]}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep("review")}>
            <Text style={styles.linkText}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Import Results</Text>

          {/* Summary */}
          {successRows.length > 0 && (
            <View style={styles.successBanner}>
              <Text style={styles.successBannerText}>
                ✓ {successRows.length} member{successRows.length !== 1 ? "s" : ""} added
              </Text>
            </View>
          )}
          {failedRows.length > 0 && (
            <View style={styles.failBanner}>
              <Text style={styles.failBannerText}>
                {failedRows.length} row{failedRows.length !== 1 ? "s" : ""} could not be added
              </Text>
            </View>
          )}

          {/* Failed rows */}
          {failedRows.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>NEEDS ATTENTION</Text>
              <View style={styles.reviewCard}>
                {failedRows.map((r, i) => (
                  <View key={r.id} style={[styles.resultRow, i > 0 && styles.rowBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{r.display_name}</Text>
                      <Text style={styles.rowTeam}>{r.team_name}</Text>
                      <Text style={styles.rowError}>{r.submitResult?.error ?? "Failed"}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary, { marginBottom: 12 }]} onPress={handleRetryFailed}>
                <Text style={[styles.btnText, { color: C.textSecondary }]}>Edit & Retry Failed Rows</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Success rows */}
          {successRows.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: failedRows.length > 0 ? 8 : 20 }]}>
                ADDED SUCCESSFULLY
              </Text>
              <View style={styles.reviewCard}>
                {successRows.map((r, i) => (
                  <View key={r.id} style={[styles.resultRow, i > 0 && styles.rowBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{r.display_name}</Text>
                      <Text style={styles.rowTeam}>{r.team_name}</Text>
                      {r.submitResult?.draft_day_eligible === false && (
                        <Text style={styles.rowHint}>Added to league only — won't participate in current Draft Day</Text>
                      )}
                    </View>
                    <Text style={styles.checkmark}>✓</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <TouchableOpacity style={[styles.btn, { marginTop: 24 }]} onPress={handleDone}>
            <Text style={styles.btnText}>Done — Back to League</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Render: review ─────────────────────────────────────────────────────────
  if (step === "review") {
    const validCount  = rows.filter((r) => !r.submitted && rowIsValid(r)).length;
    const errorCount  = errorRows.length;
    const warningCount = rows.filter((r) => !r.submitted && rowHasWarning(r)).length;

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 60 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep("paste")}>
            <Text style={styles.linkText}>← Edit Paste</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Review Import</Text>

          {/* Summary bar */}
          <View style={styles.summaryRow}>
            {errorCount === 0 ? (
              <Text style={styles.summaryGood}>
                {validCount} member{validCount !== 1 ? "s" : ""} ready to add
              </Text>
            ) : (
              <>
                <Text style={styles.summaryGood}>{validCount} ready</Text>
                <Text style={styles.summaryDot}> · </Text>
                <Text style={styles.summaryBad}>{errorCount} need{errorCount !== 1 ? "" : "s"} attention</Text>
              </>
            )}
            {warningCount > 0 && (
              <>
                <Text style={styles.summaryDot}> · </Text>
                <Text style={styles.summaryWarn}>{warningCount} warning{warningCount !== 1 ? "s" : ""}</Text>
              </>
            )}
          </View>

          {/* Row list */}
          {rows.map((r, idx) => {
            const isSubmitted = r.submitted;
            return (
              <View key={r.id} style={[styles.reviewCard, { marginBottom: 10 }]}>
                {/* Commissioner match — most prominent warning */}
                {r.commissionerMatch && (
                  <View style={styles.warnBadge}>
                    <Text style={styles.warnBadgeText}>
                      Already in league (Commissioner) — recommend removing this row
                    </Text>
                  </View>
                )}
                {/* Existing member/team warnings */}
                {!r.commissionerMatch && r.existingNameWarning && (
                  <View style={styles.warnBadge}>
                    <Text style={styles.warnBadgeText}>
                      Possible existing member: {r.display_name}
                    </Text>
                  </View>
                )}
                {!r.commissionerMatch && r.existingTeamWarning && (
                  <View style={styles.warnBadge}>
                    <Text style={styles.warnBadgeText}>
                      Possible existing team: {r.team_name}
                    </Text>
                  </View>
                )}
                {/* Within-paste duplicates */}
                {r.dupNameWarning && (
                  <View style={[styles.warnBadge, styles.warnBadgeSoft]}>
                    <Text style={styles.warnBadgeTextSoft}>{r.dupNameWarning}</Text>
                  </View>
                )}
                {r.dupTeamWarning && (
                  <View style={[styles.warnBadge, styles.warnBadgeSoft]}>
                    <Text style={styles.warnBadgeTextSoft}>{r.dupTeamWarning}</Text>
                  </View>
                )}

                <View style={styles.rowInputArea}>
                  <View style={styles.rowInputCol}>
                    <Text style={styles.fieldLabel}>MEMBER</Text>
                    <TextInput
                      style={[styles.input, !r.display_name.trim() && styles.inputError, isSubmitted && styles.inputDisabled]}
                      value={r.display_name}
                      onChangeText={(v) => updateRow(r.id, "display_name", v)}
                      placeholder="Member name"
                      placeholderTextColor={C.textMuted}
                      autoCapitalize="words"
                      autoCorrect={false}
                      editable={!isSubmitted}
                    />
                    {r.nameError && <Text style={styles.fieldError}>{r.nameError}</Text>}
                  </View>

                  <View style={styles.rowInputCol}>
                    <Text style={styles.fieldLabel}>FANTASY TEAM</Text>
                    <TextInput
                      style={[styles.input, !r.team_name.trim() && styles.inputError, isSubmitted && styles.inputDisabled]}
                      value={r.team_name}
                      onChangeText={(v) => updateRow(r.id, "team_name", v)}
                      placeholder="Team name"
                      placeholderTextColor={C.textMuted}
                      autoCapitalize="words"
                      autoCorrect={false}
                      editable={!isSubmitted}
                    />
                    {r.teamError && <Text style={styles.fieldError}>{r.teamError}</Text>}
                  </View>

                  {!isSubmitted && (
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removeRow(r.id)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  )}
                  {isSubmitted && <Text style={styles.submittedCheck}>✓</Text>}
                </View>
              </View>
            );
          })}

          {rows.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>All rows removed. Go back to paste new data.</Text>
            </View>
          )}

          {/* Submit CTA */}
          {pendingRows.length > 0 && (
            <TouchableOpacity
              style={[styles.btn, (!canSubmit) && styles.btnDisabled, { marginTop: 8 }]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              <Text style={styles.btnText}>
                Add {pendingRows.length} Member{pendingRows.length !== 1 ? "s" : ""}
              </Text>
            </TouchableOpacity>
          )}

          {errorCount > 0 && (
            <Text style={styles.submitHint}>
              Fix or remove {errorCount} row{errorCount !== 1 ? "s" : ""} with errors before importing.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Render: paste (Step 1, default) ───────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.linkText}>← Manage League</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Paste League Roster</Text>
        <Text style={styles.subtitle}>
          Paste member names and fantasy team names from a spreadsheet, text, email, or another fantasy app.
        </Text>

        <View style={styles.formatCard}>
          <Text style={styles.formatTitle}>Supported formats (one member per line):</Text>
          <Text style={styles.formatLine}>Darius, The Monstars</Text>
          <Text style={styles.formatLine}>Mike | Sunday Scaries</Text>
          <Text style={styles.formatLine}>Chris{"  "}Fourth &amp; Long{" "}{"  "}(tab-separated)</Text>
        </View>

        <TextInput
          style={styles.pasteArea}
          value={pasteText}
          onChangeText={setPasteText}
          multiline
          placeholder={
            "Darius, The Monstars\nMike, Sunday Scaries\nChris, Fourth & Long\nRob, Grim\nMally, All Eyes"
          }
          placeholderTextColor={C.textMuted}
          autoCorrect={false}
          autoCapitalize="sentences"
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.btn, !pasteText.trim() && styles.btnDisabled]}
          onPress={handleReview}
          disabled={!pasteText.trim()}
        >
          <Text style={styles.btnText}>Review Import</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, { marginTop: 10 }]}
          onPress={() => router.back()}
        >
          <Text style={[styles.btnText, { color: C.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content:   { paddingHorizontal: 20 },
  center: {
    flex: 1, backgroundColor: C.background,
    alignItems: "center", justifyContent: "center", padding: 32, gap: 16,
  },
  loadingText: { color: C.textSecondary, fontSize: 15, marginTop: 8 },

  backBtn:  { marginBottom: 16 },
  linkText: { color: C.tint, fontSize: 14, fontWeight: "600" },

  title:    { fontSize: 24, fontWeight: "800", color: C.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: C.textMuted, lineHeight: 20, marginBottom: 20 },

  formatCard: {
    backgroundColor: "#0d0d0d",
    borderRadius: 10, borderWidth: 1, borderColor: C.border,
    padding: 14, marginBottom: 18,
  },
  formatTitle: { fontSize: 12, fontWeight: "700", color: C.textMuted, marginBottom: 8 },
  formatLine:  { fontSize: 13, color: C.textSecondary, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", marginBottom: 4 },

  pasteArea: {
    backgroundColor: "#111",
    borderWidth: 1, borderColor: C.border,
    borderRadius: 10, padding: 14,
    fontSize: 14, color: C.text,
    minHeight: 200,
    marginBottom: 20,
  },

  sectionLabel: {
    fontSize: 11, fontWeight: "700",
    color: C.textMuted, letterSpacing: 0.8, marginBottom: 8,
  },

  summaryRow: {
    flexDirection: "row", alignItems: "center",
    flexWrap: "wrap", marginBottom: 16,
  },
  summaryGood: { fontSize: 14, fontWeight: "600", color: "#22c55e" },
  summaryBad:  { fontSize: 14, fontWeight: "600", color: "#ef4444" },
  summaryWarn: { fontSize: 14, fontWeight: "600", color: C.accentGold },
  summaryDot:  { fontSize: 14, color: C.textMuted },

  reviewCard: {
    backgroundColor: C.surface,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
    overflow: "hidden", marginBottom: 0,
  },

  warnBadge: {
    backgroundColor: "#1a0a0a",
    borderBottomWidth: 1, borderBottomColor: "#7f1d1d",
    paddingHorizontal: 14, paddingVertical: 8,
  },
  warnBadgeText: { color: "#f87171", fontSize: 12, fontWeight: "600" },
  warnBadgeSoft: { backgroundColor: "#1A1200", borderBottomColor: "#92400e" },
  warnBadgeTextSoft: { color: C.accentGold, fontSize: 12, fontWeight: "600" },

  rowInputArea: {
    flexDirection: "row", alignItems: "flex-start",
    paddingHorizontal: 12, paddingVertical: 12, gap: 8,
  },
  rowInputCol: { flex: 1 },

  fieldLabel: {
    fontSize: 10, fontWeight: "700", color: C.textMuted,
    letterSpacing: 0.5, marginBottom: 4,
  },
  input: {
    backgroundColor: "#111",
    borderWidth: 1, borderColor: C.border,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 14, color: C.text,
  },
  inputError:    { borderColor: "#ef4444" },
  inputDisabled: { opacity: 0.5 },
  fieldError:    { color: "#ef4444", fontSize: 11, marginTop: 3 },

  removeBtn: {
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: "#1a0a0a",
    borderWidth: 1, borderColor: "#7f1d1d",
    alignItems: "center", justifyContent: "center",
    marginTop: 18,
  },
  removeBtnText:  { color: "#f87171", fontSize: 13, fontWeight: "700" },
  submittedCheck: { color: "#22c55e", fontSize: 18, marginTop: 18 },

  emptyState: { alignItems: "center", padding: 32 },
  emptyText:  { color: C.textMuted, fontSize: 14, textAlign: "center" },

  submitHint: {
    color: "#ef4444", fontSize: 13, textAlign: "center",
    marginTop: 10,
  },

  // Results
  resultRow:    { flexDirection: "row", alignItems: "center", padding: 14 },
  rowBorder:    { borderTopWidth: 1, borderTopColor: C.border },
  rowName:      { fontSize: 14, fontWeight: "600", color: C.text },
  rowTeam:      { fontSize: 13, color: C.textSecondary, marginTop: 1 },
  rowError:     { fontSize: 12, color: "#ef4444", marginTop: 4 },
  rowHint:      { fontSize: 11, color: C.accentGold, marginTop: 4 },
  checkmark:    { color: "#22c55e", fontSize: 18, marginLeft: 8 },

  successBanner: {
    backgroundColor: "#052e1a",
    borderRadius: 10, borderWidth: 1, borderColor: "#22c55e",
    padding: 14, marginBottom: 10,
  },
  successBannerText: { color: "#22c55e", fontSize: 15, fontWeight: "700", textAlign: "center" },
  failBanner: {
    backgroundColor: "#1a0a0a",
    borderRadius: 10, borderWidth: 1, borderColor: "#ef4444",
    padding: 14, marginBottom: 10,
  },
  failBannerText: { color: "#ef4444", fontSize: 15, fontWeight: "700", textAlign: "center" },

  btn: {
    backgroundColor: C.tint,
    borderRadius: 10, paddingVertical: 14,
    alignItems: "center",
  },
  btnSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: C.border },
  btnDisabled:  { opacity: 0.45 },
  btnText:      { color: "#fff", fontSize: 15, fontWeight: "700" },
});
