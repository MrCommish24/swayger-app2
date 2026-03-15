import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface MMStats {
  wins: number;
  losses: number;
  draws: number;
  active: number;
  username: string;
  displayName: string | null;
}

interface Props {
  stats: MMStats;
}

export default function MarchMadnessShareCard({ stats }: Props) {
  const { wins, losses, draws, active, username, displayName } = stats;
  const decided = wins + losses;
  const winPct = decided > 0 ? Math.round((wins / decided) * 100) : null;
  const handle = displayName || `@${username}`;

  return (
    <View style={styles.card}>
      <View style={styles.topBar}>
        <View style={styles.mmBadge}>
          <Text style={styles.mmBadgeText}>🏀 MARCH MADNESS</Text>
        </View>
        <Text style={styles.brandText}>SWAYGER</Text>
      </View>

      <View style={styles.heroRow}>
        <Text style={styles.record}>
          {wins}<Text style={styles.dash}>–</Text>{losses}
          {draws > 0 ? <Text style={styles.draws}>–{draws}</Text> : null}
        </Text>
        <View style={styles.heroRight}>
          {winPct !== null ? (
            <Text style={styles.winPct}>{winPct}%</Text>
          ) : null}
          <Text style={styles.winPctLabel}>WIN %</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>{wins}</Text>
          <Text style={styles.statLabel}>WINS</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>{losses}</Text>
          <Text style={styles.statLabel}>LOSSES</Text>
        </View>
        {draws > 0 ? (
          <>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>{draws}</Text>
              <Text style={styles.statLabel}>DRAWS</Text>
            </View>
          </>
        ) : null}
        {active > 0 ? (
          <>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Text style={[styles.statValue, { color: "#22C55E" }]}>{active}</Text>
              <Text style={styles.statLabel}>LIVE</Text>
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.divider} />

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Ionicons name="person-circle-outline" size={14} color={Colors.dark.textSecondary} />
          <Text style={styles.footerHandle} numberOfLines={1}>{handle}</Text>
        </View>
        <Text style={styles.tagline}>Think you're right? Swayger on it.</Text>
      </View>
    </View>
  );
}

const ORANGE = "#E8590A";
const GOLD = "#F5A623";

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111827",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: ORANGE,
    padding: 24,
    gap: 16,
    width: 320,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mmBadge: {
    backgroundColor: ORANGE,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  mmBadgeText: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  brandText: {
    fontSize: 12,
    fontWeight: "900" as const,
    color: GOLD,
    letterSpacing: 2,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  record: {
    fontSize: 56,
    fontWeight: "900" as const,
    color: "#FFFFFF",
    lineHeight: 60,
  },
  dash: {
    color: Colors.dark.textSecondary,
    fontSize: 48,
  },
  draws: {
    color: Colors.dark.textSecondary,
    fontSize: 40,
  },
  heroRight: {
    alignItems: "flex-end",
    paddingBottom: 6,
  },
  winPct: {
    fontSize: 28,
    fontWeight: "800" as const,
    color: GOLD,
  },
  winPctLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: Colors.dark.textSecondary,
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    paddingVertical: 14,
  },
  statBlock: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800" as const,
    color: "#FFFFFF",
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: Colors.dark.textSecondary,
    letterSpacing: 1,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: 4,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  footerHandle: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  tagline: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: ORANGE,
    fontStyle: "italic",
    textAlign: "right",
    flex: 1,
  },
});
