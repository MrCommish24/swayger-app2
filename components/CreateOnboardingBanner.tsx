import React, { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const ONBOARDING_KEY = "swayger_onboarding_v1_dismissed";
const GOLD = "#F5A623";

const TIPS = [
  {
    icon: "create-outline" as const,
    title: "Name the wager",
    sub: "Make it specific — your opponent needs to know exactly what they're picking against.",
  },
  {
    icon: "checkmark-circle-outline" as const,
    title: "Pick your side first",
    sub: "You lock in your prediction now. They add theirs after joining with your invite code.",
  },
  {
    icon: "people-outline" as const,
    title: "You both settle it",
    sub: "No automatic scores. Once the outcome is clear, you two confirm the result together.",
  },
];

export default function CreateOnboardingBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      if (!val) setVisible(true);
    });
  }, []);

  function dismiss() {
    setVisible(false);
    AsyncStorage.setItem(ONBOARDING_KEY, "1");
  }

  if (!visible) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="flash" size={13} color={GOLD} />
          <Text style={styles.headerText}>First time? Here's how it works</Text>
        </View>
        <Pressable onPress={dismiss} hitSlop={14} testID="onboarding-dismiss">
          <Ionicons name="close" size={18} color="#6B7280" />
        </Pressable>
      </View>

      {TIPS.map((tip, i) => (
        <View key={tip.title} style={[styles.tip, i > 0 && styles.tipDivider]}>
          <View style={styles.tipIcon}>
            <Ionicons name={tip.icon} size={15} color={GOLD} />
          </View>
          <View style={styles.tipText}>
            <Text style={styles.tipTitle}>{tip.title}</Text>
            <Text style={styles.tipSub}>{tip.sub}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.2)",
    padding: 14,
    gap: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 6,
  },
  headerText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: GOLD,
  },
  tip: {
    flexDirection: "row" as const,
    alignItems: "flex-start",
    gap: 10,
  },
  tipDivider: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  tipIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(245,166,35,0.1)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
  },
  tipText: {
    flex: 1,
    gap: 2,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  tipSub: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    lineHeight: 17,
  },
});
