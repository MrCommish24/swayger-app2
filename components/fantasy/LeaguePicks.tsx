/**
 * components/fantasy/LeaguePicks.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Phase 6C — Post-Lock League Picks Social Reveal
 *
 * Displays the full pick distribution for a competition after it locks.
 * Reusable across: locked live Week, settled Week, finalized Week,
 * and Draft Day competition picks.
 *
 * Features:
 *   - Per-question answer distribution (count + percentage + bar)
 *   - "YOUR PICK" highlight on viewer's own answer
 *   - ✓ CORRECT marker after settlement
 *   - Expandable picker list per answer (tap to reveal names)
 *   - "Nobody had it" treatment for zero-pick correct answers
 *   - Abstention count ("X did not pick") per question
 */

import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import type {
  LeaguePicksRevealed,
  LeaguePicksProp,
  LeaguePicksAnswer,
} from "@/lib/fantasy-api";

const C = Colors.dark;

// ── Sub-component: single answer row ─────────────────────────────────────────

function AnswerRow({
  answer,
  totalPicks,
  isViewerAnswer,
  isOnlyPropAnswered,
}: {
  answer: LeaguePicksAnswer;
  totalPicks: number;
  isViewerAnswer: boolean;
  isOnlyPropAnswered: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const isCorrect  = answer.is_correct === true;
  const noPicks    = answer.count === 0;
  const pct        = answer.percentage;
  // Bar width as fraction of the tallest bar (caller normalises to maxCount)
  // We just use the percentage (already in 0–100) as the bar fill.
  const barFillPct = totalPicks > 0 ? (answer.count / totalPicks) * 100 : 0;

  return (
    <View style={[styles.answerRow, isCorrect && styles.answerRowCorrect]}>
      {/* ── Top line: label + count + pct ──────────────────────────────── */}
      <View style={styles.answerTopRow}>
        <View style={styles.answerLabelCol}>
          <Text style={[styles.answerLabel, isCorrect && styles.answerLabelCorrect]} numberOfLines={2}>
            {answer.label}
          </Text>
          {isCorrect && (
            <View style={styles.correctBadge}>
              <Text style={styles.correctBadgeText}>✓ CORRECT</Text>
            </View>
          )}
          {isViewerAnswer && (
            <Text style={styles.yourPickBadge}>YOUR PICK</Text>
          )}
        </View>

        <View style={styles.answerCountCol}>
          {!noPicks && (
            <>
              <Text style={[styles.answerCount, isCorrect && styles.answerCountCorrect]}>
                {answer.count} {answer.count === 1 ? "pick" : "picks"}
              </Text>
              <Text style={[styles.answerPct, isCorrect && styles.answerPctCorrect]}>
                {Number.isInteger(pct) ? `${pct}%` : `${pct}%`}
              </Text>
            </>
          )}
          {noPicks && isCorrect && (
            <Text style={styles.answerCount}>0 picks</Text>
          )}
        </View>
      </View>

      {/* ── Distribution bar ────────────────────────────────────────────── */}
      {!noPicks && (
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              isCorrect && styles.barFillCorrect,
              isViewerAnswer && !isCorrect && styles.barFillViewer,
              { width: `${Math.min(barFillPct, 100)}%` as any },
            ]}
          />
        </View>
      )}

      {/* ── "Nobody had it" label ────────────────────────────────────────── */}
      {noPicks && isCorrect && (
        <Text style={styles.nobodyText}>Nobody had it.</Text>
      )}

      {/* ── Expandable picker list ─────────────────────────────────────── */}
      {answer.count > 0 && (
        <>
          <TouchableOpacity
            style={styles.seePicksBtn}
            onPress={() => setExpanded((x) => !x)}
            activeOpacity={0.7}
          >
            <Text style={styles.seePicksText}>
              {expanded
                ? "Hide picks ▲"
                : `See ${answer.count} ${answer.count === 1 ? "pick" : "picks"} ▼`}
            </Text>
          </TouchableOpacity>

          {expanded && (
            <View style={styles.pickerList}>
              {answer.pickers.map((picker, i) => (
                <View key={i} style={styles.pickerRow}>
                  <View style={styles.pickerDot} />
                  <Text style={styles.pickerName}>{picker.display_name}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ── Sub-component: single prop card ─────────────────────────────────────────

function PropCard({
  prop,
  propIndex,
  viewerParticipantId,
}: {
  prop: LeaguePicksProp;
  propIndex: number;
  viewerParticipantId: string | null;
}) {
  const hasAnyPicks = prop.total_picks > 0;

  return (
    <View style={styles.propCard}>
      {/* Question */}
      <View style={styles.propHeaderRow}>
        <Text style={styles.propNum}>Q{propIndex + 1}</Text>
        <Text style={styles.propPts}>{prop.point_value} pt{prop.point_value !== 1 ? "s" : ""}</Text>
      </View>
      <Text style={styles.propQuestion}>{prop.question}</Text>

      {/* Pick tally */}
      <View style={styles.propTallyRow}>
        <Text style={styles.propTally}>
          {prop.total_picks} {prop.total_picks === 1 ? "pick" : "picks"}
          {prop.abstentions > 0 ? ` · ${prop.abstentions} did not pick` : ""}
        </Text>
      </View>

      {/* No-picks-at-all treatment */}
      {!hasAnyPicks && (
        <Text style={styles.noPicksText}>No picks were made for this question.</Text>
      )}

      {/* Answer distribution */}
      {hasAnyPicks || prop.correct_answer_id ? (
        <View style={styles.answerList}>
          {prop.answers.map((answer) => {
            const isViewerAnswer =
              viewerParticipantId !== null && answer.viewer_picked;
            return (
              <AnswerRow
                key={answer.answer_id}
                answer={answer}
                totalPicks={prop.total_picks}
                isViewerAnswer={isViewerAnswer}
                isOnlyPropAnswered={prop.total_picks > 0}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// ── Main exported component ───────────────────────────────────────────────────

export function LeaguePicks({ data }: { data: LeaguePicksRevealed }) {
  const { props, eligible_count, viewer_participant_id } = data;

  if (props.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No competition questions found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>LEAGUE PICKS</Text>
        <Text style={styles.headerSub}>
          The receipts are in · {eligible_count} {eligible_count === 1 ? "member" : "members"}
        </Text>
      </View>

      {/* Props */}
      {props.map((prop, i) => (
        <PropCard
          key={prop.prop_id}
          prop={prop}
          propIndex={i}
          viewerParticipantId={viewer_participant_id}
        />
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { gap: 14 },

  header: {
    backgroundColor: "#0A0F1E",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.tint,
    padding: 16,
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: C.tint,
    letterSpacing: 1.2,
  },
  headerSub: {
    fontSize: 13,
    color: C.textMuted,
  },

  propCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 10,
  },
  propHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  propNum:      { fontSize: 11, fontWeight: "700", color: C.textMuted, letterSpacing: 0.5 },
  propPts:      { fontSize: 11, fontWeight: "700", color: C.tint },
  propQuestion: { fontSize: 16, fontWeight: "700", color: C.text, lineHeight: 22 },
  propTallyRow: { flexDirection: "row", alignItems: "center" },
  propTally:    { fontSize: 12, color: C.textMuted, fontWeight: "600" },
  noPicksText:  { fontSize: 13, color: C.textMuted, fontStyle: "italic" },

  answerList: { gap: 10, marginTop: 2 },

  answerRow: {
    backgroundColor: C.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    gap: 8,
  },
  answerRowCorrect: {
    borderColor: "#22c55e",
    backgroundColor: "#052E16",
  },

  answerTopRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  answerLabelCol: { flex: 1, gap: 4 },
  answerCountCol: { alignItems: "flex-end", gap: 2, flexShrink: 0 },

  answerLabel:        { fontSize: 14, fontWeight: "700", color: C.text, lineHeight: 19 },
  answerLabelCorrect: { color: "#4ade80" },

  correctBadge: {
    backgroundColor: "#052E16",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#22c55e",
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  correctBadgeText: { fontSize: 10, fontWeight: "800", color: "#4ade80", letterSpacing: 0.4 },

  yourPickBadge: {
    fontSize: 10,
    fontWeight: "800",
    color: C.tint,
    letterSpacing: 0.6,
  },

  answerCount:        { fontSize: 12, fontWeight: "700", color: C.textSecondary, textAlign: "right" },
  answerCountCorrect: { color: "#4ade80" },
  answerPct:          { fontSize: 12, color: C.textMuted, textAlign: "right" },
  answerPctCorrect:   { color: "#4ade80" },

  barTrack: {
    height: 4,
    backgroundColor: "#1F2937",
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: {
    height: 4,
    backgroundColor: C.tint,
    borderRadius: 2,
    minWidth: 4,
  },
  barFillCorrect: { backgroundColor: "#22c55e" },
  barFillViewer:  { backgroundColor: C.tint },

  nobodyText: { fontSize: 12, color: "#4ade80", fontStyle: "italic", fontWeight: "600" },

  seePicksBtn: { alignSelf: "flex-start", paddingVertical: 2 },
  seePicksText: { fontSize: 12, color: C.tint, fontWeight: "700" },

  pickerList: { gap: 6, paddingTop: 4 },
  pickerRow:  { flexDirection: "row", alignItems: "center", gap: 8 },
  pickerDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: C.tint, flexShrink: 0,
  },
  pickerName: { fontSize: 13, color: C.text, fontWeight: "500" },

  emptyState: { padding: 32, alignItems: "center" },
  emptyText:  { color: C.textMuted, fontSize: 14 },
});
