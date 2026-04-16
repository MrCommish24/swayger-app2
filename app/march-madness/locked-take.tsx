import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  Share,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import {
  TAKE_CONFIGS,
  type TakeType,
  type BracketTeam,
  isPicksLocked,
  fetchMyLockedTakes,
  fetchSecondChanceStatus,
  saveTake,
  getTeamsByRegion,
} from "@/lib/mm-picks";
import MMPickShareCard from "@/components/MMPickShareCard";

const ORANGE = "#E8590A";
const GOLD = "#F5A623";
const REGIONS = ["east", "south", "west", "midwest"] as const;
const REGION_LABELS: Record<string, string> = {
  east: "East",
  south: "South",
  west: "West",
  midwest: "Midwest",
};

function TeamGrid({
  teams,
  selected,
  maxCount,
  onToggle,
}: {
  teams: BracketTeam[];
  selected: Set<string>;
  maxCount: number;
  onToggle: (name: string) => void;
}) {
  return (
    <View style={styles.teamGrid}>
      {teams.map((team) => {
        const isSelected = selected.has(team.name);
        const canSelect = isSelected || selected.size < maxCount;
        return (
          <Pressable
            key={team.name}
            style={({ pressed }) => [
              styles.teamCard,
              isSelected && styles.teamCardSelected,
              !canSelect && styles.teamCardDisabled,
              pressed && canSelect && styles.teamCardPressed,
            ]}
            onPress={() => canSelect && onToggle(team.name)}
            disabled={!canSelect && !isSelected}
          >
            <View style={[styles.teamSeedBadge, isSelected && styles.teamSeedBadgeSelected]}>
              <Text style={[styles.teamSeedText, isSelected && styles.teamSeedTextSelected]}>
                {team.seed}
              </Text>
            </View>
            <Text
              style={[styles.teamName, isSelected && styles.teamNameSelected]}
              numberOfLines={2}
            >
              {team.name}
            </Text>
            {isSelected ? (
              <View style={styles.teamCheck}>
                <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function LockedTakePicker() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const { type } = useLocalSearchParams<{ type: TakeType }>();

  const takeType = (type as TakeType) || "champion";
  const cfg = TAKE_CONFIGS[takeType];
  const locked = isPicksLocked();
  const teamsByRegion = getTeamsByRegion();

  const [activeRegion, setActiveRegion] = useState<string>("east");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef<View>(null);

  const { data: takes, isLoading: takesLoading } = useQuery({
    queryKey: ["mm-locked-takes", user?.id],
    queryFn: () => fetchMyLockedTakes(user!.id),
    enabled: !!user,
    staleTime: 0,
  });

  const { data: isSecondChance = false, isLoading: scLoading } = useQuery<boolean>({
    queryKey: ["mm-second-chance", user?.id],
    queryFn: () => fetchSecondChanceStatus(user!.id),
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const isLoading = takesLoading || scLoading;

  React.useEffect(() => {
    const existing = takes?.[takeType];
    if (existing?.teams?.length) {
      setSelected(new Set(existing.teams));
    }
  }, [takes, takeType]);

  const saveMutation = useMutation({
    mutationFn: () => saveTake(user!.id, takeType, Array.from(selected), isSecondChance),
    onSuccess: (result) => {
      if (result.error) {
        Alert.alert("Couldn't lock takes", result.error);
        return;
      }
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["mm-locked-takes"] });
    },
    onError: () => Alert.alert("Error", "Something went wrong. Try again."),
  });

  function toggleTeam(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else if (next.size < cfg.count) {
        next.add(name);
      }
      return next;
    });
  }

  async function handleShare() {
    if (!shareCardRef.current) return;
    setSharing(true);
    try {
      if (Platform.OS === "web") {
        // react-native-view-shot's web impl passes the ref object (not .current) to
        // html2canvas, which causes it to silently fail. Call html2canvas directly instead.
        const { default: html2canvas } = await import("html2canvas");
        const el = shareCardRef.current as unknown as HTMLElement;
        const canvas = await html2canvas(el, {
          useCORS: true,
          allowTaint: false,
          backgroundColor: "#111827",
          scale: 2,
          logging: false,
        });
        const dataUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `swayger-${takeType}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const uri = await captureRef(shareCardRef, { format: "png", quality: 1 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: "image/png" });
        } else {
          await Share.share({ url: uri });
        }
      }
    } catch (e) {
      console.error("[take-share]", e);
      Alert.alert("Couldn't capture image", "Try taking a screenshot instead.");
    } finally {
      setSharing(false);
    }
  }

  const existing = takes?.[takeType];
  const alreadySubmitted = existing?.is_submitted === true;
  const canEdit = !locked || isSecondChance;
  const selectionComplete = selected.size === cfg.count;
  const topPadding = isWeb ? 67 : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: topPadding }]}>
        <ActivityIndicator color={ORANGE} />
      </View>
    );
  }

  if (submitted || (alreadySubmitted && locked)) {
    const teams = submitted ? Array.from(selected) : existing?.teams ?? [];
    const displayName = profile?.display_name || `@${profile?.username || "you"}`;
    return (
      <View style={[styles.container, { paddingTop: topPadding }]}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.replace("/march-madness/picks")}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{cfg.label}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.successScroll,
            { paddingBottom: isWeb ? 34 + 80 : insets.bottom + 80 },
          ]}
        >
          <View style={styles.successBanner}>
            <Text style={styles.successEmoji}>{cfg.emoji}</Text>
            <Text style={styles.successTitle}>
              {cfg.label} {locked ? "Locked" : "Saved"}!
            </Text>
            <Text style={styles.successSub}>
              {teams.length} team{teams.length > 1 ? "s" : ""} ·{" "}
              {isSecondChance
                ? `${cfg.pointsEach * 0.5 * teams.length} pts possible (½ pts — second chance)`
                : `${cfg.pointsEach * teams.length} pts possible`}
            </Text>
          </View>

          <View style={styles.teamsPicked}>
            {teams.map((name) => (
              <View key={name} style={styles.pickedTeamRow}>
                <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                <Text style={styles.pickedTeamName}>{name}</Text>
              </View>
            ))}
          </View>

          <View style={styles.shareCardWrap} pointerEvents="none">
            <View ref={shareCardRef} collapsable={false}>
              <MMPickShareCard
                takeType={takeType}
                teams={teams}
                displayName={displayName}
              />
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.8 }]}
            onPress={handleShare}
            disabled={sharing}
          >
            {sharing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="share-outline" size={18} color="#FFFFFF" />
                <Text style={styles.shareBtnText}>Share My {cfg.label}</Text>
              </>
            )}
          </Pressable>

          {canEdit ? (
            <Pressable
              style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.7 }]}
              onPress={() => setSubmitted(false)}
            >
              <Text style={styles.editBtnText}>Edit Picks</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.replace("/march-madness/picks")}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Your {cfg.label}</Text>
          <Text style={styles.headerSub}>
            {selected.size}/{cfg.count} selected
          </Text>
        </View>
        <View
          style={[
            styles.selCountBadge,
            selectionComplete && styles.selCountBadgeComplete,
          ]}
        >
          <Text
            style={[
              styles.selCountText,
              selectionComplete && styles.selCountTextComplete,
            ]}
          >
            {selected.size}/{cfg.count}
          </Text>
        </View>
      </View>

      {locked && isSecondChance ? (
        <View style={[styles.instructionBanner, { borderBottomColor: "rgba(245,158,11,0.2)", backgroundColor: "rgba(245,158,11,0.08)" }]}>
          <Text style={[styles.instructionText, { color: "#F59E0B" }]}>
            ⚡ Second chance — pick {cfg.count} team{cfg.count > 1 ? "s" : ""} for the {cfg.label}. Each correct pick = {cfg.pointsEach * 0.5} pts (½ points).
          </Text>
        </View>
      ) : locked ? (
        <View style={styles.lockedBanner}>
          <Ionicons name="lock-closed" size={14} color="#9CA3AF" />
          <Text style={styles.lockedBannerText}>
            The tournament has started — picks are locked
          </Text>
        </View>
      ) : (
        <View style={styles.instructionBanner}>
          <Text style={styles.instructionText}>
            {cfg.emoji} Pick {cfg.count} team{cfg.count > 1 ? "s" : ""} you think will make the {cfg.label}.
            {" "}Each correct pick = {cfg.pointsEach} pts.
          </Text>
        </View>
      )}

      <View style={styles.regionTabs}>
        {REGIONS.map((r) => (
          <Pressable
            key={r}
            style={[styles.regionTab, activeRegion === r && styles.regionTabActive]}
            onPress={() => setActiveRegion(r)}
          >
            <Text
              style={[
                styles.regionTabText,
                activeRegion === r && styles.regionTabTextActive,
              ]}
            >
              {REGION_LABELS[r]}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.pickerScroll,
          { paddingBottom: isWeb ? 34 + 100 : insets.bottom + 100 },
        ]}
        key={activeRegion}
      >
        <TeamGrid
          teams={teamsByRegion[activeRegion] ?? []}
          selected={selected}
          maxCount={cfg.count}
          onToggle={toggleTeam}
        />
      </ScrollView>

      {canEdit ? (
        <View
          style={[
            styles.lockBar,
            { paddingBottom: isWeb ? 34 : insets.bottom + 8 },
          ]}
        >
          <View style={styles.lockBarInner}>
            <View style={styles.lockBarCount}>
              <Text style={styles.lockBarCountMain}>
                {selected.size}
                <Text style={styles.lockBarCountOf}>/{cfg.count}</Text>
              </Text>
              <Text style={styles.lockBarCountLabel}>selected</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.lockBtn,
                !selectionComplete && styles.lockBtnDisabled,
                pressed && selectionComplete && { opacity: 0.85 },
              ]}
              onPress={() => saveMutation.mutate()}
              disabled={!selectionComplete || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="lock-closed" size={16} color="#FFFFFF" />
                  <Text style={styles.lockBtnText}>
                    {isSecondChance ? "Lock It In (½ pts)" : "Lock It In"}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    alignItems: "center",
    gap: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.dark.text,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  selCountBadge: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  selCountBadgeComplete: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.35)",
  },
  selCountText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: Colors.dark.textSecondary,
  },
  selCountTextComplete: {
    color: "#22C55E",
  },
  lockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(107,114,128,0.08)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  lockedBannerText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500" as const,
  },
  instructionBanner: {
    backgroundColor: `${ORANGE}10`,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  instructionText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  regionTabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  regionTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  regionTabActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  regionTabText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
  },
  regionTabTextActive: {
    color: "#FFFFFF",
  },
  pickerScroll: {
    padding: 16,
  },
  teamGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  teamCard: {
    width: "47%",
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 12,
    gap: 6,
    position: "relative",
  },
  teamCardSelected: {
    backgroundColor: "rgba(34,197,94,0.08)",
    borderColor: "rgba(34,197,94,0.45)",
  },
  teamCardDisabled: {
    opacity: 0.35,
  },
  teamCardPressed: {
    opacity: 0.7,
  },
  teamSeedBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "rgba(107,114,128,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  teamSeedBadgeSelected: {
    backgroundColor: "rgba(34,197,94,0.2)",
  },
  teamSeedText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: Colors.dark.textSecondary,
  },
  teamSeedTextSelected: {
    color: "#22C55E",
  },
  teamName: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.dark.text,
    lineHeight: 16,
  },
  teamNameSelected: {
    color: "#22C55E",
  },
  teamCheck: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  lockBar: {
    backgroundColor: Colors.dark.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  lockBarInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  lockBarCount: {
    alignItems: "center",
  },
  lockBarCountMain: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: Colors.dark.text,
  },
  lockBarCountOf: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
  },
  lockBarCountLabel: {
    fontSize: 10,
    color: Colors.dark.textSecondary,
    letterSpacing: 0.5,
  },
  lockBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: ORANGE,
    borderRadius: 12,
    paddingVertical: 14,
  },
  lockBtnDisabled: {
    backgroundColor: "rgba(107,114,128,0.3)",
  },
  lockBtnText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  successScroll: {
    paddingHorizontal: 20,
    paddingTop: 24,
    alignItems: "center",
    gap: 20,
  },
  successBanner: {
    alignItems: "center",
    gap: 8,
  },
  successEmoji: {
    fontSize: 48,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "800" as const,
    color: Colors.dark.text,
    textAlign: "center",
  },
  successSub: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  teamsPicked: {
    width: "100%",
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.2)",
    padding: 16,
    gap: 8,
  },
  pickedTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pickedTeamName: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  shareCardWrap: {
    alignItems: "center",
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: ORANGE,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: "100%",
  },
  shareBtnText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  editBtn: {
    paddingVertical: 12,
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
    textDecorationLine: "underline",
  },
});
