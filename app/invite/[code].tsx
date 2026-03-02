import { StyleSheet, Text, View, Platform } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";

export default function InviteScreen() {
  const { code } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top + 20 }]}>
      <View style={styles.content}>
        <Text style={styles.title}>Invite</Text>
        <Text style={styles.subtitle}>Code: {code}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold" as const,
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
});
