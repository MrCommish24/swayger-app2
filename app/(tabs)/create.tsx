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
import { createSwayger, CATEGORIES } from "@/lib/swayger";
import { showError } from "@/lib/helpers";
import Colors from "@/constants/colors";

export default function CreateSwaygerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Sports");
  const [stakeUnits, setStakeUnits] = useState(1);
  const [creatorPick, setCreatorPick] = useState("");

  const canSubmit = title.trim().length >= 2 && creatorPick.trim().length > 0;

  const mutation = useMutation({
    mutationFn: () =>
      createSwayger(title, category, stakeUnits, creatorPick, user!.id, description),
    onSuccess: (result) => {
      if (result.error) {
        showError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["swaygers"] });
      setTitle("");
      setDescription("");
      setCategory("Sports");
      setStakeUnits(1);
      setCreatorPick("");
      if (result.swayger) {
        router.push(`/swayger/${result.swayger.id}`);
      } else {
        router.push("/(tabs)");
      }
    },
    onError: () => showError("Something went wrong. Try again."),
  });

  function handleCreate() {
    if (!title.trim()) {
      showError("Please enter a title.");
      return;
    }
    if (!creatorPick.trim()) {
      showError("Please enter your pick/prediction.");
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
          <Text style={styles.subtitle}>Set up a 1v1 wager</Text>
        </View>

        <View style={styles.form}>
          <View>
            <Text style={styles.label}>What's the Swayger?</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Bills vs Chiefs Winner"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={title}
              onChangeText={setTitle}
              editable={!mutation.isPending}
              maxLength={60}
            />
          </View>

          <View>
            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Add context or rules..."
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={description}
              onChangeText={setDescription}
              editable={!mutation.isPending}
              maxLength={280}
              multiline
              numberOfLines={3}
            />
          </View>

          <View>
            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat.value}
                  style={[
                    styles.categoryOption,
                    category === cat.value && styles.categoryOptionActive,
                  ]}
                  onPress={() => setCategory(cat.value)}
                >
                  <Ionicons
                    name={cat.icon}
                    size={18}
                    color={
                      category === cat.value
                        ? Colors.dark.tint
                        : Colors.dark.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.categoryLabel,
                      category === cat.value && styles.categoryLabelActive,
                    ]}
                  >
                    {cat.value}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View>
            <Text style={styles.label}>Stake (units)</Text>
            <View style={styles.stakeRow}>
              <Pressable
                style={styles.stakeButton}
                onPress={() => setStakeUnits((v) => Math.max(1, v - 1))}
              >
                <Ionicons name="remove" size={20} color={Colors.dark.text} />
              </Pressable>
              <Text style={styles.stakeValue}>{stakeUnits}</Text>
              <Pressable
                style={styles.stakeButton}
                onPress={() => setStakeUnits((v) => Math.min(10000, v + 1))}
              >
                <Ionicons name="add" size={20} color={Colors.dark.text} />
              </Pressable>
            </View>
            <View style={styles.quickPickRow}>
              {[10, 25, 50, 100].map((amount) => (
                <Pressable
                  key={amount}
                  style={({ pressed }) => [
                    styles.quickPickChip,
                    pressed && styles.quickPickChipPressed,
                  ]}
                  onPress={() => setStakeUnits((v) => Math.min(10000, v + amount))}
                >
                  <Text style={styles.quickPickText}>+{amount}</Text>
                </Pressable>
              ))}
              <Pressable
                style={({ pressed }) => [
                  styles.quickPickChip,
                  styles.quickPickClear,
                  pressed && styles.quickPickChipPressed,
                ]}
                onPress={() => setStakeUnits(1)}
              >
                <Text style={[styles.quickPickText, styles.quickPickClearText]}>Reset</Text>
              </Pressable>
            </View>
          </View>

          <View>
            <Text style={styles.label}>Your Pick</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Bills win by 7+"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={creatorPick}
              onChangeText={setCreatorPick}
              editable={!mutation.isPending}
              maxLength={200}
            />
            <Text style={styles.hint}>
              Your opponent will set their pick when they accept.
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              (mutation.isPending || !canSubmit) && styles.buttonDisabled,
            ]}
            onPress={handleCreate}
            disabled={mutation.isPending || !canSubmit}
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
  hint: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    marginTop: 6,
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
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  categoryOption: {
    flexBasis: "46%",
    flexGrow: 1,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 6,
    flexDirection: "row",
  },
  categoryOptionActive: {
    borderColor: Colors.dark.tint,
    backgroundColor: "rgba(29, 161, 242, 0.08)",
  },
  categoryLabel: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "500" as const,
  },
  categoryLabelActive: {
    color: Colors.dark.tint,
  },
  stakeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    alignSelf: "flex-start",
  },
  quickPickRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    flexWrap: "wrap",
  },
  quickPickChip: {
    backgroundColor: "rgba(29, 161, 242, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(29, 161, 242, 0.3)",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  quickPickChipPressed: {
    opacity: 0.65,
  },
  quickPickText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.tint,
  },
  quickPickClear: {
    backgroundColor: "transparent",
    borderColor: Colors.dark.border,
  },
  quickPickClearText: {
    color: Colors.dark.tabIconDefault,
  },
  stakeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stakeValue: {
    fontSize: 28,
    fontWeight: "bold" as const,
    color: Colors.dark.tint,
    minWidth: 40,
    textAlign: "center",
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
