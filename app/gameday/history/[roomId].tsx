import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import {
  formatHistoryDate,
  getMyGameDayHistoryRecord,
  type GameDayHistoryRecord,
  type GameDayHistoryProp,
} from "@/lib/gameday-history";

const C = Colors.dark;

function shownPick(value: string | null, numeric: number | null) {
  if (numeric !== null) return String(numeric);
  return value || "—";
}

function confirmedAnswer(prop: GameDayHistoryProp) {
  if (!prop.correct_answers) return null;
  if (prop.correct_answers.numeric_answer !== null) {
    return String(prop.correct_answers.numeric_answer);
  }
  return prop.correct_answers.answer_ids.length
    ? prop.correct_answers.answer_ids.join(", ")
    : "No confirmed answer provided";
}

function HistoryPick({ prop, pointsPerCorrect, madden }: {
  prop: GameDayHistoryProp;
  pointsPerCorrect: number | null;
  madden: boolean;
}) {
  if (!prop.own_pick) return null;
  const status = prop.own_pick.outcome;
  const isBonus = prop.prop_role === "bonus_game" || prop.prop_role === "bonus_total";
  const earned = pointsPerCorrect !== null && status === "correct" && (!madden || !isBonus)
    ? `+${pointsPerCorrect} SP` : null;

  return (
    <View style={styles.pick}>
      <View style={styles.pickQuestionRow}>
        <Text style={styles.question}>{prop.question}</Text>
        <Text style={[styles.outcome, status === "correct" && styles.correct, status === "incorrect" && styles.incorrect]}>
          {status === "correct" ? "CORRECT" : status === "incorrect" ? "INCORRECT" : "PENDING"}
        </Text>
      </View>
      {prop.line_text ? <Text style={styles.line}>{prop.line_text}</Text> : null}
      <View style={styles.answerRow}>
        <Text style={styles.answerLabel}>YOUR PICK</Text>
        <Text style={styles.answerValue}>{shownPick(prop.own_pick.selected_answer, prop.own_pick.numeric_answer)}</Text>
      </View>
      {prop.status === "settled" ? (
        <View style={styles.answerRow}>
          <Text style={styles.answerLabel}>CONFIRMED</Text>
          <Text style={styles.answerValue}>{confirmedAnswer(prop)}</Text>
        </View>
      ) : (
        <Text style={styles.hiddenAnswer}>Result not settled — answer hidden</Text>
      )}
      <View style={styles.pickFooter}>
        <Text style={styles.roleLabel}>
        {madden && isBonus ? "BONUS · SEPARATE FROM MAIN CARD" : prop.prop_role === "main_matchup" ? "MAIN MATCHUP" : "PICK"}
        </Text>
        {earned ? <Text style={styles.earned}>{earned}</Text> : null}
      </View>
    </View>
  );
}

function Standings({ record }: { record: GameDayHistoryRecord }) {
  if (!record.final_standings) return null;
  const winnerCount = record.final_standings.filter((entry) => entry.is_winner).length;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionEyebrow}>THE FIELD</Text>
      <Text style={styles.sectionTitle}>Final Standings</Text>
      {record.final_standings.map((entry) => {
        const isMe = entry.participant_id === record.participant.participant_id;
        return (
          <View key={entry.participant_id} style={[styles.standingRow, isMe && styles.myStanding]}>
            <Text style={styles.rank}>#{entry.rank}</Text>
            <View style={styles.standingNameWrap}>
              <Text style={[styles.standingName, isMe && styles.myStandingText]} numberOfLines={1}>
                {entry.display_name}{isMe ? "  (you)" : ""}
              </Text>
              {entry.is_winner ? (
                <Text style={styles.coWinner}>{winnerCount > 1 ? "CO-WINNER" : "WINNER"}</Text>
              ) : null}
            </View>
            <View style={styles.standingStats}>
              {record.scoring.format === "madden_weekly_pick_card" ? (
                <Text style={styles.standingMain}>{entry.correct_picks}/{entry.total_picks} correct</Text>
              ) : (
                <>
                  <Text style={styles.standingMain}>{entry.game_day_sp} SP</Text>
                  <Text style={styles.standingSub}>{entry.correct_picks} correct</Text>
                </>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function HistoryRecordView({ record }: { record: GameDayHistoryRecord }) {
  const isFinal = record.state === "final";
  const winnerCount = record.final_standings?.filter((entry) => entry.is_winner).length ?? 0;
  const canShare = true;
  const [shareError, setShareError] = React.useState<string | null>(null);
  const onShare = async () => {
    const result = record.participant;
    const lines = [
      record.room.room_name,
      record.room.team_a_name && record.room.team_b_name
        ? `${record.room.team_a_name} vs ${record.room.team_b_name}`
        : null,
      isFinal ? "Final result" : "Results pending",
      `${formatHistoryDate(record.room.game_date || record.room.created_at)}${record.room.room_code ? ` · ${record.room.room_code}` : ""}`,
      result.rank !== null ? `Rank: #${result.rank} of ${record.participant_count}` : null,
      result.game_day_sp !== null ? `Score: ${result.game_day_sp} SP` : null,
      result.correct_picks !== undefined ? `Correct picks: ${result.correct_picks}` : null,
      result.is_winner ? (winnerCount > 1 ? "Co-winner" : "Winner") : null,
      "Swayger Game Day",
    ].filter(Boolean).join("\n");
    try {
      setShareError(null);
      await Share.share({ message: lines });
    } catch {
      setShareError("Sharing was unavailable. You can still review this receipt here.");
    }
  };
  const groups = record.cards
    .map((card) => ({ ...card, submitted: card.props.filter((prop) => prop.own_pick !== null) }))
    .filter((card) => card.submitted.length > 0);

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.statePill}>
          <View style={[styles.stateDot, isFinal && styles.finalDot]} />
          <Text style={[styles.stateText, isFinal && styles.finalText]}>
            {isFinal ? "FINAL" : "RESULTS PENDING"}
          </Text>
        </View>
        {record.room.archived ? <Text style={styles.archivedLabel}>ARCHIVED · READ ONLY</Text> : null}
        <Text style={styles.roomTitle}>{record.room.room_name}</Text>
        {record.room.team_a_name && record.room.team_b_name ? (
          <Text style={styles.matchup}>{record.room.team_a_name} vs {record.room.team_b_name}</Text>
        ) : null}
        <Text style={styles.context}>
          {formatHistoryDate(record.room.game_date || record.room.created_at)}
          {record.room.room_code ? `  ·  ${record.room.room_code}` : ""}
          {record.room.community_context ? `  ·  ${record.room.community_context}` : ""}
        </Text>
      </View>

      <View style={styles.personalCard}>
        <View style={styles.personalTop}>
          <View>
            <Text style={styles.sectionEyebrow}>YOUR RESULT</Text>
            <Text style={styles.personalName}>{record.participant.display_name}</Text>
          </View>
          <View style={styles.peopleBadge}>
            <Text style={styles.peopleValue}>{record.participant_count}</Text>
            <Text style={styles.peopleLabel}>PLAYERS</Text>
          </View>
        </View>
        <View style={styles.metrics}>
          {record.participant.rank !== null ? (
            <View style={styles.metric}>
              <Text style={styles.metricValue}>#{record.participant.rank}</Text>
              <Text style={styles.metricLabel}>RANK</Text>
            </View>
          ) : null}
          {record.participant.game_day_sp !== null ? (
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{record.participant.game_day_sp}</Text>
              <Text style={styles.metricLabel}>SP</Text>
            </View>
          ) : null}
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{record.participant.correct_picks}</Text>
            <Text style={styles.metricLabel}>CORRECT</Text>
          </View>
          {record.participant.pending_picks > 0 ? (
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{record.participant.pending_picks}</Text>
              <Text style={styles.metricLabel}>PENDING</Text>
            </View>
          ) : null}
        </View>
        {record.participant.is_winner ? (
          <View style={styles.winnerNote}>
            <Text style={styles.winnerText}>
              {winnerCount > 1 ? "CO-WINNER · SHARED FIRST PLACE" : "WINNER · FIRST PLACE"}
            </Text>
          </View>
        ) : null}
        {isFinal && record.scoring.win_condition === "all_correct" && Boolean(record.final_standings?.length) && winnerCount === 0 ? (
          <Text style={styles.pendingNote}>No perfect card — no winner.</Text>
        ) : null}
        {!isFinal ? (
          <Text style={styles.pendingNote}>Some results are still being confirmed. Final standings are not available yet.</Text>
        ) : null}
        {record.scoring.format === "unsupported_custom" ? (
          <Text style={styles.pendingNote}>This competition uses a custom scoring format. Picks are available, but score and standings are withheld.</Text>
        ) : null}
        {record.scoring.format === "standard_game_day" ? (
          <Text style={styles.scoringNote}>Standard Game Day · {record.scoring.points_per_correct_main_pick} SP per correct pick</Text>
        ) : record.scoring.format === "madden_weekly_pick_card" ? (
          <Text style={styles.scoringNote}>
            Madden · {record.scoring.win_condition === "most_correct" ? "Most Correct" : "Perfect Card"} on main matchups; bonus picks are separate
          </Text>
        ) : null}
      </View>

      <Standings record={record} />

      <View style={styles.section}>
        <Text style={styles.sectionEyebrow}>YOUR LOCKED ANSWERS</Text>
        <Text style={styles.sectionTitle}>My Picks</Text>
        {groups.length === 0 ? (
          <View style={styles.emptyPicks}>
            <Text style={styles.emptyPicksText}>No submitted picks were included in this receipt.</Text>
          </View>
        ) : groups.map((card) => (
          <View key={card.card_id} style={styles.cardGroup}>
            <View style={styles.cardGroupHeader}>
              <Text style={styles.cardGroupTitle}>{card.title}</Text>
              <Text style={styles.phase}>{card.phase.replace(/_/g, " ").toUpperCase()}</Text>
            </View>
            {card.submitted.map((prop) => (
              <HistoryPick
                key={prop.prop_id}
                prop={prop}
                pointsPerCorrect={record.scoring.points_per_correct_main_pick}
                madden={record.scoring.format === "madden_weekly_pick_card"}
              />
            ))}
          </View>
        ))}
      </View>

      {canShare ? (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.shareButton, pressed && { opacity: 0.75 }]}
          onPress={onShare}
        >
          <Text style={styles.shareText}>Share this result</Text>
        </Pressable>
      ) : null}
      {shareError ? <Text accessibilityRole="alert" style={styles.pendingNote}>{shareError}</Text> : null}
      <Text style={styles.readOnlyNote}>This is a saved receipt. Viewing it does not reopen the competition.</Text>
    </>
  );
}

export default function GameDayHistoryDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ roomId?: string | string[] }>();
  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
  const { session, isLoading: authLoading } = useAuth();
  const query = useQuery({
    queryKey: ["gameday", "my-history-record", session?.user.id, roomId],
    queryFn: () => getMyGameDayHistoryRecord(session!, roomId!),
    enabled: !!session && !!roomId,
    staleTime: 60_000,
  });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 34 }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Game Day history"
        onPress={() => router.replace("/gameday/history" as never)}
        style={styles.back}
      >
        <Text style={styles.backText}>‹  HISTORY</Text>
      </Pressable>
      {authLoading ? (
        <View style={styles.stateWrap}><ActivityIndicator color={C.tint} /></View>
      ) : !session ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Sign in to view this receipt</Text>
          <Text style={styles.stateBody}>Game Day History is available only for verified account-linked participation.</Text>
          <Pressable style={styles.retryButton} onPress={() => router.push("/auth" as never)}>
            <Text style={styles.retryText}>Sign In</Text>
          </Pressable>
        </View>
      ) : query.isLoading ? (
        <View style={styles.stateWrap}>
          <View style={styles.skeletonHero} />
          <View style={styles.skeletonCard} />
          <View style={styles.skeletonCard} />
        </View>
      ) : query.isError ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Receipt unavailable</Text>
          <Text style={styles.stateBody}>This receipt may not belong to your account or may no longer be available.</Text>
          <Pressable style={styles.retryButton} onPress={() => query.refetch()}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
          <Pressable style={styles.backListButton} onPress={() => router.replace("/gameday/history" as never)}>
            <Text style={styles.backListText}>Back to History</Text>
          </Pressable>
        </View>
      ) : query.data?.record ? (
        <HistoryRecordView record={query.data.record} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 17, maxWidth: 760, width: "100%", alignSelf: "center" },
  back: { minHeight: 46, alignSelf: "flex-start", justifyContent: "center", paddingRight: 18 },
  backText: { color: C.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  hero: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 17,
    marginTop: 8,
  },
  statePill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  stateDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accentGold, marginRight: 7 },
  finalDot: { backgroundColor: C.tint },
  stateText: { color: C.accentGold, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  finalText: { color: C.tint },
  archivedLabel: { color: C.textMuted, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 8 },
  roomTitle: {
    color: C.text,
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 31,
    lineHeight: 34,
    marginTop: 12,
  },
  matchup: { color: C.tint, fontSize: 14, fontWeight: "700", marginTop: 5 },
  context: { color: C.textMuted, fontSize: 11, lineHeight: 17, marginTop: 8 },
  personalCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 17,
    marginTop: 12,
  },
  personalTop: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" },
  sectionEyebrow: { color: C.textMuted, fontSize: 9, fontWeight: "800", letterSpacing: 1.3 },
  personalName: { color: C.text, fontSize: 17, fontWeight: "700", marginTop: 5, flexShrink: 1 },
  peopleBadge: { alignItems: "center", minWidth: 60, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: C.border },
  peopleValue: { color: C.text, fontSize: 18, fontWeight: "800" },
  peopleLabel: { color: C.textMuted, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  metrics: { flexDirection: "row", flexWrap: "wrap", marginTop: 16, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 14 },
  metric: { minWidth: "25%", paddingRight: 8, marginBottom: 5 },
  metricValue: { color: C.accentGold, fontFamily: "BarlowCondensed_800ExtraBold", fontSize: 27 },
  metricLabel: { color: C.textMuted, fontSize: 8, fontWeight: "800", letterSpacing: 0.8, marginTop: 1 },
  winnerNote: { backgroundColor: "#18271F", borderRadius: 8, padding: 9, marginTop: 10 },
  winnerText: { color: "#A5D5A3", fontSize: 10, fontWeight: "900", letterSpacing: 0.7, textAlign: "center" },
  pendingNote: { color: C.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 12 },
  scoringNote: { color: C.textMuted, fontSize: 10, lineHeight: 16, marginTop: 12 },
  section: { marginTop: 25 },
  sectionTitle: {
    color: C.text,
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 25,
    textTransform: "uppercase",
    marginTop: 3,
    marginBottom: 12,
  },
  standingRow: {
    minHeight: 55,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 11,
    paddingHorizontal: 11,
    marginBottom: 6,
    gap: 10,
  },
  myStanding: { borderColor: C.accentGold },
  rank: { color: C.accentGold, fontSize: 14, fontWeight: "900", width: 28 },
  standingNameWrap: { flex: 1, minWidth: 0 },
  standingName: { color: C.text, fontSize: 12, fontWeight: "600" },
  myStandingText: { color: C.accentGold },
  coWinner: { color: C.tint, fontSize: 8, fontWeight: "900", letterSpacing: 0.8, marginTop: 3 },
  standingStats: { alignItems: "flex-end", maxWidth: "38%" },
  standingMain: { color: C.text, fontSize: 11, fontWeight: "700", textAlign: "right" },
  standingSub: { color: C.textMuted, fontSize: 9, marginTop: 2 },
  cardGroup: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 15,
    padding: 12,
    marginBottom: 10,
  },
  cardGroupHeader: { paddingHorizontal: 2, paddingBottom: 9 },
  cardGroupTitle: { color: C.text, fontSize: 15, fontWeight: "700" },
  phase: { color: C.textMuted, fontSize: 8, fontWeight: "800", letterSpacing: 1, marginTop: 4 },
  pick: { backgroundColor: C.background, borderRadius: 11, padding: 11, marginTop: 7 },
  pickQuestionRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  question: { flex: 1, color: C.text, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  outcome: { color: C.accentGold, fontSize: 8, fontWeight: "900", letterSpacing: 0.6, paddingTop: 2 },
  correct: { color: C.tint },
  incorrect: { color: "#E78679" },
  line: { color: C.textMuted, fontSize: 10, marginTop: 4 },
  answerRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 10 },
  answerLabel: { color: C.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  answerValue: { flex: 1, color: C.text, fontSize: 13, fontWeight: "600", textAlign: "right" },
  hiddenAnswer: { color: C.textMuted, fontSize: 10, fontStyle: "italic", marginTop: 10 },
  pickFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  roleLabel: { color: C.textMuted, fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  earned: { color: C.tint, fontSize: 10, fontWeight: "800" },
  emptyPicks: { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 15 },
  emptyPicksText: { color: C.textMuted, fontSize: 12, lineHeight: 18 },
  shareButton: {
    minHeight: 50,
    backgroundColor: C.tint,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  shareText: { color: C.text, fontSize: 14, fontWeight: "800" },
  readOnlyNote: { color: C.textMuted, fontSize: 10, textAlign: "center", lineHeight: 16, marginTop: 11 },
  stateWrap: { gap: 13, marginTop: 16 },
  stateCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 17, padding: 19, marginTop: 12 },
  stateTitle: { color: C.text, fontSize: 18, fontWeight: "700" },
  stateBody: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 7 },
  retryButton: { minHeight: 46, borderRadius: 11, backgroundColor: C.tint, alignItems: "center", justifyContent: "center", marginTop: 16 },
  retryText: { color: C.text, fontSize: 13, fontWeight: "800" },
  backListButton: { alignItems: "center", justifyContent: "center", minHeight: 44, marginTop: 5 },
  backListText: { color: C.tint, fontSize: 12, fontWeight: "700" },
  skeletonHero: { height: 190, borderRadius: 17, backgroundColor: C.surface },
  skeletonCard: { height: 145, borderRadius: 17, backgroundColor: C.surface, marginTop: 2 },
});
