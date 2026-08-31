/**
 * Global Draft Day Receipt.
 *
 * The API supplies one shared payload for every authorized member. This screen
 * fetches season detail separately only to decide whether commissioner-level
 * sharing controls should be shown.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useFantasyGuestToken } from "@/lib/use-fantasy-guest-token";
import {
  buildDraftDayReceiptUrl,
  CompetitionReceiptData,
  fantasyFetch,
  FantasySeasonDetail,
  getDraftDayReceipt,
} from "@/lib/fantasy-api";
import { CompetitionReceipt } from "@/components/fantasy/CompetitionReceipt";
import Colors from "@/constants/colors";

const C = Colors.dark;

export default function DraftDayReceiptScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();
  const { guestToken, guestTokenLoading } = useFantasyGuestToken();
  const { leagueId, seasonId } = useLocalSearchParams<{ leagueId: string; seasonId: string }>();

  const [receipt, setReceipt] = useState<CompetitionReceiptData | null>(null);
  const [detail, setDetail] = useState<FantasySeasonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!leagueId || !seasonId || (!session && !guestToken)) return;
    if (!quiet) setLoading(true);
    setError(null);
    const auth = session ? { session } : { guestToken };
    try {
      const [receiptData, seasonData] = await Promise.all([
        getDraftDayReceipt(leagueId, seasonId, auth),
        fantasyFetch<FantasySeasonDetail>(
          `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}`,
          {},
          auth,
        ),
      ]);
      setReceipt(receiptData);
      setDetail(seasonData);
    } catch (e: any) {
      setError(e.message ?? "Failed to load the Draft Day receipt");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leagueId, seasonId, session, guestToken]);

  useEffect(() => {
    if (!authLoading && !guestTokenLoading) load();
  }, [authLoading, guestTokenLoading, load]);

  const receiptUrl = leagueId && seasonId
    ? buildDraftDayReceiptUrl(leagueId, seasonId)
    : "";
  const canShare = detail?.viewer?.role === "commissioner" ||
    detail?.viewer?.role === "co_commissioner";

  const handleShare = useCallback(async () => {
    if (!receipt || !receiptUrl || sharing) return;
    setSharing(true);
    try {
      const leagueName = receipt.league_name ?? "our league";
      const message =
        `${leagueName}'s Draft Day receipt is final.\n\n` +
        `See the winner, standings, and final answers:\n${receiptUrl}`;
      if (Platform.OS === "ios") {
        await Share.share({ message, url: receiptUrl });
      } else {
        await Share.share({ message });
      }
    } catch {
      // Share dismissal is not an error state.
    } finally {
      setSharing(false);
    }
  }, [receipt, receiptUrl, sharing]);

  const handleCopy = useCallback(async () => {
    if (!receiptUrl || copied) return;
    try {
      await Clipboard.setStringAsync(receiptUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable in a restricted preview environment.
    }
  }, [receiptUrl, copied]);

  if (authLoading || guestTokenLoading || (loading && !receipt)) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  if (!session && !guestToken) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Sign in or use your league guest access to view this receipt.</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace("/auth")}>
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.button} onPress={() => load()}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.linkText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!receipt?.finalized) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.notReadyEmoji}>⏳</Text>
        <Text style={styles.notReadyTitle}>Receipt Not Ready Yet</Text>
        <Text style={styles.notReadyBody}>
          Your commissioner is still resolving the Draft Day questions. Check back soon.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.linkText}>← Back to Draft Day</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 36 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
          tintColor={C.tint}
        />
      }
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
        <Text style={styles.linkText}>← Draft Day Results</Text>
      </TouchableOpacity>
      <CompetitionReceipt
        data={receipt}
        canShare={canShare}
        sharing={sharing}
        copied={copied}
        onShare={handleShare}
        onCopy={handleCopy}
        onViewLeaguePicks={() =>
          router.push(`/fantasy/draft-day/${leagueId}/${seasonId}/league-picks` as any)
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 20 },
  center: { flex: 1, backgroundColor: C.background, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  backLink: { marginBottom: 14 },
  linkText: { color: C.tint, fontSize: 14, fontWeight: "600" },
  errorText: { color: C.danger, fontSize: 14, textAlign: "center", lineHeight: 20 },
  button: { backgroundColor: C.tint, borderRadius: 11, paddingVertical: 13, paddingHorizontal: 28, minWidth: 130, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  notReadyEmoji: { fontSize: 46 },
  notReadyTitle: { color: C.text, fontSize: 21, fontWeight: "800", textAlign: "center" },
  notReadyBody: { color: C.textSecondary, fontSize: 14, textAlign: "center", lineHeight: 21 },
});