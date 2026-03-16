import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TAKE_CONFIGS, type TakeType } from "@/lib/mm-picks";

const ORANGE = "#E8590A";
const GOLD = "#F5A623";

interface Props {
  takeType: TakeType;
  teams: string[];
  displayName: string;
}

export default function MMPickShareCard({ takeType, teams, displayName }: Props) {
  const cfg = TAKE_CONFIGS[takeType];

  return (
    <View style={styles.card}>
      <View style={styles.topBar}>
        <View style={styles.mmBadge}>
          <Text style={styles.mmBadgeText}>🏀 MARCH MADNESS</Text>
        </View>
        <Text style={styles.brandText}>SWAYGER</Text>
      </View>

      <View style={styles.takeRow}>
        <Text style={styles.takeEmoji}>{cfg.emoji}</Text>
        <View>
          <Text style={styles.takeLabel}>MY {cfg.label.toUpperCase()}</Text>
          <Text style={styles.takeSubLabel}>IS LOCKED IN</Text>
        </View>
        <View style={styles.lockedIcon}>
          <Ionicons name="lock-closed" size={20} color={GOLD} />
        </View>
      </View>

      <View style={styles.teamsList}>
        {teams.map((name, i) => (
          <View key={name} style={styles.teamRow}>
            <View style={styles.teamNum}>
              <Text style={styles.teamNumText}>{i + 1}</Text>
            </View>
            <Text style={styles.teamName} numberOfLines={1}>
              {name}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.divider} />

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Ionicons name="person-circle-outline" size={13} color="#6B7280" />
          <Text style={styles.footerHandle} numberOfLines={1}>
            {displayName}
          </Text>
        </View>
        <Text style={styles.tagline}>Think you're right? Swayger on it.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111827",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: ORANGE,
    padding: 22,
    gap: 16,
    width: 300,
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
    fontSize: 10,
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
  takeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  takeEmoji: {
    fontSize: 32,
  },
  takeLabel: {
    fontSize: 16,
    fontWeight: "900" as const,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  takeSubLabel: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: "#6B7280",
    letterSpacing: 1,
  },
  lockedIcon: {
    marginLeft: "auto",
  },
  teamsList: {
    gap: 6,
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  teamNum: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: "rgba(245,166,35,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  teamNumText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: GOLD,
  },
  teamName: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#F3F4F6",
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  footerHandle: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: "#6B7280",
    flex: 1,
  },
  tagline: {
    fontSize: 9,
    fontWeight: "600" as const,
    color: ORANGE,
    fontStyle: "italic",
    textAlign: "right",
    flex: 1,
  },
});
