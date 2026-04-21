import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
  Share,
  Modal,
  Animated,
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { createSwayger, fetchSwaygerInvite } from "@/lib/swayger";
import { peekPendingInvite, storePendingInvite } from "@/lib/pending-invite";
import Colors from "@/constants/colors";

const NBA_BLUE = "#1D428A";
const NBA_GOLD = "#FFC72C";

// ─── Types ────────────────────────────────────────────────────

interface PropDef {
  id: string;
  player_name: string;
  player_id: string;
  team: string;
  stat: string;
  stat_label: string;
  line: number;
  game: string;
  event_id: string;
  odd_id: string;
  status: "open" | "voided";
  result: "over" | "under" | null;
}

interface PropNight {
  id: string;
  date: string;
  lock_time: string;
  status: "open" | "locked" | "resolved";
  props: PropDef[];
}

interface UserPick {
  id: string;
  night_id: string;
  picks: { prop_id: string; pick: "over" | "under" }[];
  score: number;
  correct_count: number;
}

interface LeaderboardEntry {
  user_id: string;
  username: string;
  display_name: string;
  total_score: number;
  total_correct: number;
  nights_played: number;
}

// ─── Helpers ─────────────────────────────────────────────────

function statIcon(stat: string): keyof typeof Ionicons.glyphMap {
  if (stat === "points") return "basketball-outline";
  if (stat === "rebounds") return "sync-outline";
  if (stat === "assists") return "git-network-outline";
  return "stats-chart-outline";
}

function formatLockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatNightDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function scoreLabel(score: number): string {
  if (score >= 250) return "Perfect Night 🔥";
  if (score >= 100) return "Strong Night";
  if (score >= 40) return "Decent Night";
  if (score >= 10) return "Getting Started";
  return "No Points";
}

function pickEmoji(pick: "over" | "under"): string {
  return pick === "over" ? "📈" : "📉";
}

function buildShareText(
  night: PropNight,
  pick: UserPick | null,
  picksMap: Record<string, "over" | "under">,
  resolved: boolean
): string {
  const dateStr = formatNightDate(night.date);
  const lines: string[] = [`🏀 NBA Playoffs Picks – ${dateStr}`];

  for (const prop of night.props) {
    if (prop.status === "voided") continue;
    const choice = picksMap[prop.id];
    if (!choice) continue;
    const emoji = pickEmoji(choice);
    const label = `${prop.player_name} ${choice.toUpperCase()} ${prop.line} ${prop.stat_label.toLowerCase()}`;
    if (resolved && prop.result) {
      const correct = prop.result === choice;
      lines.push(`${emoji} ${label} ${correct ? "✓" : "✗"}`);
    } else {
      lines.push(`${emoji} ${label}`);
    }
  }

  if (resolved && pick) {
    const activePropCount = night.props.filter((p) => p.status !== "voided").length;
    lines.push(`\n${pick.correct_count}/${activePropCount} correct · ${pick.score} pts · ${scoreLabel(pick.score)}`);
    lines.push("Play on Swayger!");
  } else {
    lines.push("\nCan you beat me? 👀 Play on Swayger!");
  }

  return lines.join("\n");
}

// ─── Share Card ───────────────────────────────────────────────

function ShareCard({
  night,
  pick,
  picksMap,
  resolved,
}: {
  night: PropNight;
  pick: UserPick | null;
  picksMap: Record<string, "over" | "under">;
  resolved: boolean;
}) {
  const activePropCount = night.props.filter((p) => p.status !== "voided").length;
  const hasPicks = Object.keys(picksMap).length > 0;
  if (!hasPicks) return null;

  async function handleShare() {
    const message = buildShareText(night, pick, picksMap, resolved);
    try {
      await Share.share({ message });
    } catch {
      // user dismissed
    }
  }

  return (
    <View style={shareStyles.wrapper}>
      <View style={shareStyles.card}>
        <View style={shareStyles.cardHeader}>
          <Text style={shareStyles.cardBrand}>SWAYGER</Text>
          <View style={shareStyles.cardPill}>
            <Ionicons
              name={resolved ? "checkmark-circle" : "lock-closed"}
              size={12}
              color={resolved ? Colors.dark.success : Colors.dark.textSecondary}
            />
            <Text style={[shareStyles.cardPillText, resolved && shareStyles.cardPillTextResolved]}>
              {resolved ? "Results" : "Locked In"}
            </Text>
          </View>
        </View>

        <Text style={shareStyles.cardDate}>{formatNightDate(night.date)}</Text>
        <Text style={shareStyles.cardLeague}>NBA PLAYOFFS CHALLENGE</Text>

        <View style={shareStyles.picksGrid}>
          {night.props
            .filter((p) => p.status !== "voided")
            .map((prop) => {
              const choice = picksMap[prop.id];
              if (!choice) return null;
              const correct = resolved && prop.result ? prop.result === choice : null;

              return (
                <View key={prop.id} style={shareStyles.pickRow}>
                  <View style={shareStyles.pickLeft}>
                    <Ionicons name={statIcon(prop.stat)} size={13} color={NBA_GOLD} />
                    <View>
                      <Text style={shareStyles.pickPlayer}>{prop.player_name}</Text>
                      <Text style={shareStyles.pickDetail}>
                        {choice.toUpperCase()} {prop.line} {prop.stat_label}
                      </Text>
                    </View>
                  </View>
                  {resolved && correct !== null && (
                    <View style={[shareStyles.pickResult, correct ? shareStyles.pickResultCorrect : shareStyles.pickResultWrong]}>
                      <Ionicons
                        name={correct ? "checkmark" : "close"}
                        size={14}
                        color={correct ? Colors.dark.success : Colors.dark.danger}
                      />
                    </View>
                  )}
                </View>
              );
            })}
        </View>

        {resolved && pick && (
          <View style={shareStyles.scoreRow}>
            <Text style={shareStyles.scoreValue}>{pick.score} pts</Text>
            <Text style={shareStyles.scoreLabel}>
              {pick.correct_count}/{activePropCount} · {scoreLabel(pick.score)}
            </Text>
          </View>
        )}

        <View style={shareStyles.cardFooter}>
          <Text style={shareStyles.cardFooterText}>swayger.app</Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [shareStyles.shareBtn, pressed && shareStyles.shareBtnPressed]}
        onPress={handleShare}
      >
        <Ionicons name="share-outline" size={18} color="#FFFFFF" />
        <Text style={shareStyles.shareBtnText}>
          {resolved ? "Share Results" : "Share Picks"}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Last Night Pill ──────────────────────────────────────────

function LastNightPill({
  night,
  pick,
  onDismiss,
  onExpand,
}: {
  night: PropNight;
  pick: UserPick | null;
  onDismiss: () => void;
  onExpand: () => void;
}) {
  const activePropCount = night.props.filter((p) => p.status !== "voided").length;

  return (
    <Pressable style={pillStyles.container} onPress={onExpand}>
      <View style={pillStyles.left}>
        <Ionicons name="time-outline" size={15} color={NBA_GOLD} />
        <Text style={pillStyles.label}>
          Last night:{" "}
          {pick ? (
            <Text style={pillStyles.score}>
              {pick.correct_count}/{activePropCount} correct · {pick.score} pts
            </Text>
          ) : (
            <Text style={pillStyles.score}>tap to see results</Text>
          )}
        </Text>
      </View>
      <View style={pillStyles.right}>
        <Text style={pillStyles.review}>Review</Text>
        <Ionicons name="chevron-forward" size={13} color={NBA_GOLD} />
        <Pressable onPress={onDismiss} hitSlop={10} style={pillStyles.dismiss}>
          <Ionicons name="close" size={14} color={Colors.dark.textSecondary} />
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Results Window ───────────────────────────────────────────

function ResultsWindow({
  night,
  pick,
}: {
  night: PropNight;
  pick: UserPick | null;
}) {
  const activePropCount = night.props.filter((p) => p.status !== "voided").length;
  const pickMap: Record<string, "over" | "under"> = {};
  if (pick?.picks) {
    for (const p of pick.picks) pickMap[p.prop_id] = p.pick;
  }

  return (
    <View style={resultsStyles.container}>
      <View style={resultsStyles.headerBadge}>
        <Ionicons name="moon" size={14} color={NBA_GOLD} />
        <Text style={resultsStyles.headerBadgeText}>Last Night's Results</Text>
      </View>

      <Text style={resultsStyles.date}>{formatNightDate(night.date)}</Text>

      {pick ? (
        <View style={resultsStyles.scoreSummary}>
          <Text style={resultsStyles.scoreValue}>{pick.score} pts</Text>
          <Text style={resultsStyles.scoreLabel}>
            {pick.correct_count}/{activePropCount} correct · {scoreLabel(pick.score)}
          </Text>
        </View>
      ) : (
        <View style={resultsStyles.scoreSummary}>
          <Text style={resultsStyles.scoreLabel}>You didn't play last night</Text>
        </View>
      )}

      <View style={resultsStyles.propsList}>
        {night.props
          .filter((p) => p.status !== "voided")
          .map((prop) => {
            const choice = pickMap[prop.id];
            const correct = choice && prop.result ? prop.result === choice : null;

            return (
              <View key={prop.id} style={resultsStyles.propRow}>
                <View style={resultsStyles.propLeft}>
                  <View style={resultsStyles.propStat}>
                    <Ionicons name={statIcon(prop.stat)} size={11} color={NBA_GOLD} />
                    <Text style={resultsStyles.propStatText}>{prop.stat_label}</Text>
                  </View>
                  <Text style={resultsStyles.propPlayer}>{prop.player_name}</Text>
                  <Text style={resultsStyles.propLine}>
                    Line: {prop.line} · Result: {prop.result ? prop.result.toUpperCase() : "—"}
                  </Text>
                </View>
                <View style={resultsStyles.propRight}>
                  {choice ? (
                    <>
                      <View style={[
                        resultsStyles.choicePill,
                        correct === true && resultsStyles.choicePillCorrect,
                        correct === false && resultsStyles.choicePillWrong,
                        correct === null && resultsStyles.choicePillNeutral,
                      ]}>
                        <Text style={[
                          resultsStyles.choiceText,
                          correct === true && resultsStyles.choiceTextCorrect,
                          correct === false && resultsStyles.choiceTextWrong,
                        ]}>
                          {choice.toUpperCase()}
                        </Text>
                      </View>
                      {correct !== null && (
                        <Ionicons
                          name={correct ? "checkmark-circle" : "close-circle"}
                          size={18}
                          color={correct ? Colors.dark.success : Colors.dark.danger}
                        />
                      )}
                    </>
                  ) : (
                    <Text style={resultsStyles.noPick}>—</Text>
                  )}
                </View>
              </View>
            );
          })}
      </View>

      {pick && (
        <ShareCard
          night={night}
          pick={pick}
          picksMap={pickMap}
          resolved={true}
        />
      )}
    </View>
  );
}

// ─── Picks Challenge Card ─────────────────────────────────────

const CHALLENGE_TIERS = [
  { label: "Gut Feeling", points: 10, icon: "help-circle-outline" as const, desc: "Worth bragging about" },
  { label: "Pretty Sure", points: 25, icon: "checkmark-circle-outline" as const, desc: "I'd stand on this" },
  { label: "Lock it In", points: 50, icon: "lock-closed-outline" as const, desc: "Easy money" },
];

function buildNightInviteLink(inviteCode: string): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/join?code=${inviteCode}`;
  }
  return Linking.createURL(`/invite/${inviteCode}`);
}

function PicksChallengeCard({
  night,
  userId,
}: {
  night: PropNight;
  userId: string;
}) {
  const [selectedTier, setSelectedTier] = useState<typeof CHALLENGE_TIERS[0] | null>(null);
  const [creating, setCreating] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [swaygerTitle, setSwaygerTitle] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const inviteLink = inviteCode ? buildNightInviteLink(inviteCode) : null;

  async function handleCreate() {
    if (!selectedTier) return;
    setCreating(true);
    setCreateError(null);
    try {
      const dateStr = formatNightDate(night.date);
      const title = `🎯 Picks Challenge – ${dateStr}`;
      const description = `[night:${night.id}] Whoever gets more NBA Playoff props correct tonight wins. Lower score confirms the result.`;
      const { swayger, error } = await createSwayger(
        title,
        "Sports",
        selectedTier.points,
        "I'll get more picks correct than you tonight 🎯",
        userId,
        description
      );
      if (error || !swayger) {
        setCreateError(error ?? "Could not create challenge. Try again.");
        return;
      }
      setSwaygerTitle(title);
      const invite = await fetchSwaygerInvite(swayger.id);
      if (invite?.invite_code) {
        setInviteCode(invite.invite_code);
      }
    } catch (e) {
      setCreateError("Something went wrong. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!inviteLink) return;
    await Clipboard.setStringAsync(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (!inviteLink || !swaygerTitle) return;
    const message = `I challenged you to a Picks Showdown on Swayger! 🏀🎯\n\n${swaygerTitle}\n\nWhoever gets more props correct tonight wins. Accept here: ${inviteLink}`;
    try {
      await Share.share({ message, url: inviteLink });
    } catch {
      await handleCopy();
    }
  }

  function handleReset() {
    setSelectedTier(null);
    setInviteCode(null);
    setSwaygerTitle(null);
    setCreateError(null);
    setCopied(false);
  }

  if (inviteCode && inviteLink) {
    return (
      <View style={challengeStyles.successCard}>
        <View style={challengeStyles.successHeader}>
          <Ionicons name="checkmark-circle" size={20} color={Colors.dark.success} />
          <Text style={challengeStyles.successTitle}>Challenge Created!</Text>
        </View>
        <Text style={challengeStyles.successSub}>
          Share your invite link — opponent must accept before lock time to compete.
        </Text>
        <View style={challengeStyles.linkBox}>
          <Text style={challengeStyles.linkText} numberOfLines={1} ellipsizeMode="middle">
            {inviteLink}
          </Text>
        </View>
        <View style={challengeStyles.successBtns}>
          <Pressable
            style={({ pressed }) => [challengeStyles.copyBtn, pressed && { opacity: 0.8 }]}
            onPress={handleCopy}
          >
            <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color={NBA_GOLD} />
            <Text style={challengeStyles.copyBtnText}>{copied ? "Copied!" : "Copy Link"}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [challengeStyles.shareSuccessBtn, pressed && { opacity: 0.8 }]}
            onPress={handleShare}
          >
            <Ionicons name="share-outline" size={16} color="#000000" />
            <Text style={challengeStyles.shareSuccessBtnText}>Send Challenge</Text>
          </Pressable>
        </View>
        <Pressable style={challengeStyles.anotherBtn} onPress={handleReset}>
          <Text style={challengeStyles.anotherBtnText}>Challenge someone else →</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={challengeStyles.card}>
      <View style={challengeStyles.cardHeader}>
        <Text style={challengeStyles.cardEyebrow}>🎯 PICKS CHALLENGE</Text>
        <View style={challengeStyles.newBadge}>
          <Text style={challengeStyles.newBadgeText}>NEW</Text>
        </View>
      </View>
      <Text style={challengeStyles.cardTitle}>Think you can out-pick a friend?</Text>
      <Text style={challengeStyles.cardSub}>
        Challenge someone to beat your score tonight. Whoever gets more correct wins the Swayger.
      </Text>

      <View style={challengeStyles.tiers}>
        {CHALLENGE_TIERS.map((tier) => {
          const selected = selectedTier?.points === tier.points;
          return (
            <Pressable
              key={tier.points}
              style={({ pressed }) => [
                challengeStyles.tier,
                selected && challengeStyles.tierSelected,
                pressed && !selected && challengeStyles.tierPressed,
              ]}
              onPress={() => setSelectedTier(tier)}
            >
              <Ionicons
                name={tier.icon}
                size={18}
                color={selected ? "#000000" : NBA_GOLD}
              />
              <Text style={[challengeStyles.tierLabel, selected && challengeStyles.tierLabelSelected]}>
                {tier.label}
              </Text>
              <Text style={[challengeStyles.tierPoints, selected && challengeStyles.tierPointsSelected]}>
                {tier.points} SP
              </Text>
              <Text style={[challengeStyles.tierDesc, selected && challengeStyles.tierDescSelected]}>
                {tier.desc}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {createError && (
        <Text style={challengeStyles.errorText}>{createError}</Text>
      )}

      <Pressable
        style={({ pressed }) => [
          challengeStyles.createBtn,
          !selectedTier && challengeStyles.createBtnDisabled,
          pressed && selectedTier && { opacity: 0.85 },
        ]}
        onPress={handleCreate}
        disabled={!selectedTier || creating}
      >
        {creating ? (
          <ActivityIndicator color="#000000" size="small" />
        ) : (
          <>
            <Ionicons name="flash" size={18} color={selectedTier ? "#000000" : Colors.dark.textSecondary} />
            <Text style={[challengeStyles.createBtnText, !selectedTier && challengeStyles.createBtnTextDisabled]}>
              {selectedTier ? `Create ${selectedTier.points} SP Challenge →` : "Select your confidence"}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

// ─── Challenge Bottom Sheet ───────────────────────────────────

const SCREEN_HEIGHT = Dimensions.get("window").height;

function ChallengeBottomSheet({
  night,
  userId,
  visible,
  onDismiss,
}: {
  night: PropNight;
  userId: string;
  visible: boolean;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [selectedTier, setSelectedTier] = useState<typeof CHALLENGE_TIERS[0] | null>(null);
  const [creating, setCreating] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [swaygerTitle, setSwaygerTitle] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const inviteLink = inviteCode ? buildNightInviteLink(inviteCode) : null;
  const nativeDriver = Platform.OS !== "web";

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(SCREEN_HEIGHT);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: nativeDriver,
          tension: 62,
          friction: 11,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: nativeDriver,
        }),
      ]).start();
    }
  }, [visible]);

  function dismiss() {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 260, useNativeDriver: nativeDriver }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 260, useNativeDriver: nativeDriver }),
    ]).start(() => onDismiss());
  }

  function handleReset() {
    setSelectedTier(null);
    setInviteCode(null);
    setSwaygerTitle(null);
    setCreateError(null);
    setCopied(false);
  }

  async function handleCreate() {
    if (!selectedTier) return;
    setCreating(true);
    setCreateError(null);
    try {
      const dateStr = formatNightDate(night.date);
      const title = `🎯 Picks Challenge – ${dateStr}`;
      const description = `[night:${night.id}] Whoever gets more NBA Playoff props correct tonight wins. Lower score confirms the result.`;
      const { swayger, error } = await createSwayger(
        title,
        "Sports",
        selectedTier.points,
        "I'll get more picks correct than you tonight 🎯",
        userId,
        description
      );
      if (error || !swayger) {
        setCreateError(error ?? "Could not create challenge. Try again.");
        return;
      }
      setSwaygerTitle(title);
      const invite = await fetchSwaygerInvite(swayger.id);
      if (invite?.invite_code) {
        setInviteCode(invite.invite_code);
      }
    } catch {
      setCreateError("Something went wrong. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!inviteLink) return;
    await Clipboard.setStringAsync(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (!inviteLink || !swaygerTitle) return;
    const message = `I challenged you to a Picks Showdown on Swayger! 🏀🎯\n\n${swaygerTitle}\n\nWhoever gets more props correct tonight wins. Accept here: ${inviteLink}`;
    try {
      await Share.share({ message, url: inviteLink });
    } catch {
      await handleCopy();
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      {/* Backdrop */}
      <Animated.View
        style={[sheetStyles.backdrop, { opacity: backdropAnim, pointerEvents: "box-none" }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          sheetStyles.sheet,
          { paddingBottom: insets.bottom + 24, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle bar */}
        <View style={sheetStyles.handle} />

        {/* Close button */}
        <Pressable style={sheetStyles.closeBtn} onPress={dismiss} hitSlop={12}>
          <Ionicons name="close" size={22} color={Colors.dark.textSecondary} />
        </Pressable>

        {/* Top copy */}
        <View style={sheetStyles.sheetTop}>
          <Text style={sheetStyles.eyebrow}>🔥  PICKS LOCKED IN</Text>
          <Text style={sheetStyles.headline}>Now make it{"\n"}interesting.</Text>
          <Text style={sheetStyles.subHeadline}>
            Challenge a friend to beat your score tonight. Whoever gets more correct wins the Swayger.
          </Text>
        </View>

        {inviteCode && inviteLink ? (
          // ── Success state ──
          <View style={sheetStyles.successState}>
            <View style={sheetStyles.successHeader}>
              <Ionicons name="checkmark-circle" size={24} color={Colors.dark.success} />
              <Text style={sheetStyles.successTitle}>Challenge Created!</Text>
            </View>
            <Text style={sheetStyles.successSub}>
              Share your link — opponent must accept before games lock to compete.
            </Text>
            <View style={sheetStyles.linkBox}>
              <Text style={sheetStyles.linkText} numberOfLines={1} ellipsizeMode="middle">
                {inviteLink}
              </Text>
            </View>
            <View style={sheetStyles.successBtns}>
              <Pressable
                style={({ pressed }) => [sheetStyles.copyBtn, pressed && { opacity: 0.8 }]}
                onPress={handleCopy}
              >
                <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color={NBA_GOLD} />
                <Text style={sheetStyles.copyBtnText}>{copied ? "Copied!" : "Copy Link"}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [sheetStyles.sendBtn, pressed && { opacity: 0.8 }]}
                onPress={handleShare}
              >
                <Ionicons name="share-outline" size={16} color="#000000" />
                <Text style={sheetStyles.sendBtnText}>Send Challenge</Text>
              </Pressable>
            </View>
            <Pressable style={sheetStyles.anotherBtn} onPress={handleReset}>
              <Text style={sheetStyles.anotherBtnText}>Challenge someone else →</Text>
            </Pressable>
          </View>
        ) : (
          // ── Tier selection state ──
          <View style={sheetStyles.tierSection}>
            <View style={sheetStyles.tiers}>
              {CHALLENGE_TIERS.map((tier) => {
                const selected = selectedTier?.points === tier.points;
                return (
                  <Pressable
                    key={tier.points}
                    style={({ pressed }) => [
                      sheetStyles.tier,
                      selected && sheetStyles.tierSelected,
                      pressed && !selected && sheetStyles.tierPressed,
                    ]}
                    onPress={() => setSelectedTier(tier)}
                  >
                    <Ionicons name={tier.icon} size={20} color={selected ? "#000000" : NBA_GOLD} />
                    <Text style={[sheetStyles.tierLabel, selected && sheetStyles.tierLabelSel]}>
                      {tier.label}
                    </Text>
                    <Text style={[sheetStyles.tierPoints, selected && sheetStyles.tierPointsSel]}>
                      {tier.points} SP
                    </Text>
                    <Text style={[sheetStyles.tierDesc, selected && sheetStyles.tierDescSel]}>
                      {tier.desc}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {createError && <Text style={sheetStyles.errorText}>{createError}</Text>}

            <Pressable
              style={({ pressed }) => [
                sheetStyles.createBtn,
                !selectedTier && sheetStyles.createBtnDisabled,
                pressed && !!selectedTier && { opacity: 0.85 },
              ]}
              onPress={handleCreate}
              disabled={!selectedTier || creating}
            >
              {creating ? (
                <ActivityIndicator color="#000000" size="small" />
              ) : (
                <>
                  <Ionicons
                    name="flash"
                    size={18}
                    color={selectedTier ? "#000000" : Colors.dark.textSecondary}
                  />
                  <Text
                    style={[sheetStyles.createBtnText, !selectedTier && sheetStyles.createBtnTextDisabled]}
                  >
                    {selectedTier
                      ? `Create ${selectedTier.points} SP Challenge →`
                      : "Select your confidence level"}
                  </Text>
                </>
              )}
            </Pressable>

            <Pressable style={sheetStyles.maybeLater} onPress={dismiss}>
              <Text style={sheetStyles.maybeLaterText}>Maybe later</Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

// ─── Prop Card ────────────────────────────────────────────────

function PropCard({
  prop,
  myPick,
  onPick,
  locked,
  showResult,
}: {
  prop: PropDef;
  myPick: "over" | "under" | undefined;
  onPick: (propId: string, side: "over" | "under") => void;
  locked: boolean;
  showResult: boolean;
}) {
  const voided = prop.status === "voided";

  function getOverStyle(side: "over" | "under") {
    if (showResult && prop.result) {
      const isCorrect = prop.result === side;
      const userPicked = myPick === side;
      if (userPicked && isCorrect) return [styles.pickBtn, styles.pickBtnCorrect];
      if (userPicked && !isCorrect) return [styles.pickBtn, styles.pickBtnWrong];
      if (!userPicked && isCorrect) return [styles.pickBtn, styles.pickBtnCorrectDim];
      return [styles.pickBtn, styles.pickBtnDim];
    }
    if (myPick === side) return [styles.pickBtn, styles.pickBtnSelected];
    return styles.pickBtn;
  }

  function getTextStyle(side: "over" | "under") {
    if (showResult && prop.result) {
      const isCorrect = prop.result === side;
      const userPicked = myPick === side;
      if (userPicked && isCorrect) return [styles.pickBtnText, styles.pickBtnTextCorrect];
      if (userPicked && !isCorrect) return [styles.pickBtnText, styles.pickBtnTextWrong];
    }
    if (myPick === side) return [styles.pickBtnText, styles.pickBtnTextSelected];
    return styles.pickBtnText;
  }

  return (
    <View style={[styles.propCard, voided && styles.propCardVoided]}>
      <View style={styles.propCardHeader}>
        <View style={styles.propStatBadge}>
          <Ionicons name={statIcon(prop.stat)} size={12} color={NBA_GOLD} />
          <Text style={styles.propStatLabel}>{prop.stat_label}</Text>
        </View>
        {voided && (
          <View style={styles.voidedBadge}>
            <Text style={styles.voidedText}>Voided · +25 pts</Text>
          </View>
        )}
      </View>

      <Text style={styles.propPlayerName}>{prop.player_name}</Text>
      <Text style={styles.propGame} numberOfLines={1}>{prop.game}</Text>

      <View style={styles.lineRow}>
        <Text style={styles.lineLabel}>O/U</Text>
        <Text style={styles.lineValue}>{prop.line}</Text>
      </View>

      {!voided && (
        <View style={styles.pickRow}>
          <Pressable
            style={getOverStyle("over")}
            onPress={() => !locked && !showResult && onPick(prop.id, "over")}
            disabled={locked || showResult}
          >
            {showResult && prop.result === "over" && myPick === "over" && (
              <Ionicons name="checkmark" size={12} color={Colors.dark.success} />
            )}
            {showResult && prop.result !== "over" && myPick === "over" && (
              <Ionicons name="close" size={12} color={Colors.dark.danger} />
            )}
            <Text style={getTextStyle("over")}>Over</Text>
          </Pressable>
          <Pressable
            style={getOverStyle("under")}
            onPress={() => !locked && !showResult && onPick(prop.id, "under")}
            disabled={locked || showResult}
          >
            {showResult && prop.result === "under" && myPick === "under" && (
              <Ionicons name="checkmark" size={12} color={Colors.dark.success} />
            )}
            {showResult && prop.result !== "under" && myPick === "under" && (
              <Ionicons name="close" size={12} color={Colors.dark.danger} />
            )}
            <Text style={getTextStyle("under")}>Under</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function LeaderboardView({ nightId }: { nightId: string }) {
  const { data, isLoading } = useQuery<{ ok: boolean; leaderboard: LeaderboardEntry[] }>({
    queryKey: ["/api/props/leaderboard"],
    staleTime: 60_000,
  });

  if (isLoading) return <ActivityIndicator color={NBA_GOLD} style={{ marginTop: 24 }} />;

  const entries = data?.leaderboard ?? [];

  return (
    <View style={styles.leaderboardSection}>
      <Text style={styles.sectionTitle}>Picks Leaderboard</Text>
      {entries.length === 0 ? (
        <Text style={styles.emptyText}>No scores yet this season.</Text>
      ) : (
        entries.slice(0, 20).map((entry, i) => (
          <View key={entry.user_id} style={styles.lbRow}>
            <Text style={[styles.lbRank, i < 3 && styles.lbRankTop]}>{i + 1}</Text>
            <View style={styles.lbName}>
              <Text style={styles.lbUsername}>
                {entry.display_name || entry.username || "Anonymous"}
              </Text>
              <Text style={styles.lbMeta}>
                {entry.nights_played} {entry.nights_played === 1 ? "night" : "nights"} ·{" "}
                {entry.total_correct} correct
              </Text>
            </View>
            <Text style={styles.lbScore}>{entry.total_score.toLocaleString()} pts</Text>
          </View>
        ))
      )}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────

export default function PicksScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hq } = useLocalSearchParams<{ hq?: string }>();
  const hqMode = hq === "1";

  const [pendingPicks, setPendingPicks] = useState<Record<string, "over" | "under">>({});
  const [submitted, setSubmitted] = useState(false);
  const [activeTab, setActiveTab] = useState<"picks" | "leaderboard">("picks");
  const [lastNightDismissed, setLastNightDismissed] = useState(false);
  const [showLastNightExpanded, setShowLastNightExpanded] = useState(false);
  const [pendingChallengeCode, setPendingChallengeCode] = useState<string | null>(null);
  const [showChallengeSheet, setShowChallengeSheet] = useState(false);

  const { data: nightData, isLoading: nightLoading } = useQuery<{ ok: boolean; night: PropNight | null }>({
    queryKey: ["/api/props/tonight"],
    staleTime: 60_000,
  });

  const { data: lastNightData } = useQuery<{ ok: boolean; night: PropNight | null; pick: UserPick | null }>({
    queryKey: ["/api/props/last-night", user?.id],
    queryFn: async () => {
      const url = new URL("/api/props/last-night", getApiUrl());
      if (user?.id) url.searchParams.set("user_id", user.id);
      const res = await fetch(url.toString());
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: 120_000,
  });

  const night = nightData?.night ?? null;
  const lastNight = lastNightData?.night ?? null;
  const lastNightPick = lastNightData?.pick ?? null;

  const isLocked = !night || night.status !== "open" || new Date() >= new Date(night.lock_time);
  const isResolved = night?.status === "resolved";

  const { data: myPickData } = useQuery<{ ok: boolean; pick: UserPick | null }>({
    queryKey: ["/api/props/my-picks", night?.id, user?.id],
    queryFn: async () => {
      if (!night?.id || !user?.id) return { ok: true, pick: null };
      const url = new URL("/api/props/my-picks", getApiUrl());
      url.searchParams.set("night_id", night.id);
      url.searchParams.set("user_id", user.id);
      const res = await fetch(url.toString());
      return res.json();
    },
    enabled: !!night?.id && !!user?.id,
    staleTime: 30_000,
  });

  const myPick = myPickData?.pick ?? null;

  const existingPickMap: Record<string, "over" | "under"> = {};
  if (myPick?.picks) {
    for (const p of myPick.picks) {
      existingPickMap[p.prop_id] = p.pick;
    }
  }

  useEffect(() => {
    if (myPick?.picks && Object.keys(pendingPicks).length === 0) {
      const map: Record<string, "over" | "under"> = {};
      for (const p of myPick.picks) map[p.prop_id] = p.pick;
      setPendingPicks(map);
    }
  }, [myPick]);

  const activePicks = isLocked || isResolved ? existingPickMap : pendingPicks;

  // Check for a pending picks challenge invite on mount (user came from the invite screen)
  useEffect(() => {
    peekPendingInvite().then((pending) => {
      if (pending?.intent === "picks_challenge") {
        setPendingChallengeCode(pending.code);
      }
    }).catch(() => {});
  }, []);

  const submitMutation = useMutation({
    mutationFn: async (picks: { prop_id: string; pick: "over" | "under" }[]) => {
      const url = new URL("/api/props/pick", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ night_id: night!.id, user_id: user!.id, picks }),
      });
      if (!res.ok) throw new Error("Failed to submit picks");
      return res.json();
    },
    onSuccess: async () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/props/my-picks", night?.id, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/props/leaderboard"] });
      // Check if user came from a picks challenge invite
      const pending = await peekPendingInvite().catch(() => null);
      if (pending?.intent === "picks_challenge") {
        setPendingChallengeCode(pending.code);
      }
      // Show the challenge sheet once per night (after a brief celebratory pause)
      // In HQ mode, always show it — the email CTA1 is specifically about challenging a friend next
      if (night?.id) {
        if (hqMode) {
          setTimeout(() => setShowChallengeSheet(true), 800);
        } else {
          const shownKey = `swayger_challenge_sheet_${night.id}`;
          const alreadyShown = await AsyncStorage.getItem(shownKey).catch(() => null);
          if (!alreadyShown) {
            await AsyncStorage.setItem(shownKey, "1").catch(() => {});
            setTimeout(() => setShowChallengeSheet(true), 800);
          }
        }
      }
    },
    onError: () => {
      Alert.alert("Error", "Could not submit picks. Please try again.");
    },
  });

  const handlePick = useCallback((propId: string, side: "over" | "under") => {
    setPendingPicks((prev) => ({ ...prev, [propId]: side }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!night || !user) return;
    const picks = Object.entries(pendingPicks).map(([prop_id, pick]) => ({ prop_id, pick }));
    if (picks.length !== night.props.length) {
      Alert.alert("Pick all props", "Make a pick on every prop before submitting.");
      return;
    }
    submitMutation.mutate(picks);
  }, [night, user, pendingPicks, submitMutation]);

  const allPicked =
    night &&
    night.props.filter((p) => p.status !== "voided").every((p) => pendingPicks[p.id]);

  const hasPriorPicks = !!myPick;

  // Determine if we should show the last night results window
  // (no tonight AND last night exists and is resolved)
  const showResultsWindow = !nightLoading && !night && !!lastNight;

  // Show last night pill above tonight's picks
  const showLastNightPill =
    !!night && !!lastNight && !lastNightDismissed && !showLastNightExpanded &&
    lastNight.id !== night.id;

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.dark.text} />
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>NBA PLAYOFFS CHALLENGE</Text>
        <Text style={styles.title}>Picks</Text>
        {!showResultsWindow && (
          <View style={styles.tabRow}>
            <Pressable
              style={[styles.tabBtn, activeTab === "picks" && styles.tabBtnActive]}
              onPress={() => setActiveTab("picks")}
            >
              <Text style={[styles.tabBtnText, activeTab === "picks" && styles.tabBtnTextActive]}>
                Tonight
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tabBtn, activeTab === "leaderboard" && styles.tabBtnActive]}
              onPress={() => setActiveTab("leaderboard")}
            >
              <Text style={[styles.tabBtnText, activeTab === "leaderboard" && styles.tabBtnTextActive]}>
                Leaderboard
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {activeTab === "leaderboard" && !showResultsWindow ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          <LeaderboardView nightId={night?.id ?? ""} />
        </ScrollView>
      ) : nightLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={NBA_GOLD} />
        </View>
      ) : showResultsWindow ? (
        // ── Results Window: no night tonight, show last night's results ──
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          <ResultsWindow night={lastNight!} pick={lastNightPick} />
          <View style={styles.noNightNote}>
            <Ionicons name="moon-outline" size={16} color={Colors.dark.textSecondary} />
            <Text style={styles.noNightNoteText}>Tonight's picks aren't up yet. Check back at 9 AM.</Text>
          </View>
          <LeaderboardView nightId={lastNight!.id} />
        </ScrollView>
      ) : !night ? (
        <View style={styles.centered}>
          <Ionicons name="moon-outline" size={48} color={Colors.dark.textSecondary} />
          <Text style={styles.emptyHeading}>No picks tonight</Text>
          <Text style={styles.emptyBody}>Check back on game nights during the playoffs.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Last Night pill */}
          {showLastNightPill && (
            <LastNightPill
              night={lastNight!}
              pick={lastNightPick}
              onDismiss={() => setLastNightDismissed(true)}
              onExpand={() => setShowLastNightExpanded(true)}
            />
          )}

          {/* Expanded last night results inline */}
          {showLastNightExpanded && lastNight && (
            <View style={styles.lastNightExpanded}>
              <View style={styles.lastNightExpandedHeader}>
                <Text style={styles.lastNightExpandedTitle}>Last Night</Text>
                <Pressable onPress={() => setShowLastNightExpanded(false)} hitSlop={8}>
                  <Ionicons name="chevron-up" size={18} color={Colors.dark.textSecondary} />
                </Pressable>
              </View>
              <ResultsWindow night={lastNight} pick={lastNightPick} />
            </View>
          )}

          {/* Night header */}
          <View style={styles.nightHeader}>
            <View style={styles.nightHeaderLeft}>
              <Text style={styles.nightDate}>{formatNightDate(night.date)}</Text>
              {isResolved ? (
                <View style={[styles.statusPill, styles.statusPillResolved]}>
                  <Ionicons name="checkmark-circle" size={12} color={Colors.dark.success} />
                  <Text style={[styles.statusText, { color: Colors.dark.success }]}>Results in</Text>
                </View>
              ) : isLocked ? (
                <View style={[styles.statusPill, styles.statusPillLocked]}>
                  <Ionicons name="lock-closed" size={12} color={Colors.dark.textSecondary} />
                  <Text style={[styles.statusText, { color: Colors.dark.textSecondary }]}>Locked</Text>
                </View>
              ) : (
                <View style={[styles.statusPill, styles.statusPillOpen]}>
                  <Ionicons name="time-outline" size={12} color={NBA_GOLD} />
                  <Text style={[styles.statusText, { color: NBA_GOLD }]}>
                    Locks {formatLockTime(night.lock_time)}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.scoringGuide}>
              <Text style={styles.scoringGuideTitle}>Scoring</Text>
              <Text style={styles.scoringGuideRow}>1/4 · 10 pts</Text>
              <Text style={styles.scoringGuideRow}>2/4 · 40 pts</Text>
              <Text style={styles.scoringGuideRow}>3/4 · 100 pts</Text>
              <Text style={[styles.scoringGuideRow, { color: NBA_GOLD }]}>4/4 · 250 pts 🔥</Text>
            </View>
          </View>

          {/* Result summary for resolved nights */}
          {isResolved && myPick && (
            <View style={styles.resultSummary}>
              <Text style={styles.resultScore}>{myPick.score} pts</Text>
              <Text style={styles.resultLabel}>
                {myPick.correct_count}/{night.props.filter((p) => p.status !== "voided").length} correct ·{" "}
                {scoreLabel(myPick.score)}
              </Text>
            </View>
          )}

          {/* HQ Challenge Banner — shown when user arrives via email CTA1 */}
          {hqMode && !isLocked && !isResolved && (
            <View style={hqStyles.banner}>
              <View style={hqStyles.bannerLeft}>
                <Text style={hqStyles.bannerEyebrow}>🏀 SWAYGER HQ CHALLENGE</Text>
                <Text style={hqStyles.bannerTitle}>Beat HQ's picks tonight.</Text>
                <Text style={hqStyles.bannerSub}>Make your calls below — then challenge a friend.</Text>
              </View>
              <View style={hqStyles.bannerBadge}>
                <Text style={hqStyles.bannerBadgeText}>HQ</Text>
              </View>
            </View>
          )}

          {/* Prior picks submitted banner */}
          {hasPriorPicks && !isResolved && (
            <View style={styles.submittedBanner}>
              <Ionicons
                name={isLocked ? "lock-closed" : "checkmark-circle"}
                size={16}
                color={isLocked ? Colors.dark.textSecondary : Colors.dark.success}
              />
              <Text style={[styles.submittedText, isLocked && { color: Colors.dark.textSecondary }]}>
                {isLocked ? "Picks locked in" : "Picks saved · tap any card to change"}
              </Text>
            </View>
          )}

          {/* Props */}
          <View style={styles.propsGrid}>
            {night.props.map((prop) => (
              <PropCard
                key={prop.id}
                prop={prop}
                myPick={activePicks[prop.id]}
                onPick={handlePick}
                locked={isLocked}
                showResult={isResolved}
              />
            ))}
          </View>

          {/* Submit button or sign-in wall */}
          {!isLocked && !user && (
            <View style={styles.signInWall}>
              <Ionicons name="lock-closed" size={22} color={NBA_GOLD} />
              <Text style={styles.signInWallTitle}>Sign in to lock in your picks</Text>
              <Text style={styles.signInWallSub}>Browse freely — create an account when ready.</Text>
              <Pressable
                style={({ pressed }) => [styles.signInBtn, pressed && { opacity: 0.85 }]}
                onPress={() => router.push("/auth/sign-in")}
              >
                <Text style={styles.signInBtnText}>Sign In / Sign Up</Text>
              </Pressable>
            </View>
          )}

          {!isLocked && user && (
            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                !allPicked && styles.submitBtnDisabled,
                pressed && allPicked && styles.submitBtnPressed,
              ]}
              onPress={handleSubmit}
              disabled={!allPicked || submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="flash" size={18} color="#FFFFFF" />
                  <Text style={styles.submitBtnText}>{hasPriorPicks ? "Update Picks" : "Submit Picks"}</Text>
                </>
              )}
            </Pressable>
          )}

          {/* Ready to accept? banner after successful submission with pending challenge */}
          {submitted && pendingChallengeCode && (
            <Pressable
              style={({ pressed }) => [styles.readyToAcceptBanner, pressed && { opacity: 0.9 }]}
              onPress={() => router.push(`/invite/${pendingChallengeCode}`)}
            >
              <View style={styles.readyToAcceptInner}>
                <Ionicons name="checkmark-circle" size={22} color="#000000" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.readyToAcceptTitle}>Picks locked in!</Text>
                  <Text style={styles.readyToAcceptSub}>Tap to accept the challenge →</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#000000" />
              </View>
            </Pressable>
          )}

          {/* Inline challenge card — full tier selector visible right below picks */}
          {!isLocked && !isResolved && hasPriorPicks && user && (
            <PicksChallengeCard night={night} userId={user.id} />
          )}

          {/* Share card — show after lock if picks exist */}
          {(isLocked || isResolved) && hasPriorPicks && (
            <ShareCard
              night={night}
              pick={myPick}
              picksMap={activePicks}
              resolved={isResolved}
            />
          )}

          <LeaderboardView nightId={night.id} />
        </ScrollView>
      )}

      {/* Challenge bottom sheet — slides up after submit */}
      {night && user && (
        <ChallengeBottomSheet
          night={night}
          userId={user.id}
          visible={showChallengeSheet}
          onDismiss={() => setShowChallengeSheet(false)}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyHeading: { fontSize: 20, fontWeight: "700", color: Colors.dark.text, textAlign: "center" },
  emptyBody: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 20 },
  emptyText: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center", marginTop: 12 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    alignSelf: "flex-start",
    marginLeft: -4,
  },
  backBtnText: {
    fontSize: 16,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: NBA_GOLD,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  tabRow: { flexDirection: "row", gap: 8 },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
  },
  tabBtnActive: { backgroundColor: NBA_BLUE },
  tabBtnText: { fontSize: 13, fontWeight: "600", color: Colors.dark.textSecondary },
  tabBtnTextActive: { color: "#FFFFFF" },

  scrollContent: { padding: 16, gap: 16 },

  lastNightExpanded: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  lastNightExpandedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  lastNightExpandedTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: NBA_GOLD,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  nightHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 16,
  },
  nightHeaderLeft: { gap: 8, flex: 1 },
  nightDate: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusPillOpen: { backgroundColor: "rgba(255,199,44,0.12)" },
  statusPillLocked: { backgroundColor: "rgba(255,255,255,0.06)" },
  statusPillResolved: { backgroundColor: "rgba(16,185,129,0.12)" },
  statusText: { fontSize: 12, fontWeight: "600" },

  scoringGuide: { alignItems: "flex-end", gap: 2 },
  scoringGuideTitle: { fontSize: 10, color: Colors.dark.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },
  scoringGuideRow: { fontSize: 11, color: Colors.dark.textSecondary },

  resultSummary: {
    backgroundColor: "rgba(16,185,129,0.10)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.25)",
    padding: 16,
    alignItems: "center",
    gap: 4,
  },
  resultScore: { fontSize: 36, fontWeight: "800", color: Colors.dark.success },
  resultLabel: { fontSize: 14, color: Colors.dark.textSecondary },

  submittedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16,185,129,0.10)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.25)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  submittedText: { fontSize: 13, fontWeight: "600", color: Colors.dark.success },

  propsGrid: { gap: 12 },

  propCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 16,
    gap: 6,
  },
  propCardVoided: { opacity: 0.5 },
  propCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  propStatBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,199,44,0.10)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  propStatLabel: { fontSize: 11, fontWeight: "600", color: NBA_GOLD, textTransform: "uppercase", letterSpacing: 0.6 },
  voidedBadge: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  voidedText: { fontSize: 11, fontWeight: "600", color: Colors.dark.textSecondary },

  propPlayerName: { fontSize: 18, fontWeight: "700", color: Colors.dark.text, marginTop: 2 },
  propGame: { fontSize: 12, color: Colors.dark.textSecondary },

  lineRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 },
  lineLabel: { fontSize: 12, color: Colors.dark.textMuted, textTransform: "uppercase", letterSpacing: 0.6 },
  lineValue: { fontSize: 28, fontWeight: "800", color: Colors.dark.text },

  pickRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  pickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  pickBtnSelected: {
    backgroundColor: NBA_BLUE,
    borderColor: NBA_BLUE,
  },
  pickBtnCorrect: {
    backgroundColor: "rgba(16,185,129,0.20)",
    borderColor: Colors.dark.success,
  },
  pickBtnWrong: {
    backgroundColor: "rgba(239,68,68,0.15)",
    borderColor: Colors.dark.danger,
  },
  pickBtnCorrectDim: {
    backgroundColor: "rgba(16,185,129,0.08)",
    borderColor: "rgba(16,185,129,0.20)",
  },
  pickBtnDim: {
    opacity: 0.35,
  },
  pickBtnText: { fontSize: 13, fontWeight: "700", color: Colors.dark.textSecondary },
  pickBtnTextSelected: { color: "#FFFFFF" },
  pickBtnTextCorrect: { color: Colors.dark.success },
  pickBtnTextWrong: { color: Colors.dark.danger },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: NBA_BLUE,
    borderRadius: 14,
    paddingVertical: 16,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnPressed: { opacity: 0.85 },
  submitBtnText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },

  signInWall: {
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,199,44,0.06)",
    borderWidth: 1.5,
    borderColor: NBA_GOLD,
    borderRadius: 16,
    padding: 20,
    marginTop: 4,
  },
  signInWallTitle: { fontSize: 16, fontWeight: "800", color: "#FFFFFF", textAlign: "center" },
  signInWallSub: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center" },
  signInBtn: {
    backgroundColor: NBA_GOLD,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
    marginTop: 4,
  },
  signInBtnText: { fontSize: 15, fontWeight: "800", color: "#000000" },

  readyToAcceptBanner: {
    backgroundColor: NBA_GOLD,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  readyToAcceptInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  readyToAcceptTitle: { fontSize: 15, fontWeight: "800", color: "#000000" },
  readyToAcceptSub: { fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.7)" },

  leaderboardSection: { gap: 10 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  lbRank: { fontSize: 14, fontWeight: "700", color: Colors.dark.textSecondary, width: 22, textAlign: "center" },
  lbRankTop: { color: NBA_GOLD },
  lbName: { flex: 1, gap: 2 },
  lbUsername: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  lbMeta: { fontSize: 12, color: Colors.dark.textSecondary },
  lbScore: { fontSize: 14, fontWeight: "700", color: NBA_GOLD },

  noNightNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  noNightNoteText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    flex: 1,
  },

  challengeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: NBA_GOLD,
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 2,
  },
  challengeBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000000",
    flex: 1,
    textAlign: "center",
  },
});

// ─── Share card styles ────────────────────────────────────────

const shareStyles = StyleSheet.create({
  wrapper: { gap: 10 },
  card: {
    backgroundColor: "#0F1923",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: NBA_GOLD,
    padding: 18,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardBrand: {
    fontSize: 13,
    fontWeight: "900",
    color: NBA_GOLD,
    letterSpacing: 2,
  },
  cardPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  cardPillText: { fontSize: 11, fontWeight: "700", color: Colors.dark.textSecondary },
  cardPillTextResolved: { color: Colors.dark.success },
  cardDate: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  cardLeague: { fontSize: 10, fontWeight: "700", color: "rgba(255,199,44,0.6)", letterSpacing: 1.2, textTransform: "uppercase" },
  picksGrid: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 10,
    marginTop: 2,
  },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  pickPlayer: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  pickDetail: { fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 1 },
  pickResult: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  pickResultCorrect: { backgroundColor: "rgba(16,185,129,0.20)" },
  pickResultWrong: { backgroundColor: "rgba(239,68,68,0.15)" },
  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 10,
    marginTop: 2,
  },
  scoreValue: { fontSize: 28, fontWeight: "800", color: NBA_GOLD },
  scoreLabel: { fontSize: 13, color: "rgba(255,255,255,0.5)" },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,199,44,0.20)",
    paddingTop: 8,
    marginTop: 2,
  },
  cardFooterText: { fontSize: 11, color: "rgba(255,199,44,0.45)", textAlign: "center", letterSpacing: 1 },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: NBA_GOLD,
    borderRadius: 14,
    paddingVertical: 14,
  },
  shareBtnPressed: { opacity: 0.82 },
  shareBtnText: { fontSize: 15, fontWeight: "700", color: "#000000" },
});

// ─── Last Night pill styles ───────────────────────────────────

const pillStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,199,44,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,199,44,0.22)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  label: { fontSize: 13, color: Colors.dark.text, fontWeight: "500" },
  score: { fontWeight: "700", color: NBA_GOLD },
  right: { flexDirection: "row", alignItems: "center", gap: 4 },
  review: { fontSize: 12, fontWeight: "700", color: NBA_GOLD },
  dismiss: { marginLeft: 6 },
});

// ─── Results window styles ────────────────────────────────────

const resultsStyles = StyleSheet.create({
  container: { gap: 14 },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,199,44,0.10)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  headerBadgeText: { fontSize: 12, fontWeight: "700", color: NBA_GOLD, textTransform: "uppercase", letterSpacing: 0.8 },
  date: { fontSize: 20, fontWeight: "800", color: Colors.dark.text },
  scoreSummary: {
    backgroundColor: "rgba(16,185,129,0.08)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.20)",
    padding: 16,
    alignItems: "center",
    gap: 4,
  },
  scoreValue: { fontSize: 40, fontWeight: "900", color: Colors.dark.success },
  scoreLabel: { fontSize: 14, color: Colors.dark.textSecondary },
  propsList: { gap: 10 },
  propRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 14,
  },
  propLeft: { flex: 1, gap: 3 },
  propStat: { flexDirection: "row", alignItems: "center", gap: 5 },
  propStatText: { fontSize: 11, fontWeight: "600", color: NBA_GOLD, textTransform: "uppercase", letterSpacing: 0.5 },
  propPlayer: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },
  propLine: { fontSize: 12, color: Colors.dark.textSecondary },
  propRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  choicePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  choicePillCorrect: { backgroundColor: "rgba(16,185,129,0.15)" },
  choicePillWrong: { backgroundColor: "rgba(239,68,68,0.12)" },
  choicePillNeutral: { backgroundColor: "rgba(255,255,255,0.06)" },
  choiceText: { fontSize: 12, fontWeight: "700", color: Colors.dark.textSecondary },
  choiceTextCorrect: { color: Colors.dark.success },
  choiceTextWrong: { color: Colors.dark.danger },
  noPick: { fontSize: 14, color: Colors.dark.textSecondary },
});

const hqStyles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: NBA_BLUE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: NBA_GOLD,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  bannerLeft: { flex: 1, paddingRight: 12 },
  bannerEyebrow: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: NBA_GOLD,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  bannerSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
  },
  bannerBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: NBA_GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerBadgeText: {
    fontSize: 14,
    fontWeight: "800" as const,
    color: NBA_BLUE,
  },
});

const challengeStyles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: NBA_GOLD,
    backgroundColor: "rgba(255,199,44,0.06)",
    padding: 18,
    marginBottom: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: NBA_GOLD,
    letterSpacing: 1.2,
  },
  newBadge: {
    backgroundColor: NBA_GOLD,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#000000",
    letterSpacing: 0.8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  cardSub: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  tiers: {
    flexDirection: "row",
    gap: 8,
  },
  tier: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    padding: 10,
    alignItems: "center",
    gap: 4,
  },
  tierSelected: {
    borderColor: NBA_GOLD,
    backgroundColor: NBA_GOLD,
  },
  tierPressed: {
    opacity: 0.8,
  },
  tierLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  tierLabelSelected: {
    color: "#000000",
  },
  tierPoints: {
    fontSize: 16,
    fontWeight: "900",
    color: NBA_GOLD,
  },
  tierPointsSelected: {
    color: "#000000",
  },
  tierDesc: {
    fontSize: 9,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  tierDescSelected: {
    color: "rgba(0,0,0,0.65)",
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: NBA_GOLD,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  createBtnDisabled: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  createBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#000000",
  },
  createBtnTextDisabled: {
    color: Colors.dark.textSecondary,
  },
  errorText: {
    fontSize: 13,
    color: Colors.dark.danger,
    textAlign: "center",
  },
  successCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.dark.success,
    backgroundColor: "rgba(16,185,129,0.07)",
    padding: 18,
    marginBottom: 16,
    gap: 12,
  },
  successHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  successTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Colors.dark.success,
  },
  successSub: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  linkBox: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  linkText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  successBtns: {
    flexDirection: "row",
    gap: 10,
  },
  copyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: NBA_GOLD,
    backgroundColor: "transparent",
    paddingVertical: 12,
  },
  copyBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: NBA_GOLD,
  },
  shareSuccessBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    backgroundColor: NBA_GOLD,
    paddingVertical: 12,
  },
  shareSuccessBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#000000",
  },
  anotherBtn: {
    alignItems: "center",
    paddingVertical: 4,
  },
  anotherBtnText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textDecorationLine: "underline",
  },
});

// ─── Challenge Sheet styles ───────────────────────────────────

const sheetStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.78)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0A1628",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,199,44,0.15)",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginTop: 12,
    marginBottom: 4,
  },
  closeBtn: {
    position: "absolute",
    top: 18,
    right: 22,
    zIndex: 10,
  },
  sheetTop: {
    marginTop: 20,
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2.5,
    color: NBA_GOLD,
    marginBottom: 14,
  },
  headline: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 38,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  subHeadline: {
    fontSize: 15,
    color: "rgba(255,255,255,0.55)",
    lineHeight: 22,
  },

  // ── Success state ──
  successState: {
    gap: 14,
    marginBottom: 16,
  },
  successHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  successSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    lineHeight: 20,
  },
  linkBox: {
    backgroundColor: "rgba(255,199,44,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,199,44,0.25)",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  linkText: {
    fontSize: 12,
    color: NBA_GOLD,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  successBtns: {
    flexDirection: "row",
    gap: 10,
  },
  copyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,199,44,0.10)",
    borderWidth: 1.5,
    borderColor: NBA_GOLD,
    borderRadius: 14,
    paddingVertical: 14,
  },
  copyBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: NBA_GOLD,
  },
  sendBtn: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: NBA_GOLD,
    borderRadius: 14,
    paddingVertical: 14,
  },
  sendBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#000000",
  },
  anotherBtn: {
    alignItems: "center",
    paddingVertical: 6,
  },
  anotherBtnText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.45)",
    textDecorationLine: "underline",
  },

  // ── Tier selection ──
  tierSection: {
    gap: 16,
    marginBottom: 8,
  },
  tiers: {
    flexDirection: "row",
    gap: 8,
  },
  tier: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 5,
  },
  tierSelected: {
    backgroundColor: NBA_GOLD,
    borderColor: NBA_GOLD,
  },
  tierPressed: {
    opacity: 0.65,
  },
  tierLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  tierLabelSel: { color: "#000000" },
  tierPoints: {
    fontSize: 18,
    fontWeight: "800",
    color: NBA_GOLD,
  },
  tierPointsSel: { color: "#000000" },
  tierDesc: {
    fontSize: 10,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 14,
  },
  tierDescSel: { color: "rgba(0,0,0,0.6)" },
  errorText: {
    fontSize: 13,
    color: Colors.dark.danger,
    textAlign: "center",
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: NBA_GOLD,
    borderRadius: 16,
    paddingVertical: 18,
  },
  createBtnDisabled: {
    backgroundColor: "rgba(255,199,44,0.18)",
  },
  createBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#000000",
  },
  createBtnTextDisabled: {
    color: Colors.dark.textSecondary,
  },
  maybeLater: {
    alignItems: "center",
    paddingVertical: 10,
  },
  maybeLaterText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.35)",
  },
});
