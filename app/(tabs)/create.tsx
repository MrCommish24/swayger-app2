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

const CONFIDENCE_TIERS = [
  {
    label: "Gut Feeling",
    points: 10,
    description: "Worth calling out",
    icon: "help-circle-outline" as const,
  },
  {
    label: "Pretty Sure",
    points: 25,
    description: "I'd stand on this",
    icon: "checkmark-circle-outline" as const,
  },
  {
    label: "No Doubt",
    points: 50,
    description: "Lock it in",
    icon: "lock-closed-outline" as const,
  },
];

function getConfidenceTier(units: number) {
  return CONFIDENCE_TIERS.find((t) => t.points === units) ?? null;
}

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
    params.counterStake ? Math.max(10, parseInt(params.counterStake, 10)) : 10
  );
  const [stakeNote, setStakeNote] = useState("");
  const [showCustomStake, setShowCustomStake] = useState(false);
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
    stakeUnits >= 10 &&
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
      setStakeUnits(10);
      setShowCustomStake(false);
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
              <Text style={styles.label}>How sure are you?</Text>
              {balanceData != null && (
                <View style={styles.balancePill}>
                  <Ionicons name="wallet-outline" size={12} color={Colors.dark.accentGold} />
                  <Text style={styles.balancePillText}>{myBalance.toLocaleString()} SP available</Text>
                </View>
              )}
            </View>

            {/* Confidence tier cards */}
            <View style={styles.tierList}>
              {CONFIDENCE_TIERS.map((tier) => {
                const isSelected = stakeUnits === tier.points && !showCustomStake;
                const insufficient = balanceData != null && tier.points > myBalance;
                return (
                  <Pressable
                    key={tier.label}
                    style={[
                      styles.tierCard,
                      isSelected && styles.tierCardSelected,
                      insufficient && styles.tierCardDisabled,
                    ]}
                    onPress={() => {
                      if (!insufficient) {
                        setStakeUnits(tier.points);
                        setShowCustomStake(false);
                      }
                    }}
                    disabled={insufficient || mutation.isPending}
                  >
                    <View style={styles.tierLeft}>
                      <Ionicons
                        name={tier.icon}
                        size={20}
                        color={isSelected ? Colors.dark.tint : Colors.dark.textSecondary}
                      />
                      <View>
                        <Text style={[styles.tierLabel, isSelected && styles.tierLabelSelected]}>
                          {tier.label}
                        </Text>
                        <Text style={styles.tierDescription}>{tier.description}</Text>
                      </View>
                    </View>
                    <Text style={[styles.tierPoints, isSelected && styles.tierPointsSelected]}>
                      {tier.points} SP
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {balanceData != null && stakeUnits > myBalance && (
              <Text style={styles.stakeError}>
                Not enough SP — you have {myBalance.toLocaleString()}
              </Text>
            )}

            {/* Custom amount escape hatch */}
            {!showCustomStake ? (
              <Pressable
                style={styles.customToggle}
                onPress={() => setShowCustomStake(true)}
              >
                <Ionicons name="create-outline" size={13} color={Colors.dark.tabIconDefault} />
                <Text style={styles.customToggleText}>Enter custom amount</Text>
              </Pressable>
            ) : (
              <View style={styles.customSection}>
                <View style={styles.customInputRow}>
                  <TextInput
                    style={styles.customInput}
                    placeholder="Min 10 SP"
                    placeholderTextColor={Colors.dark.tabIconDefault}
                    keyboardType="numeric"
                    value={stakeUnits > 0 ? String(stakeUnits) : ""}
                    onChangeText={(v) => {
                      const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
                      if (!isNaN(n)) {
                        setStakeUnits(
                          balanceData != null
                            ? Math.min(myBalance, Math.max(10, n))
                            : Math.max(10, n)
                        );
                      } else if (v === "") {
                        setStakeUnits(10);
                      }
                    }}
                    editable={!mutation.isPending}
                    maxLength={6}
                  />
                  <Text style={styles.customSPLabel}>SP</Text>
                  <Pressable
                    onPress={() => { setShowCustomStake(false); setStakeUnits(10); }}
                    style={styles.customClear}
                  >
                    <Text style={styles.customClearText}>Use tiers</Text>
                  </Pressable>
                </View>
                <Text style={styles.hint}>Min: 10 SP</Text>
              </View>
            )}
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
  tierList: {
    gap: 10,
  },
  tierCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  tierCardSelected: {
    borderColor: Colors.dark.tint,
    backgroundColor: "rgba(29, 161, 242, 0.08)",
  },
  tierCardDisabled: {
    opacity: 0.4,
  },
  tierLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  tierLabel: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  tierLabelSelected: {
    color: Colors.dark.tint,
  },
  tierDescription: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    marginTop: 1,
  },
  tierPoints: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Colors.dark.textSecondary,
  },
  tierPointsSelected: {
    color: Colors.dark.tint,
  },
  customToggle: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    marginTop: 12,
    alignSelf: "flex-start" as const,
  },
  customToggleText: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
  },
  customSection: {
    marginTop: 12,
  },
  customInputRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  customInput: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: Colors.dark.text,
    minWidth: 90,
  },
  customSPLabel: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontWeight: "600" as const,
  },
  customClear: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  customClearText: {
    fontSize: 12,
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
