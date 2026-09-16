import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { getWeeklyMoment } from "@/lib/fantasy-weekly-moments";
import Colors from "@/constants/colors";

const C = Colors.dark;

export function WeeklyMomentLabel({
  templatePropId,
  compact = false,
  settlement = false,
}: {
  templatePropId?: string | null;
  compact?: boolean;
  settlement?: boolean;
}) {
  const moment = getWeeklyMoment(templatePropId);
  if (!moment) return null;
  return (
    <View style={[styles.root, compact && styles.compactRoot]}>
      <Text style={[styles.title, compact && styles.compactTitle]}>{moment.title}</Text>
      {!compact && (
        <Text style={styles.definition}>
          {settlement && moment.settlementNote ? moment.settlementNote : moment.shortDefinition}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 3, marginBottom: 2 },
  compactRoot: { marginBottom: 1 },
  title: { color: C.tint, fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  compactTitle: { fontSize: 11, letterSpacing: 0.25 },
  definition: { color: C.textMuted, fontSize: 12, lineHeight: 17 },
});