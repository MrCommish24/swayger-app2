import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  Share,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import NBABracketShareCard from "@/components/NBABracketShareCard";
import {
  fetchAllSeries,
  fetchMyBracketPicks,
  saveBracketPick,
  fetchLeaderboard,
  isRoundLocked,
  formatLockDate,
  ROUND_LOCK_DATES,
  ROUND_LABELS,
  ROUND_POINTS,
  GAMES_BONUS_POINTS,
  PLAYOFF_ROUND_ORDER,
  type PlayoffSeries,
  type BracketPick,
  type PlayoffRound,
  type PlayoffScore,
} from "@/lib/nba-playoffs";

const NBA_BLUE = "#1D428A";
const NBA_GOLD = "#FFC72C";
const LOCKED_COLOR = "#6B7280";

function formatGameDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function GamesSelector({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (g: number) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.gamesRow}>
      <Text style={styles.gamesLabel}>Games:</Text>
      {[4, 5, 6, 7].map((g) => (
        <Pressable
          key={g}
          style={[
            styles.gamesBtn,
            value === g && styles.gamesBtnActive,
            disabled && styles.gamesBtnDisabled,
          ]}
          onPress={() => !disabled && onChange(g)}
          disabled={disabled}
        >
          <Text style={[styles.gamesBtnText, value === g && styles.gamesBtnTextActive]}>
            {g}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function SeriesCard({
  series,
  pick,
  onPick,
  locked,
}: {
  series: PlayoffSeries;
  pick: BracketPick | undefined;
  onPick: (seriesId: string, team: string, games: number | null) => void;
  locked: boolean;
}) {
  const [selectedTeam, setSelectedTeam] = useState<string | null>(pick?.picked_team ?? null);
  const [selectedGames, setSelectedGames] = useState<number | null>(pick?.games_guess ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedTeam(pick?.picked_team ?? null);
    setSelectedGames(pick?.games_guess ?? null);
  }, [pick?.picked_team, pick?.games_guess]);

  const isTBD = series.team1.startsWith("TBD") || series.team2.startsWith("TBD");
  const isResolved = !!series.winner;
  const effectiveLocked = locked || isTBD;

  async function handlePick(team: string) {
    if (effectiveLocked || saving) return;
    const newTeam = selectedTeam === team ? null : team;
    setSelectedTeam(newTeam);
    if (!newTeam) return;

    setSaving(true);
    try {
      await onPick(series.id, newTeam, selectedGames);
    } catch {
      setSelectedTeam(pick?.picked_team ?? null);
    } finally {
      setSaving(false);
    }
  }

  async function handleGames(g: number) {
    if (effectiveLocked || saving || !selectedTeam) return;
    setSelectedGames(g);
    setSaving(true);
    try {
      await onPick(series.id, selectedTeam, g);
    } catch {
      setSelectedGames(pick?.games_guess ?? null);
    } finally {
      setSaving(false);
    }
  }

  const seedLabel = series.seed1 && series.seed2
    ? `(${series.seed1}) vs (${series.seed2})`
    : "";

  return (
    <View style={[styles.seriesCard, isResolved && styles.seriesCardResolved]}>
      {/* Header row */}
      <View style={styles.seriesHeader}>
        <Text style={styles.seriesSeedLabel}>{seedLabel}</Text>
        {series.starts_at && (
          <Text style={styles.seriesDate}>{formatGameDate(series.starts_at)}</Text>
        )}
        {saving && <ActivityIndicator size="small" color={NBA_GOLD} />}
        {isResolved && (
          <View style={styles.resolvedBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
            <Text style={styles.resolvedText}>Final</Text>
          </View>
        )}
      </View>

      {/* Team buttons */}
      <View style={styles.teamRow}>
        {[series.team1, series.team2].map((team, idx) => {
          const isPicked = selectedTeam === team;
          const isWinner = isResolved && series.winner === team;
          const isLoser = isResolved && series.winner && series.winner !== team;
          const pickedCorrectly = isPicked && isWinner;
          const pickedWrong = isPicked && isLoser;

          return (
            <Pressable
              key={`${idx}-${team}`}
              style={[
                styles.teamBtn,
                isPicked && !isResolved && styles.teamBtnPicked,
                isWinner && styles.teamBtnWinner,
                isLoser && styles.teamBtnLoser,
                effectiveLocked && !isResolved && styles.teamBtnLocked,
              ]}
              onPress={() => handlePick(team)}
              disabled={effectiveLocked || isTBD}
            >
              {pickedCorrectly && (
                <Ionicons name="checkmark-circle" size={14} color="#22C55E" style={{ marginRight: 4 }} />
              )}
              {pickedWrong && (
                <Ionicons name="close-circle" size={14} color="#EF4444" style={{ marginRight: 4 }} />
              )}
              <Text
                style={[
                  styles.teamBtnText,
                  isPicked && !isResolved && styles.teamBtnTextPicked,
                  isWinner && styles.teamBtnTextWinner,
                  isLoser && styles.teamBtnTextLoser,
                ]}
                numberOfLines={1}
              >
                {team}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Games selector — only show when a team is picked and not resolved */}
      {selectedTeam && !isResolved && !effectiveLocked && (
        <GamesSelector
          value={selectedGames}
          onChange={handleGames}
          disabled={effectiveLocked}
        />
      )}

      {/* Result: show games if resolved and user picked */}
      {isResolved && series.games && (
        <View style={styles.resultRow}>
          <Text style={styles.resultText}>
            Series ended in {series.games} games
            {selectedGames === series.games ? " · 🎯 Games correct!" : ""}
          </Text>
        </View>
      )}

      {/* TBD overlay */}
      {isTBD && !isResolved && (
        <Text style={styles.tbdText}>Matchup TBD — check back after Play-In</Text>
      )}
    </View>
  );
}

function RoundSection({
  round,
  seriesList,
  picks,
  onPick,
  onShare,
}: {
  round: PlayoffRound;
  seriesList: PlayoffSeries[];
  picks: BracketPick[];
  onPick: (seriesId: string, team: string, games: number | null) => void;
  onShare: (round: PlayoffRound) => void;
}) {
  const locked = isRoundLocked(round);
  const lockDate = ROUND_LOCK_DATES[round];
  const pts = ROUND_POINTS[round];
  const bonus = GAMES_BONUS_POINTS[round];
  const picksMap = new Map(picks.map((p) => [p.series_id, p]));
  const pickCount = seriesList.filter((s) => picksMap.has(s.id)).length;
  const total = seriesList.length;
  const hasPicksForRound = pickCount > 0;

  return (
    <View style={styles.roundSection}>
      {/* Round header */}
      <View style={styles.roundHeader}>
        <View style={styles.roundTitleRow}>
          <Text style={styles.roundTitle}>{ROUND_LABELS[round]}</Text>
          {locked ? (
            <View style={styles.lockedBadge}>
              <Ionicons name="lock-closed" size={12} color={LOCKED_COLOR} />
              <Text style={styles.lockedBadgeText}>Locked</Text>
            </View>
          ) : (
            <View style={styles.openBadge}>
              <Ionicons name="pencil" size={12} color={NBA_GOLD} />
              <Text style={styles.openBadgeText}>Open</Text>
            </View>
          )}
          {locked && hasPicksForRound && (
            <Pressable
              style={({ pressed }) => [styles.shareRoundBtn, pressed && { opacity: 0.7 }]}
              onPress={() => onShare(round)}
              hitSlop={8}
            >
              <Ionicons name="share-outline" size={14} color={NBA_GOLD} />
              <Text style={styles.shareRoundBtnText}>Share</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.roundMeta}>
          <Text style={styles.roundPts}>
            {pts.toLocaleString()} pts · +{bonus} bonus
          </Text>
          {!locked && total > 0 && (
            <Text style={styles.roundProgress}>
              {pickCount}/{total} picked
            </Text>
          )}
        </View>
        {!locked && (
          <Text style={styles.roundLock}>
            Locks {formatLockDate(lockDate)}
          </Text>
        )}
      </View>

      {/* Series cards */}
      {seriesList.length === 0 ? (
        <View style={styles.roundEmpty}>
          <Ionicons name="time-outline" size={20} color={Colors.dark.textSecondary} />
          <Text style={styles.roundEmptyText}>Matchups announced after previous round</Text>
        </View>
      ) : (
        seriesList.map((s) => (
          <SeriesCard
            key={s.id}
            series={s}
            pick={picksMap.get(s.id)}
            onPick={onPick}
            locked={locked}
          />
        ))
      )}
    </View>
  );
}

// Canonical Round 1 order — East (1-4) then West (1-4) by seed
// The two 1v8 slots have a known 1 seed but TBD 8 seed (play-in determines it).
const ROUND1_SERIES_ORDER: {
  id: string;
  seed1: number;
  seed2: number;
  team1Fallback: string;
  team2Fallback: string;
  conference: "east" | "west";
}[] = [
  // East
  { id: "r1-east-detroit-pistons-vs-tbd",               seed1: 1, seed2: 8, team1Fallback: "Detroit Pistons",          team2Fallback: "TBD", conference: "east" },
  { id: "r1-east-boston-celtics-vs-philadelphia-76ers",  seed1: 2, seed2: 7, team1Fallback: "Boston Celtics",           team2Fallback: "Philadelphia 76ers", conference: "east" },
  { id: "r1-east-new-york-knicks-vs-atlanta-hawks",      seed1: 3, seed2: 6, team1Fallback: "New York Knicks",          team2Fallback: "Atlanta Hawks", conference: "east" },
  { id: "r1-east-cleveland-cavaliers-vs-toronto-raptors",seed1: 4, seed2: 5, team1Fallback: "Cleveland Cavaliers",      team2Fallback: "Toronto Raptors", conference: "east" },
  // West
  { id: "r1-west-oklahoma-city-thunder-vs-tbd",          seed1: 1, seed2: 8, team1Fallback: "Oklahoma City Thunder",    team2Fallback: "TBD", conference: "west" },
  { id: "r1-west-san-antonio-spurs-vs-portland-trail-blazers", seed1: 2, seed2: 7, team1Fallback: "San Antonio Spurs", team2Fallback: "Portland Trail Blazers", conference: "west" },
  { id: "r1-west-denver-nuggets-vs-minnesota-timberwolves", seed1: 3, seed2: 6, team1Fallback: "Denver Nuggets",       team2Fallback: "Minnesota Timberwolves", conference: "west" },
  { id: "r1-west-los-angeles-lakers-vs-houston-rockets", seed1: 4, seed2: 5, team1Fallback: "Los Angeles Lakers",      team2Fallback: "Houston Rockets", conference: "west" },
];

function canonicalizeRound1Series(series: PlayoffSeries[]): PlayoffSeries[] {
  const map = new Map(series.map((s) => [s.id, s]));
  return ROUND1_SERIES_ORDER.map(({ id, seed1, seed2, team1Fallback, team2Fallback, conference }, index) => {
    const row = map.get(id);
    if (row) return row;
    return {
      id,
      season: "2026",
      round: "round1",
      conference,
      seed1,
      seed2,
      team1: team1Fallback,
      team2: team2Fallback,
      winner: null,
      games: null,
      starts_at: null,
      sort_order: index,
      created_at: "",
      updated_at: "",
    } as PlayoffSeries;
  });
}

export default function BracketScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const [shareRound, setShareRound] = useState<PlayoffRound | null>(null);
  const [sharing, setSharing] = useState(false);
  const [justCompletedRound, setJustCompletedRound] = useState<PlayoffRound | null>(null);
  const shareCardRef = useRef<View>(null);

  const { data: allSeries, isLoading: seriesLoading } = useQuery<PlayoffSeries[]>({
    queryKey: ["/api/nba/series"],
    queryFn: fetchAllSeries,
    staleTime: 60_000,
  });

  const { data: myPicks } = useQuery<BracketPick[]>({
    queryKey: ["/nba/my-picks", user?.id],
    queryFn: () => fetchMyBracketPicks(user!.id),
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const { data: leaderboard } = useQuery<PlayoffScore[]>({
    queryKey: ["/api/nba/leaderboard"],
    queryFn: fetchLeaderboard,
    staleTime: 120_000,
  });

  const userScore = leaderboard?.find((s) => s.user_id === user?.id);
  const userRank = userScore
    ? (leaderboard ?? []).filter((s) => s.total_pts > (userScore?.total_pts ?? 0)).length + 1
    : undefined;
  const playerCount = leaderboard?.length ?? 0;

  const saveMutation = useMutation({
    mutationFn: async ({
      seriesId,
      team,
      games,
    }: {
      seriesId: string;
      team: string;
      games: number | null;
    }) => {
      if (!user?.id) throw new Error("Not signed in");
      await saveBracketPick(user.id, seriesId, team, games);
    },
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: ["/nba/my-picks", user?.id] });
      // Check if this pick completed a round
      setTimeout(() => {
        const currentPicks = queryClient.getQueryData<BracketPick[]>(["/nba/my-picks", user?.id]) ?? [];
        const series = queryClient.getQueryData<PlayoffSeries[]>(["/api/nba/series"]) ?? [];
        for (const round of PLAYOFF_ROUND_ORDER) {
          if (isRoundLocked(round)) continue;
          const roundSeries = series.filter(
            (s) => s.round === round && !s.team1.startsWith("TBD") && !s.team2.startsWith("TBD")
          );
          if (roundSeries.length === 0) continue;
          const pickedIds = new Set(currentPicks.map((p) => p.series_id));
          const allPicked = roundSeries.every((s) => pickedIds.has(s.id));
          if (allPicked && roundSeries.some((s) => s.id === seriesId)) {
            setJustCompletedRound(round);
          }
        }
      }, 300);
    },
    onError: () => {
      Alert.alert("Error", "Couldn't save your pick. Try again.");
    },
  });

  async function handlePick(seriesId: string, team: string, games: number | null) {
    await saveMutation.mutateAsync({ seriesId, team, games });
  }

  async function handleShare() {
    if (!shareCardRef.current) return;
    setSharing(true);
    try {
      if (Platform.OS === "web") {
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
        link.download = `swayger-nba-${shareRound ?? "picks"}.png`;
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
      console.error("[nba-share]", e);
      Alert.alert("Couldn't capture image", "Try taking a screenshot instead.");
    } finally {
      setSharing(false);
    }
  }

  // Group series by round
  const seriesByRound = new Map<PlayoffRound, PlayoffSeries[]>();
  for (const round of PLAYOFF_ROUND_ORDER) {
    seriesByRound.set(
      round,
      round === "round1"
        ? canonicalizeRound1Series((allSeries ?? []).filter((s) => s.round === "round1"))
        : (allSeries ?? []).filter((s) => s.round === round)
    );
  }

  const displayName = profile?.display_name || `@${profile?.username || "you"}`;
  const ROUND_SCORE_KEYS: Record<PlayoffRound, keyof PlayoffScore> = {
    round1: "round1_pts",
    round2: "round2_pts",
    conf_finals: "conf_finals_pts",
    finals: "finals_pts",
  };
  const shareRoundScore = shareRound && userScore
    ? (userScore[ROUND_SCORE_KEYS[shareRound]] as number) ?? 0
    : undefined;

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace("/playoffs")}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>🏀 Bracket Picks</Text>
        <View style={{ width: 34 }} />
      </View>

      {/* Scoring legend */}
      <View style={styles.scoringBanner}>
        <Text style={styles.scoringText}>
          Pick the series winner · +bonus for calling # of games
        </Text>
        <Text style={styles.scoringText}>
          R1: 100 pts · R2: 300 · CF: 1,000 · Finals: 3,000
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {seriesLoading ? (
          <ActivityIndicator color={NBA_GOLD} style={{ marginTop: 40 }} />
        ) : (
          PLAYOFF_ROUND_ORDER.map((round) => (
            <RoundSection
              key={round}
              round={round}
              seriesList={seriesByRound.get(round) ?? []}
              picks={myPicks ?? []}
              onPick={handlePick}
              onShare={(r) => setShareRound(r)}
            />
          ))
        )}
      </ScrollView>

      {/* Completion banner — shown after finishing all picks in a round */}
      {justCompletedRound && !shareRound && (
        <View style={[styles.completionBanner, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 8 }]}>
          <View style={styles.completionBannerInner}>
            <View style={styles.completionBannerLeft}>
              <Text style={styles.completionEmoji}>🎉</Text>
              <View>
                <Text style={styles.completionTitle}>All picks locked in!</Text>
                <Text style={styles.completionSub}>
                  {ROUND_LABELS[justCompletedRound]} · share your bracket
                </Text>
              </View>
            </View>
            <View style={styles.completionActions}>
              <Pressable
                style={({ pressed }) => [styles.completionShareBtn, pressed && { opacity: 0.85 }]}
                onPress={() => { setShareRound(justCompletedRound); setJustCompletedRound(null); }}
              >
                <Ionicons name="share-outline" size={16} color="#FFFFFF" />
                <Text style={styles.completionShareBtnText}>Share</Text>
              </Pressable>
              <Pressable onPress={() => setJustCompletedRound(null)} hitSlop={12}>
                <Ionicons name="close" size={18} color={Colors.dark.textSecondary} />
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Share overlay modal */}
      {shareRound && (
        <View style={styles.shareOverlay}>
          <Pressable style={styles.shareOverlayBackdrop} onPress={() => setShareRound(null)} />
          <View style={[styles.shareOverlayContent, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}>
            <View style={styles.shareOverlayHandle} />
            <Text style={styles.shareOverlayTitle}>
              Share {ROUND_LABELS[shareRound]} Picks
            </Text>

            {/* Rendered share card (captured for image export) */}
            <View style={styles.shareCardWrap} pointerEvents="none">
              <View ref={shareCardRef} collapsable={false}>
                <NBABracketShareCard
                  round={shareRound}
                  picks={myPicks ?? []}
                  series={allSeries ?? []}
                  displayName={displayName}
                  score={shareRoundScore && shareRoundScore > 0 ? shareRoundScore : undefined}
                  rank={userRank}
                  playerCount={playerCount > 0 ? playerCount : undefined}
                />
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.85 }]}
              onPress={handleShare}
              disabled={sharing}
            >
              {sharing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.shareBtnText}>
                    {Platform.OS === "web" ? "Download Card" : "Share My Picks"}
                  </Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.shareDismiss, pressed && { opacity: 0.7 }]}
              onPress={() => setShareRound(null)}
            >
              <Text style={styles.shareDismissText}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backBtn: { width: 34, alignItems: "flex-start" },
  headerTitle: { fontSize: 17, fontWeight: "700" as const, color: Colors.dark.text },

  scoringBanner: {
    backgroundColor: `${NBA_BLUE}18`,
    borderBottomWidth: 1,
    borderBottomColor: `${NBA_BLUE}40`,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 2,
  },
  scoringText: { fontSize: 12, color: Colors.dark.textSecondary, textAlign: "center" },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 24 },

  roundSection: { gap: 10 },
  roundHeader: { gap: 4, paddingBottom: 4 },
  roundTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  roundTitle: { fontSize: 18, fontWeight: "800" as const, color: Colors.dark.text },
  lockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${LOCKED_COLOR}18`,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lockedBadgeText: { fontSize: 11, color: LOCKED_COLOR, fontWeight: "600" as const },
  openBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${NBA_GOLD}18`,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  openBadgeText: { fontSize: 11, color: NBA_GOLD, fontWeight: "600" as const },
  roundMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  roundPts: { fontSize: 13, color: NBA_GOLD, fontWeight: "600" as const },
  roundProgress: { fontSize: 13, color: Colors.dark.textSecondary },
  roundLock: { fontSize: 12, color: Colors.dark.textSecondary },
  roundEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
  },
  roundEmptyText: { fontSize: 13, color: Colors.dark.textSecondary },

  seriesCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 14,
    gap: 10,
  },
  seriesCardResolved: { borderColor: "#22C55E30", backgroundColor: "#22C55E08" },
  seriesHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  seriesSeedLabel: { fontSize: 12, color: Colors.dark.textSecondary, flex: 1 },
  seriesDate: { fontSize: 12, color: Colors.dark.textSecondary },
  resolvedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#22C55E18",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  resolvedText: { fontSize: 11, color: "#22C55E", fontWeight: "600" as const },

  teamRow: { flexDirection: "row", gap: 8 },
  teamBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: Colors.dark.background,
  },
  teamBtnPicked: {
    borderColor: NBA_BLUE,
    backgroundColor: `${NBA_BLUE}20`,
  },
  teamBtnWinner: {
    borderColor: "#22C55E",
    backgroundColor: "#22C55E18",
  },
  teamBtnLoser: {
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
    opacity: 0.5,
  },
  teamBtnLocked: { opacity: 0.7 },
  teamBtnText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  teamBtnTextPicked: { color: Colors.dark.text },
  teamBtnTextWinner: { color: "#22C55E" },
  teamBtnTextLoser: { color: Colors.dark.textSecondary },

  gamesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 4,
  },
  gamesLabel: { fontSize: 13, color: Colors.dark.textSecondary, marginRight: 4 },
  gamesBtn: {
    width: 40,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.background,
  },
  gamesBtnActive: { borderColor: NBA_GOLD, backgroundColor: `${NBA_GOLD}20` },
  gamesBtnDisabled: { opacity: 0.5 },
  gamesBtnText: { fontSize: 14, fontWeight: "600" as const, color: Colors.dark.textSecondary },
  gamesBtnTextActive: { color: NBA_GOLD },

  resultRow: { paddingTop: 4 },
  resultText: { fontSize: 12, color: Colors.dark.textSecondary, fontStyle: "italic" },

  tbdText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
    textAlign: "center",
    paddingTop: 2,
  },

  shareRoundBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${NBA_GOLD}15`,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${NBA_GOLD}30`,
    marginLeft: "auto" as any,
  },
  shareRoundBtnText: { fontSize: 11, fontWeight: "700" as const, color: NBA_GOLD },

  completionBanner: {
    backgroundColor: Colors.dark.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  completionBannerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  completionBannerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  completionEmoji: { fontSize: 24 },
  completionTitle: { fontSize: 14, fontWeight: "700" as const, color: Colors.dark.text },
  completionSub: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 1 },
  completionActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  completionShareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: NBA_BLUE,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  completionShareBtnText: { fontSize: 13, fontWeight: "700" as const, color: "#FFFFFF" },

  shareOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
  },
  shareOverlayBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  shareOverlayContent: {
    backgroundColor: Colors.dark.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: 20,
    paddingTop: 12,
    alignItems: "center",
    gap: 16,
  },
  shareOverlayHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.border,
    marginBottom: 4,
  },
  shareOverlayTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Colors.dark.text,
    letterSpacing: -0.3,
  },
  shareCardWrap: { alignItems: "center" },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: NBA_BLUE,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 32,
    width: "100%",
  },
  shareBtnText: { fontSize: 16, fontWeight: "700" as const, color: "#FFFFFF" },
  shareDismiss: { paddingVertical: 6 },
  shareDismissText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
    textDecorationLine: "underline",
  },
});
