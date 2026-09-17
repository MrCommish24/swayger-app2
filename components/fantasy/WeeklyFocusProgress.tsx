import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import { progressDotState } from "@/lib/fantasy-focused-run";

const C = Colors.dark;

type Props = {
  total: number;
  currentIndex: number;
  items: { title?: string; completed: boolean; status: string; active: boolean; stale?: boolean }[];
  onSelect: (index: number) => void;
  disabled?: boolean;
};

export function WeeklyFocusProgress({ total, currentIndex, items, onSelect, disabled }: Props) {
  const answered = items.filter((item) => item.completed).length;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={`${answered} of ${total} calls made. Pick ${currentIndex + 1} of ${total}.`} accessibilityValue={{ min: 0, max: total, now: answered }}>
      <View style={styles.topline}>
        <Text style={styles.counter}>Pick {currentIndex + 1} of {total}</Text>
        <Text style={styles.answered}>{answered} of {total} calls made</Text>
      </View>
      <View style={styles.segments}>
        {Array.from({ length: total }, (_, index) => {
          const item = items[index];
          const complete = item?.completed;
          const active = item?.active;
            const stale = item?.stale;
            const statusText = stale ? "needs review" : item?.status === "saving" ? "saving" : item?.status === "error" ? "save failed" : complete ? "completed" : "unanswered";
          const dotState = progressDotState(index, currentIndex, Boolean(complete));
          const dotSize = dotState === "current" ? 12 : dotState === "recent_completed" ? 9 : dotState === "completed" ? 7 : 6;
          return (
            <Pressable
              key={index}
              disabled={Boolean(disabled)}
              onPress={() => onSelect(index)}
              {...({ onKeyPress: (event: any) => {
                if (event.nativeEvent.key === "Enter" || event.nativeEvent.key === " ") onSelect(index);
              } } as any)}
              accessibilityRole="button"
               accessibilityLabel={`Pick ${index + 1}, ${statusText}${item?.title ? `, ${item.title}` : ""}${active ? ", current" : ""}`}
              accessibilityState={{ selected: active, disabled: Boolean(disabled) }}
              style={styles.segmentHit}
            >
              <View style={[styles.segment, { width: dotSize, height: dotSize }, complete && styles.complete, stale && styles.stale, active && styles.active]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 9 },
  counter: { color: C.text, fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
  answered: { color: C.textMuted, fontSize: 12, fontWeight: "600" },
  segments: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  segmentHit: { flex: 1, minWidth: 10, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  segment: { borderRadius: 8, backgroundColor: C.border },
  complete: { backgroundColor: C.tint },
  stale: { backgroundColor: "#F59E0B" },
  active: { backgroundColor: C.text, borderWidth: 2, borderColor: C.tint },
});