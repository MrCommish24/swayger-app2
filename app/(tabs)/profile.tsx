import { StyleSheet, Text, View, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, profile, signOut } = useAuth();

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top + 20 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color={Colors.dark.tint} />
        </View>

        {profile && (
          <View style={styles.info}>
            <Text style={styles.username}>@{profile.username}</Text>
            {profile.display_name && (
              <Text style={styles.displayName}>{profile.display_name}</Text>
            )}
          </View>
        )}

        {user && (
          <Text style={styles.email}>{user.email}</Text>
        )}
      </View>

      <View style={[styles.bottomArea, { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 100 }]}>
        <Pressable
          style={({ pressed }) => [styles.signOutButton, pressed && styles.buttonPressed]}
          onPress={signOut}
        >
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
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
    gap: 12,
    paddingHorizontal: 40,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.surface,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  info: {
    alignItems: "center",
    gap: 4,
  },
  username: {
    fontSize: 20,
    fontWeight: "bold" as const,
    color: Colors.dark.text,
  },
  displayName: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
  email: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
  },
  bottomArea: {
    paddingHorizontal: 24,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  buttonPressed: {
    opacity: 0.7,
  },
  signOutText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "600" as const,
  },
});
