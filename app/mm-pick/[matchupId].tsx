import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";

const ORANGE = "#E8590A";
const ORANGE_DIM = "rgba(232,89,10,0.12)";
const ORANGE_BORDER = "rgba(232,89,10,0.35)";

interface MatchupInfo {
  teamA: string;
  teamB: string;
  seedA: number;
  seedB: number;
  region: string;
}

export const PENDING_REFERRAL_KEY = "swayger_pending_referral";

export interface PendingReferral {
  referralCode: string;
  matchupId: string;
  roundId: string;
}

function roundLabel(roundId: string): string {
  const labels: Record<string, string> = {
    "round-64": "Round of 64",
    "round-32": "Round of 32",
    "sweet-16": "Sweet 16",
    "elite-8": "Elite Eight",
    "final-four": "Final Four",
    "championship": "Championship",
  };
  return labels[roundId] ?? roundId;
}

export default function MMPickLandingScreen() {
  const { matchupId } = useLocalSearchParams<{ matchupId: string }>();
  const { ref: refCode, round_id: roundId } = useLocalSearchParams<{ ref: string; round_id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [matchup, setMatchup] = useState<MatchupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [referralStored, setReferralStored] = useState(false);

  const topPadding = isWeb ? 67 : insets.top;

  useEffect(() => {
    async function load() {
      const apiBase = getApiUrl();

      await Promise.all([
        // Fetch referrer name
        refCode
          ? fetch(new URL(`/api/mm/referral-info?code=${encodeURIComponent(refCode)}`, apiBase).toString())
              .then((r) => r.json())
              .then((d) => { if (d.found) setReferrerName(d.name); })
              .catch(() => {})
          : Promise.resolve(),

        // Fetch matchup data for this round
        roundId
          ? fetch(new URL(`/api/mm/round-matchups/${encodeURIComponent(roundId)}`, apiBase).toString())
              .then((r) => r.json())
              .then((data) => {
                const allMatchups = [
                  ...(data.upset ?? []),
                  ...(data.blowout ?? []),
                  ...(data.highScorer ?? []),
                ];
                const found = allMatchups.find((m: { matchupId: string }) => m.matchupId === matchupId);
                if (found) {
                  setMatchup({
                    teamA: found.teamA,
                    teamB: found.teamB,
                    seedA: found.seedA ?? 0,
                    seedB: found.seedB ?? 0,
                    region: found.region ?? "",
                  });
                }
              })
              .catch(() => {})
          : Promise.resolve(),
      ]);

      setLoading(false);
    }
    load();
  }, [matchupId, roundId, refCode]);

  async function handleJoin() {
    if (refCode && matchupId && roundId) {
      const pending: PendingReferral = { referralCode: refCode, matchupId, roundId };
      await AsyncStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify(pending));
      setReferralStored(true);
    }
    router.push("/auth" as never);
  }

  function handleGoToPicks() {
    router.push({
      pathname: "/march-madness/picks" as never,
      params: { roundId: roundId ?? "sweet-16" },
    } as never);
  }

  const roundStr = roundId ? roundLabel(roundId) : "March Madness";

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPadding }]}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.brandRow}>
          <Ionicons name="flash" size={18} color={ORANGE} />
          <Text style={styles.brand}>Swayger</Text>
        </View>
      </View>

      {/* Referrer banner */}
      {referrerName && (
        <View style={styles.referrerBanner}>
          <Ionicons name="person-circle-outline" size={18} color={ORANGE} />
          <Text style={styles.referrerText}>
            <Text style={styles.referrerName}>{referrerName}</Text> challenged you to pick this game
          </Text>
        </View>
      )}

      {/* Round label */}
      <View style={styles.roundBadge}>
        <Ionicons name="trophy-outline" size={13} color={ORANGE} />
        <Text style={styles.roundBadgeText}>2026 March Madness · {roundStr}</Text>
      </View>

      {/* Matchup card */}
      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={ORANGE} />
        </View>
      ) : matchup ? (
        <View style={styles.matchupCard}>
          {matchup.region ? (
            <Text style={styles.regionLabel}>{matchup.region.toUpperCase()}</Text>
          ) : null}

          <View style={styles.teamsRow}>
            <View style={styles.teamSide}>
              {matchup.seedA > 0 ? (
                <View style={styles.seedBadge}>
                  <Text style={styles.seedText}>{matchup.seedA}</Text>
                </View>
              ) : null}
              <Text style={styles.teamName} numberOfLines={2}>{matchup.teamA}</Text>
            </View>

            <Text style={styles.vsText}>VS</Text>

            <View style={[styles.teamSide, styles.teamSideRight]}>
              <Text style={[styles.teamName, styles.teamNameRight]} numberOfLines={2}>{matchup.teamB}</Text>
              {matchup.seedB > 0 ? (
                <View style={styles.seedBadge}>
                  <Text style={styles.seedText}>{matchup.seedB}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <Text style={styles.pickPrompt}>Which team wins this game?</Text>
        </View>
      ) : (
        <View style={styles.matchupCard}>
          <Text style={styles.pickPrompt}>March Madness · {roundStr}</Text>
          <Text style={styles.noMatchupText}>Make your picks on Swayger</Text>
        </View>
      )}

      {/* Value prop */}
      <View style={styles.valueProps}>
        {[
          { icon: "flash-outline", text: "Earn points for correct picks" },
          { icon: "podium-outline", text: "Compete on the leaderboard" },
          { icon: "people-outline", text: "Wager with friends" },
        ].map(({ icon, text }) => (
          <View key={text} style={styles.valuePropRow}>
            <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={16} color={ORANGE} />
            <Text style={styles.valuePropText}>{text}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      {user ? (
        <View style={styles.ctaSection}>
          <Text style={styles.ctaSubText}>You're already in. Go make your picks.</Text>
          <Pressable
            style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
            onPress={handleGoToPicks}
          >
            <Ionicons name="flash" size={16} color="#FFFFFF" />
            <Text style={styles.ctaBtnText}>Go to {roundStr} Picks</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.ctaSection}>
          <Text style={styles.ctaSubText}>
            {referrerName
              ? `Join Swayger and make your pick — if you're right, you earn points.`
              : "Join Swayger to make your pick and compete for March Madness glory."}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
            onPress={handleJoin}
          >
            <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
            <Text style={styles.ctaBtnText}>Join to Pick This Game</Text>
          </Pressable>
          {referralStored && (
            <Text style={styles.referralStoredText}>
              Your pick challenge is saved — finish signing up to lock it in.
            </Text>
          )}
        </View>
      )}

      {/* Lock deadline nudge */}
      <Text style={styles.lockNudge}>
        {roundStr} picks lock soon — don't miss it.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  content: { paddingBottom: 60, paddingHorizontal: 20 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.dark.surface,
    alignItems: "center", justifyContent: "center",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  brand: { fontSize: 18, fontWeight: "700" as const, color: Colors.dark.text },

  referrerBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: ORANGE_DIM,
    borderWidth: 1,
    borderColor: ORANGE_BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  referrerText: { flex: 1, fontSize: 14, color: Colors.dark.text, lineHeight: 20 },
  referrerName: { fontWeight: "700" as const, color: ORANGE },

  roundBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    backgroundColor: ORANGE_DIM,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    marginBottom: 16,
  },
  roundBadgeText: { fontSize: 12, color: ORANGE, fontWeight: "600" as const },

  matchupCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 20,
    gap: 16,
    marginBottom: 24,
  },
  loadingCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  regionLabel: {
    fontSize: 11, fontWeight: "600" as const, color: Colors.dark.textSecondary,
    letterSpacing: 1,
  },
  teamsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  teamSide: { flex: 1, gap: 6 },
  teamSideRight: { alignItems: "flex-end" },
  teamName: {
    fontSize: 17, fontWeight: "700" as const, color: Colors.dark.text, lineHeight: 22,
  },
  teamNameRight: { textAlign: "right" },
  seedBadge: {
    backgroundColor: Colors.dark.surfaceLight,
    borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
    alignSelf: "flex-start",
  },
  seedText: { fontSize: 11, color: Colors.dark.textSecondary, fontWeight: "600" as const },
  vsText: {
    fontSize: 13, fontWeight: "800" as const, color: Colors.dark.tabIconDefault,
    letterSpacing: 1,
  },
  pickPrompt: {
    fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center",
  },
  noMatchupText: {
    fontSize: 16, color: Colors.dark.text, textAlign: "center", fontWeight: "600" as const,
  },

  valueProps: { gap: 10, marginBottom: 28 },
  valuePropRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  valuePropText: { fontSize: 14, color: Colors.dark.textSecondary, lineHeight: 20 },

  ctaSection: { gap: 14, marginBottom: 24 },
  ctaSubText: {
    fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 20,
  },
  ctaBtn: {
    backgroundColor: ORANGE,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 16, borderRadius: 14,
  },
  ctaBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" as const },
  referralStoredText: {
    fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center",
    lineHeight: 18, fontStyle: "italic",
  },
  lockNudge: {
    fontSize: 12, color: Colors.dark.tabIconDefault, textAlign: "center",
    marginTop: 8,
  },
});
