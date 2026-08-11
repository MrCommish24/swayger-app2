/**
 * app/fantasy/draft-day/[leagueId]/[seasonId].tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Fantasy Draft Day Setup — Commissioner only.
 *
 * Flow:
 *   Step 1 "choose"   — Browse curated templates, toggle on/off.
 *   Step 2 "preview"  — Read-only summary; confirm before publish.
 *   Step 3 "done"     — After publish, navigate back to hub.
 *
 * Design principles (per product spec):
 *   • Commissioner curates a fun prediction game, NOT configures database records.
 *   • Short wizard: Choose → Preview → Publish (3 taps).
 *   • No free point-weight editing; values come from Swayger templates.
 *   • Draft Day Picks vs Season Receipts visually distinct throughout.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import {
  getDraftDayTemplates,
  publishDraftDay,
  DraftDayTemplate,
  DraftDayTemplates,
} from "@/lib/fantasy-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

type Step = "loading" | "choose" | "preview" | "publishing" | "error";

const SCOPE_LABEL: Record<string, string> = {
  competition: "DRAFT DAY PICKS",
  season:      "SEASON RECEIPTS",
};
const SCOPE_TAGLINE: Record<string, string> = {
  competition: "These determine today's winner.",
  season:      "Lock these in now. We'll bring the receipts back later.",
};
const SCOPE_COLOR: Record<string, string> = {
  competition: C.tint,
  season:      C.accentGold,
};

export default function DraftDaySetupScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();
  const { leagueId, seasonId } = useLocalSearchParams<{
    leagueId: string;
    seasonId: string;
  }>();

  const [step, setStep]           = useState<Step>("loading");
  const [templates, setTemplates] = useState<DraftDayTemplates | null>(null);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const [sport, setSport]         = useState<string>("football");

  const fetchTemplates = useCallback(async () => {
    if (!session || !leagueId || !seasonId) return;
    setStep("loading");
    try {
      const result = await getDraftDayTemplates(leagueId, seasonId, { session });
      setTemplates(result);
      setSport(result.sport ?? "football");
      // Pre-select defaults
      const defaultIds = new Set([
        ...result.competition.filter((t) => t.is_default).map((t) => t.id),
        ...result.season.filter((t) => t.is_default).map((t) => t.id),
      ]);
      setSelected(defaultIds);
      setStep("choose");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Failed to load templates");
      setStep("error");
    }
  }, [session, leagueId, seasonId]);

  useEffect(() => {
    if (authLoading) return;
    if (!session) { router.replace("/auth"); return; }
    fetchTemplates();
  }, [authLoading, session?.access_token]);

  const toggleTemplate = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handlePublish = async () => {
    if (!session || !leagueId || !seasonId) return;
    setStep("publishing");
    try {
      await publishDraftDay(leagueId, seasonId, [...selected], { session });
      // Navigate back to the hub (it will refresh and show the published card)
      router.replace(`/fantasy/${leagueId}/${seasonId}`);
    } catch (e: any) {
      setErrorMsg(e.message ?? "Publish failed");
      setStep("error");
    }
  };

  // ── Loading / error ─────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  if (step === "error") {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{errorMsg}</Text>
        <TouchableOpacity style={styles.btn} onPress={fetchTemplates}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={styles.linkText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === "publishing") {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
        <Text style={[styles.mutedText, { marginTop: 16 }]}>Publishing Draft Day…</Text>
      </View>
    );
  }

  const allTemplates     = templates ? [...templates.competition, ...templates.season] : [];
  const selectedItems    = allTemplates.filter((t) => selected.has(t.id));
  const competitionCount = selectedItems.filter((t) => t.scoring_scope === "competition").length;
  const seasonCount      = selectedItems.filter((t) => t.scoring_scope === "season").length;
  const totalSelected    = selected.size;

  // ── Step 2: Preview ─────────────────────────────────────────────────────────
  if (step === "preview") {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
        ]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => setStep("choose")}>
          <Text style={styles.linkText}>← Back to Questions</Text>
        </TouchableOpacity>

        {/* League header */}
        <Text style={styles.previewLabel}>PREVIEW</Text>
        <Text style={styles.previewTitle}>Draft Day Swayger</Text>
        <Text style={styles.previewSubtitle}>
          {sport.charAt(0).toUpperCase() + sport.slice(1)} · {new Date().getFullYear()} Season
        </Text>

        {/* Competition count */}
        <View style={[styles.previewCard, { borderColor: SCOPE_COLOR.competition }]}>
          <Text style={[styles.previewCardLabel, { color: SCOPE_COLOR.competition }]}>
            DRAFT DAY PICKS
          </Text>
          <Text style={styles.previewCardCount}>{competitionCount} questions</Text>
          <Text style={styles.previewCardTagline}>{SCOPE_TAGLINE.competition}</Text>
          {selectedItems
            .filter((t) => t.scoring_scope === "competition")
            .map((t) => (
              <Text key={t.id} style={styles.previewListItem}>· {t.question}</Text>
            ))}
        </View>

        {/* Season count */}
        <View style={[styles.previewCard, { borderColor: SCOPE_COLOR.season, marginTop: 12 }]}>
          <Text style={[styles.previewCardLabel, { color: SCOPE_COLOR.season }]}>
            SEASON RECEIPTS
          </Text>
          <Text style={styles.previewCardCount}>{seasonCount} questions</Text>
          <Text style={styles.previewCardTagline}>{SCOPE_TAGLINE.season}</Text>
          {selectedItems
            .filter((t) => t.scoring_scope === "season")
            .map((t) => (
              <Text key={t.id} style={styles.previewListItem}>· {t.question}</Text>
            ))}
        </View>

        <View style={styles.previewTotalRow}>
          <Text style={styles.previewTotalText}>
            Total selected: {totalSelected} question{totalSelected !== 1 ? "s" : ""}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.btn, { marginTop: 24 }]}
          onPress={handlePublish}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>🚀  Publish Draft Day</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Step 1: Choose Questions ────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.linkText}>← League Hub</Text>
      </TouchableOpacity>

      <Text style={styles.screenTitle}>Set Up Draft Day</Text>
      <Text style={styles.screenSubtitle}>
        Choose which questions your league will answer before the draft begins.
      </Text>

      {(["competition", "season"] as const).map((scope) => {
        const group = scope === "competition" ? templates!.competition : templates!.season;
        if (group.length === 0) return null;
        const color = SCOPE_COLOR[scope];
        return (
          <View key={scope} style={styles.sectionBlock}>
            <View style={[styles.sectionHeader, { borderLeftColor: color }]}>
              <Text style={[styles.sectionLabel, { color }]}>{SCOPE_LABEL[scope]}</Text>
              <Text style={styles.sectionTagline}>{SCOPE_TAGLINE[scope]}</Text>
            </View>

            {group.map((tmpl) => {
              const isSelected = selected.has(tmpl.id);
              return (
                <Pressable
                  key={tmpl.id}
                  style={[
                    styles.templateCard,
                    isSelected && styles.templateCardSelected,
                    isSelected && { borderColor: color },
                  ]}
                  onPress={() => toggleTemplate(tmpl.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                >
                  {/* Checkmark */}
                  <View style={[styles.check, isSelected && { backgroundColor: color }]}>
                    {isSelected && <Text style={styles.checkMark}>✓</Text>}
                  </View>

                  <View style={styles.templateBody}>
                    <Text style={[styles.templateQuestion, isSelected && { color: C.text }]}>
                      {tmpl.question}
                    </Text>
                    <View style={styles.templateMeta}>
                      <Text style={[styles.metaPill, { color }]}>
                        {scope === "competition" ? "Draft Day Pick" : "Season Receipt"}
                      </Text>
                      <Text style={styles.metaDot}>·</Text>
                      <Text style={styles.metaPoints}>{tmpl.point_value} pts</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        );
      })}

      {/* Footer CTA */}
      <View style={styles.footerRow}>
        <Text style={styles.footerCount}>
          {totalSelected} question{totalSelected !== 1 ? "s" : ""} selected
        </Text>
        <TouchableOpacity
          style={[styles.btn, styles.btnInline, totalSelected === 0 && styles.btnDisabled]}
          onPress={() => totalSelected > 0 && setStep("preview")}
          disabled={totalSelected === 0}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>Preview →</Text>
        </TouchableOpacity>
      </View>
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
    gap: 12,
  },

  backBtn: { marginBottom: 16 },

  // Choose step
  screenTitle:    { fontSize: 24, fontWeight: "800", color: C.text, marginBottom: 6 },
  screenSubtitle: { fontSize: 13, color: C.textMuted, marginBottom: 24, lineHeight: 19 },

  sectionBlock: { marginBottom: 24 },
  sectionHeader: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginBottom: 12,
  },
  sectionLabel:   { fontSize: 12, fontWeight: "700", letterSpacing: 0.7 },
  sectionTagline: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  templateCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  templateCardSelected: { backgroundColor: "#0A0A18" },

  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  checkMark: { color: "#fff", fontSize: 12, fontWeight: "700", lineHeight: 14 },

  templateBody:     { flex: 1 },
  templateQuestion: { fontSize: 14, fontWeight: "600", color: C.textSecondary, lineHeight: 20 },
  templateMeta:     { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  metaPill:         { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  metaDot:          { color: C.textMuted, fontSize: 11 },
  metaPoints:       { fontSize: 11, color: C.textMuted },

  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 12,
  },
  footerCount: { fontSize: 13, color: C.textMuted },

  // Preview step
  previewLabel:    { fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8, marginBottom: 4 },
  previewTitle:    { fontSize: 26, fontWeight: "800", color: C.text, marginBottom: 2 },
  previewSubtitle: { fontSize: 13, color: C.textMuted, marginBottom: 20 },
  previewCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    gap: 4,
  },
  previewCardLabel:   { fontSize: 11, fontWeight: "700", letterSpacing: 0.7, marginBottom: 2 },
  previewCardCount:   { fontSize: 20, fontWeight: "700", color: C.text },
  previewCardTagline: { fontSize: 12, color: C.textMuted, marginBottom: 8 },
  previewListItem:    { fontSize: 13, color: C.textSecondary, lineHeight: 21 },
  previewTotalRow:    { alignItems: "center", marginTop: 16 },
  previewTotalText:   { fontSize: 14, color: C.textMuted },

  // Shared
  btn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  btnInline:   { minWidth: 120 },
  btnDisabled: { opacity: 0.4 },
  btnText:     { color: "#fff", fontWeight: "700", fontSize: 15 },
  linkText:    { color: C.tint, fontSize: 14, fontWeight: "600" },
  errorText:   { color: C.danger, fontSize: 14, textAlign: "center" },
  mutedText:   { color: C.textMuted, fontSize: 13 },
});
