import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import { PushNotificationBanner } from "@/components/PushNotificationBanner";
import {
  fetchLeaderboard,
  fetchNBAGames,
  fetchMyBracketPicks,
  fetchAllSeries,
  formatAmericanOdds,
  isRoundLocked,
  type PlayoffRound,
  type PlayoffScore,
  type NBAGame,
  type BracketPick,
  type PlayoffSeries,
} from "@/lib/nba-playoffs";

const ROUND_LABELS: Record<PlayoffRound, string> = {
  round1: "Round 1",
  round2: "Round 2",
  conf_finals: "Conf. Finals",
  finals: "NBA Finals",
};
const ROUND_ORDER: PlayoffRound[] = ["round1", "round2", "conf_finals", "finals"];

const NBA_BLUE = "#1D428A";
const NBA_GOLD = "#FFC72C";
const GOLD = "#F5A623";
const RANK_LABELS = ["🥇", "🥈", "🥉"] as const;

function formatGameTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isToday) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function LiveGameCard({ game }: { game: NBAGame }) {
  const router = useRouter();
  const fav = game.favorite_team;
  const spread = game.spread_home !== null
    ? (game.favorite_team === game.home_team ? game.spread_home : game.spread_away)
    : null;

  const homeOdds = game.h2h_home !== null ? formatAmericanOdds(game.h2h_home) : null;
  const awayOdds = game.h2h_away !== null ? formatAmericanOdds(game.h2h_away) : null;

  function handleCreateSwayger() {
    const title = `${game.away_team} @ ${game.home_team}`;
    router.push({
      pathname: "/(tabs)/create",
      params: { prefillTitle: title, prefillCategory: "NBA Playoffs" },
    });
  }

  return (
    <View style={styles.gameCard}>
      <Text style={styles.gameTime}>{formatGameTime(game.commence_time)}</Text>

      <View style={styles.gameTeams}>
        <View style={styles.gameTeamSide}>
          <Text style={[styles.gameTeamName, fav === game.away_team && styles.gameTeamFav]} numberOfLines={1}>
            {game.away_team}
          </Text>
          {awayOdds && <Text style={styles.gameOdds}>{awayOdds}</Text>}
        </View>

        <View style={styles.gameVs}>
          {spread !== null ? (
            <Text style={styles.gameSpread}>{spread > 0 ? `+${spread}` : `${spread}`}</Text>
          ) : (
            <Text style={styles.gameVsText}>@</Text>
          )}
          {game.total !== null && (
            <Text style={styles.gameTotal}>O/U {game.total}</Text>
          )}
        </View>

        <View style={styles.gameTeamSide}>
          <Text style={[styles.gameTeamName, fav === game.home_team && styles.gameTeamFav, { textAlign: "right" }]} numberOfLines={1}>
            {game.home_team}
          </Text>
          {homeOdds && <Text style={[styles.gameOdds, { textAlign: "right" }]}>{homeOdds}</Text>}
        </View>
      </View>

      <Pressable style={styles.gameSwaygerBtn} onPress={handleCreateSwayger}>
        <Ionicons name="add-circle" size={16} color={NBA_GOLD} />
        <Text style={styles.gameSwaygerText}>Create Swayger on this game</Text>
      </Pressable>
    </View>
  );
}

function LeaderboardSnippet({ scores, myId }: { scores: PlayoffScore[]; myId?: string }) {
  const router = useRouter();
  const top3 = scores.slice(0, 3);

  return (
    <Pressable style={styles.leaderboardCard} onPress={() => router.push("/playoffs/leaderboard")}>
      <View style={styles.leaderboardCardHeader}>
        <Text style={styles.leaderboardCardTitle}>🏆 Leaderboard</Text>
        <View style={styles.leaderboardCardLink}>
          <Text style={styles.leaderboardCardLinkText}>Full standings</Text>
          <Ionicons name="chevron-forward" size={14} color={NBA_GOLD} />
        </View>
      </View>

      {top3.length === 0 ? (
        <Text style={styles.leaderboardEmpty}>No scores yet — make your picks first.</Text>
      ) : (
        top3.map((entry, idx) => {
          const handle = entry.display_name || `@${entry.username}`;
          const isMe = entry.user_id === myId;
          return (
            <View key={entry.user_id} style={[styles.lbRow, isMe && styles.lbRowMe]}>
              <Text style={styles.lbRank}>{RANK_LABELS[idx]}</Text>
              <Text style={[styles.lbHandle, isMe && { color: NBA_GOLD }]} numberOfLines={1}>
                {handle}
              </Text>
              <Text style={styles.lbPts}>{entry.total_pts.toLocaleString()} pts</Text>
            </View>
          );
        })
      )}
    </Pressable>
  );
}

function PicksProgress({
  series,
  picks,
}: {
  series: PlayoffSeries[];
  picks: BracketPick[];
}) {
  const router = useRouter();

  // Find the active round: first unlocked round with seeded matchups,
  // or fall back to the last round that has series.
  let activeRound: PlayoffRound = "round1";
  let activeSeries: PlayoffSeries[] = [];
  for (const r of ROUND_ORDER) {
    const rs = series.filter(
      (s) => s.round === r && !s.team1.startsWith("TBD") && !s.team2.startsWith("TBD")
    );
    if (rs.length === 0) continue;
    activeRound = r;
    activeSeries = rs;
    if (!isRoundLocked(r)) break;
  }

  const roundPicks = picks.filter((p) => activeSeries.some((s) => s.id === p.series_id));
  const locked = isRoundLocked(activeRound);
  const pickCount = roundPicks.length;
  const total = activeSeries.length;
  const allPicked = pickCount >= total && total > 0;
  const label = ROUND_LABELS[activeRound];

  if (locked && total === 0) return null;

  return (
    <Pressable style={styles.picksProgress} onPress={() => router.push("/playoffs/bracket")}>
      <View style={styles.picksProgressLeft}>
        {allPicked ? (
          <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
        ) : (
          <Ionicons name="basketball" size={22} color={NBA_GOLD} />
        )}
        <View>
          <Text style={styles.picksProgressTitle}>
            {locked
              ? allPicked
                ? `${label} picks locked in ✅`
                : `${label} locked — no picks made`
              : allPicked
              ? `All ${label} picks in!`
              : `Make your ${label} picks`}
          </Text>
          {!locked && (
            <Text style={styles.picksProgressSub}>
              {pickCount}/{total} series picked
            </Text>
          )}
        </View>
      </View>
      {!locked && (
        <Ionicons name="chevron-forward" size={18} color={Colors.dark.textSecondary} />
      )}
    </Pressable>
  );
}

function MyPicksSummary({
  series,
  picks,
  onPress,
}: {
  series: PlayoffSeries[];
  picks: BracketPick[];
  onPress: () => void;
}) {
  if (picks.length === 0) return null;
  const pickMap = new Map(picks.map((p) => [p.series_id, p]));
  const roundsWithPicks = ROUND_ORDER.filter((r) =>
    series.some((s) => s.round === r && pickMap.has(s.id))
  );
  if (roundsWithPicks.length === 0) return null;

  return (
    <Pressable style={styles.myPicksCard} onPress={onPress}>
      <View style={styles.myPicksHeader}>
        <Text style={styles.myPicksTitle}>My Picks</Text>
        <View style={styles.myPicksHeaderActions}>
          <View style={styles.leaderboardCardLink}>
            <Text style={styles.leaderboardCardLinkText}>View & Share</Text>
            <Ionicons name="share-outline" size={13} color={NBA_GOLD} />
          </View>
        </View>
      </View>
      {roundsWithPicks.map((round) => {
        const roundSeries = series.filter((s) => s.round === round && pickMap.has(s.id));
        return (
          <View key={round}>
            <Text style={styles.myPicksRoundLabel}>{ROUND_LABELS[round]}</Text>
            {roundSeries.map((s) => {
              const pick = pickMap.get(s.id)!;
              const resolved = s.winner !== null;
              const correct = resolved && s.winner === pick.picked_team;
              const gamesCorrect = resolved && s.games === pick.games_guess;
              return (
                <View key={s.id} style={styles.myPickRow}>
                  <View style={styles.myPickRowLeft}>
                    <Text style={styles.myPickMatchup} numberOfLines={1}>
                      {s.team1} vs {s.team2}
                    </Text>
                    <Text style={styles.myPickChoice} numberOfLines={1}>
                      {pick.picked_team}{pick.games_guess ? ` in ${pick.games_guess}` : ""}
                    </Text>
                  </View>
                  {resolved && (
                    <View style={styles.myPickResult}>
                      <Ionicons
                        name={correct ? "checkmark-circle" : "close-circle"}
                        size={16}
                        color={correct ? "#22C55E" : "#EF4444"}
                      />
                      {correct && gamesCorrect && (
                        <Text style={styles.myPickBonus}>+bonus</Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
    </Pressable>
  );
}

export default function PlayoffsHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: leaderboard, isLoading: lbLoading } = useQuery<PlayoffScore[]>({
    queryKey: ["/api/nba/leaderboard"],
    queryFn: fetchLeaderboard,
    staleTime: 60_000,
  });

  const { data: games, isLoading: gamesLoading } = useQuery<NBAGame[]>({
    queryKey: ["/api/nba/games"],
    queryFn: fetchNBAGames,
    staleTime: 30 * 60 * 1000,
  });

  const { data: series } = useQuery<PlayoffSeries[]>({
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

  // Only show upcoming playoff games (April 18+), filter out past games
  const now = new Date();
  const upcomingGames = (games ?? []).filter(
    (g) => new Date(g.commence_time) > now
  );

  const myRank = leaderboard?.findIndex((e) => e.user_id === user?.id);
  const myScore = leaderboard?.find((e) => e.user_id === user?.id);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.dark.text} />
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>NBA Playoffs</Text>
        <Pressable
          onPress={() => router.push("/playoffs/leaderboard")}
          hitSlop={12}
        >
          <Ionicons name="trophy-outline" size={22} color={NBA_GOLD} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Push notification nudge */}
        <PushNotificationBanner />

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>NBA PLAYOFFS 2026</Text>
          </View>
          <Text style={styles.heroTitle}>Leaderboard Challenge</Text>
          <Text style={styles.heroSub}>
            Pick series winners each round, call the number of games, race up the leaderboard.
          </Text>
          <View style={styles.heroPrize}>
            <Ionicons name="gift" size={18} color={NBA_GOLD} />
            <Text style={styles.heroPrizeText}>$100 in prizes across all four rounds</Text>
          </View>
        </View>

        {/* My score (if any) */}
        {myScore && myRank !== undefined && myRank >= 0 && (
          <View style={styles.myScoreCard}>
            <View>
              <Text style={styles.myScoreLabel}>Your Rank</Text>
              <Text style={styles.myScoreValue}>#{myRank + 1}</Text>
            </View>
            <View style={styles.myScoreDivider} />
            <View>
              <Text style={styles.myScoreLabel}>Points</Text>
              <Text style={[styles.myScoreValue, { color: NBA_GOLD }]}>
                {myScore.total_pts.toLocaleString()}
              </Text>
            </View>
            <View style={styles.myScoreDivider} />
            <View>
              <Text style={styles.myScoreLabel}>Correct</Text>
              <Text style={styles.myScoreValue}>{myScore.correct_picks}</Text>
            </View>
          </View>
        )}

        {/* Picks progress */}
        {series && myPicks && (
          <PicksProgress series={series} picks={myPicks} />
        )}

        {/* My picks summary */}
        {series && myPicks && myPicks.length > 0 && (() => {
          const pickSeriesIds = new Set(myPicks.map((p) => p.series_id));
          const roundsWithPicks = ROUND_ORDER.filter((r) =>
            series.some((s) => s.round === r && pickSeriesIds.has(s.id))
          );
          const latestRound = roundsWithPicks[roundsWithPicks.length - 1] ?? "round1";
          return (
            <MyPicksSummary
              series={series}
              picks={myPicks}
              onPress={() => router.push(`/playoffs/bracket?share=${latestRound}`)}
            />
          );
        })()}

        {/* Leaderboard snippet */}
        <View>
          {lbLoading ? (
            <ActivityIndicator color={NBA_GOLD} />
          ) : (
            <LeaderboardSnippet scores={leaderboard ?? []} myId={user?.id} />
          )}
        </View>

        {/* How it works */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={styles.howItWorksCard}>
            {[
              { icon: "pencil", text: "Pick the winner of each series before it locks" },
              { icon: "calculator", text: "Bonus points for calling the exact number of games" },
              { icon: "trending-up", text: "Points scale each round — Finals are worth 30× Round 1" },
              { icon: "gift", text: "$15 gift card prize for the best score each round" },
              { icon: "trophy", text: "$50 Grand Champion prize to the overall leader at the end" },
            ].map(({ icon, text }, i) => (
              <View key={i} style={styles.howRow}>
                <View style={styles.howIcon}>
                  <Ionicons name={icon as any} size={16} color={NBA_GOLD} />
                </View>
                <Text style={styles.howText}>{text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Live games */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Games</Text>
          {gamesLoading ? (
            <ActivityIndicator color={NBA_GOLD} />
          ) : upcomingGames.length === 0 ? (
            <View style={styles.noGamesCard}>
              <Text style={styles.noGamesText}>
                No upcoming games right now. Check back on game days.
              </Text>
            </View>
          ) : (
            upcomingGames.slice(0, 6).map((g) => (
              <LiveGameCard key={g.id} game={g} />
            ))
          )}
        </View>

        {/* Prize breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prize Breakdown</Text>
          <View style={styles.prizeCard}>
            {[
              { label: "Best Round 1 Score", amount: "$15", color: "#3B82F6" },
              { label: "Best Round 2 Score", amount: "$15", color: "#F97316" },
              { label: "Best Conf Finals Score", amount: "$20", color: "#A855F7" },
              { label: "🏆 Overall Champion", amount: "$50", color: GOLD },
            ].map(({ label, amount, color }) => (
              <View key={label} style={styles.prizeRow}>
                <Text style={styles.prizeLabel}>{label}</Text>
                <Text style={[styles.prizeAmount, { color }]}>{amount}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
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
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  backBtnText: { fontSize: 16, color: Colors.dark.text, fontWeight: "500" },
  headerTitle: { fontSize: 17, fontWeight: "700" as const, color: Colors.dark.text },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },

  hero: {
    backgroundColor: `${NBA_BLUE}20`,
    borderWidth: 1,
    borderColor: `${NBA_BLUE}50`,
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
    gap: 8,
  },
  heroBadge: {
    backgroundColor: NBA_BLUE,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 4,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: "#FFFFFF",
    letterSpacing: 1.2,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "900" as const,
    color: Colors.dark.text,
    textAlign: "center",
  },
  heroSub: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  heroPrize: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  heroPrizeText: { fontSize: 14, fontWeight: "700" as const, color: NBA_GOLD },

  myScoreCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${NBA_BLUE}15`,
    borderWidth: 1,
    borderColor: `${NBA_BLUE}40`,
    borderRadius: 14,
    padding: 16,
    gap: 16,
    justifyContent: "center",
  },
  myScoreLabel: { fontSize: 11, color: Colors.dark.textSecondary, marginBottom: 2, textAlign: "center" },
  myScoreValue: { fontSize: 24, fontWeight: "800" as const, color: Colors.dark.text, textAlign: "center" },
  myScoreDivider: { width: 1, height: 36, backgroundColor: Colors.dark.border },

  picksProgress: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 14,
    padding: 14,
  },
  picksProgressLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  picksProgressTitle: { fontSize: 14, fontWeight: "700" as const, color: Colors.dark.text },
  picksProgressSub: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 1 },

  myPicksCard: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  myPicksHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 4,
  },
  myPicksHeaderActions: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10 },
  myPicksTitle: { fontSize: 15, fontWeight: "700" as const, color: Colors.dark.text },
  myPicksRoundLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginTop: 6,
    marginBottom: 2,
  },
  myPickRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  myPickRowLeft: { flex: 1, gap: 2 },
  myPickMatchup: { fontSize: 11, color: Colors.dark.textSecondary },
  myPickChoice: { fontSize: 13, fontWeight: "600" as const, color: Colors.dark.text },
  myPickResult: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, marginLeft: 8 },
  myPickBonus: { fontSize: 11, fontWeight: "700" as const, color: NBA_GOLD },

  leaderboardCard: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  leaderboardCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leaderboardCardTitle: { fontSize: 15, fontWeight: "700" as const, color: Colors.dark.text },
  leaderboardCardLink: { flexDirection: "row", alignItems: "center", gap: 2 },
  leaderboardCardLinkText: { fontSize: 13, color: NBA_GOLD, fontWeight: "600" as const },
  leaderboardEmpty: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center", paddingVertical: 8 },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  lbRowMe: { backgroundColor: `${NBA_BLUE}10`, borderRadius: 8, paddingHorizontal: 6 },
  lbRank: { fontSize: 18, width: 28 },
  lbHandle: { flex: 1, fontSize: 14, fontWeight: "600" as const, color: Colors.dark.text },
  lbPts: { fontSize: 14, fontWeight: "700" as const, color: Colors.dark.text },

  section: { gap: 10 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  howItWorksCard: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  howRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  howIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: `${NBA_GOLD}18`,
    alignItems: "center",
    justifyContent: "center",
  },
  howText: { flex: 1, fontSize: 14, color: Colors.dark.text, lineHeight: 20, paddingTop: 4 },

  gameCard: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  gameTime: { fontSize: 11, color: Colors.dark.textSecondary, textAlign: "center" },
  gameTeams: { flexDirection: "row", alignItems: "center", gap: 8 },
  gameTeamSide: { flex: 1, gap: 2 },
  gameTeamName: { fontSize: 13, fontWeight: "600" as const, color: Colors.dark.textSecondary },
  gameTeamFav: { color: Colors.dark.text, fontWeight: "700" as const },
  gameOdds: { fontSize: 12, color: Colors.dark.textSecondary },
  gameVs: { alignItems: "center", gap: 2 },
  gameVsText: { fontSize: 13, color: Colors.dark.textSecondary },
  gameSpread: { fontSize: 14, fontWeight: "700" as const, color: Colors.dark.text },
  gameTotal: { fontSize: 11, color: Colors.dark.textSecondary },
  gameSwaygerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: `${NBA_GOLD}50`,
    borderRadius: 10,
    paddingVertical: 10,
  },
  gameSwaygerText: { fontSize: 13, fontWeight: "600" as const, color: NBA_GOLD },


  noGamesCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  noGamesText: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center" },

  prizeCard: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 16,
    overflow: "hidden",
  },
  prizeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  prizeLabel: { fontSize: 14, color: Colors.dark.text, flex: 1 },
  prizeAmount: { fontSize: 16, fontWeight: "700" as const },
});
