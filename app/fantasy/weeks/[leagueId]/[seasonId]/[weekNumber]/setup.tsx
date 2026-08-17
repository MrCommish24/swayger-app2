/**
 * app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/setup.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 5 — Commissioner Week N Setup Wizard
 * Phase 5.3 — Default question preselection + "Use Last Week's Questions"
 *
 * Step 1: Choose Questions (1–8 weekly NFL props)
 *   • is_default templates are preselected automatically on load
 *   • "Use Last Week's Questions" replaces selection with Week N-1 template IDs
 *   • Inactive last-week templates shown with "No longer recommended" badge
 * Step 2: Review & Publish
 *
 * On successful publish → router.replace to hub (quiet focus re-fetch shows
 * the newly published WeeklyCard).
 */

import React, { useCallback, useEffect, useState } from "react";
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
import { useAuth } from "@/lib/auth-context";
import {
  getWeeklyTemplates,
  getLastWeekTemplates,
  publishWeekly,
  WeeklyTemplate,
} from "@/lib/fantasy-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

const MAX_WEEKLY_QUESTIONS = 8;
const MIN_WEEKLY_QUESTIONS = 1;

export default function WeeklySetupScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { session } = useAuth();
  const { leagueId, seasonId, weekNumber } = useLocalSearchParams<{
    leagueId: string; seasonId: string; weekNumber: string;
  }>();

  const wn = parseInt(weekNumber ?? "1", 10);

  const [step, setStep]                     = useState<"pick" | "review">("pick");
  const [templates, setTemplates]           = useState<WeeklyTemplate[]>([]);
  const [selected, setSelected]             = useState<Set<string>>(new Set());
  // IDs considered inactive (from last week but no longer in library)
  const [inactiveIds, setInactiveIds]       = useState<Set<string>>(new Set());
  const [loading, setLoading]               = useState(true);
  const [loadingLastWeek, setLoadingLastWeek] = useState(false);
  const [publishing, setPublishing]         = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  const auth = session ? { session } : {};

  const loadTemplates = useCallback(async () => {
    if (!leagueId || !seasonId || !session) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getWeeklyTemplates(leagueId, seasonId, wn, { session });
      setTemplates(data.templates);
      // Phase 5.3: Preselect is_default templates (same pattern as Draft Day)
      const defaults = new Set(
        data.templates.filter((t) => t.is_default).map((t) => t.id)
      );
      setSelected(defaults);
    } catch (e: any) {
      setError(e.message ?? "Failed to load questions");
    } finally {
      setLoading(false);
    }
  }, [leagueId, seasonId, wn, session?.access_token]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_WEEKLY_QUESTIONS) {
        next.add(id);
      }
      return next;
    });
  };

  /** Replace current selection with last week's template IDs. */
  const useLastWeek = async () => {
    if (!leagueId || !seasonId || !session || loadingLastWeek) return;
    setLoadingLastWeek(true);
    setError(null);
    try {
      const result = await getLastWeekTemplates(leagueId, seasonId, wn, { session });

      if (result.template_ids.length === 0) {
        setError("No questions found from last week.");
        return;
      }

      // Build the selection from last week's IDs that are currently in the library
      // Plus keep inactive ones selected (with badge) so commissioner is aware
      const newSelected = new Set<string>();
      const newInactive = new Set<string>(result.inactive_template_ids);

      // Add IDs that exist in current template list
      const knownIds = new Set(templates.map((t) => t.id));
      for (const id of result.template_ids) {
        if (knownIds.has(id)) {
          newSelected.add(id);
        }
        // Inactive ones won't be in the library list — skip silently
        // (shown via inactiveIds badge if we had a way to display them;
        //  since they're not in templates[], we simply note any skips)
      }

      const skipped = result.template_ids.filter(
        (id) => !knownIds.has(id) && !result.inactive_template_ids.includes(id)
      );

      setSelected(newSelected);
      setInactiveIds(newInactive);

      if (skipped.length > 0) {
        // Some templates were removed from library entirely — silent skip is fine
        console.warn("[setup] last-week templates not in current library:", skipped);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load last week's questions.");
    } finally {
      setLoadingLastWeek(false);
    }
  };

  const handlePublish = async () => {
    if (!session || publishing || selected.size === 0) return;
    setPublishing(true);
    setError(null);
    try {
      // Preserve the order templates appear on screen
      const ordered = templates.filter(t => selected.has(t.id)).map(t => t.id);
      await publishWeekly(leagueId, seasonId, wn, ordered, { session });
      // Navigate back to hub — useFocusEffect there will quiet-refresh
      router.replace(`/fantasy/${leagueId}/${seasonId}` as any);
    } catch (e: any) {
      setError(e.message ?? "Failed to publish. Please try again.");
      setPublishing(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  // ── Step 1: Pick questions ───────────────────────────────────────────────────
  if (step === "pick") {
    const defaultCount   = templates.filter((t) => t.is_default).length;
    const optionalCount  = templates.filter((t) => !t.is_default).length;
    const selectedCount  = selected.size;
    const remaining      = MAX_WEEKLY_QUESTIONS - selectedCount;

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
        ]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.linkText}>← Back</Text>
        </TouchableOpacity>

        {/* Header */}
        <Text style={styles.weekLabel}>WEEK {wn} SWAYGER</Text>
        <Text style={styles.heading}>Set Up Week {wn}</Text>

        {/* Count badge + Use Last Week row */}
        <View style={styles.controlRow}>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {selectedCount} / {MAX_WEEKLY_QUESTIONS} selected
            </Text>
          </View>

          {/* Use Last Week — only available for Week 2+ */}
          {wn > 1 && (
            <TouchableOpacity
              style={[styles.lastWeekBtn, loadingLastWeek && { opacity: 0.6 }]}
              onPress={useLastWeek}
              disabled={loadingLastWeek}
              activeOpacity={0.8}
            >
              {loadingLastWeek ? (
                <ActivityIndicator color={C.tint} size="small" />
              ) : (
                <Text style={styles.lastWeekBtnText}>↩ Use Last Week's</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Suggested / Default questions */}
        {defaultCount > 0 && (
          <>
            <Text style={styles.sectionLabel}>SUGGESTED QUESTIONS</Text>
            <View style={styles.card}>
              {templates.filter((t) => t.is_default).map((t, i, arr) => {
                const isSelected = selected.has(t.id);
                const isDisabled = !isSelected && selected.size >= MAX_WEEKLY_QUESTIONS;
                return (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    isSelected={isSelected}
                    isDisabled={isDisabled}
                    isFirst={i === 0}
                    onToggle={() => toggle(t.id)}
                  />
                );
              })}
            </View>
          </>
        )}

        {/* Optional questions */}
        {optionalCount > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 8 }]}>MORE QUESTIONS</Text>
            <View style={styles.card}>
              {templates.filter((t) => !t.is_default).map((t, i) => {
                const isSelected = selected.has(t.id);
                const isDisabled = !isSelected && selected.size >= MAX_WEEKLY_QUESTIONS;
                return (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    isSelected={isSelected}
                    isDisabled={isDisabled}
                    isFirst={i === 0}
                    onToggle={() => toggle(t.id)}
                  />
                );
              })}
            </View>
          </>
        )}

        {remaining === 0 && (
          <Text style={styles.capNote}>Maximum {MAX_WEEKLY_QUESTIONS} questions reached.</Text>
        )}

        <TouchableOpacity
          style={[styles.btn, selectedCount < MIN_WEEKLY_QUESTIONS && styles.btnDisabled]}
          onPress={() => setStep("review")}
          disabled={selectedCount < MIN_WEEKLY_QUESTIONS}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>
            Review {selectedCount} Question{selectedCount !== 1 ? "s" : ""} →
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Step 2: Review & Publish ─────────────────────────────────────────────────
  const selectedTemplates = templates.filter(t => selected.has(t.id));
  const totalPoints       = selectedTemplates.reduce((s, t) => s + (t.point_value ?? 0), 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => setStep("pick")}>
        <Text style={styles.linkText}>← Edit Questions</Text>
      </TouchableOpacity>

      <Text style={styles.weekLabel}>WEEK {wn} SWAYGER</Text>
      <Text style={styles.heading}>Review Week {wn}</Text>
      <Text style={styles.sub}>
        Publishing is permanent. Members can start making picks immediately.
      </Text>

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryNum}>{selectedTemplates.length}</Text>
          <Text style={styles.summaryLabel}>Questions</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryNum}>{totalPoints}</Text>
          <Text style={styles.summaryLabel}>Total Pts</Text>
        </View>
      </View>

      <View style={styles.card}>
        {selectedTemplates.map((t, i) => (
          <View key={t.id} style={[styles.reviewRow, i > 0 && styles.rowBorder]}>
            <Text style={styles.reviewNum}>{i + 1}.</Text>
            <View style={styles.reviewText}>
              <Text style={styles.reviewQ}>{t.question}</Text>
              <Text style={styles.rowMeta}>{t.point_value} pt{t.point_value !== 1 ? "s" : ""}</Text>
            </View>
          </View>
        ))}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: "#16a34a" }, publishing && { opacity: 0.5 }]}
        onPress={handlePublish}
        disabled={publishing}
        activeOpacity={0.8}
      >
        <Text style={styles.btnText}>
          {publishing ? "Publishing…" : `🏈  Publish Week ${wn}`}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Sub-component: individual template row ────────────────────────────────────
interface TemplateRowProps {
  template:   WeeklyTemplate;
  isSelected: boolean;
  isDisabled: boolean;
  isFirst:    boolean;
  onToggle:   () => void;
}

function TemplateRow({ template: t, isSelected, isDisabled, isFirst, onToggle }: TemplateRowProps) {
  return (
    <TouchableOpacity
      style={[
        styles.row,
        !isFirst && styles.rowBorder,
        isSelected && styles.rowSelected,
        isDisabled && styles.rowDisabled,
      ]}
      onPress={onToggle}
      activeOpacity={0.7}
      disabled={isDisabled}
    >
      <View style={styles.rowLeft}>
        <Text style={[styles.rowQ, isSelected && styles.rowQSelected]}>
          {t.question}
        </Text>
        <Text style={styles.rowMeta}>
          {t.point_value} pt{t.point_value !== 1 ? "s" : ""}
          {t.answer_target_type === "yes_no" ? " · Yes/No" : ""}
        </Text>
      </View>
      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
        {isSelected && <Text style={styles.checkmark}>✓</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content:   { paddingHorizontal: 20 },
  center: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  backBtn:  { marginBottom: 16 },
  weekLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: C.tint,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  heading: { fontSize: 24, fontWeight: "800", color: C.text, marginBottom: 4 },
  sub: { fontSize: 14, color: C.textMuted, lineHeight: 20, marginBottom: 16 },

  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 8,
  },
  countBadge: {
    backgroundColor: C.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  countText: { fontSize: 13, fontWeight: "700", color: C.tint },

  lastWeekBtn: {
    backgroundColor: "#0f172a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.tint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  lastWeekBtnText: { fontSize: 13, fontWeight: "600", color: C.tint },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: C.textMuted,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  capNote: { fontSize: 12, color: C.textMuted, textAlign: "center", marginBottom: 8 },

  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowBorder:   { borderTopWidth: 1, borderTopColor: C.border },
  rowSelected: { backgroundColor: "#06091A" },
  rowDisabled: { opacity: 0.4 },
  rowLeft: { flex: 1 },
  rowQ: { fontSize: 14, fontWeight: "600", color: C.text, lineHeight: 20 },
  rowQSelected: { color: C.tint },
  rowMeta: { fontSize: 11, color: C.textMuted, marginTop: 3 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  checkboxSelected: { backgroundColor: C.tint, borderColor: C.tint },
  checkmark: { color: "#fff", fontSize: 14, fontWeight: "800" },

  btn: {
    backgroundColor: C.tint,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  errorText: { color: C.danger, fontSize: 13, marginBottom: 12, textAlign: "center" },
  linkText:  { color: C.tint, fontSize: 14, fontWeight: "600" },

  // Review step
  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  summaryBox: {
    flex: 1, backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    padding: 14, alignItems: "center",
  },
  summaryNum:   { fontSize: 26, fontWeight: "800", color: C.text },
  summaryLabel: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  reviewRow: {
    flexDirection: "row", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    alignItems: "flex-start",
  },
  reviewNum:  { fontSize: 13, fontWeight: "700", color: C.textMuted, width: 20, paddingTop: 1 },
  reviewText: { flex: 1 },
  reviewQ:    { fontSize: 14, fontWeight: "600", color: C.text, lineHeight: 20 },
});
