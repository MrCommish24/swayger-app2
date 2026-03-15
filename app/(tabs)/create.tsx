import { useState, useEffect } from "react";
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
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { createSwayger, CATEGORIES } from "@/lib/swayger";
import { supabase } from "@/lib/supabase";
import { showError } from "@/lib/helpers";
import Colors from "@/constants/colors";

export default function CreateSwaygerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    counterTitle?: string;
    counterCategory?: string;
    counterDescription?: string;
    counterStake?: string;
    counterOpponentUsername?: string;
    lockedOpponentId?: string;
    lockedOpponentUsername?: string;
    sourceSwaygerIdForEdit?: string;
    rematchTypeForEdit?: string;
    creatorPickPrefill?: string;
    openChallenge?: string;
  }>();

  const isOpenChallenge = params.openChallenge === "true";
  const isCounter = !!params.counterTitle && !params.lockedOpponentId && !isOpenChallenge;
  const isRematch = !!params.lockedOpponentId;

  const [title, setTitle] = useState(params.counterTitle || "");
  const [description, setDescription] = useState(params.counterDescription || "");
  const [category, setCategory] = useState(params.counterCategory || "Sports");
  const [stakeUnits, setStakeUnits] = useState(params.counterStake ? parseInt(params.counterStake, 10) : 0);
  const [creatorPick, setCreatorPick] = useState(params.creatorPickPrefill || "");

  useEffect(() => {
    if (params.counterTitle) {
      setTitle(params.counterTitle);
      setDescription(params.counterDescription || "");
      setCategory(params.counterCategory || "Sports");
      setStakeUnits(params.counterStake ? parseInt(params.counterStake, 10) : 0);
      setCreatorPick(params.creatorPickPrefill || "");
    }
  }, [params.counterTitle]);

  const canSubmit = title.trim().length >= 2 && creatorPick.trim().length > 0 && stakeUnits >= 1;

  const mutation = useMutation({
    mutationFn: () =>
      createSwayger(title, category, stakeUnits, creatorPick, user!.id, description),
    onSuccess: async (result) => {
      if (result.error) {
        showError(result.error);
        return;
      }
      if (result.swayger && params.lockedOpponentId) {
        const updates: Record<string, unknown> = { opponent_id: params.lockedOpponentId };
        if (params.sourceSwaygerIdForEdit) {
          updates.source_swayger_id = params.sourceSwaygerIdForEdit;
          updates.rematch_type = params.rematchTypeForEdit;
        }
        await supabase.from("swaygers").update(updates).eq("id", result.swayger.id);
      }
      queryClient.invalidateQueries({ queryKey: ["swaygers"] });
      setTitle("");
      setDescription("");
      setCategory("Sports");
      setStakeUnits(0);
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
          <Text style={styles.title}>
            {isRematch
              ? (params.rematchTypeForEdit === "double_or_nothing" ? "Double or Nothing" : "Run it Back")
              : isOpenChallenge ? "Same Swayger, New Opponent"
              : isCounter ? "Counter Offer" : "Create Swayger"}
          </Text>
          <Text style={styles.subtitle}>
            {isRematch
              ? `vs @${params.lockedOpponentUsername || "opponent"}`
              : isOpenChallenge ? "Adjust any terms, then send it"
              : isCounter && params.counterOpponentUsername
              ? `Countering @${params.counterOpponentUsername}'s invite`
              : "Set up a 1v1 wager"}
          </Text>
        </View>

        {isCounter && (
          <View style={styles.counterBanner}>
            <Ionicons name="swap-horizontal" size={16} color={Colors.dark.tint} />
            <Text style={styles.counterBannerText}>
              Terms pre-filled from the original invite. Adjust anything you want, then share your counter.
            </Text>
          </View>
        )}

        {isOpenChallenge && (
          <View style={styles.counterBanner}>
            <Ionicons name="person-add-outline" size={16} color={Colors.dark.tint} />
            <Text style={styles.counterBannerText}>
              Same terms, new opponent. Adjust anything before you send it.
            </Text>
          </View>
        )}

        {isRematch && (
          <View style={styles.lockedOpponentBanner}>
            <View style={styles.lockedOpponentLeft}>
              <Ionicons
                name={params.rematchTypeForEdit === "double_or_nothing" ? "flame" : "refresh"}
                size={16}
                color={params.rematchTypeForEdit === "double_or_nothing" ? Colors.dark.accentGold : Colors.dark.tint}
              />
              <Text style={styles.lockedOpponentText}>
                Rematch vs{" "}
                <Text style={styles.lockedOpponentName}>@{params.lockedOpponentUsername}</Text>
                {" "}— edit any terms before sending.
              </Text>
            </View>
          </View>
        )}

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
                style={[styles.stakeButton, stakeUnits === 0 && styles.stakeButtonDisabled]}
                onPress={() => setStakeUnits((v) => Math.max(0, v - 1))}
                disabled={stakeUnits === 0}
              >
                <Ionicons name="remove" size={20} color={stakeUnits === 0 ? Colors.dark.tabIconDefault : Colors.dark.text} />
              </Pressable>
              <Text style={[styles.stakeValue, stakeUnits === 0 && styles.stakeValueZero]}>
                {stakeUnits === 0 ? "—" : stakeUnits}
              </Text>
              <Pressable
                style={styles.stakeButton}
                onPress={() => setStakeUnits((v) => Math.min(10000, v + 1))}
              >
                <Ionicons name="add" size={20} color={Colors.dark.text} />
              </Pressable>
            </View>
            <View style={styles.quickPickRow}>
              {[5, 10, 25, 50].map((amount) => (
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
                onPress={() => setStakeUnits(0)}
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
  counterBanner: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 8,
    backgroundColor: `${Colors.dark.tint}15`,
    borderWidth: 1,
    borderColor: `${Colors.dark.tint}40`,
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 24,
    marginBottom: 4,
  },
  counterBannerText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.tint,
    lineHeight: 18,
  },
  lockedOpponentBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 24,
    marginBottom: 4,
  },
  lockedOpponentLeft: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 8,
  },
  lockedOpponentText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  lockedOpponentName: {
    fontWeight: "600" as const,
    color: Colors.dark.text,
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
  stakeValueZero: {
    color: Colors.dark.tabIconDefault,
    fontSize: 24,
  },
  stakeButtonDisabled: {
    opacity: 0.35,
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
