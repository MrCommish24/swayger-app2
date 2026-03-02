import { StyleSheet, Text, View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import Colors from "@/constants/colors";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={styles.content}>
        <Ionicons name="person-outline" size={48} color={Colors.dark.tint} />
        <Text style={styles.subtitle}>Your profile will appear here.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold" as const,
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 40,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
});
