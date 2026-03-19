import { useRef, useState } from "react";
import {
  StyleSheet, Text, View, Platform, ActivityIndicator,
  ScrollView, Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { useAuth } from "@/lib/auth-context";
import { fetchDetailedH2H, DetailedH2HResult, categoryIcon, H2HSwaygerLog } from "@/lib/swayger";
import { getAvatarColor, formatDate, showError } from "@/lib/helpers";
import H2HReceiptCard from "@/components/H2HReceiptCard";
import Colors from "@/constants/colors";

export default function H2HDetailScreen() {
  const { opponentId } = useLocalSearchParams<{ opponentId: string }>();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const router = useRouter();
  const { user, profile } = useAuth();
  const captureTarget = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const { data, isLoading } = useQuery<DetailedH2HResult>({
    queryKey: ["h2h-detail", user?.id, opponentId],
    queryFn: () => fetchDetailedH2H(user!.id, opponentId!),
    enabled: !!user?.id && !!opponentId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  async function handleShare() {
    if (!captureTarget.current || sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(captureTarget, { format: "png", quality: 1.0 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share H2H Receipt" });
      } else {
        showError("Sharing is not available on this device.");
      }
    } catch {
      showError("Could not capture receipt. Try again.");
    } finally {
      setSharing(false);
    }
  }

  const myUsername = profile?.username || user?.email?.split("@")[0] || "me";
  const myDisplayName = profile?.display_name || null;
  const myAvatarColor = getAvatarColor(myUsername);
  const opponentAvatarColor = data ? getAvatarColor(data.opponentUsername) : "#666";

  function renderLogItem(item: H2HSwaygerLog, index: number) {
    const resultColor = item.isDraw ? Colors.dark.textSecondary : item.myWon ? "#22C55E" : "#EF4444";
    const resultLabel = item.isDraw ? "D" : item.myWon ? "W" : "L";
    const icon = categoryIcon(item.category) as keyof typeof Ionicons.glyphMap;
    return (
      <View key={item.id} style={[styles.logRow, index === 0 && styles.logRowFirst]}>
        <View style={styles.logIconWrap}>
          <Ionicons name={icon} size={16} color={Colors.dark.textSecondary} />
        </View>
        <View style={styles.logInfo}>
          <Text style={styles.logTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.logMeta}>{item.category} · {formatDate(item.date)}</Text>
        </View>
        <View style={styles.logResult}>
          <View style={[styles.resultBadge, { borderColor: resultColor, backgroundColor: `${resultColor}18` }]}>
            <Text style={[styles.resultLabel, { color: resultColor }]}>{resultLabel}</Text>
          </View>
          <Text style={styles.logUnits}>{item.stake_units} SP</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="h2h-detail-back">
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {data ? `vs @${data.opponentUsername}` : "Head to Head"}
          </Text>
          {data && data.overall.total > 0 && (
            <Text style={styles.subtitle}>{data.overall.total} settled Swayger{data.overall.total !== 1 ? "s" : ""}</Text>
          )}
        </View>
        <Pressable
          style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.7 }]}
          onPress={handleShare}
          disabled={sharing || isLoading || !data}
          testID="h2h-share"
        >
          {sharing
            ? <ActivityIndicator size="small" color={Colors.dark.tint} />
            : <Ionicons name="share-outline" size={22} color={Colors.dark.tint} />
          }
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
        </View>
      ) : !data ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.dark.textSecondary} />
          <Text style={styles.emptyText}>Could not load H2H data</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: isWeb ? 34 + 84 : insets.bottom + 60 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.cardWrap}>
            <View ref={captureTarget} collapsable={false}>
              <H2HReceiptCard
                myUsername={myUsername}
                myDisplayName={myDisplayName}
                myAvatarColor={myAvatarColor}
                opponentUsername={data.opponentUsername}
                opponentDisplayName={data.opponentDisplayName}
                opponentAvatarColor={opponentAvatarColor}
                overall={data.overall}
                byCategory={data.byCategory}
              />
            </View>

            <Pressable
              style={({ pressed }) => [styles.shareFullBtn, pressed && { opacity: 0.8 }]}
              onPress={handleShare}
              disabled={sharing}
            >
              {sharing
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name="share-outline" size={18} color="#fff" />
                    <Text style={styles.shareFullBtnText}>Share Receipt</Text>
                  </>
              }
            </Pressable>
          </View>

          {data.log.length > 0 && (
            <View style={styles.logSection}>
              <View style={styles.logHeaderRow}>
                <Text style={styles.logHeader}>Game Log</Text>
                <Text style={styles.logHeaderSub}>{data.log.length} result{data.log.length !== 1 ? "s" : ""}</Text>
              </View>
              <View style={styles.logLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "#22C55E" }]} />
                  <Text style={styles.legendLabel}>W — You won</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "#EF4444" }]} />
                  <Text style={styles.legendLabel}>L — They won</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.dark.textSecondary }]} />
                  <Text style={styles.legendLabel}>D — Draw</Text>
                </View>
              </View>
              {data.log.map((item, idx) => renderLogItem(item, idx))}
            </View>
          )}

          {data.overall.total === 0 && (
            <View style={styles.noGames}>
              <Ionicons name="people-outline" size={40} color={Colors.dark.tabIconDefault} />
              <Text style={styles.noGamesText}>No settled Swaygers yet</Text>
              <Text style={styles.noGamesSub}>Come back once your first Swayger is settled.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  headerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  backBtn: { padding: 4 },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontWeight: "bold" as const, color: Colors.dark.text },
  subtitle: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 2 },
  shareBtn: { padding: 6 },

  centered: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyText: { fontSize: 16, color: Colors.dark.textSecondary, textAlign: "center" as const },

  scrollContent: { paddingTop: 8, gap: 0 },
  cardWrap: {
    alignItems: "center" as const,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
  },

  shareFullBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: Colors.dark.tint,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 28,
    alignSelf: "center" as const,
  },
  shareFullBtnText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#fff",
  },

  logSection: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  logHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    gap: 8,
    marginBottom: 8,
  },
  logHeader: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  logHeaderSub: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
  },
  logLegend: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 16,
    marginBottom: 12,
    flexWrap: "wrap" as const,
  },
  legendItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: { fontSize: 11, color: Colors.dark.textSecondary },

  logRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.dark.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 10,
  },
  logRowFirst: {
    borderColor: Colors.dark.tint,
    backgroundColor: "rgba(29,161,242,0.04)",
  },
  logIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.dark.surfaceLight,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  logInfo: { flex: 1, gap: 3 },
  logTitle: { fontSize: 14, fontWeight: "600" as const, color: Colors.dark.text },
  logMeta: { fontSize: 11, color: Colors.dark.tabIconDefault },
  logResult: { alignItems: "flex-end" as const, gap: 4 },
  resultBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  resultLabel: { fontSize: 14, fontWeight: "800" as const },
  logUnits: { fontSize: 11, color: Colors.dark.tabIconDefault, fontWeight: "500" as const },

  noGames: { alignItems: "center" as const, gap: 10, paddingVertical: 40, paddingHorizontal: 40 },
  noGamesText: { fontSize: 16, fontWeight: "600" as const, color: Colors.dark.text, textAlign: "center" as const },
  noGamesSub: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center" as const, lineHeight: 18 },
});
