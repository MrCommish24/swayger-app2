/**
 * Shared finalized Weekly Receipt.
 *
 * The receipt endpoint is intentionally viewer-independent: every authorized
 * member sees the same result, while only commissioner/co-commissioner gets
 * the share and copy controls.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { captureRef } from "react-native-view-shot";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useFantasyGuestToken } from "@/lib/use-fantasy-guest-token";
import {
  buildWeeklyReceiptShortUrl,
  CompetitionReceiptData,
  FantasySeasonDetail,
  getWeeklyReceipt,
  getWeeklyReceiptAlias,
  WeeklyReceiptData,
  fantasyFetch,
} from "@/lib/fantasy-api";
import { CompetitionReceipt } from "@/components/fantasy/CompetitionReceipt";
import { CompactCompetitionReceipt } from "@/components/fantasy/CompactCompetitionReceipt";
import { buildWeeklyReceiptShareText } from "@/lib/fantasy-receipt-share";
import { Analytics } from "@/lib/posthog";
import Colors from "@/constants/colors";

const C = Colors.dark;

export default function WeeklyReceiptScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();
  const { guestToken, guestTokenLoading } = useFantasyGuestToken();
  const { leagueId, seasonId, weekNumber } = useLocalSearchParams<{
    leagueId: string;
    seasonId: string;
    weekNumber: string;
  }>();
  const wn = Number.parseInt(weekNumber ?? "1", 10);
  const [receipt, setReceipt] = useState<WeeklyReceiptData | null>(null);
  const [detail, setDetail] = useState<FantasySeasonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const captureCardRef = useRef<View | null>(null);
  const aliasPromiseRef = useRef<Promise<string> | null>(null);
  const viewedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const analyticsContext = useCallback((viewerRole?: "commissioner" | "co_commissioner" | "member") => ({
    league_id: leagueId,
    season_id: seasonId,
    week_number: wn,
    experience_type: "weekly" as const,
    competition_type: "weekly" as const,
    viewer_role: viewerRole ?? detail?.viewer?.role,
    is_guest: !session,
  }), [detail?.viewer?.role, leagueId, seasonId, session, wn]);

  const load = useCallback(async () => {
    if (!leagueId || !seasonId || !session && !guestToken) return;
    setLoading(true);
    setError(null);
    const auth = session ? { session } : { guestToken };
    try {
      const [receiptData, seasonData] = await Promise.all([
        getWeeklyReceipt(leagueId, seasonId, wn, auth),
        fantasyFetch<FantasySeasonDetail>(
          `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}`,
          {},
          auth,
        ),
      ]);
      if (!mountedRef.current) return;
      // Older API responses may omit the redundant week field; the route
      // parameter is authoritative for the receipt heading and share text.
      setReceipt({ ...receiptData, week_number: receiptData.week_number ?? wn });
      setDetail(seasonData);
      if (receiptData.finalized && !viewedRef.current) {
        viewedRef.current = true;
        Analytics.fantasyReceiptViewed(analyticsContext(seasonData.viewer?.role));
      }
    } catch (e: any) {
      if (mountedRef.current) setError(e.message ?? "Failed to load the weekly receipt");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [analyticsContext, guestToken, leagueId, seasonId, session, wn]);

  useEffect(() => {
    if (!authLoading && !guestTokenLoading) load();
  }, [authLoading, guestTokenLoading, load]);

  const canShare = detail?.viewer?.role === "commissioner" ||
    detail?.viewer?.role === "co_commissioner";

  const ensureShortUrl = useCallback(async () => {
    if (shortUrl) return shortUrl;
    if (!leagueId || !seasonId || (!session && !guestToken)) {
      throw new Error("Receipt sharing requires league access");
    }
    if (aliasPromiseRef.current) return aliasPromiseRef.current;
    const auth = session ? { session } : { guestToken };
    const promise = getWeeklyReceiptAlias(leagueId, seasonId, wn, auth)
      .then(({ short_code }) => {
        const url = buildWeeklyReceiptShortUrl(short_code);
        if (mountedRef.current) setShortUrl(url);
        return url;
      })
      .finally(() => { aliasPromiseRef.current = null; });
    aliasPromiseRef.current = promise;
    return promise;
  }, [guestToken, leagueId, seasonId, session, shortUrl, wn]);

  const textShare = useCallback(async (message: string, url: string) => {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: "Swayger Weekly Receipt", text: message, url });
      return;
    }
    const result = await Share.share(
      Platform.OS === "ios" ? { message, url } : { message },
    );
    if (result.action === Share.dismissedAction) throw new Error("Share dismissed");
  }, []);

  const handleShare = useCallback(async () => {
    if (!receipt || sharing) return;
    setSharing(true);
    try {
      const url = await ensureShortUrl();
      const message = buildWeeklyReceiptShareText(receipt, url);
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
        const file = new File([blob], `swayger-week-${wn}-receipt.png`, { type: "image/png" });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            title: "Swayger Weekly Receipt",
            text: message,
            files: [file],
          });
          Analytics.fantasyReceiptShared(analyticsContext(), { share_surface: "web_share" });
        } else {
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = downloadUrl;
          link.download = `swayger-week-${wn}-receipt.png`;
          link.click();
          URL.revokeObjectURL(downloadUrl);
          await Clipboard.setStringAsync(message);
          if (mountedRef.current) setCopied(true);
          Analytics.fantasyReceiptShared(analyticsContext(), { share_surface: "download_copy" });
        }
      } else {
        const target = captureCardRef.current;
        if (!target) throw new Error("Receipt image is not ready");
        const uri = await captureRef(target, { format: "png", quality: 1 });
        const result = await Share.share(
          { message, url: uri, title: "Swayger Weekly Receipt" },
          { dialogTitle: "Share Weekly Receipt" },
        );
        if (result.action === Share.sharedAction) {
          Analytics.fantasyReceiptShared(analyticsContext(), { share_surface: "native_share" });
        }
      }
    } catch (e: any) {
      // Native and web share APIs reject on dismissal; that is not an error.
      if (!/abort|cancel|dismiss/i.test(`${e?.name ?? ""} ${e?.message ?? ""}`)) {
        try {
          const url = shortUrl ?? await ensureShortUrl();
          await textShare(buildWeeklyReceiptShareText(receipt, url), url);
          Analytics.fantasyReceiptShared(analyticsContext(), { share_surface: "text_share" });
        } catch { /* restricted previews may expose neither capture nor share */ }
      }
    } finally {
      if (mountedRef.current) setSharing(false);
    }
  }, [analyticsContext, ensureShortUrl, receipt, sharing, shortUrl, textShare, wn]);

  const handleCopy = useCallback(async () => {
    if (copied) return;
    try {
      const url = await ensureShortUrl();
      await Clipboard.setStringAsync(url);
      Analytics.fantasyReceiptLinkCopied(analyticsContext());
      if (mountedRef.current) {
        setCopied(true);
        setTimeout(() => mountedRef.current && setCopied(false), 2000);
      }
    } catch { /* clipboard may be unavailable in restricted previews */ }
  }, [analyticsContext, copied, ensureShortUrl]);

  if (authLoading || guestTokenLoading || (loading && !receipt)) {
    return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={C.tint} size="large" /></View>;
  }
  if (!session && !guestToken) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Sign in or use league guest access to view this receipt.</Text>
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
        <TouchableOpacity style={styles.button} onPress={load}><Text style={styles.buttonText}>Retry</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.linkText}>← Back</Text></TouchableOpacity>
      </View>
    );
  }
  if (!receipt?.finalized) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <View style={styles.statusMark}><Text style={styles.statusMarkText}>...</Text></View>
        <Text style={styles.pendingTitle}>Receipt Not Ready Yet</Text>
        <Text style={styles.pendingBody}>Week {wn} results will appear after the commissioner finalizes them.</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.linkText}>← Back to Week {wn}</Text></TouchableOpacity>
      </View>
    );
  }

  const nextWeek = receipt.next_week_number ?? wn + 1;
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 36 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.linkText}>← Week {wn} Results</Text>
        </TouchableOpacity>
        <CompetitionReceipt
          data={receipt as CompetitionReceiptData}
          variant="weekly"
          canShare={!!canShare}
          sharing={sharing}
          copied={copied}
          onShare={handleShare}
          onCopy={handleCopy}
          onViewLeaguePicks={() => router.push(`/fantasy/weeks/${leagueId}/${seasonId}/${wn}/league-picks` as any)}
        />
        <View style={styles.nextWeekCard}>
          <Text style={styles.nextWeekLabel}>WHAT&apos;S NEXT</Text>
          <Text style={styles.nextWeekTitle}>
            {receipt.next_week_published ? `Week ${nextWeek} is live` : `Week ${nextWeek} is coming next`}
          </Text>
          <Text style={styles.nextWeekBody}>
            {receipt.next_week_published
              ? "Keep the streak going and make your next picks."
              : "Your commissioner will publish the next weekly competition soon."}
          </Text>
          {receipt.next_week_published && (
            <TouchableOpacity
              style={styles.nextWeekButton}
              onPress={() => router.push(`/fantasy/weeks/${leagueId}/${seasonId}/${nextWeek}/play` as any)}
            >
              <Text style={styles.nextWeekButtonText}>Make Week {nextWeek} Picks →</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      <View pointerEvents="none" style={styles.captureStage}>
        <View ref={captureCardRef} collapsable={false}>
          <CompactCompetitionReceipt data={receipt as CompetitionReceiptData} variant="weekly" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 20 },
  captureStage: { position: "absolute", left: -10000, top: 0 },
  center: { flex: 1, backgroundColor: C.background, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  backLink: { marginBottom: 14 },
  linkText: { color: C.tint, fontSize: 14, fontWeight: "600" },
  errorText: { color: C.danger, fontSize: 14, textAlign: "center", lineHeight: 20 },
  button: { backgroundColor: C.tint, borderRadius: 11, paddingVertical: 13, paddingHorizontal: 28, minWidth: 130, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  statusMark: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.tint, alignItems: "center", justifyContent: "center" },
  statusMarkText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  pendingTitle: { color: C.text, fontSize: 21, fontWeight: "800", textAlign: "center" },
  pendingBody: { color: C.textSecondary, fontSize: 14, textAlign: "center", lineHeight: 21 },
  nextWeekCard: { backgroundColor: "#111A33", borderRadius: 16, borderWidth: 1, borderColor: "#293B78", padding: 17, marginTop: 4 },
  nextWeekLabel: { color: "#A5B4FC", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  nextWeekTitle: { color: C.text, fontSize: 18, fontWeight: "800", marginTop: 5 },
  nextWeekBody: { color: C.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 5 },
  nextWeekButton: { backgroundColor: C.tint, borderRadius: 11, minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 13 },
  nextWeekButtonText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});