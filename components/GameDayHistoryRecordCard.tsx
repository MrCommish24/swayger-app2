import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import {
  formatHistoryDate,
  historyContext,
  type GameDayHistoryRecord,
} from "@/lib/gameday-history";

const C = Colors.dark;

export default function HistoryRecordCard({
  record,
  onPress,
  compact = false,
}: {
  record: GameDayHistoryRecord;
  onPress: () => void;
  compact?: boolean;
}) {
  const person = record.participant;
  const status = record.state === "final" ? "FINAL" : "RESULTS PENDING";
  const personalSummary = [
    person.rank !== null ? `#${person.rank}` : null,
    person.game_day_sp !== null ? `${person.game_day_sp} SP` : null,
    person.correct_picks !== undefined ? `${person.correct_picks} correct` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${record.room.room_name}, ${status.toLowerCase()}, view ${record.state === "final" ? "receipt" : "results"}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.compactCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.topLine}>
        <View style={[styles.stateDot, record.state === "final" && styles.finalDot]} />
        <Text style={[styles.state, record.state === "final" && styles.finalState]}>
          {status}
        </Text>
        {record.room.archived ? <Text style={styles.archived}>ARCHIVED</Text> : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>{record.room.room_name}</Text>
      <Text style={styles.context}>
        {historyContext(record.room) || formatHistoryDate(record.room.game_date || record.room.created_at)}
      </Text>
      <View style={styles.footer}>
        <View style={styles.summary}>
          {personalSummary ? <Text style={styles.result}>{personalSummary}</Text> : null}
          <Text style={styles.count}>
            {record.participant_count} {record.participant_count === 1 ? "participant" : "participants"}
          </Text>
        </View>
        <Text style={styles.cta}>
          {record.state === "final" ? "View Receipt" : "View Results"}
          <Text style={styles.arrow}>  ›</Text>
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  compactCard: { padding: 14, marginBottom: 8 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  topLine: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  stateDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accentGold, marginRight: 7 },
  finalDot: { backgroundColor: C.tint },
  state: { color: C.accentGold, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  finalState: { color: C.tint },
  archived: {
    marginLeft: "auto",
    color: C.textMuted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  title: { color: C.text, fontSize: 17, fontWeight: "700", lineHeight: 22 },
  context: { color: C.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 13,
    paddingTop: 11,
  },
  summary: { flex: 1 },
  result: { color: C.accentGold, fontSize: 12, fontWeight: "700" },
  count: { color: C.textSecondary, fontSize: 12, marginTop: 3 },
  cta: { color: C.tint, fontSize: 12, fontWeight: "700" },
  arrow: { fontSize: 17 },
});
