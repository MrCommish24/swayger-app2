import { StyleSheet, Text, View, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import Colors from "@/constants/colors";

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Swayger</Text>
      </View>

      <View style={styles.content}>
        <Ionicons name="flash-outline" size={48} color={Colors.dark.tint} />
        <Text style={styles.subtitle}>Your active swaygers will appear here.</Text>
      </View>

      <View style={[styles.bottomArea, { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 100 }]}>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => router.push("/(tabs)/create")}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.buttonText}>Create Swayger</Text>
        </Pressable>
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
  bottomArea: {
    paddingHorizontal: 24,
  },
  button: {
    backgroundColor: Colors.dark.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600" as const,
  },
});
