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
import { createWorkspace } from "@/lib/workspace";
import { showError } from "@/lib/helpers";
import Colors from "@/constants/colors";

const SCORING_OPTIONS = [
  { value: "points", label: "Points", icon: "star-outline" as const },
  { value: "wins", label: "Win/Loss", icon: "trophy-outline" as const },
  { value: "spread", label: "Spread", icon: "trending-up-outline" as const },
  { value: "custom", label: "Custom", icon: "settings-outline" as const },
];

export default function CreateWorkspaceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [scoringType, setScoringType] = useState("points");

  const mutation = useMutation({
    mutationFn: () => createWorkspace(name, scoringType, user!.id),
    onSuccess: (result) => {
      if (result.error) {
        showError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setName("");
      setScoringType("points");
      if (result.workspace) {
        router.push(`/workspace/${result.workspace.id}`);
      } else {
        router.push("/(tabs)");
      }
    },
    onError: () => {
      showError("Something went wrong. Try again.");
    },
  });

  function handleCreate() {
    if (!name.trim()) {
      showError("Please enter a workspace name.");
      return;
    }
    if (name.trim().length < 2) {
      showError("Name must be at least 2 characters.");
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
          <Text style={styles.title}>Create Workspace</Text>
          <Text style={styles.subtitle}>
            Set up a league for your group
          </Text>
        </View>

        <View style={styles.form}>
          <View>
            <Text style={styles.label}>Workspace Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Sunday League"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={name}
              onChangeText={setName}
              editable={!mutation.isPending}
              maxLength={50}
            />
          </View>

          <View>
            <Text style={styles.label}>Scoring Type</Text>
            <View style={styles.scoringGrid}>
              {SCORING_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.scoringOption,
                    scoringType === opt.value && styles.scoringOptionActive,
                  ]}
                  onPress={() => setScoringType(opt.value)}
                >
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={
                      scoringType === opt.value
                        ? Colors.dark.tint
                        : Colors.dark.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.scoringLabel,
                      scoringType === opt.value && styles.scoringLabelActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              (mutation.isPending || !name.trim()) && styles.buttonDisabled,
            ]}
            onPress={handleCreate}
            disabled={mutation.isPending || !name.trim()}
          >
            {mutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="add" size={20} color="#FFFFFF" />
                <Text style={styles.buttonText}>Create Workspace</Text>
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
  scoringGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  scoringOption: {
    flexBasis: "47%",
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
  scoringOptionActive: {
    borderColor: Colors.dark.tint,
    backgroundColor: "rgba(29, 161, 242, 0.08)",
  },
  scoringLabel: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontWeight: "500" as const,
  },
  scoringLabelActive: {
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
