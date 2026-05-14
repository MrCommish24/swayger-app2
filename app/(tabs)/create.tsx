import { useState, useEffect, useRef } from "react";
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
import { Analytics } from "@/lib/posthog";
import { supabase } from "@/lib/supabase";
import { showError } from "@/lib/helpers";
import Colors from "@/constants/colors";

const CONFIDENCE_TIERS = [
  { label: "Gut Feeling", points: 10, icon: "help-circle-outline" as const },
  { label: "Pretty Sure", points: 25, icon: "checkmark-circle-outline" as const },
  { label: "No Doubt",    points: 50, icon: "lock-closed-outline" as const },
];

export default function CreateSwaygerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const pickRef = useRef<TextInput>(null);

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
    prefillTitle?: string;
    prefillCategory?: string;
    prefillDescription?: string;
  }>();

  const isOpenChallenge = params.openChallenge === "true";
  const isCounter = !!params.counterTitle && !params.lockedOpponentId && !isOpenChallenge;
  const isRematch = !!params.lockedOpponentId;

  const [creatorPick, setCreatorPick] = useState(params.creatorPickPrefill || "");
  const [title, setTitle] = useState(params.prefillTitle || params.counterTitle || "");
  const [category, setCategory] = useState(params.prefillCategory || params.counterCategory || "Sports");
  const [stakeUnits, setStakeUnits] = useState(
    params.counterStake ? Math.max(10, parseInt(params.counterStake, 10)) : 10
  );
  const [description, setDescription] = useState(params.prefillDescription || params.counterDescription || "");
  const [stakeNote, setStakeNote] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [showCustomStake, setShowCustomStake] = useState(false);
  const [titleTouched, setTitleTouched] = useState(!!params.prefillTitle || !!params.counterTitle);

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

  // Auto-fill title from pick if user hasn't manually touched it
  function handlePickChange(text: string) {
    setCreatorPick(text);
    if (!titleTouched && text.trim().length > 0) {
      setTitle(text.length > 50 ? text.slice(0, 50) : text);
    }
    if (!titleTouched && text.trim().length === 0) {
      setTitle("");
    }
  }

  const canSubmit =
    creatorPick.trim().length > 0 &&
    title.trim().length >= 2 &&
    stakeUnits >= 10 &&
    (balanceData == null || stakeUnits <= myBalance);

  const mutation = useMutation({
    mutationFn: () =>
      createSwayger(title, category, stakeUnits, creatorPick, user!.id, description, stakeNote),
    onSuccess: async (result) => {
      if (result.error) { showError(result.error); return; }
      Analytics.swaygerCreated(category, stakeUnits);
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
      setCreatorPick(""); setTitle(""); setCategory("Sports");
      setStakeUnits(10); setDescription(""); setStakeNote("");
      setShowDetails(false); setShowCustomStake(false); setTitleTouched(false);
      if (result.swayger) {
        router.push(`/swayger/${result.swayger.id}?feedback=1`);
      } else {
        router.push("/(tabs)");
      }
    },
    onError: () => showError("Something went wrong. Try again."),
  });

  function handleCreate() {
    if (!creatorPick.trim()) { showError("Enter your take first."); return; }
    if (!title.trim() || title.trim().length < 2) { showError("Add a bet title."); return; }
    mutation.mutate();
  }

  const screenTitle = isRematch
    ? (params.rematchTypeForEdit === "double_or_nothing" ? "Double or Nothing" : "Run it Back")
    : isOpenChallenge ? "Same Swayger, New Opponent"
    : isCounter ? "Counter Offer" : "New Swayger";

  const screenSub = isRematch
    ? `vs @${params.lockedOpponentUsername || "opponent"}`
    : isCounter && params.counterOpponentUsername
    ? `Countering @${params.counterOpponentUsername}`
    : "Say what you think. Set the stakes.";

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>{screenTitle}</Text>
          <Text style={styles.screenSub}>{screenSub}</Text>
        </View>

        {/* Context banners */}
        {(isCounter || isOpenChallenge) && (
          <View style={styles.contextBanner}>
            <Ionicons
              name={isCounter ? "swap-horizontal" : "person-add-outline"}
              size={15}
              color={Colors.dark.tint}
            />
            <Text style={styles.contextBannerText}>
              {isCounter
                ? "Pre-filled from the original invite. Adjust anything."
                : "Same terms, new opponent. Adjust before you send."}
            </Text>
          </View>
        )}
        {isRematch && (
          <View style={styles.contextBanner}>
            <Ionicons
              name={params.rematchTypeForEdit === "double_or_nothing" ? "flame" : "refresh"}
              size={15}
              color={params.rematchTypeForEdit === "double_or_nothing"
                ? Colors.dark.accentGold : Colors.dark.tint}
            />
            <Text style={styles.contextBannerText}>
              Rematch vs{" "}
              <Text style={{ color: Colors.dark.text, fontWeight: "600" }}>
                @{params.lockedOpponentUsername}
              </Text>
              {" "}— edit any terms before sending.
            </Text>
          </View>
        )}

        <View style={styles.form}>

          {/* ── Field 1: Your Take (pick) ── */}
          <View>
            <Text style={styles.fieldLabel}>Your take</Text>
            <TextInput
              ref={pickRef}
              style={styles.takeInput}
              placeholder={"e.g. OKC wins the series in 6"}
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={creatorPick}
              onChangeText={handlePickChange}
              editable={!mutation.isPending}
              maxLength={200}
              autoFocus={!isRematch && !isCounter}
            />
            <Text style={styles.fieldHint}>
              Your opponent will enter their counter-take when they accept.
            </Text>
          </View>

          {/* ── Field 2: Bet Title ── */}
          <View>
            <Text style={styles.fieldLabel}>Bet title</Text>
            <TextInput
              style={styles.titleInput}
              placeholder="e.g. Thunder vs Wolves — Series"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={title}
              onChangeText={(t) => { setTitle(t); setTitleTouched(true); }}
              editable={!mutation.isPending}
              maxLength={60}
            />
          </View>

          {/* ── Field 3: Category chips ── */}
          <View>
            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {CATEGORIES.map((cat) => {
                const active = category === cat.value;
                return (
                  <Pressable
                    key={cat.value}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setCategory(cat.value)}
                    disabled={!!params.prefillCategory || mutation.isPending}
                  >
                    <Ionicons
                      name={cat.icon}
                      size={15}
                      color={active ? Colors.dark.tint : Colors.dark.textSecondary}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {cat.value}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ── Field 4: Confidence / stake ── */}
          <View>
            <View style={styles.stakeLabelRow}>
              <Text style={styles.fieldLabel}>Confidence</Text>
              {balanceData != null && (
                <View style={styles.balancePill}>
                  <Ionicons name="wallet-outline" size={11} color={Colors.dark.accentGold} />
                  <Text style={styles.balancePillText}>{myBalance.toLocaleString()} SP</Text>
                </View>
              )}
            </View>

            <View style={styles.tierRow}>
              {CONFIDENCE_TIERS.map((tier) => {
                const isSelected = stakeUnits === tier.points && !showCustomStake;
                const insufficient = balanceData != null && tier.points > myBalance;
                return (
                  <Pressable
                    key={tier.label}
                    style={[
                      styles.tierChip,
                      isSelected && styles.tierChipSelected,
                      insufficient && styles.tierChipDisabled,
                    ]}
                    onPress={() => {
                      if (!insufficient) { setStakeUnits(tier.points); setShowCustomStake(false); }
                    }}
                    disabled={insufficient || mutation.isPending}
                  >
                    <Text style={[styles.tierChipSP, isSelected && styles.tierChipSPSelected]}>
                      {tier.points} SP
                    </Text>
                    <Text style={[styles.tierChipLabel, isSelected && styles.tierChipLabelSelected]}>
                      {tier.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {balanceData != null && stakeUnits > myBalance && (
              <Text style={styles.stakeError}>Not enough SP — you have {myBalance.toLocaleString()}</Text>
            )}

            {!showCustomStake ? (
              <Pressable style={styles.customToggle} onPress={() => setShowCustomStake(true)}>
                <Ionicons name="create-outline" size={12} color={Colors.dark.tabIconDefault} />
                <Text style={styles.customToggleText}>Custom amount</Text>
              </Pressable>
            ) : (
              <View style={styles.customRow}>
                <TextInput
                  style={styles.customInput}
                  placeholder="10+"
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  keyboardType="numeric"
                  value={stakeUnits > 0 ? String(stakeUnits) : ""}
                  onChangeText={(v) => {
                    const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
                    if (!isNaN(n)) {
                      setStakeUnits(balanceData != null
                        ? Math.min(myBalance, Math.max(10, n))
                        : Math.max(10, n));
                    } else if (v === "") setStakeUnits(10);
                  }}
                  editable={!mutation.isPending}
                  maxLength={6}
                />
                <Text style={styles.customSPLabel}>SP</Text>
                <Pressable onPress={() => { setShowCustomStake(false); setStakeUnits(10); }}>
                  <Text style={styles.customClear}>Use tiers</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* ── Optional details ── */}
          <Pressable
            style={styles.detailsToggle}
            onPress={() => setShowDetails((v) => !v)}
          >
            <Ionicons
              name={showDetails ? "chevron-up" : "chevron-down"}
              size={14}
              color={Colors.dark.tabIconDefault}
            />
            <Text style={styles.detailsToggleText}>
              {showDetails ? "Hide details" : "Add details (optional)"}
            </Text>
          </Pressable>

          {showDetails && (
            <View style={styles.detailsSection}>
              <View>
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  style={[styles.titleInput, styles.multiline]}
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
                <Text style={styles.fieldLabel}>What's at stake</Text>
                <TextInput
                  style={styles.titleInput}
                  placeholder='e.g. "bragging rights" or "dinner"'
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  value={stakeNote}
                  onChangeText={setStakeNote}
                  editable={!mutation.isPending}
                  maxLength={80}
                />
              </View>
            </View>
          )}

          {/* ── Create button ── */}
          <Pressable
            style={({ pressed }) => [
              styles.createBtn,
              pressed && canSubmit && styles.createBtnPressed,
              (!canSubmit || mutation.isPending) && styles.createBtnDisabled,
            ]}
            onPress={handleCreate}
            disabled={mutation.isPending || !canSubmit}
          >
            {mutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="flash" size={19} color="#FFFFFF" />
                <Text style={styles.createBtnText}>Create Swayger</Text>
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

  // Header
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 4,
  },
  screenTitle: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 30,
    color: Colors.dark.text,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  screenSub: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },

  // Context banners
  contextBanner: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 8,
    backgroundColor: `${Colors.dark.tint}12`,
    borderWidth: 1,
    borderColor: `${Colors.dark.tint}35`,
    borderRadius: 10,
    padding: 11,
    marginHorizontal: 24,
    marginBottom: 4,
  },
  contextBannerText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.tint,
    lineHeight: 18,
  },

  // Form
  form: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 22,
  },

  // Field labels
  fieldLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 11,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.9,
    marginBottom: 8,
  },
  fieldHint: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    marginTop: 5,
    lineHeight: 16,
  },

  // Take (pick) input — hero field
  takeInput: {
    fontFamily: "DMSans_400Regular",
    fontSize: 18,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1.5,
    borderColor: Colors.dark.tint,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
  },

  // Title input — secondary
  titleInput: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  multiline: {
    minHeight: 76,
    textAlignVertical: "top" as const,
  },

  // Category chips
  chipRow: {
    flexDirection: "row" as const,
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: {
    backgroundColor: `${Colors.dark.tint}15`,
    borderColor: Colors.dark.tint,
  },
  chipText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "500" as const,
  },
  chipTextActive: {
    color: Colors.dark.tint,
  },

  // Stake / confidence
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
    backgroundColor: `${Colors.dark.accentGold}15`,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  balancePillText: {
    fontSize: 11,
    color: Colors.dark.accentGold,
    fontWeight: "600" as const,
  },

  // Compact tier chips
  tierRow: {
    flexDirection: "row" as const,
    gap: 10,
  },
  tierChip: {
    flex: 1,
    alignItems: "center" as const,
    gap: 3,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  tierChipSelected: {
    borderColor: Colors.dark.tint,
    backgroundColor: `${Colors.dark.tint}12`,
  },
  tierChipDisabled: {
    opacity: 0.35,
  },
  tierChipSP: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 20,
    color: Colors.dark.textSecondary,
  },
  tierChipSPSelected: {
    color: Colors.dark.tint,
  },
  tierChipLabel: {
    fontSize: 11,
    color: Colors.dark.tabIconDefault,
    fontWeight: "500" as const,
    textAlign: "center" as const,
  },
  tierChipLabelSelected: {
    color: Colors.dark.tint,
  },

  stakeError: {
    fontSize: 12,
    color: Colors.dark.danger,
    marginTop: 6,
  },

  // Custom stake
  customToggle: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    marginTop: 10,
    alignSelf: "flex-start" as const,
  },
  customToggleText: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
  },
  customRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    marginTop: 10,
  },
  customInput: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.dark.text,
    width: 80,
    textAlign: "center" as const,
  },
  customSPLabel: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontWeight: "600" as const,
  },
  customClear: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    textDecorationLine: "underline" as const,
  },

  // Optional details
  detailsToggle: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    alignSelf: "flex-start" as const,
    marginTop: -6,
  },
  detailsToggleText: {
    fontSize: 13,
    color: Colors.dark.tabIconDefault,
  },
  detailsSection: {
    gap: 18,
    marginTop: -4,
  },

  // Create button
  createBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: Colors.dark.tint,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
  },
  createBtnPressed: {
    opacity: 0.85,
  },
  createBtnDisabled: {
    opacity: 0.45,
  },
  createBtnText: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 18,
    color: "#FFFFFF",
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
  },
});
