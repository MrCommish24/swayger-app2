import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  LayoutAnimation,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import {
  TAKE_CONFIGS,
  TAKE_ORDER,
  type TakeType,
  type LockedTake,
  type SpecialPick,
  type RankedMatchup,
  type RoundMatchups,
  UPSET_LIMITS,
  PICKS_LOCK_DATE,
  isPicksLocked,
  isRoundLocked,
  getRoundLockDate,
  fetchMyLockedTakes,
  fetchMySpecialPicks,
  fetchSecondChanceStatus,
  fetchMyPickScore,
  fetchRoundMatchups,
  saveSpecialPick,
  getActivePicksRoundId,
} from "@/lib/mm-picks";
import { getCurrentRound } from "@/lib/march-madness";

const ORANGE = "#E8590A";
const GOLD = "#F5A623";
const PURPLE = "#A855F7";
const GREEN = "#22C55E";
const BLUE = "#3B82F6";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLockDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function roundLabel(roundId: string): string {
  const map: Record<string, string> = {
    "round-64": "Round of 64",
    "round-32": "Round of 32",
    "sweet-16": "Sweet 16",
    "elite-8":  "Elite 8",
    "final-four": "Final Four",
  };
  return map[roundId] ?? roundId;
}

// ─── Lock Banner (bracket takes) ─────────────────────────────────────────────

function BracketLockBanner() {
  const locked = isPicksLocked();
  const formatted = formatLockDate(PICKS_LOCK_DATE);
  return (
    <View style={[styles.lockBanner, locked && styles.lockBannerLocked]}>
      <Ionicons
        name={locked ? "lock-closed" : "time-outline"}
        size={14}
        color={locked ? "#9CA3AF" : GOLD}
      />
      <Text style={[styles.lockBannerText, locked && styles.lockBannerTextLocked]}>
        {locked
          ? "Bracket picks locked — tournament in progress"
          : `Bracket picks lock ${formatted}`}
      </Text>
    </View>
  );
}

// ─── Scoring Guide ────────────────────────────────────────────────────────────

const SCORING_ROWS = [
  { emoji: "🏆", label: "Champion",        pts: "10 pts",   note: "1 pick" },
  { emoji: "🔥", label: "Final Four",       pts: "5 pts ea", note: "4 picks" },
  { emoji: "⚡", label: "Elite Eight",      pts: "3 pts ea", note: "8 picks" },
  { emoji: "🌀", label: "Sweet Sixteen",    pts: "2 pts ea", note: "16 picks" },
  { emoji: "💥", label: "Upset Pick",       pts: "3 pts ea", note: "per round" },
  { emoji: "🎯", label: "Blowout Pick",     pts: "3 pts",    note: "per round" },
  { emoji: "🏀", label: "High Scorer Pick", pts: "3 pts",    note: "per round" },
];

function ScoringGuide() {
  const [expanded, setExpanded] = useState(false);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  }

  return (
    <View style={styles.scoringCard}>
      <Pressable style={styles.scoringHeader} onPress={toggle} hitSlop={8}>
        <View style={styles.scoringHeaderLeft}>
          <Ionicons name="information-circle-outline" size={16} color={GOLD} />
          <Text style={styles.scoringHeaderText}>How scoring works</Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={Colors.dark.textSecondary}
        />
      </Pressable>
      {expanded ? (
        <View style={styles.scoringBody}>
          {SCORING_ROWS.map((row) => (
            <View key={row.label} style={styles.scoringRow}>
              <Text style={styles.scoringEmoji}>{row.emoji}</Text>
              <Text style={styles.scoringLabel}>{row.label}</Text>
              <Text style={styles.scoringNote}>{row.note}</Text>
              <Text style={styles.scoringPts}>{row.pts}</Text>
            </View>
          ))}
          <View style={styles.scoringDivider} />
          <Text style={styles.scoringFootnote}>
            Blowout: pick the game with the largest margin. High Scorer: pick the highest-scoring game. One pick per category per round. Picks lock before each round tips off.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Take Card (locked takes) ─────────────────────────────────────────────────

function TakeCard({
  takeType,
  take,
  onPress,
}: {
  takeType: TakeType;
  take: LockedTake | undefined;
  onPress: () => void;
}) {
  const cfg = TAKE_CONFIGS[takeType];
  const locked = isPicksLocked();
  const submitted = take?.is_submitted === true;
  const teams = take?.teams ?? [];

  const statusColor = submitted ? GREEN : locked ? "#6B7280" : GOLD;
  const statusIcon = submitted ? "checkmark-circle" : locked ? "lock-closed" : "radio-button-off";
  const statusText = submitted
    ? `${teams.length}/${cfg.count} locked in`
    : locked
    ? "No pick made"
    : `Open · pick ${cfg.count} team${cfg.count > 1 ? "s" : ""}`;
  const preview =
    submitted && teams.length > 0
      ? teams.slice(0, 3).join(", ") + (teams.length > 3 ? ` +${teams.length - 3}` : "")
      : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.takeCard,
        { borderColor: submitted ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)" },
        pressed && styles.cardPressed,
        locked && !submitted && styles.cardDimmed,
      ]}
      onPress={onPress}
      disabled={locked && !submitted}
    >
      <View style={[styles.takeIconBadge, { backgroundColor: `${cfg.color}18` }]}>
        <Text style={styles.takeEmoji}>{cfg.emoji}</Text>
      </View>
      <View style={styles.takeInfo}>
        <Text style={styles.takeName}>{cfg.label}</Text>
        <View style={styles.takeStatusRow}>
          <Ionicons name={statusIcon as any} size={12} color={statusColor} />
          <Text style={[styles.takeStatus, { color: statusColor }]}>{statusText}</Text>
        </View>
        {preview ? (
          <Text style={styles.takePreview} numberOfLines={1}>{preview}</Text>
        ) : null}
      </View>
      <View style={styles.takeMeta}>
        <Text style={styles.takePoints}>+{cfg.pointsEach * cfg.count}</Text>
        <Text style={styles.takePointsLabel}>pts max</Text>
        {!locked || submitted ? (
          <Ionicons
            name={submitted ? (locked ? "eye-outline" : "create-outline") : "chevron-forward"}
            size={16}
            color={submitted ? GREEN : Colors.dark.textSecondary}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Matchup Card (shared by all special pick types) ─────────────────────────

function MatchupCard({
  matchup,
  picked,
  canPick,
  isToggling,
  pickType,
  onPress,
}: {
  matchup: RankedMatchup;
  picked: boolean;
  canPick: boolean;
  isToggling: boolean;
  pickType: "upset" | "blowout" | "high_scorer";
  onPress: () => void;
}) {
  const accentColor =
    pickType === "upset" ? ORANGE : pickType === "blowout" ? PURPLE : BLUE;

  const rankDot = (
    <View style={[styles.rankDot, { backgroundColor: picked ? accentColor : "rgba(255,255,255,0.08)" }]}>
      <Text style={[styles.rankDotText, { color: picked ? "#fff" : Colors.dark.textSecondary }]}>
        {matchup.rank}
      </Text>
    </View>
  );

  const showSeedA = matchup.seedA > 0;
  const showSeedB = matchup.seedB > 0;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.matchupCard,
        picked && { borderColor: `${accentColor}50`, backgroundColor: `${accentColor}08` },
        !canPick && !picked && styles.matchupCardDisabled,
        pressed && canPick && styles.cardPressed,
      ]}
      onPress={onPress}
      disabled={(!canPick && !picked) || isToggling}
    >
      <View style={styles.matchupLeft}>
        {rankDot}
        <View style={styles.matchupTeams}>
          <View style={styles.matchupTeamRow}>
            {showSeedA ? (
              <View style={[styles.seedPill, pickType === "upset" && styles.seedPillFav]}>
                <Text style={styles.seedPillText}>{matchup.seedA}</Text>
              </View>
            ) : null}
            <Text
              style={[
                styles.matchupTeamName,
                pickType === "upset" && styles.matchupFavName,
              ]}
              numberOfLines={1}
            >
              {matchup.teamA}
            </Text>
          </View>
          <Text style={styles.vsLine}>vs</Text>
          <View style={styles.matchupTeamRow}>
            {showSeedB ? (
              <View style={[styles.seedPill, pickType === "upset" && styles.seedPillUnder]}>
                <Text style={[styles.seedPillText, pickType === "upset" && { color: ORANGE }]}>
                  {matchup.seedB}
                </Text>
              </View>
            ) : null}
            <Text
              style={[
                styles.matchupTeamName,
                picked && pickType === "upset" && { color: GREEN },
              ]}
              numberOfLines={1}
            >
              {matchup.teamB}
            </Text>
          </View>
          {matchup.gameDate ? (
            <Text style={styles.matchupMeta}>{matchup.gameDate}{matchup.site ? ` · ${matchup.site}` : ""}</Text>
          ) : null}
          {matchup.keyStat ? (
            <View style={styles.keyStatRow}>
              <Ionicons name="stats-chart" size={10} color={accentColor} />
              <Text style={[styles.keyStatText, { color: accentColor }]}>{matchup.keyStat}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.matchupRight}>
        {isToggling ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : picked ? (
          <View style={[styles.pickedBadge, { backgroundColor: `${accentColor}15` }]}>
            <Ionicons name="checkmark" size={14} color={accentColor} />
            <Text style={[styles.pickedBadgeText, { color: accentColor }]}>Called it</Text>
          </View>
        ) : canPick ? (
          <Ionicons name="add-circle-outline" size={20} color={Colors.dark.textSecondary} />
        ) : (
          <Ionicons name="remove-circle-outline" size={20} color="#374151" />
        )}
        {(matchup.spread !== undefined || matchup.underdogMoneyline !== undefined || matchup.overUnder !== undefined) ? (
          <Text style={styles.oddsHint}>
            {pickType === "blowout" && matchup.spread !== undefined ? `${matchup.spread.toFixed(1)} spread` : ""}
            {pickType === "high_scorer" && matchup.overUnder ? `o/u ${matchup.overUnder}` : ""}
            {pickType === "upset" && matchup.underdogMoneyline ? `+${matchup.underdogMoneyline}` : ""}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Special Picks Section ────────────────────────────────────────────────────

function SpecialPicksSection({
  roundId,
  pickType,
  label,
  icon,
  accentColor,
  description,
  matchups,
  picks,
  pickLimit,
  roundLocked,
  togglingId,
  onPick,
}: {
  roundId: string;
  pickType: "upset" | "blowout" | "high_scorer";
  label: string;
  icon: string;
  accentColor: string;
  description: string;
  matchups: RankedMatchup[];
  picks: SpecialPick[];
  pickLimit: number;
  roundLocked: boolean;
  togglingId: string | null;
  onPick: (matchup: RankedMatchup, isCurrentlyPicked: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const pickedIds = new Set(picks.filter((p) => p.pick_type === pickType).map((p) => p.matchup_id));
  const pickedCount = pickedIds.size;

  if (!matchups.length && !roundLocked) return null;

  const lockDate = getRoundLockDate(roundId);
  const lockStr = lockDate ? formatLockDate(lockDate.toISOString()) : "";

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  }

  return (
    <View style={styles.specialSection}>
      <Pressable style={styles.specialSectionHeader} onPress={toggle} hitSlop={6}>
        <View style={[styles.specialIconBadge, { backgroundColor: `${accentColor}18` }]}>
          <Text style={{ fontSize: 16 }}>{icon}</Text>
        </View>
        <View style={styles.specialSectionMeta}>
          <Text style={styles.specialSectionTitle}>{label}</Text>
          <Text style={styles.specialSectionSub}>{roundLabel(roundId)}</Text>
        </View>
        {pickLimit > 1 ? (
          <View style={[styles.pickCounter, pickedCount >= pickLimit && styles.pickCounterFull]}>
            <Text style={[styles.pickCountNum, pickedCount >= pickLimit && { color: GREEN }]}>
              {pickedCount}
            </Text>
            <Text style={styles.pickCountDivider}>/{pickLimit}</Text>
          </View>
        ) : (
          <View style={[styles.pickCounter, pickedCount > 0 && styles.pickCounterFull]}>
            <Ionicons
              name={pickedCount > 0 ? "checkmark-circle" : "ellipse-outline"}
              size={20}
              color={pickedCount > 0 ? GREEN : Colors.dark.textSecondary}
            />
          </View>
        )}
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={Colors.dark.textSecondary}
          style={{ marginLeft: 4 }}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.specialBody}>
          {roundLocked ? (
            <View style={styles.roundLockedRow}>
              <Ionicons name="lock-closed" size={13} color="#6B7280" />
              <Text style={styles.roundLockedText}>
                {lockStr ? `Locked ${lockStr}` : "Picks locked for this round"}
              </Text>
            </View>
          ) : (
            <Text style={styles.specialDesc}>{description}</Text>
          )}
          {matchups.map((m) => {
            const picked = pickedIds.has(m.matchupId);
            const canPick = !roundLocked && (
              pickType === "upset"
                ? (picked || pickedCount < pickLimit)
                : true
            );
            return (
              <MatchupCard
                key={m.matchupId}
                matchup={m}
                picked={picked}
                canPick={canPick}
                isToggling={togglingId === `${pickType}:${m.matchupId}`}
                pickType={pickType}
                onPress={() => canPick && onPick(m, picked)}
              />
            );
          })}
          {!matchups.length && roundLocked ? (
            <Text style={styles.noMatchupsText}>No featured matchups for this round yet.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PicksHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const currentRound = getCurrentRound();
  const roundId = getActivePicksRoundId(currentRound.id);
  const roundLocked = isRoundLocked(roundId);

  const { data: takes, isLoading: takesLoading } = useQuery<
    Partial<Record<TakeType, LockedTake>>
  >({
    queryKey: ["mm-locked-takes", user?.id],
    queryFn: () => fetchMyLockedTakes(user!.id),
    enabled: !!user,
  });

  const { data: specialPicks, isLoading: picksLoading } = useQuery<SpecialPick[]>({
    queryKey: ["mm-special-picks", user?.id, roundId],
    queryFn: () => fetchMySpecialPicks(user!.id, roundId),
    enabled: !!user,
  });

  const { data: roundMatchups, isLoading: matchupsLoading } = useQuery<RoundMatchups | null>({
    queryKey: ["mm-round-matchups", roundId],
    queryFn: () => fetchRoundMatchups(roundId),
    staleTime: 5 * 60 * 1000,
  });

  const { data: myScore } = useQuery({
    queryKey: ["mm-pick-score", user?.id],
    queryFn: () => fetchMyPickScore(user!.id),
    enabled: !!user,
  });

  const { data: isSecondChance = false } = useQuery<boolean>({
    queryKey: ["mm-second-chance", user?.id],
    queryFn: () => fetchSecondChanceStatus(user!.id),
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [nudgeGame, setNudgeGame] = useState<{ title: string } | null>(null);

  const pickMutation = useMutation({
    mutationFn: ({
      pickType,
      matchupId,
      pickedTeam,
    }: {
      pickType: "upset" | "blowout" | "high_scorer";
      matchupId: string;
      pickedTeam: string | null;
    }) => saveSpecialPick(user!.id, roundId, pickType, matchupId, pickedTeam, isSecondChance ? 0.5 : 1.0),
    onSuccess: (result) => {
      setTogglingId(null);
      if (result.error) {
        Alert.alert("Can't pick that", result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["mm-special-picks"] });
    },
    onError: () => setTogglingId(null),
  });

  function handlePick(
    pickType: "upset" | "blowout" | "high_scorer",
    matchup: RankedMatchup,
    isCurrentlyPicked: boolean,
  ) {
    const pickedTeam =
      pickType === "upset" ? (matchup.underdogTeam ?? matchup.teamB) : null;
    setTogglingId(`${pickType}:${matchup.matchupId}`);
    if (!isCurrentlyPicked) {
      setNudgeGame({ title: `${matchup.teamA} vs. ${matchup.teamB}` });
    } else {
      setNudgeGame(null);
    }
    pickMutation.mutate({ pickType, matchupId: matchup.matchupId, pickedTeam });
  }

  function handleTakePress(takeType: TakeType) {
    router.push({
      pathname: "/march-madness/locked-take",
      params: { type: takeType },
    });
  }

  const topPadding = isWeb ? 67 : insets.top;
  const isLoading = takesLoading || picksLoading || matchupsLoading;
  const upsetLimit = UPSET_LIMITS[roundId] ?? 3;

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>March Madness Picks</Text>
        {myScore && myScore.total_points > 0 ? (
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreBadgeText}>{myScore.total_points} pts</Text>
          </View>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: isWeb ? 34 + 100 : insets.bottom + 100 },
        ]}
      >
        <BracketLockBanner />

        {/* Prize strip */}
        <View style={styles.prizeStrip}>
          <Ionicons name="trophy" size={13} color={GOLD} />
          <Text style={styles.prizeStripText}>
            Leaderboard leader at the end of the tournament wins a $100 Amazon gift card
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.leaderboardBtn, pressed && styles.cardPressed]}
          onPress={() => router.push("/march-madness/picks-leaderboard")}
        >
          <Ionicons name="trophy-outline" size={18} color={GOLD} />
          <Text style={styles.leaderboardBtnText}>Picks Leaderboard</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.dark.textSecondary} />
        </Pressable>

        <ScoringGuide />

        {isLoading ? (
          <ActivityIndicator color={ORANGE} style={{ marginTop: 48 }} />
        ) : (
          <>
            {/* Locked Takes Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>BRACKET TAKES</Text>
                <Text style={styles.sectionSub}>Correct picks earn leaderboard points</Text>
              </View>
              {TAKE_ORDER.map((takeType) => (
                <TakeCard
                  key={takeType}
                  takeType={takeType}
                  take={takes?.[takeType]}
                  onPress={() => handleTakePress(takeType)}
                />
              ))}
            </View>

            {/* Per-round lock notice */}
            {!roundLocked ? (
              <View style={styles.roundPicksBanner}>
                <Ionicons name="time-outline" size={14} color={ORANGE} />
                <Text style={styles.roundPicksBannerText}>
                  {roundLabel(roundId)} picks lock {formatLockDate(
                    (getRoundLockDate(roundId) ?? new Date()).toISOString()
                  )}
                </Text>
              </View>
            ) : null}

            {/* Second-chance banner */}
            {isSecondChance && !roundLocked && (
              <View style={styles.secondChanceBanner}>
                <Ionicons name="flash-outline" size={16} color="#F59E0B" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.secondChanceTitle}>Second Chance — ½ Points</Text>
                  <Text style={styles.secondChanceSub}>
                    You missed the initial deadline. You can still pick, but correct picks earn half points (1.5 pts each).
                  </Text>
                </View>
              </View>
            )}
            {isSecondChance && roundLocked && (
              <View style={[styles.secondChanceBanner, { opacity: 0.7 }]}>
                <Ionicons name="flash-outline" size={16} color="#F59E0B" />
                <Text style={styles.secondChanceTitle}>Second Chance picks — locked</Text>
              </View>
            )}

            {/* Round-by-round Special Picks */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>ROUND PICKS · {roundLabel(roundId).toUpperCase()}</Text>
                <Text style={styles.sectionSub}>
                  {isSecondChance
                    ? (roundMatchups?.oddsSource === "live"
                        ? "Ranked by live odds · 1.5 pts per correct pick (2nd chance)"
                        : "Ranked by seed data · 1.5 pts per correct pick (2nd chance)")
                    : (roundMatchups?.oddsSource === "live"
                        ? "Ranked by live odds · 3 pts per correct pick"
                        : "Ranked by seed data · 3 pts per correct pick")}
                </Text>
              </View>

              <SpecialPicksSection
                roundId={roundId}
                pickType="upset"
                label="Upset Pick"
                icon="💥"
                accentColor={ORANGE}
                description={`Pick up to ${upsetLimit} team${upsetLimit > 1 ? "s" : ""} you think will pull off an upset. Top candidates ranked by upset probability. Correct picks earn 3 pts each.`}
                matchups={roundMatchups?.upset ?? []}
                picks={specialPicks ?? []}
                pickLimit={upsetLimit}
                roundLocked={roundLocked}
                togglingId={togglingId}
                onPick={(m, isPicked) => handlePick("upset", m, isPicked)}
              />

              <SpecialPicksSection
                roundId={roundId}
                pickType="blowout"
                label="Blowout Pick"
                icon="🎯"
                accentColor={PURPLE}
                description="Pick the game you think will have the largest margin of victory. Highest margin wins. Earns 3 pts."
                matchups={roundMatchups?.blowout ?? []}
                picks={specialPicks ?? []}
                pickLimit={1}
                roundLocked={roundLocked}
                togglingId={togglingId}
                onPick={(m, isPicked) => handlePick("blowout", m, isPicked)}
              />

              <SpecialPicksSection
                roundId={roundId}
                pickType="high_scorer"
                label="High Scorer Pick"
                icon="🏀"
                accentColor={BLUE}
                description="Pick the game you think will have the most combined points. Highest total wins. Earns 3 pts."
                matchups={roundMatchups?.highScorer ?? []}
                picks={specialPicks ?? []}
                pickLimit={1}
                roundLocked={roundLocked}
                togglingId={togglingId}
                onPick={(m, isPicked) => handlePick("high_scorer", m, isPicked)}
              />
            </View>

            {nudgeGame && (
              <View style={styles.nudgeCard}>
                <View style={styles.nudgeLeft}>
                  <Text style={styles.nudgeHeading}>Nice pick 👊</Text>
                  <Text style={styles.nudgeGame} numberOfLines={1}>{nudgeGame.title}</Text>
                  <Text style={styles.nudgeBody}>
                    Challenge a friend on this game and put bragging rights on the line.
                  </Text>
                  <Pressable
                    style={({ pressed }) => [styles.nudgeBtn, pressed && { opacity: 0.85 }]}
                    onPress={() => {
                      router.push({
                        pathname: "/(tabs)/create",
                        params: {
                          prefillCategory: "March Madness",
                          prefillTitle: nudgeGame.title,
                        },
                      });
                    }}
                  >
                    <Ionicons name="flash" size={13} color="#fff" />
                    <Text style={styles.nudgeBtnText}>Make it a Swayger</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={styles.nudgeDismiss}
                  onPress={() => setNudgeGame(null)}
                  hitSlop={12}
                >
                  <Ionicons name="close" size={16} color={Colors.dark.textSecondary} />
                </Pressable>
              </View>
            )}

          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
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
  headerTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Colors.dark.text,
    letterSpacing: -0.3,
  },
  scoreBadge: {
    backgroundColor: "rgba(245,166,35,0.15)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.3)",
  },
  scoreBadgeText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: GOLD,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  lockBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245,166,35,0.08)",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.25)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  lockBannerLocked: {
    backgroundColor: "rgba(107,114,128,0.08)",
    borderColor: "rgba(107,114,128,0.2)",
  },
  lockBannerText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: GOLD,
    flex: 1,
  },
  lockBannerTextLocked: {
    color: "#6B7280",
  },
  section: {
    gap: 10,
    marginTop: 4,
  },
  sectionHeaderRow: {
    gap: 2,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: Colors.dark.textSecondary,
    letterSpacing: 1.2,
  },
  sectionSub: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    opacity: 0.7,
  },
  roundPicksBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${ORANGE}0A`,
    borderWidth: 1,
    borderColor: `${ORANGE}30`,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  roundPicksBannerText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: ORANGE,
    flex: 1,
  },
  secondChanceBanner: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  secondChanceTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#F59E0B",
  },
  secondChanceSub: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
    lineHeight: 17,
  },
  takeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  cardPressed: {
    opacity: 0.75,
  },
  cardDimmed: {
    opacity: 0.45,
  },
  takeIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  takeEmoji: {
    fontSize: 22,
  },
  takeInfo: {
    flex: 1,
    gap: 3,
  },
  takeName: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  takeStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  takeStatus: {
    fontSize: 12,
    fontWeight: "500" as const,
  },
  takePreview: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
    marginTop: 1,
  },
  takeMeta: {
    alignItems: "flex-end",
    gap: 2,
  },
  takePoints: {
    fontSize: 16,
    fontWeight: "800" as const,
    color: GOLD,
  },
  takePointsLabel: {
    fontSize: 9,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
    letterSpacing: 0.5,
  },
  specialSection: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  specialSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  specialIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  specialSectionMeta: {
    flex: 1,
  },
  specialSectionTitle: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  specialSectionSub: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 1,
  },
  pickCounter: {
    flexDirection: "row",
    alignItems: "baseline",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pickCounterFull: {
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  pickCountNum: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: ORANGE,
  },
  pickCountDivider: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
  },
  specialBody: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 10,
    gap: 8,
  },
  specialDesc: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    lineHeight: 17,
    marginBottom: 4,
  },
  roundLockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  roundLockedText: {
    fontSize: 12,
    color: "#6B7280",
  },
  noMatchupsText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 8,
  },
  matchupCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 10,
    gap: 10,
  },
  matchupCardDisabled: {
    opacity: 0.38,
  },
  matchupLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  rankDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  rankDotText: {
    fontSize: 10,
    fontWeight: "700" as const,
  },
  matchupTeams: {
    flex: 1,
    gap: 2,
  },
  matchupTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  matchupTeamName: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.dark.text,
    flex: 1,
  },
  matchupFavName: {
    color: Colors.dark.textSecondary,
    fontWeight: "500" as const,
  },
  vsLine: {
    fontSize: 9,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
    letterSpacing: 0.5,
    marginLeft: 27,
  },
  matchupMeta: {
    fontSize: 10,
    color: Colors.dark.textSecondary,
    marginTop: 2,
    marginLeft: 27,
  },
  keyStatRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    marginTop: 3,
    marginLeft: 27,
  },
  keyStatText: {
    fontSize: 10,
    fontWeight: "600" as const,
    fontStyle: "italic" as const,
  },
  matchupRight: {
    alignItems: "flex-end",
    gap: 4,
    minWidth: 70,
  },
  pickedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pickedBadgeText: {
    fontSize: 11,
    fontWeight: "600" as const,
  },
  oddsHint: {
    fontSize: 10,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
  },
  seedPill: {
    backgroundColor: "rgba(107,114,128,0.25)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: "center",
  },
  seedPillFav: {
    backgroundColor: "rgba(107,114,128,0.18)",
  },
  seedPillUnder: {
    backgroundColor: `${ORANGE}25`,
  },
  seedPillText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: Colors.dark.textSecondary,
  },
  scoringCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.15)",
    overflow: "hidden",
  },
  scoringHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  scoringHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scoringHeaderText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: GOLD,
  },
  scoringBody: {
    borderTopWidth: 1,
    borderTopColor: "rgba(245,166,35,0.1)",
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 8,
    gap: 10,
  },
  scoringRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  scoringEmoji: {
    fontSize: 15,
    width: 22,
    textAlign: "center" as const,
  },
  scoringLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.dark.text,
    flex: 1,
  },
  scoringNote: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginRight: 4,
  },
  scoringPts: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: GOLD,
    minWidth: 80,
    textAlign: "right" as const,
  },
  scoringDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 4,
  },
  scoringFootnote: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    lineHeight: 16,
    fontStyle: "italic",
  },
  leaderboardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 16,
    marginTop: 8,
  },
  leaderboardBtnText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: Colors.dark.text,
    flex: 1,
  },
  prizeStrip: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: "rgba(245,166,35,0.08)",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.22)",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  prizeStripText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600" as const,
    color: "#C8A84B",
    lineHeight: 17,
  },
  nudgeCard: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    backgroundColor: "rgba(232,89,10,0.1)",
    borderWidth: 1,
    borderColor: "rgba(232,89,10,0.35)",
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginTop: 4,
  },
  nudgeLeft: {
    flex: 1,
    gap: 4,
  },
  nudgeHeading: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: ORANGE,
  },
  nudgeGame: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  nudgeBody: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    lineHeight: 17,
  },
  nudgeBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    backgroundColor: ORANGE,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignSelf: "flex-start" as const,
    marginTop: 6,
  },
  nudgeBtnText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#fff",
  },
  nudgeDismiss: {
    padding: 2,
  },
});
