import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CategoryH2HRecord } from "@/lib/swayger";

const GOLD = "#F5A623";
const BLUE = "#1DA1F2";
const BG = "#0E0E0E";
const SURFACE = "#1A1A1A";
const BORDER = "#2C2C2C";
const TEXT = "#FFFFFF";
const TEXT_DIM = "#888888";
const TEXT_MUTED = "#444444";
const WIN_GREEN = "#22C55E";
const LOSS_RED = "#EF4444";

const CAT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Sports: "american-football-outline",
  Entertainment: "film-outline",
  Gaming: "game-controller-outline",
  Lifestyle: "heart-outline",
  Politics: "megaphone-outline",
  Other: "trophy-outline",
};

function catIcon(category: string): keyof typeof Ionicons.glyphMap {
  return CAT_ICONS[category] || "trophy-outline";
}

function leadLine(myWins: number, theirWins: number, draws: number, myLabel: string, theirLabel: string): string {
  const total = myWins + theirWins + draws;
  if (total === 0) return "No settled Swaygers yet";
  if (myWins === theirWins) return "All tied up";
  const diff = Math.abs(myWins - theirWins);
  if (myWins > theirWins) return `${myLabel} leads by ${diff}`;
  return `${theirLabel} leads by ${diff}`;
}

function winPct(wins: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((wins / total) * 100)}%`;
}

export interface H2HReceiptCardProps {
  myUsername: string;
  myDisplayName: string | null;
  myAvatarColor: string;
  opponentUsername: string;
  opponentDisplayName: string | null;
  opponentAvatarColor: string;
  overall: { myWins: number; theirWins: number; draws: number; total: number };
  byCategory: CategoryH2HRecord[];
}

export default function H2HReceiptCard({
  myUsername,
  myDisplayName,
  myAvatarColor,
  opponentUsername,
  opponentDisplayName,
  opponentAvatarColor,
  overall,
  byCategory,
}: H2HReceiptCardProps) {
  const myLabel = myDisplayName || `@${myUsername}`;
  const theirLabel = opponentDisplayName || `@${opponentUsername}`;
  const lead = leadLine(overall.myWins, overall.theirWins, overall.draws, myLabel, theirLabel);
  const decided = overall.myWins + overall.theirWins;
  const myPct = winPct(overall.myWins, decided);
  const theirPct = winPct(overall.theirWins, decided);
  const myInitial = (myDisplayName || myUsername).charAt(0).toUpperCase();
  const theirInitial = (opponentDisplayName || opponentUsername).charAt(0).toUpperCase();

  return (
    <View style={styles.card} collapsable={false}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>⚡</Text>
        <Text style={styles.headerLabel}>H2H RECORD</Text>
      </View>

      <View style={styles.hairline} />

      <View style={styles.scoreboard}>
        <View style={styles.playerSide}>
          <View style={[styles.avatar, { backgroundColor: myAvatarColor }]}>
            <Text style={styles.avatarInitial}>{myInitial}</Text>
          </View>
          <Text style={[styles.playerName, { color: BLUE }]} numberOfLines={1}>
            {myLabel}
          </Text>
          <Text style={[styles.bigScore, { color: BLUE }]}>{overall.myWins}</Text>
          <Text style={[styles.pctLabel, { color: BLUE }]}>{myPct}</Text>
        </View>

        <View style={styles.vsCol}>
          <Text style={styles.vsText}>vs</Text>
          {overall.draws > 0 && (
            <View style={styles.drawPill}>
              <Text style={styles.drawText}>{overall.draws}D</Text>
            </View>
          )}
        </View>

        <View style={styles.playerSide}>
          <View style={[styles.avatar, { backgroundColor: opponentAvatarColor }]}>
            <Text style={styles.avatarInitial}>{theirInitial}</Text>
          </View>
          <Text style={[styles.playerName, { color: GOLD }]} numberOfLines={1}>
            {theirLabel}
          </Text>
          <Text style={[styles.bigScore, { color: GOLD }]}>{overall.theirWins}</Text>
          <Text style={[styles.pctLabel, { color: GOLD }]}>{theirPct}</Text>
        </View>
      </View>

      <View style={styles.leadRow}>
        <Text style={styles.leadText}>{lead}</Text>
        <Text style={styles.totalText}>{overall.total} settled</Text>
      </View>

      {byCategory.length > 0 && (
        <>
          <View style={styles.hairline} />
          <View style={styles.breakdown}>
            <View style={styles.breakdownHeader}>
              <Text style={[styles.breakdownColLeft, styles.breakdownHeadText]}>CATEGORY</Text>
              <Text style={[styles.breakdownColRight, styles.breakdownHeadText, { color: BLUE }]}>YOU</Text>
              <Text style={[styles.breakdownColRight, styles.breakdownHeadText, { color: GOLD }]}>THEM</Text>
            </View>
            {byCategory.map((cat) => {
              const myW = cat.myWins;
              const thW = cat.theirWins;
              const myColor = myW > thW ? WIN_GREEN : myW < thW ? LOSS_RED : TEXT_DIM;
              const thColor = thW > myW ? WIN_GREEN : thW < myW ? LOSS_RED : TEXT_DIM;
              return (
                <View key={cat.category} style={styles.breakdownRow}>
                  <View style={styles.breakdownColLeft}>
                    <Ionicons name={catIcon(cat.category)} size={12} color={TEXT_DIM} />
                    <Text style={styles.catName}>{cat.category}</Text>
                    {cat.draws > 0 && <Text style={styles.drawsSmall}>{cat.draws}D</Text>}
                  </View>
                  <Text style={[styles.breakdownColRight, styles.catScore, { color: myColor }]}>{myW}</Text>
                  <Text style={[styles.breakdownColRight, styles.catScore, { color: thColor }]}>{thW}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      <View style={styles.hairline} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>CERTIFIED BY SWAYGER</Text>
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
    borderColor: "#D97706",
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
  headerIcon: { fontSize: 16 },
  headerLabel: {
    fontSize: 11,
    fontWeight: "800" as const,
    letterSpacing: 2,
    color: GOLD,
  },
  hairline: { height: 1, backgroundColor: BORDER },

  scoreboard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 8,
  },
  playerSide: {
    flex: 1,
    alignItems: "center" as const,
    gap: 6,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#fff",
  },
  playerName: {
    fontSize: 11,
    fontWeight: "600" as const,
    textAlign: "center" as const,
  },
  bigScore: {
    fontSize: 52,
    fontWeight: "800" as const,
    lineHeight: 56,
  },
  pctLabel: {
    fontSize: 11,
    fontWeight: "600" as const,
    opacity: 0.8,
  },
  vsCol: {
    alignItems: "center" as const,
    gap: 8,
    paddingBottom: 4,
  },
  vsText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: TEXT_MUTED,
  },
  drawPill: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  drawText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: TEXT_DIM,
  },

  leadRow: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  leadText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: TEXT_DIM,
  },
  totalText: {
    fontSize: 11,
    color: TEXT_MUTED,
    fontWeight: "500" as const,
  },

  breakdown: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
  },
  breakdownHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginBottom: 2,
  },
  breakdownHeadText: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 1,
    color: TEXT_MUTED,
  },
  breakdownRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
  breakdownColLeft: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  breakdownColRight: {
    width: 36,
    textAlign: "center" as const,
  },
  catName: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: TEXT,
  },
  catScore: {
    fontSize: 15,
    fontWeight: "700" as const,
    textAlign: "center" as const,
  },
  drawsSmall: {
    fontSize: 10,
    color: TEXT_MUTED,
    fontWeight: "500" as const,
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
