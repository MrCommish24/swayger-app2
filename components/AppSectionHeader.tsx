/**
 * AppSectionHeader
 *
 * Lightweight branded header for the four top-level tab screens.
 * Renders the Swayger brand label (small, accent-colored) above the
 * section title (large, primary) so every top-level screen is clearly
 * attributable to the app without repeating the full sign-in lockup.
 *
 * Usage:
 *   <AppSectionHeader title="GAME DAY" />
 *
 * Drop this inside the existing `header` container on each tab screen —
 * outer padding and row layout are owned by the caller.
 */

import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

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
    <View testID={testID}>
      {/* Brand label — decorative; hidden from a11y tree */}
      <Text
        style={styles.brand}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        SWAYGER
      </Text>

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
  brand: {
    fontFamily: "BarlowCondensed_700Bold",
    fontSize: 11,
    color: Colors.dark.tint,
    textTransform: "uppercase" as const,
    letterSpacing: 2,
    lineHeight: 14,
  },
  title: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 32,
    color: Colors.dark.text,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    lineHeight: 34,
  },
});
