/**
 * components/fantasy/AnswerSelector.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 6B — Large-Roster Answer Selector
 *
 * Threshold-based pick UI for fantasy prop questions:
 *
 *   answer_options.length <= LARGE_ROSTER_THRESHOLD (4)
 *     → inline buttons (same design as prior play screens)
 *
 *   answer_options.length > LARGE_ROSTER_THRESHOLD
 *     → compact card (shows current pick or "No pick yet") +
 *       modal selector (2-column team grid, scrollable to 16+)
 *
 * Pick semantics are owned by the caller:
 *   - `onSelect(answerId)` fires immediately on tap
 *   - caller runs the existing autosave function
 *   - modal closes on selection; compact card reflects `pickStatus`
 *
 * Note on secondary labels (team + member name):
 *   The published answer_options snapshot stores one `label` per option.
 *   For fantasy_team options, label = team name.
 *   For season_member options, label = member display name.
 *   A combined "team + manager name" would require snapshot enhancement
 *   (no SQL migration taken in Area B). Only the snapshot label is shown.
 *   See Phase 6B report §15 Known Limitations.
 */

import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DraftDayAnswerOption } from "@/lib/fantasy-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

// ── Public constant — import this to gate threshold decisions consistently ────
/** Options count at-or-below this renders inline; above it opens modal. */
export const LARGE_ROSTER_THRESHOLD = 4;

// ── Prop types ────────────────────────────────────────────────────────────────

export interface AnswerSelectorProps {
  /** Full published answer_options array (ordered as per server snapshot). */
  options: DraftDayAnswerOption[];
  /** Currently selected answer ID. null = no pick. */
  selectedId: string | null;
  /** When true, picking is disabled (card is locked or settled). */
  isLocked: boolean;
  /**
   * Question text shown in the modal header so the user remembers
   * what they are choosing.
   */
  question: string;
  /**
   * Called immediately when the user taps an option.
   * For modal selector: fires before modal closes.
   * Caller is responsible for the actual autosave.
   */
  onSelect: (answerId: string) => void;
  /**
   * Current save-state for this prop. Reflected on the compact card
   * (not per-option) when the modal is closed.
   */
  pickStatus?: "saving" | "saved" | "error";
}

// ── Main export ───────────────────────────────────────────────────────────────

export function AnswerSelector({
  options,
  selectedId,
  isLocked,
  question,
  onSelect,
  pickStatus,
}: AnswerSelectorProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const isLargeRoster = options.length > LARGE_ROSTER_THRESHOLD;

  const handleTap = (id: string) => {
    onSelect(id);
    if (isLargeRoster) setModalVisible(false);
  };

  // ── Inline path (≤4 options) ──────────────────────────────────────────────
  if (!isLargeRoster) {
    return (
      <View style={styles.inlineList}>
        {options.map((opt) => {
          const sel = selectedId === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.inlineBtn,
                sel && styles.inlineBtnSelected,
                isLocked && styles.inlineBtnLocked,
              ]}
              onPress={() => handleTap(opt.id)}
              disabled={isLocked}
              activeOpacity={isLocked ? 1 : 0.7}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: sel, disabled: isLocked }}
            >
              <Text
                style={[styles.inlineText, sel && styles.inlineTextSelected]}
                numberOfLines={3}
              >
                {opt.label}
              </Text>
              {sel && (
                <Text
                  style={[styles.inlineCheck, isLocked && { color: C.accentGold }]}
                >
                  {isLocked ? "🔒" : "✓"}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  // ── Large-roster path (>4 options) ────────────────────────────────────────
  const selectedOpt = selectedId ? options.find((o) => o.id === selectedId) ?? null : null;

  return (
    <>
      {/* Compact pick display */}
      <CompactPick
        selectedOpt={selectedOpt}
        isLocked={isLocked}
        pickStatus={pickStatus}
        onOpen={() => setModalVisible(true)}
      />

      {/* Modal selector */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        statusBarTranslucent={Platform.OS === "android"}
        onRequestClose={() => setModalVisible(false)}
      >
        <SelectorModal
          options={options}
          selectedId={selectedId}
          question={question}
          onSelect={handleTap}
          onClose={() => setModalVisible(false)}
        />
      </Modal>
    </>
  );
}

// ── Compact pick card ─────────────────────────────────────────────────────────

function CompactPick({
  selectedOpt,
  isLocked,
  pickStatus,
  onOpen,
}: {
  selectedOpt: DraftDayAnswerOption | null;
  isLocked: boolean;
  pickStatus?: "saving" | "saved" | "error";
  onOpen: () => void;
}) {
  const buttonLabel = selectedOpt ? "Change Pick" : "Choose Team";

  return (
    <View style={styles.compactWrap}>
      <Text style={styles.compactLabel}>YOUR PICK</Text>

      {selectedOpt ? (
        <View style={styles.compactPickRow}>
          {isLocked && <Text style={styles.compactLockIcon}>🔒</Text>}
          <Text style={styles.compactSelection} numberOfLines={2}>
            {selectedOpt.label}
          </Text>
        </View>
      ) : (
        <Text style={styles.compactNone}>No pick yet</Text>
      )}

      {/* Save feedback below pick */}
      {pickStatus === "saving" && (
        <Text style={styles.savingText}>Saving…</Text>
      )}
      {pickStatus === "error" && (
        <Text style={styles.saveErrorText}>Failed to save. Tap to retry.</Text>
      )}

      {/* Open modal button — hidden when locked */}
      {!isLocked && (
        <TouchableOpacity
          style={[
            styles.chooseBtn,
            pickStatus === "saving" && styles.chooseBtnDisabled,
          ]}
          onPress={onOpen}
          disabled={pickStatus === "saving"}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={buttonLabel}
        >
          <Text style={styles.chooseBtnText}>{buttonLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Modal sheet ───────────────────────────────────────────────────────────────

function SelectorModal({
  options,
  selectedId,
  question,
  onSelect,
  onClose,
}: {
  options: DraftDayAnswerOption[];
  selectedId: string | null;
  question: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  // Derive title from option type
  const firstType = options[0]?.type;
  const modalTitle =
    firstType === "season_member"
      ? "CHOOSE A MEMBER"
      : firstType === "fantasy_team"
      ? "CHOOSE A TEAM"
      : "MAKE YOUR PICK";

  const renderItem = ({ item }: { item: DraftDayAnswerOption }) => {
    const sel = selectedId === item.id;
    return (
      <TouchableOpacity
        style={[styles.gridCard, sel && styles.gridCardSelected]}
        onPress={() => onSelect(item.id)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={item.label + (sel ? ", selected" : "")}
        accessibilityState={{ selected: sel }}
      >
        {sel && <Text style={styles.gridCheck}>✓</Text>}
        <Text
          style={[styles.gridLabel, sel && styles.gridLabelSelected]}
          numberOfLines={4}
        >
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.overlay}>
      {/* Tappable backdrop */}
      <TouchableOpacity
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
        activeOpacity={1}
        accessibilityLabel="Close selector"
      />

      {/* Bottom sheet */}
      <View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 12 },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.modalHeader}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.modalTitle}>{modalTitle}</Text>
            <Text style={styles.modalQuestion} numberOfLines={3}>
              {question}
            </Text>
            <Text style={styles.modalCount}>
              {options.length} option{options.length !== 1 ? "s" : ""}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Scrollable grid */}
        <FlatList
          data={options}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // Bring the current pick into view on open
          initialScrollIndex={undefined}
        />
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Inline (≤4) ────────────────────────────────────────────────────────────
  inlineList: { gap: 8 },
  inlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  inlineBtnSelected: { backgroundColor: "#06091A", borderColor: C.tint },
  inlineBtnLocked:   { opacity: 0.8 },
  inlineText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: C.text,
    lineHeight: 20,
  },
  inlineTextSelected: { color: C.tint },
  inlineCheck: {
    fontSize: 16,
    color: C.tint,
    fontWeight: "800",
    marginLeft: 8,
  },

  // ── Compact card (>4) ──────────────────────────────────────────────────────
  compactWrap: { gap: 6 },
  compactLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: C.textMuted,
    letterSpacing: 1,
  },
  compactPickRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  compactLockIcon: { fontSize: 14 },
  compactSelection: {
    fontSize: 16,
    fontWeight: "700",
    color: C.text,
    lineHeight: 22,
    flex: 1,
  },
  compactNone: { fontSize: 14, color: C.textMuted, fontStyle: "italic" },
  savingText:    { fontSize: 12, color: C.textMuted },
  saveErrorText: { fontSize: 12, color: C.danger },
  chooseBtn: {
    marginTop: 4,
    backgroundColor: C.tint,
    borderRadius: 9,
    paddingVertical: 11,
    paddingHorizontal: 20,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  chooseBtnDisabled: { opacity: 0.5 },
  chooseBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  // ── Modal overlay & sheet ──────────────────────────────────────────────────
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "75%",
    // Shadow for iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    // Elevation for Android
    elevation: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 0,
    gap: 12,
  },
  modalTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: C.tint,
    letterSpacing: 1.2,
  },
  modalQuestion: {
    fontSize: 14,
    fontWeight: "600",
    color: C.text,
    lineHeight: 20,
  },
  modalCount: { fontSize: 12, color: C.textMuted },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  closeBtnText: { fontSize: 14, color: C.text, fontWeight: "700" },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 0,
  },

  // ── Grid ───────────────────────────────────────────────────────────────────
  gridContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  gridRow:     { gap: 10 },
  gridCard: {
    flex: 1,
    backgroundColor: C.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    minHeight: 70,
    justifyContent: "center",
    gap: 4,
  },
  gridCardSelected: {
    backgroundColor: "#06091A",
    borderColor: C.tint,
    borderWidth: 2,
  },
  gridCheck: {
    fontSize: 12,
    color: C.tint,
    fontWeight: "800",
    marginBottom: 2,
  },
  gridLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: C.text,
    lineHeight: 18,
  },
  gridLabelSelected: { color: C.tint },
});
