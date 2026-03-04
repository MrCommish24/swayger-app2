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
import { LegInput } from "@/types";
import Colors from "@/constants/colors";

const SPORT_OPTIONS = [
  { value: "NFL", label: "NFL", icon: "american-football-outline" as const },
  { value: "NBA", label: "NBA", icon: "basketball-outline" as const },
  { value: "MLB", label: "MLB", icon: "baseball-outline" as const },
  { value: "Soccer", label: "Soccer", icon: "football-outline" as const },
  { value: "NHL", label: "NHL", icon: "snow-outline" as const },
  { value: "Other", label: "Other", icon: "trophy-outline" as const },
];

const MARKET_TYPES = [
  { value: "player_prop", label: "Player Prop" },
  { value: "spread", label: "Spread" },
  { value: "moneyline", label: "Moneyline" },
  { value: "over_under", label: "Over/Under" },
  { value: "team_total", label: "Team Total" },
  { value: "custom", label: "Custom" },
];

const EMPTY_LEG: LegInput = { market_type: "custom", selection: "", odds: "", line: "" };

export default function CreateSwaygerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("NFL");
  const [stake, setStake] = useState("");
  const [legs, setLegs] = useState<LegInput[]>([{ ...EMPTY_LEG }]);

  function updateLeg(index: number, field: keyof LegInput, value: string) {
    setLegs((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function addLeg() {
    setLegs((prev) => [...prev, { ...EMPTY_LEG }]);
  }

  function removeLeg(index: number) {
    if (legs.length <= 1) return;
    setLegs((prev) => prev.filter((_, i) => i !== index));
  }

  const hasValidLeg = legs.some((l) => l.selection.trim().length > 0);

  const mutation = useMutation({
    mutationFn: () => createSwayger(title, sport, user!.id, stake, legs),
    onSuccess: (result) => {
      if (result.error) {
        showError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["swaygers"] });
      setTitle("");
      setSport("NFL");
      setStake("");
      setLegs([{ ...EMPTY_LEG }]);
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
    if (!hasValidLeg) {
      showError("Add at least one pick/leg with a selection.");
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
                    size={18}
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

          <View>
            <Text style={styles.label}>Picks / Legs</Text>
            {legs.map((leg, index) => (
              <View key={index} style={styles.legCard}>
                <View style={styles.legHeader}>
                  <Text style={styles.legNumber}>Leg {index + 1}</Text>
                  {legs.length > 1 && (
                    <Pressable onPress={() => removeLeg(index)}>
                      <Ionicons name="close-circle" size={22} color="#EF4444" />
                    </Pressable>
                  )}
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.marketTypeScroll}
                >
                  {MARKET_TYPES.map((mt) => (
                    <Pressable
                      key={mt.value}
                      style={[
                        styles.marketChip,
                        leg.market_type === mt.value && styles.marketChipActive,
                      ]}
                      onPress={() => updateLeg(index, "market_type", mt.value)}
                    >
                      <Text
                        style={[
                          styles.marketChipText,
                          leg.market_type === mt.value && styles.marketChipTextActive,
                        ]}
                      >
                        {mt.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <TextInput
                  style={styles.input}
                  placeholder="e.g. Josh Allen OVER 1.5 Pass TDs"
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  value={leg.selection}
                  onChangeText={(v) => updateLeg(index, "selection", v)}
                  editable={!mutation.isPending}
                  maxLength={200}
                />

                <View style={styles.legRow}>
                  <View style={styles.legRowField}>
                    <Text style={styles.miniLabel}>Line</Text>
                    <TextInput
                      style={[styles.input, styles.miniInput]}
                      placeholder="-3.5"
                      placeholderTextColor={Colors.dark.tabIconDefault}
                      value={leg.line}
                      onChangeText={(v) => updateLeg(index, "line", v)}
                      editable={!mutation.isPending}
                      maxLength={20}
                    />
                  </View>
                  <View style={styles.legRowField}>
                    <Text style={styles.miniLabel}>Odds</Text>
                    <TextInput
                      style={[styles.input, styles.miniInput]}
                      placeholder="-110"
                      placeholderTextColor={Colors.dark.tabIconDefault}
                      value={leg.odds}
                      onChangeText={(v) => updateLeg(index, "odds", v)}
                      editable={!mutation.isPending}
                      maxLength={20}
                    />
                  </View>
                </View>
              </View>
            ))}

            <Pressable style={styles.addLegButton} onPress={addLeg}>
              <Ionicons name="add-circle-outline" size={20} color={Colors.dark.tint} />
              <Text style={styles.addLegText}>Add another leg</Text>
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              (mutation.isPending || !title.trim() || !hasValidLeg) && styles.buttonDisabled,
            ]}
            onPress={handleCreate}
            disabled={mutation.isPending || !title.trim() || !hasValidLeg}
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
  miniLabel: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    marginBottom: 4,
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
  miniInput: {
    paddingVertical: 10,
    fontSize: 14,
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
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 4,
    flexDirection: "row",
  },
  sportOptionActive: {
    borderColor: Colors.dark.tint,
    backgroundColor: "rgba(29, 161, 242, 0.08)",
  },
  sportLabel: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "500" as const,
  },
  sportLabelActive: {
    color: Colors.dark.tint,
  },
  legCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 14,
    gap: 10,
    marginBottom: 10,
  },
  legHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  legNumber: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.tint,
  },
  marketTypeScroll: {
    marginHorizontal: -4,
  },
  marketChip: {
    backgroundColor: Colors.dark.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginHorizontal: 3,
  },
  marketChipActive: {
    backgroundColor: "rgba(29, 161, 242, 0.15)",
    borderWidth: 1,
    borderColor: Colors.dark.tint,
  },
  marketChipText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontWeight: "500" as const,
  },
  marketChipTextActive: {
    color: Colors.dark.tint,
  },
  legRow: {
    flexDirection: "row",
    gap: 10,
  },
  legRowField: {
    flex: 1,
  },
  addLegButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
  },
  addLegText: {
    fontSize: 14,
    color: Colors.dark.tint,
    fontWeight: "500" as const,
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
