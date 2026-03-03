import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { createSwayger } from "@/lib/swayger";
import { showError } from "@/lib/helpers";
import Colors from "@/constants/colors";

const SPORT_OPTIONS = [
  { value: "NFL", label: "NFL", icon: "american-football-outline" as const },
  { value: "NBA", label: "NBA", icon: "basketball-outline" as const },
  { value: "MLB", label: "MLB", icon: "baseball-outline" as const },
  { value: "Soccer", label: "Soccer", icon: "football-outline" as const },
  { value: "NHL", label: "NHL", icon: "snow-outline" as const },
  { value: "Other", label: "Other", icon: "trophy-outline" as const },
];

export default function CreateSwaygerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("NFL");
  const [stake, setStake] = useState("");

  const mutation = useMutation({
    mutationFn: () => createSwayger(title, sport, user!.id),
    onSuccess: (result) => {
      if (result.error) {
        showError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["swaygers"] });
      setTitle("");
      setSport("NFL");
      setStake("");
      if (result.swayger) {
        router.push(`/swayger/${result.swayger.id}`);
      } else {
        router.push("/(tabs)");
      }
    },
    onError: () => {
      showError("Something went wrong. Try again.");
    },
  });

  function handleCreate() {
    if (!title.trim()) {
      showError("Please enter a title for your Swayger.");
      return;
    }
    if (title.trim().length < 2) {
      showError("Title must be at least 2 characters.");
      return;
    }
    mutation.mutate();
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: isWeb ? 67 : insets.top + 20 }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Create Swayger</Text>
          <Text style={styles.subtitle}>
            Set up a new wager for your crew
          </Text>
        </View>

        <View style={styles.form}>
          <View>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Sunday NFL Picks"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={title}
              onChangeText={setTitle}
              editable={!mutation.isPending}
              maxLength={50}
            />
          </View>

          <View>
            <Text style={styles.label}>Sport</Text>
            <View style={styles.sportGrid}>
              {SPORT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.sportOption,
                    sport === opt.value && styles.sportOptionActive,
                  ]}
                  onPress={() => setSport(opt.value)}
                >
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={
                      sport === opt.value
                        ? Colors.dark.tint
                        : Colors.dark.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.sportLabel,
                      sport === opt.value && styles.sportLabelActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View>
            <Text style={styles.label}>Stake (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Loser buys dinner"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={stake}
              onChangeText={setStake}
              editable={!mutation.isPending}
              maxLength={100}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              (mutation.isPending || !title.trim()) && styles.buttonDisabled,
            ]}
            onPress={handleCreate}
            disabled={mutation.isPending || !title.trim()}
          >
            {mutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="flash" size={20} color="#FFFFFF" />
                <Text style={styles.buttonText}>Create Swayger</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold" as const,
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
  },
  form: {
    paddingHorizontal: 24,
    gap: 24,
    marginTop: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
    marginBottom: 8,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.dark.text,
  },
  sportGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  sportOption: {
    flexBasis: "30%",
    flexGrow: 1,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: "center",
    gap: 6,
    flexDirection: "row",
  },
  sportOptionActive: {
    borderColor: Colors.dark.tint,
    backgroundColor: "rgba(29, 161, 242, 0.08)",
  },
  sportLabel: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontWeight: "500" as const,
  },
  sportLabelActive: {
    color: Colors.dark.tint,
  },
  button: {
    backgroundColor: Colors.dark.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600" as const,
  },
});
