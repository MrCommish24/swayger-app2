import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { GDLeaderboardEntry } from "@/lib/gameday-api";

const GOLD = "#F5A623";
const TEAL = "#1DA1F2";
const BG = "#0C1220";
const SURFACE = "#111C30";
const BORDER = "#1E2D45";
const GOLD_BORDER = "#C07818";
const TEXT = "#FFFFFF";
const TEXT_DIM = "#7A8FA8";
const TEXT_MUTED = "#3A4F6A";

const MEDALS = ["🥇", "🥈", "🥉"];

export interface GameDayReceiptCardProps {
  roomName: string;
  matchup: string;
  gameDate?: string | null;
  leaderboard: GDLeaderboardEntry[];
  myParticipantId?: string | null;
  roomLink?: string;
}

export default function GameDayReceiptCard({
  roomName,
  matchup,
  gameDate,
  leaderboard,
  myParticipantId,
  roomLink,
}: GameDayReceiptCardProps) {
  const myEntry = myParticipantId
    ? leaderboard.find((e) => e.participant_id === myParticipantId) ?? null
    : null;

  const formattedDate = gameDate
    ? new Date(gameDate + "T12:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <View style={styles.card} collapsable={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>⚡</Text>
        <View>
          <Text style={styles.headerLabel}>GAME DAY SWAYGER</Text>
          <Text style={styles.headerSub}>FINAL STANDINGS</Text>
        </View>
      </View>

      <View style={styles.hairline} />

      {/* Room info */}
      <View style={styles.body}>
        <Text style={styles.matchup}>{matchup}</Text>
        <Text style={styles.roomName}>{roomName}</Text>
        {formattedDate ? (
          <Text style={styles.date}>{formattedDate}</Text>
        ) : null}

        {/* Leaderboard */}
        <View style={styles.lbSection}>
          {leaderboard.map((entry, i) => {
            const isMe = entry.participant_id === myParticipantId;
            const medal = i < 3 ? MEDALS[i] : null;
            return (
              <View
                key={entry.participant_id}
                style={[styles.lbRow, isMe && styles.lbRowMe]}
              >
                <Text style={[styles.lbMedal, !medal && styles.lbNumber]}>
                  {medal ?? `${entry.rank}`}
                </Text>
                <Text
                  style={[styles.lbName, isMe && styles.lbNameMe]}
                  numberOfLines={1}
                >
                  {entry.display_name}
                  {isMe ? " ←" : ""}
                </Text>
                <View style={styles.lbRight}>
                  <Text style={[styles.lbSP, isMe && styles.lbSPMe]}>
                    {entry.game_day_sp} pts
                  </Text>
                  <Text style={styles.lbCorrect}>
                    {entry.correct_picks} correct
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Personal stat */}
        {myEntry ? (
          <View style={styles.myStatLine}>
            <Text style={styles.myStatText}>
              You finished #{myEntry.rank} of {leaderboard.length} ·{" "}
              {myEntry.correct_picks} correct pick
              {myEntry.correct_picks !== 1 ? "s" : ""}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.hairline} />

      {/* Footer */}
      <View style={styles.footer}>
        {roomLink ? (
          <Text style={styles.footerLink} numberOfLines={1}>
            {roomLink}
          </Text>
        ) : null}
        <Text style={styles.footerBrand}>SWAYGER · MAKE YOUR PICKS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 340,
    backgroundColor: BG,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: GOLD_BORDER,
    overflow: "hidden",
  },
  header: {
    backgroundColor: SURFACE,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  headerIcon: {
    fontSize: 20,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: "800" as const,
    letterSpacing: 2,
    color: GOLD,
  },
  headerSub: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 1.5,
    color: TEXT_DIM,
    marginTop: 1,
  },
  hairline: {
    height: 1,
    backgroundColor: BORDER,
  },
  body: {
    padding: 18,
    gap: 4,
  },
  matchup: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: TEAL,
    letterSpacing: 0.3,
  },
  roomName: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: TEXT_DIM,
    marginTop: 1,
  },
  date: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginTop: 1,
    marginBottom: 4,
  },
  lbSection: {
    marginTop: 12,
    gap: 5,
  },
  lbRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: SURFACE,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  lbRowMe: {
    borderColor: GOLD,
    backgroundColor: `${GOLD}12`,
  },
  lbMedal: {
    fontSize: 16,
    width: 24,
    textAlign: "center" as const,
  },
  lbNumber: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: TEXT_MUTED,
  },
  lbName: {
    flex: 1,
    fontSize: 13,
    color: TEXT,
    fontWeight: "500" as const,
  },
  lbNameMe: {
    color: GOLD,
    fontWeight: "700" as const,
  },
  lbRight: {
    alignItems: "flex-end" as const,
  },
  lbSP: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: TEXT_DIM,
  },
  lbSPMe: {
    color: GOLD,
  },
  lbCorrect: {
    fontSize: 10,
    color: TEXT_MUTED,
    marginTop: 1,
  },
  myStatLine: {
    marginTop: 12,
    backgroundColor: `${TEAL}18`,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${TEAL}40`,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  myStatText: {
    fontSize: 12,
    color: TEAL,
    fontWeight: "600" as const,
    textAlign: "center" as const,
  },
  footer: {
    backgroundColor: SURFACE,
    paddingVertical: 11,
    paddingHorizontal: 18,
    alignItems: "center" as const,
    gap: 2,
  },
  footerLink: {
    fontSize: 11,
    color: TEAL,
    fontWeight: "600" as const,
    letterSpacing: 0.3,
  },
  footerBrand: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: TEXT_MUTED,
    letterSpacing: 2,
  },
});
