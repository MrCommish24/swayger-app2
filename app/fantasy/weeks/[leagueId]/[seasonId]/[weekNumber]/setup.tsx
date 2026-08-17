/**
 * app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/setup.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 5 — Commissioner Week N Setup Wizard
 *
 * Step 1: Choose Questions (pick 1–8 weekly NFL props)
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

  const [step, setStep]               = useState<"pick" | "review">("pick");
  const [templates, setTemplates]     = useState<WeeklyTemplate[]>([]);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [loading, setLoading]         = useState(true);
  const [publishing, setPublishing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const auth = session ? { session } : {};

  const loadTemplates = useCallback(async () => {
    if (!leagueId || !seasonId || !session) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getWeeklyTemplates(leagueId, seasonId, wn, { session });
      setTemplates(data.templates);
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
      setError(e.message ?? "Failed to publish Week. Please try again.");
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
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.linkText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.heading}>Set Up Week {wn}</Text>
        <Text style={styles.sub}>
          Pick {MIN_WEEKLY_QUESTIONS}–{MAX_WEEKLY_QUESTIONS} questions for your league to answer.
        </Text>

        <View style={styles.countBadge}>
          <Text style={styles.countText}>{selected.size} / {MAX_WEEKLY_QUESTIONS} selected</Text>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.card}>
          {templates.map((t, i) => {
            const isSelected = selected.has(t.id);
            const isDisabled = !isSelected && selected.size >= MAX_WEEKLY_QUESTIONS;
            return (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.row,
                  i > 0 && styles.rowBorder,
                  isSelected && styles.rowSelected,
                  isDisabled && styles.rowDisabled,
                ]}
                onPress={() => toggle(t.id)}
                activeOpacity={0.7}
                disabled={isDisabled}
              >
                <View style={styles.rowLeft}>
                  <Text style={[styles.rowQ, isSelected && styles.rowQSelected]}>
                    {t.question}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {t.point_value} pt{t.point_value !== 1 ? "s" : ""} · {t.answer_target_type ?? "yes_no"}
                  </Text>
                </View>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.btn, selected.size < MIN_WEEKLY_QUESTIONS && styles.btnDisabled]}
          onPress={() => setStep("review")}
          disabled={selected.size < MIN_WEEKLY_QUESTIONS}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>Review {selected.size} Question{selected.size !== 1 ? "s" : ""} →</Text>
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
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }]}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => setStep("pick")}>
        <Text style={styles.linkText}>← Edit Questions</Text>
      </TouchableOpacity>

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
  backBtn: { marginBottom: 20 },
  heading: { fontSize: 24, fontWeight: "800", color: C.text, marginBottom: 6 },
  sub: { fontSize: 14, color: C.textMuted, lineHeight: 20, marginBottom: 16 },
  countBadge: {
    alignSelf: "flex-start",
    backgroundColor: C.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
  },
  countText: { fontSize: 13, fontWeight: "700", color: C.tint },
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: C.border },
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
  linkText: { color: C.tint, fontSize: 14, fontWeight: "600" },
  // Review step
  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  summaryBox: {
    flex: 1, backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    padding: 14, alignItems: "center",
  },
  summaryNum:   { fontSize: 26, fontWeight: "800", color: C.text },
  summaryLabel: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  reviewRow: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 14, alignItems: "flex-start" },
  reviewNum: { fontSize: 13, fontWeight: "700", color: C.textMuted, width: 20, paddingTop: 1 },
  reviewText: { flex: 1 },
  reviewQ: { fontSize: 14, fontWeight: "600", color: C.text, lineHeight: 20 },
});
