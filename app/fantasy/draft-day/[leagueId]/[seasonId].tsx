/**
 * app/fantasy/draft-day/[leagueId]/[seasonId].tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Fantasy Draft Day Setup + Manage — Commissioner only.
 *
 * Modes:
 *   Setup   (?manage absent) — Normal wizard: Choose → Review → Publish.
 *   Manage  (?manage=1)      — Edit existing: pre-selects current questions,
 *                              allows changes, saves via PATCH (not re-publish).
 *
 * Manage mode guards (edit-before-picks):
 *   card.status = 'open' AND pick_count = 0 → editable
 *   card.status = 'locked'                  → read-only, message
 *   pick_count > 0                          → read-only, message
 *   card.status = 'settled'                 → read-only, message
 *
 * Inactive (legacy) templates: previously published templates that have since
 * been deactivated are shown at the top of their scope section with an
 * "⚠ No longer recommended" badge. They remain in the selection until
 * explicitly removed; once removed they cannot be re-added (not in active list).
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
  getDraftDay,
  publishDraftDay,
  updateDraftDayProps,
  DraftDayTemplate,
  DraftDayTemplates,
  DraftDayCurrentProp,
} from "@/lib/fantasy-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

const MAX_QUESTIONS    = 15;
const RECOMMENDED_MIN  = 6;
const RECOMMENDED_MAX  = 10;

// step values — unified for setup + manage modes
type Step =
  | "loading"
  | "already_published" // setup mode only: Draft Day exists, no manage param
  | "choose"
  | "review"
  | "publishing"        // also used for saving in manage mode
  | "error"
  | "manage_readonly";  // manage mode: editing blocked (locked / picks exist)

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
  const { leagueId, seasonId, manage } = useLocalSearchParams<{
    leagueId: string;
    seasonId: string;
    manage?: string;
  }>();

  // manage=1 → manage mode (edit existing Draft Day)
  const isManageMode = manage === "1";

  const [step, setStep]           = useState<Step>("loading");
  const [templates, setTemplates] = useState<DraftDayTemplates | null>(null);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [atCap, setAtCap]         = useState(false);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const [sport, setSport]         = useState<string>("football");

  // Manage mode: inactive legacy templates (published but now deactivated)
  // These come from existing.current_props where is_active=false.
  const [legacyTemplates, setLegacyTemplates] = useState<DraftDayTemplate[]>([]);
  // Manage mode: reason editing is blocked (null = editable)
  const [readOnlyReason, setReadOnlyReason]   = useState<string | null>(null);
  // Manage mode: current_props for read-only display
  const [currentProps, setCurrentProps]       = useState<DraftDayCurrentProp[]>([]);

  const fetchTemplates = useCallback(async () => {
    if (!session || !leagueId || !seasonId) return;
    setStep("loading");
    setAtCap(false);
    setLegacyTemplates([]);
    setReadOnlyReason(null);
    try {
      // Fetch active templates + existing Draft Day in parallel
      const [result, existing] = await Promise.all([
        getDraftDayTemplates(leagueId, seasonId, { session }),
        getDraftDay(leagueId, seasonId, { session }).catch(() => null),
      ]);

      setTemplates(result);
      setSport(result.sport ?? "football");

      if (existing) {
        if (isManageMode) {
          // ── Manage mode: determine edit eligibility ──────────────────────
          setCurrentProps(existing.current_props ?? []);

          const canEdit =
            existing.card_status === "open" &&
            (existing.pick_count ?? 0) === 0;

          if (!canEdit) {
            // Build a human-readable reason
            const reason =
              existing.card_status === "locked"
                ? "Draft Day picks are locked. Unlock picks from the League Hub before making changes."
                : existing.card_status === "settled"
                ? "Draft Day has been finalized and questions can no longer be changed."
                : (existing.pick_count ?? 0) > 0
                ? "Members have already submitted picks, so Draft Day questions can no longer be changed."
                : "Draft Day cannot be edited right now.";
            setReadOnlyReason(reason);
            setStep("manage_readonly");
            return;
          }

          // Editable: pre-select from current published props
          const allActiveIds = new Set([
            ...result.competition.map((t) => t.id),
            ...result.season.map((t) => t.id),
          ]);

          // Build legacy template objects from current_props that are now inactive
          const legacy: DraftDayTemplate[] = (existing.current_props ?? [])
            .filter((p) => !p.is_active)
            .map((p) => ({
              id:                p.template_prop_id,
              question:          p.question,
              scoring_scope:     p.scoring_scope,
              point_value:       p.point_value,
              answer_target_type: null,
              supports_no_one:   p.supports_no_one,
              is_default:        false,
            }));
          setLegacyTemplates(legacy);

          // Pre-select ALL current props (active + legacy)
          const preSelected = new Set(
            (existing.current_props ?? []).map((p) => p.template_prop_id)
          );
          setSelected(preSelected);
          setAtCap(preSelected.size >= MAX_QUESTIONS);
          setStep("choose");
          return;
        }

        // Setup mode: Draft Day already exists — dead-end (use hub to manage)
        setStep("already_published");
        return;
      }

      // No existing Draft Day — normal setup flow (pre-select defaults)
      if (isManageMode) {
        // Navigated to manage but no Draft Day exists — fall through to setup
        // (shouldn't happen in normal flow; hub only shows Manage when published)
      }
      const defaultIds: string[] = [];
      for (const t of [...result.competition, ...result.season]) {
        if (t.is_default && defaultIds.length < MAX_QUESTIONS) {
          defaultIds.push(t.id);
        }
      }
      setSelected(new Set(defaultIds));
      setStep("choose");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Failed to load templates");
      setStep("error");
    }
  }, [session, leagueId, seasonId, isManageMode]);

  useEffect(() => {
    if (authLoading) return;
    if (!session) { router.replace("/auth"); return; }
    fetchTemplates();
  }, [authLoading, session?.access_token]);

  const toggleTemplate = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setAtCap(false);
      } else {
        if (next.size >= MAX_QUESTIONS) {
          setAtCap(true);
          return prev;
        }
        next.add(id);
        if (next.size === MAX_QUESTIONS) setAtCap(true);
      }
      return next;
    });
  };

  // ── Publish (setup mode) ──────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!session || !leagueId || !seasonId) return;
    setStep("publishing");
    try {
      await publishDraftDay(leagueId, seasonId, [...selected], { session });
      router.replace(`/fantasy/${leagueId}/${seasonId}`);
    } catch (e: any) {
      setErrorMsg(e.message ?? "Publish failed");
      setStep("error");
    }
  };

  // ── Save Changes (manage mode) ────────────────────────────────────────────
  const handleSaveChanges = async () => {
    if (!session || !leagueId || !seasonId) return;
    setStep("publishing");
    try {
      await updateDraftDayProps(leagueId, seasonId, [...selected], { session });
      router.replace(`/fantasy/${leagueId}/${seasonId}`);
    } catch (e: any) {
      setErrorMsg(e.message ?? "Save failed");
      setStep("error");
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  // ── Already published (setup mode, no ?manage) ────────────────────────────
  if (step === "already_published") {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.alreadyIcon}>✅</Text>
        <Text style={styles.alreadyTitle}>Draft Day is live</Text>
        <Text style={styles.alreadySubtitle}>
          This season's Draft Day is already published.{"\n"}Manage it from the League Hub.
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => router.replace(`/fantasy/${leagueId}/${seasonId}`)}
        >
          <Text style={styles.btnText}>← Back to League Hub</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Manage mode: read-only (locked / picks exist / settled) ──────────────
  if (step === "manage_readonly") {
    const compProps = currentProps.filter((p) => p.scoring_scope === "competition");
    const seasProps = currentProps.filter((p) => p.scoring_scope === "season");
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
        ]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace(`/fantasy/${leagueId}/${seasonId}`)}>
          <Text style={styles.linkText}>← League Hub</Text>
        </TouchableOpacity>

        <Text style={styles.screenTitle}>Draft Day Questions</Text>

        {/* Reason banner */}
        <View style={styles.readOnlyBanner}>
          <Text style={styles.readOnlyBannerText}>🔒 {readOnlyReason}</Text>
        </View>

        {/* Current questions — read-only */}
        {compProps.length > 0 && (
          <View style={styles.sectionBlock}>
            <View style={[styles.sectionHeader, { borderLeftColor: C.tint }]}>
              <Text style={[styles.sectionLabel, { color: C.tint }]}>{SCOPE_LABEL.competition}</Text>
              <Text style={styles.sectionTagline}>{SCOPE_TAGLINE.competition}</Text>
            </View>
            {compProps.map((p) => (
              <View key={p.template_prop_id} style={styles.readOnlyCard}>
                <Text style={styles.readOnlyQuestion}>{p.question}</Text>
                {!p.is_active && (
                  <Text style={styles.legacyBadge}>⚠ No longer recommended</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {seasProps.length > 0 && (
          <View style={styles.sectionBlock}>
            <View style={[styles.sectionHeader, { borderLeftColor: C.accentGold }]}>
              <Text style={[styles.sectionLabel, { color: C.accentGold }]}>{SCOPE_LABEL.season}</Text>
              <Text style={styles.sectionTagline}>{SCOPE_TAGLINE.season}</Text>
            </View>
            {seasProps.map((p) => (
              <View key={p.template_prop_id} style={styles.readOnlyCard}>
                <Text style={styles.readOnlyQuestion}>{p.question}</Text>
                {!p.is_active && (
                  <Text style={styles.legacyBadge}>⚠ No longer recommended</Text>
                )}
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.btn, { marginTop: 8 }]}
          onPress={() => router.replace(`/fantasy/${leagueId}/${seasonId}`)}
        >
          <Text style={styles.btnText}>← Back to League Hub</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
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

  // ── Publishing / Saving ────────────────────────────────────────────────────
  if (step === "publishing") {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
        <Text style={[styles.mutedText, { marginTop: 16 }]}>
          {isManageMode ? "Saving changes…" : "Publishing Draft Day…"}
        </Text>
      </View>
    );
  }

  // ── Shared computed values (used in choose + review steps) ──────────────────
  const allActiveTemplates = templates ? [...templates.competition, ...templates.season] : [];

  // For review: build selectedItems from all sources (active + legacy)
  const allTemplateById: Record<string, DraftDayTemplate> = {};
  for (const t of allActiveTemplates) allTemplateById[t.id] = t;
  for (const t of legacyTemplates)   allTemplateById[t.id] = t;

  const selectedItems    = [...selected].map((id) => allTemplateById[id]).filter(Boolean);
  const competitionItems = selectedItems.filter((t) => t.scoring_scope === "competition");
  const seasonItems      = selectedItems.filter((t) => t.scoring_scope === "season");
  const totalSelected    = selected.size;
  const remaining        = MAX_QUESTIONS - totalSelected;

  // ── Step 2: Review ─────────────────────────────────────────────────────────
  if (step === "review") {
    const reviewLabel = isManageMode ? "REVIEW CHANGES" : "REVIEW DRAFT DAY";
    const publishBtn  = isManageMode ? "💾  Save Changes" : "🚀  Publish Draft Day";
    const onConfirm   = isManageMode ? handleSaveChanges : handlePublish;

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

        <Text style={styles.previewLabel}>{reviewLabel}</Text>
        <Text style={styles.previewTitle}>Draft Day Swayger</Text>
        <Text style={styles.previewSubtitle}>
          {sport.charAt(0).toUpperCase() + sport.slice(1)} · {new Date().getFullYear()} Season
        </Text>
        <Text style={styles.reviewHint}>
          {isManageMode
            ? "Review your changes before saving. These questions will replace the current set."
            : "Make sure these are the questions you want your league to answer."}
        </Text>

        <View style={[styles.previewCard, { borderColor: SCOPE_COLOR.competition }]}>
          <Text style={[styles.previewCardLabel, { color: SCOPE_COLOR.competition }]}>
            DRAFT DAY PICKS
          </Text>
          <Text style={styles.previewCardCount}>
            {competitionItems.length} question{competitionItems.length !== 1 ? "s" : ""}
          </Text>
          <Text style={styles.previewCardTagline}>{SCOPE_TAGLINE.competition}</Text>
          {competitionItems.map((t) => (
            <View key={t.id} style={styles.previewItemRow}>
              <Text style={styles.previewListItem}>· {t.question}</Text>
              {legacyTemplates.some((l) => l.id === t.id) && (
                <Text style={styles.legacyBadgeSmall}>legacy</Text>
              )}
            </View>
          ))}
        </View>

        <View style={[styles.previewCard, { borderColor: SCOPE_COLOR.season, marginTop: 12 }]}>
          <Text style={[styles.previewCardLabel, { color: SCOPE_COLOR.season }]}>
            SEASON RECEIPTS
          </Text>
          <Text style={styles.previewCardCount}>
            {seasonItems.length} question{seasonItems.length !== 1 ? "s" : ""}
          </Text>
          <Text style={styles.previewCardTagline}>{SCOPE_TAGLINE.season}</Text>
          {seasonItems.map((t) => (
            <View key={t.id} style={styles.previewItemRow}>
              <Text style={styles.previewListItem}>· {t.question}</Text>
              {legacyTemplates.some((l) => l.id === t.id) && (
                <Text style={styles.legacyBadgeSmall}>legacy</Text>
              )}
            </View>
          ))}
        </View>

        <View style={styles.previewTotalRow}>
          <Text style={styles.previewTotalText}>
            {totalSelected} of {MAX_QUESTIONS} questions selected
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.btn, { marginTop: 24 }]}
          onPress={onConfirm}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>{publishBtn}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Step 1: Choose Questions ─────────────────────────────────────────────────
  const screenTitle    = isManageMode ? "Manage Draft Day" : "Set Up Draft Day";
  const screenSubtitle = isManageMode
    ? "Update the questions your league will answer. Changes apply immediately after saving."
    : "Choose which questions your league will answer before the draft begins.";
  const reviewBtnLabel = isManageMode ? "Review Changes →" : "Review Draft Day →";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => router.replace(`/fantasy/${leagueId}/${seasonId}`)}>
        <Text style={styles.linkText}>← League Hub</Text>
      </TouchableOpacity>

      <Text style={styles.screenTitle}>{screenTitle}</Text>
      <Text style={styles.screenSubtitle}>{screenSubtitle}</Text>

      {(["competition", "season"] as const).map((scope) => {
        const color       = SCOPE_COLOR[scope];
        const activeGroup = scope === "competition" ? templates!.competition : templates!.season;
        const legacyGroup = legacyTemplates.filter((t) => t.scoring_scope === scope);
        // All templates shown for this scope: legacy first, then active
        const hasContent  = legacyGroup.length > 0 || activeGroup.length > 0;
        if (!hasContent) return null;

        return (
          <View key={scope} style={styles.sectionBlock}>
            <View style={[styles.sectionHeader, { borderLeftColor: color }]}>
              <Text style={[styles.sectionLabel, { color }]}>{SCOPE_LABEL[scope]}</Text>
              <Text style={styles.sectionTagline}>{SCOPE_TAGLINE[scope]}</Text>
            </View>

            {/* Legacy (inactive) templates — visible but marked */}
            {legacyGroup.map((tmpl) => {
              const isSelected = selected.has(tmpl.id);
              return (
                <Pressable
                  key={tmpl.id}
                  style={[
                    styles.templateCard,
                    styles.legacyCard,
                    isSelected && styles.templateCardSelected,
                    isSelected && { borderColor: color },
                  ]}
                  onPress={() => toggleTemplate(tmpl.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                >
                  <View style={[styles.check, isSelected && { backgroundColor: color }]}>
                    {isSelected && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                  <View style={styles.templateBody}>
                    <View style={styles.legacyRow}>
                      <Text style={styles.legacyBadge}>⚠ No longer recommended</Text>
                    </View>
                    <Text style={[
                      styles.templateQuestion,
                      isSelected && { color: C.text },
                    ]}>
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

            {/* Active templates */}
            {activeGroup.map((tmpl) => {
              const isSelected = selected.has(tmpl.id);
              const isDisabled = !isSelected && atCap;
              return (
                <Pressable
                  key={tmpl.id}
                  style={[
                    styles.templateCard,
                    isSelected && styles.templateCardSelected,
                    isSelected && { borderColor: color },
                    isDisabled && styles.templateCardDisabled,
                  ]}
                  onPress={() => toggleTemplate(tmpl.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected, disabled: isDisabled }}
                >
                  <View style={[styles.check, isSelected && { backgroundColor: color }]}>
                    {isSelected && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                  <View style={styles.templateBody}>
                    <Text style={[
                      styles.templateQuestion,
                      isSelected && { color: C.text },
                      isDisabled && { color: C.textMuted },
                    ]}>
                      {tmpl.question}
                    </Text>
                    <View style={styles.templateMeta}>
                      <Text style={[styles.metaPill, { color: isDisabled ? C.textMuted : color }]}>
                        {scope === "competition" ? "Draft Day Pick" : "Season Receipt"}
                      </Text>
                      <Text style={styles.metaDot}>·</Text>
                      <Text style={styles.metaPoints}>{tmpl.point_value} pts</Text>
                      {tmpl.supports_no_one && (
                        <>
                          <Text style={styles.metaDot}>·</Text>
                          <Text style={[styles.metaPoints, { color: C.textMuted }]}>includes "No one"</Text>
                        </>
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        );
      })}

      {atCap && (
        <View style={styles.capBanner}>
          <Text style={styles.capBannerText}>
            ✋ Maximum reached — deselect a question to add another.
          </Text>
        </View>
      )}

      <View style={styles.footerRow}>
        <View style={styles.footerCounts}>
          <Text style={styles.footerCount}>
            {totalSelected} of {MAX_QUESTIONS} selected
          </Text>
          {!atCap && totalSelected > 0 && totalSelected < RECOMMENDED_MIN && (
            <Text style={styles.footerHint}>We recommend {RECOMMENDED_MIN}–{RECOMMENDED_MAX} questions.</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.btn, styles.btnInline, totalSelected === 0 && styles.btnDisabled]}
          onPress={() => totalSelected > 0 && setStep("review")}
          disabled={totalSelected === 0}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>{reviewBtnLabel}</Text>
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

  // Already-published state
  alreadyIcon:     { fontSize: 40, marginBottom: 12 },
  alreadyTitle:    { fontSize: 22, fontWeight: "800", color: C.text, textAlign: "center" },
  alreadySubtitle: { fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 20, marginBottom: 24 },

  // Read-only manage mode
  readOnlyBanner: {
    backgroundColor: "#1A1A2E",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#4B5563",
    padding: 12,
    marginBottom: 20,
  },
  readOnlyBannerText: { fontSize: 13, color: C.textSecondary, lineHeight: 19 },
  readOnlyCard: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  readOnlyQuestion: { fontSize: 14, color: C.textSecondary, lineHeight: 20 },

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
  templateCardDisabled: { opacity: 0.4 },

  // Legacy (inactive) template card variant
  legacyCard: {
    borderColor: "#4B5563",
    borderStyle: "dashed",
  },
  legacyRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  legacyBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: "#D97706",
    letterSpacing: 0.3,
  },
  legacyBadgeSmall: {
    fontSize: 10,
    fontWeight: "600",
    color: "#D97706",
    marginLeft: 6,
  },

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
  templateMeta:     { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  metaPill:         { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  metaDot:          { color: C.textMuted, fontSize: 11 },
  metaPoints:       { fontSize: 11, color: C.textMuted },

  capBanner: {
    backgroundColor: "#2A1500",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#7C2D12",
    padding: 12,
    marginBottom: 16,
  },
  capBannerText: { color: "#FDBA74", fontSize: 13, fontWeight: "600", textAlign: "center" },

  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 12,
  },
  footerCounts: { flex: 1 },
  footerCount: { fontSize: 13, color: C.textMuted },
  footerHint:  { fontSize: 11, color: C.textMuted, marginTop: 2 },

  // Review step
  previewLabel:    { fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8, marginBottom: 4 },
  previewTitle:    { fontSize: 26, fontWeight: "800", color: C.text, marginBottom: 2 },
  previewSubtitle: { fontSize: 13, color: C.textMuted, marginBottom: 6 },
  reviewHint:      { fontSize: 13, color: C.textSecondary, marginBottom: 20, lineHeight: 19 },
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
  previewItemRow:     { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
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
  btnInline:   { minWidth: 140 },
  btnDisabled: { opacity: 0.4 },
  btnText:     { color: "#fff", fontWeight: "700", fontSize: 15 },
  linkText:    { color: C.tint, fontSize: 14, fontWeight: "600" },
  errorText:   { color: C.danger, fontSize: 14, textAlign: "center" },
  mutedText:   { color: C.textMuted, fontSize: 13 },
});
