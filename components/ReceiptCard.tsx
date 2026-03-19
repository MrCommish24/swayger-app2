import React from "react";
import { View, Text, StyleSheet } from "react-native";

const GOLD = "#F59E0B";
const BG = "#0E0E0E";
const SURFACE = "#1A1A1A";
const BORDER = "#2C2C2C";
const GOLD_BORDER = "#D97706";
const TEXT = "#FFFFFF";
const TEXT_DIM = "#888888";
const TEXT_MUTED = "#444444";

export interface ReceiptCardProps {
  title: string;
  category: string;
  creatorUsername: string;
  opponentUsername: string;
  creatorPick: string;
  opponentPick: string;
  outcome: string;
  stakeUnits: number;
}

function resolveWinner(
  outcome: string,
  creatorUsername: string,
  opponentUsername: string
): { line: string; emoji: string; isGold: boolean } {
  switch (outcome) {
    case "creator":
      return { line: `@${creatorUsername} wins`, emoji: "🏆", isGold: true };
    case "opponent":
      return { line: `@${opponentUsername} wins`, emoji: "🏆", isGold: true };
    case "draw":
      return { line: "Draw", emoji: "🤝", isGold: false };
    case "no_contest":
      return { line: "No Contest", emoji: "🚫", isGold: false };
    default:
      return { line: outcome, emoji: "⚡", isGold: false };
  }
}

export default function ReceiptCard({
  title,
  category,
  creatorUsername,
  opponentUsername,
  creatorPick,
  opponentPick,
  outcome,
  stakeUnits,
}: ReceiptCardProps) {
  const winner = resolveWinner(outcome, creatorUsername, opponentUsername);

  return (
    <View style={styles.card} collapsable={false}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>⚡</Text>
        <Text style={styles.headerLabel}>SWAYGER RECEIPT</Text>
      </View>

      <View style={styles.hairline} />

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={3}>
          {title}
        </Text>
        <Text style={styles.category}>{(category || "Other").toUpperCase()}</Text>

        <View style={styles.vsRow}>
          <View style={styles.playerCol}>
            <Text style={styles.username} numberOfLines={1}>
              @{creatorUsername}
            </Text>
            <View style={styles.pickBubble}>
              <Text style={styles.pickText} numberOfLines={3}>
                {creatorPick}
              </Text>
            </View>
          </View>

          <View style={styles.vsContainer}>
            <Text style={styles.vsText}>vs</Text>
          </View>

          <View style={styles.playerCol}>
            <Text style={styles.username} numberOfLines={1}>
              @{opponentUsername}
            </Text>
            <View style={styles.pickBubble}>
              <Text style={styles.pickText} numberOfLines={3}>
                {opponentPick}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.resultBlock}>
          <Text style={styles.resultEmoji}>{winner.emoji}</Text>
          <Text style={[styles.resultLine, winner.isGold && styles.resultLineGold]}>
            {winner.line}
          </Text>
          <View style={styles.unitsPill}>
            <Text style={styles.unitsText}>
              +{stakeUnits} Swayger Points
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.hairline} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Settled on Swayger</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 320,
    backgroundColor: BG,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: GOLD_BORDER,
    overflow: "hidden",
  },
  header: {
    backgroundColor: SURFACE,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  headerIcon: {
    fontSize: 16,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: "800" as const,
    letterSpacing: 2,
    color: GOLD,
  },
  hairline: {
    height: 1,
    backgroundColor: BORDER,
  },
  body: {
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: TEXT,
    lineHeight: 24,
  },
  category: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: TEXT_DIM,
    letterSpacing: 1.5,
    marginTop: -4,
  },
  vsRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 8,
    marginTop: 4,
  },
  playerCol: {
    flex: 1,
    alignItems: "center" as const,
    gap: 6,
  },
  username: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: TEXT_DIM,
  },
  pickBubble: {
    width: "100%",
    backgroundColor: SURFACE,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minHeight: 44,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  pickText: {
    fontSize: 12,
    color: TEXT,
    textAlign: "center" as const,
    fontStyle: "italic" as const,
    lineHeight: 16,
  },
  vsContainer: {
    paddingTop: 28,
    alignItems: "center" as const,
    width: 24,
  },
  vsText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: TEXT_MUTED,
  },
  dividerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginTop: 4,
    marginBottom: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: BORDER,
  },
  resultBlock: {
    alignItems: "center" as const,
    gap: 6,
    paddingVertical: 4,
  },
  resultEmoji: {
    fontSize: 32,
  },
  resultLine: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: TEXT,
    textAlign: "center" as const,
    letterSpacing: 0.3,
  },
  resultLineGold: {
    color: GOLD,
  },
  unitsPill: {
    backgroundColor: `${GOLD}20`,
    borderRadius: 100,
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: `${GOLD}40`,
  },
  unitsText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: GOLD,
  },
  footer: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center" as const,
    backgroundColor: SURFACE,
  },
  footerText: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: TEXT_MUTED,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
  },
});
