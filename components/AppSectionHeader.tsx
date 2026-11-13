/**
 * AppSectionHeader
 *
 * Shared compact brand lockup and active tab title for top-level screens.
 *
 * Usage:
 *   <AppSectionHeader title="GAME DAY" />
 *
 * Outer position and padding are owned by the caller so each tab can align
 * the same lockup alongside its own page controls.
 */

import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import SwaygerMark from "@/components/SwaygerMark";

interface AppSectionHeaderProps {
  /** Section title displayed in large type below the brand label. */
  title: string;
  /**
   * Accessible label announced by screen readers.
   * Defaults to the title prop if omitted.
   * The brand label is hidden from the accessibility tree to avoid
   * repetitive "Swayger – Swayger" announcements.
   */
  accessibilityLabel?: string;
  testID?: string;
}

export default function AppSectionHeader({
  title,
  accessibilityLabel,
  testID,
}: AppSectionHeaderProps) {
  return (
    <View testID={testID ?? "app-section-header"}>
      <View
        style={styles.brandRow}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <SwaygerMark color={Colors.dark.tint} size={16} />
        <Text style={styles.brand}>SWAYGER</Text>
      </View>

      {/* Section title — primary heading for this screen */}
      <Text
        style={styles.title}
        accessibilityRole="header"
        accessibilityLabel={accessibilityLabel ?? title}
      >
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 16,
    marginBottom: 2,
  },
  brand: {
    fontFamily: "BarlowCondensed_700Bold",
    fontSize: 13,
    color: Colors.dark.tint,
    textTransform: "uppercase" as const,
    letterSpacing: 1.8,
    lineHeight: 16,
  },
  title: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 23,
    color: Colors.dark.text,
    letterSpacing: 0.8,
    lineHeight: 25,
  },
});
