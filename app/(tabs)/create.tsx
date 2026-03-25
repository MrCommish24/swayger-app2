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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { createSwayger, fetchMyBalance, CATEGORIES, categoryIcon } from "@/lib/swayger";
import { supabase } from "@/lib/supabase";
import { showError } from "@/lib/helpers";
import Colors from "@/constants/colors";
import CreateOnboardingBanner from "@/components/CreateOnboardingBanner";

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
    // March Madness quick-create — pre-fills the form without triggering any
    // special mode (isCounter / isOpenChallenge), so the title stays "Create Swayger"
    prefillTitle?: string;
    prefillCategory?: string;
    prefillDescription?: string;
  }>();

  const isOpenChallenge = params.openChallenge === "true";
  const isCounter = !!params.counterTitle && !params.lockedOpponentId && !isOpenChallenge;
  const isRematch = !!params.lockedOpponentId;

  const [title, setTitle] = useState(params.prefillTitle || params.counterTitle || "");
  const [description, setDescription] = useState(params.prefillDescription || params.counterDescription || "");
  const [category, setCategory] = useState(params.prefillCategory || params.counterCategory || "Sports");
  const [stakeUnits, setStakeUnits] = useState(
    params.counterStake ? Math.max(5, parseInt(params.counterStake, 10)) : 5
  );
  const [stakeNote, setStakeNote] = useState("");
  const [creatorPick, setCreatorPick] = useState(params.creatorPickPrefill || "");

  const { data: balanceData } = useQuery({
    queryKey: ["balance", user?.id],
    queryFn: () => fetchMyBalance(user!.id),
    enabled: !!user,
    staleTime: 0,
  });
  const myBalance = balanceData?.balance ?? 0;

  useEffect(() => {
    if (params.prefillTitle) {
      setTitle(params.prefillTitle);
      setDescription(params.prefillDescription || "");
      setCategory(params.prefillCategory || "Sports");
    } else if (params.counterTitle) {
      setTitle(params.counterTitle);
      setDescription(params.counterDescription || "");
      setCategory(params.counterCategory || "Sports");
      setStakeUnits(params.counterStake ? Math.max(5, parseInt(params.counterStake, 10)) : 5);
      setCreatorPick(params.creatorPickPrefill || "");
    }
  }, [params.prefillTitle, params.counterTitle]);

  const canSubmit =
    title.trim().length >= 2 &&
    creatorPick.trim().length > 0 &&
    stakeUnits >= 5 &&
    (balanceData == null || stakeUnits <= myBalance);

  const mutation = useMutation({
    mutationFn: () =>
      createSwayger(title, category, stakeUnits, creatorPick, user!.id, description, stakeNote),
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
      queryClient.invalidateQueries({ queryKey: ["balance", user?.id] });
      setTitle("");
      setDescription("");
      setCategory("Sports");
      setStakeUnits(5);
      setStakeNote("");
      setCreatorPick("");
      if (result.swayger) {
        router.push(`/swayger/${result.swayger.id}?feedback=1`);
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

        {!isCounter && !isRematch && !isOpenChallenge ? (
          <CreateOnboardingBanner />
        ) : null}

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
            {params.prefillCategory ? (
              <View style={styles.categoryLocked}>
                <Ionicons
                  name={categoryIcon(category) as keyof typeof Ionicons.glyphMap}
                  size={16}
                  color={Colors.dark.tint}
                />
                <Text style={styles.categoryLockedText}>{category}</Text>
                <Ionicons name="lock-closed-outline" size={13} color={Colors.dark.tabIconDefault} />
              </View>
            ) : (
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
            )}
          </View>

          <View>
            <View style={styles.stakeLabelRow}>
              <Text style={styles.label}>Swayger Points</Text>
              {balanceData != null && (
                <View style={styles.balancePill}>
                  <Ionicons name="wallet-outline" size={12} color={Colors.dark.accentGold} />
                  <Text style={styles.balancePillText}>{myBalance.toLocaleString()} SP available</Text>
                </View>
              )}
            </View>
            <View style={styles.stakeRow}>
              <Pressable
                style={[styles.stakeButton, stakeUnits <= 5 && styles.stakeButtonDisabled]}
                onPress={() => setStakeUnits((v) => Math.max(5, v - 1))}
                disabled={stakeUnits <= 5}
              >
                <Ionicons name="remove" size={20} color={stakeUnits <= 5 ? Colors.dark.tabIconDefault : Colors.dark.text} />
              </Pressable>
              <Text style={styles.stakeValue}>{stakeUnits}</Text>
              <Pressable
                style={[styles.stakeButton, stakeUnits >= myBalance && balanceData != null && styles.stakeButtonDisabled]}
                onPress={() => setStakeUnits((v) => balanceData != null ? Math.min(myBalance, v + 1) : v + 1)}
                disabled={balanceData != null && stakeUnits >= myBalance}
              >
                <Ionicons name="add" size={20} color={balanceData != null && stakeUnits >= myBalance ? Colors.dark.tabIconDefault : Colors.dark.text} />
              </Pressable>
            </View>
            {balanceData != null && stakeUnits > myBalance && (
              <Text style={styles.stakeError}>
                Not enough SP — you have {myBalance.toLocaleString()}
              </Text>
            )}
            <View style={styles.quickPickRow}>
              {[5, 10, 25, 50, 100].map((amount) => (
                <Pressable
                  key={amount}
                  style={({ pressed }) => [
                    styles.quickPickChip,
                    pressed && styles.quickPickChipPressed,
                  ]}
                  onPress={() => setStakeUnits((v) => {
                    const next = v + amount;
                    return balanceData != null ? Math.min(myBalance, next) : next;
                  })}
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
                onPress={() => setStakeUnits(5)}
              >
                <Text style={[styles.quickPickText, styles.quickPickClearText]}>Reset</Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>Min: 5 SP · What are you wagering for?</Text>
          </View>

          <View>
            <Text style={styles.label}>Stake Note (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder='e.g. "bragging rights" or "pizza"'
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={stakeNote}
              onChangeText={setStakeNote}
              editable={!mutation.isPending}
              maxLength={80}
            />
            <Text style={styles.hint}>Add social flavor — what's on the line beyond points.</Text>
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
  categoryLocked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(29, 161, 242, 0.08)",
    borderWidth: 1,
    borderColor: Colors.dark.tint,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: "flex-start" as const,
  },
  categoryLockedText: {
    fontSize: 14,
    fontWeight: "600" as const,
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
  stakeLabelRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 8,
  },
  balancePill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    backgroundColor: `${Colors.dark.accentGold}18`,
    borderWidth: 1,
    borderColor: `${Colors.dark.accentGold}40`,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  balancePillText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.dark.accentGold,
  },
  stakeError: {
    fontSize: 12,
    color: "#EF4444",
    marginTop: 6,
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
