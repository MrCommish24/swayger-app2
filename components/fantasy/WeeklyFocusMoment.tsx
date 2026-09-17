import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { DraftDayProp } from "@/lib/fantasy-api";
import { WeeklyMomentLabel } from "@/components/fantasy/WeeklyMomentLabel";
import { AnswerSelector } from "@/components/fantasy/AnswerSelector";
import Colors from "@/constants/colors";

const C = Colors.dark;

type Props = {
  prop: DraftDayProp;
  index: number;
  total: number;
  selectedId: string | null;
  status?: "saving" | "saved" | "error";
  locked: boolean;
  stale?: boolean;
  onSelect: (answerId: string) => Promise<boolean>;
  onPrevious: () => void;
  onNext: () => void;
  reviewing?: boolean;
  onFinishReview?: () => void;
  ackLabel?: string;
  confirmedAnswerLabel?: string | null;
  showAcknowledgment?: boolean;
  onShare?: () => void;
  canFinishReview?: boolean;
  headingRef?: React.RefObject<React.ElementRef<typeof Text> | null>;
};

export function WeeklyFocusMoment({ prop, index, total, selectedId, status, locked, stale = false, onSelect, onPrevious, onNext, reviewing, onFinishReview, canFinishReview = true, ackLabel = "ON THE RECORD", confirmedAnswerLabel, showAcknowledgment = false, onShare, headingRef }: Props) {
  const answered = Boolean(selectedId);
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <View style={styles.meta}>
        <Text style={styles.kicker}>MOMENT {String(index + 1).padStart(2, "0")}</Text>
        <Text style={styles.points}>{prop.point_value} point{prop.point_value === 1 ? "" : "s"}</Text>
      </View>
      <WeeklyMomentLabel templatePropId={prop.template_prop_id} />
      <Text ref={headingRef} {...(Platform.OS === "web" ? ({ tabIndex: -1 } as any) : {})} style={styles.question} accessibilityRole="header">{prop.question}</Text>
      {stale && <Text style={styles.stale} accessibilityLiveRegion="polite">Roster updated — resubmit this Moment.</Text>}
      <Text style={styles.instruction}>{locked ? "Your prediction is locked." : "Choose your take."}</Text>
      <AnswerSelector
        options={prop.answer_options ?? []}
        selectedId={selectedId}
        isLocked={locked}
        question={prop.question}
        onSelect={(id) => { void onSelect(id); }}
        pickStatus={status}
      />
      {status === "saved" && showAcknowledgment && <Text style={styles.ack}>{ackLabel}</Text>}
      {status === "error" && <Text style={styles.errorAck} accessibilityLiveRegion="assertive">Pick not saved. Your previous answer was restored.</Text>}
      {status === "saved" && confirmedAnswerLabel && (
        <Text style={styles.srOnly} accessibilityLiveRegion="polite">
          Pick saved. {confirmedAnswerLabel} is on the record.
        </Text>
      )}
      {!!confirmedAnswerLabel && status !== "saving" && status !== "error" && !locked && onShare && (
        <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel="Share Pick" style={styles.share}>
          <Text style={styles.shareText}>Share Pick</Text>
        </Pressable>
      )}
      <View style={styles.nav}>
        <Pressable onPress={onPrevious} disabled={index === 0} accessibilityRole="button" accessibilityLabel="Previous pick" accessibilityState={{ disabled: index === 0 }} style={[styles.navButton, index === 0 && styles.disabled]}>
          <Text style={styles.navText}>Previous Pick</Text>
        </Pressable>
        <View style={styles.nextActions}>
          {reviewing && (
            <Pressable onPress={onFinishReview} disabled={!canFinishReview} accessibilityRole="button" accessibilityLabel="Done editing picks" accessibilityState={{ disabled: !canFinishReview }} style={[styles.doneButton, !canFinishReview && styles.disabled]}>
              <Text style={styles.navText}>Done</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onNext}
            disabled={index === total - 1 || (!reviewing && !locked && !answered)}
            accessibilityRole="button"
            accessibilityLabel="Next pick"
            accessibilityState={{ disabled: index === total - 1 || (!reviewing && !locked && !answered) }}
            style={[styles.nextButton, (index === total - 1 || (!reviewing && !locked && !answered)) && styles.disabled]}
          >
            <Text style={styles.nextText}>Next Pick</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 18, padding: 18, gap: 12 },
  meta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kicker: { color: C.tint, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  points: { color: C.textMuted, fontSize: 11, fontWeight: "700" },
  question: { color: C.text, fontSize: 24, lineHeight: 31, fontWeight: "800", letterSpacing: -0.3, marginTop: 2 },
  instruction: { color: C.textMuted, fontSize: 13, lineHeight: 19 },
  nav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  nextActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  doneButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  navButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  navText: { color: C.textMuted, fontSize: 13, fontWeight: "700" },
  nextButton: { minHeight: 44, borderRadius: 10, backgroundColor: C.tint, justifyContent: "center", paddingHorizontal: 18 },
  nextText: { color: "#071013", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.35 },
  ack: { color: C.tint, fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  share: { alignSelf: "flex-start", minHeight: 36, justifyContent: "center", paddingHorizontal: 2 },
  shareText: { color: C.tint, fontSize: 12, fontWeight: "900" },
  errorAck: { color: C.danger, fontSize: 12, fontWeight: "700" },
  stale: { color: "#F59E0B", fontSize: 12, fontWeight: "800" },
  srOnly: { position: "absolute", width: 1, height: 1, opacity: 0 },
});