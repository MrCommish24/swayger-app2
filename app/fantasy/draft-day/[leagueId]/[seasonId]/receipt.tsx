/**
 * Global Draft Day Receipt.
 *
 * The API supplies one shared payload for every authorized member. This screen
 * fetches season detail separately only to decide whether commissioner-level
 * sharing controls should be shown.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
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
  buildDraftDayReceiptShortUrl,
  CompetitionReceiptData,
  fantasyFetch,
  FantasySeasonDetail,
  getDraftDayReceipt,
  getDraftDayReceiptAlias,
} from "@/lib/fantasy-api";
import { CompetitionReceipt } from "@/components/fantasy/CompetitionReceipt";
import { CompactCompetitionReceipt } from "@/components/fantasy/CompactCompetitionReceipt";
import { buildDraftDayReceiptShareText } from "@/lib/fantasy-receipt-share";
import Colors from "@/constants/colors";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";

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
  const [shortReceiptUrl, setShortReceiptUrl] = useState<string | null>(null);
  const captureCardRef = useRef<View | null>(null);
  const aliasPromiseRef = useRef<Promise<string> | null>(null);

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

  const canShare = detail?.viewer?.role === "commissioner" ||
    detail?.viewer?.role === "co_commissioner";

  const ensureShortReceiptUrl = useCallback(async (): Promise<string> => {
    if (shortReceiptUrl) return shortReceiptUrl;
    if (!leagueId || !seasonId || (!session && !guestToken)) {
      throw new Error("Receipt sharing requires league access");
    }
    if (aliasPromiseRef.current) return aliasPromiseRef.current;

    const auth = session ? { session } : { guestToken };
    const promise = getDraftDayReceiptAlias(leagueId, seasonId, auth)
      .then(({ short_code }) => {
        const url = buildDraftDayReceiptShortUrl(short_code);
        setShortReceiptUrl(url);
        return url;
      })
      .finally(() => {
        aliasPromiseRef.current = null;
      });
    aliasPromiseRef.current = promise;
    return promise;
  }, [guestToken, leagueId, seasonId, session, shortReceiptUrl]);

  const fallbackToTextShare = useCallback(async (message: string, url: string) => {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: "Swayger Draft Day Receipt", text: message, url });
      return;
    }
    await Share.share(Platform.OS === "ios" ? { message, url } : { message });
  }, []);

  const handleShare = useCallback(async () => {
    if (!receipt || sharing) return;
    setSharing(true);
    try {
      const url = await ensureShortReceiptUrl();
      const message = buildDraftDayReceiptShareText(receipt, url);

      if (Platform.OS === "web") {
        const target = captureCardRef.current as any;
        if (!target) throw new Error("Receipt image is not ready");
        const html2canvas = (await import("html2canvas")).default;
        const canvas = await html2canvas(target, {
          backgroundColor: "#0C1220",
          scale: Math.min(2, window.devicePixelRatio || 1),
          useCORS: true,
        });
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (!blob) throw new Error("Unable to create receipt image");

        const file = new File([blob], "swayger-draft-day-receipt.png", {
          type: "image/png",
        });
        if (
          typeof navigator !== "undefined" &&
          navigator.share &&
          navigator.canShare?.({ files: [file] })
        ) {
          await navigator.share({
            title: "Swayger Draft Day Receipt",
            text: message,
            files: [file],
          });
        } else {
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = downloadUrl;
          link.download = "swayger-draft-day-receipt.png";
          link.click();
          URL.revokeObjectURL(downloadUrl);
          await Clipboard.setStringAsync(message);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      } else {
        const target = captureCardRef.current;
        if (!target) throw new Error("Receipt image is not ready");
        const uri = await captureRef(target, {
          format: "png",
          quality: 1,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: "image/png",
            dialogTitle: "Share Draft Day Receipt",
            UTI: "public.png",
          });
        } else {
          await fallbackToTextShare(message, url);
        }
      }
    } catch (e: any) {
      // Share dismissal is not an error state, but capture/API failures should
      // still leave the user a usable text/link fallback.
      const errorText = `${e?.name ?? ""} ${e?.message ?? ""}`;
      if (!/abort|cancel|dismiss/i.test(errorText)) {
        try {
          const url = shortReceiptUrl ?? await ensureShortReceiptUrl();
          await fallbackToTextShare(buildDraftDayReceiptShareText(receipt, url), url);
        } catch {
          // Restricted preview environments may expose neither capture nor share.
        }
      }
    } finally {
      setSharing(false);
    }
  }, [
    ensureShortReceiptUrl,
    fallbackToTextShare,
    receipt,
    sharing,
    shortReceiptUrl,
  ]);

  const handleCopy = useCallback(async () => {
    if (copied) return;
    try {
      const url = await ensureShortReceiptUrl();
      await Clipboard.setStringAsync(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable in a restricted preview environment.
    }
  }, [copied, ensureShortReceiptUrl]);

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
    <View style={styles.container}>
      <ScrollView
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

      <View pointerEvents="none" style={styles.captureStage}>
        <View ref={captureCardRef} collapsable={false}>
          <CompactCompetitionReceipt data={receipt} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 20 },
  captureStage: {
    position: "absolute",
    left: -10000,
    top: 0,
  },
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