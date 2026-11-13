import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import HistoryRecordCard from "@/components/GameDayHistoryRecordCard";
import { getMyGameDayHistory } from "@/lib/gameday-history";

const C = Colors.dark;
const PAGE_SIZE = 10;

export default function GameDayHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const query = useQuery({
    queryKey: ["gameday", "my-history", session?.user.id],
    queryFn: () => getMyGameDayHistory(session!),
    enabled: !!session,
    staleTime: 30_000,
  });
  const records = useMemo(() => query.data?.records ?? [], [query.data?.records]);
  const visibleRecords = records.slice(0, visibleCount);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => router.replace("/(tabs)" as never)}
        style={styles.back}
      >
        <Text style={styles.backText}>‹  GAME DAY</Text>
      </Pressable>
      <Text style={styles.eyebrow}>YOUR COMPETITION RECEIPTS</Text>
      <Text style={styles.heading}>Game Day{"\n"}History</Text>
      <Text style={styles.intro}>Every eligible room you played in, together in one place.</Text>

      {authLoading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator color={C.tint} />
          <Text style={styles.stateText}>Checking your account…</Text>
        </View>
      ) : !session ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>History is tied to your account</Text>
          <Text style={styles.stateText}>Sign in to see Game Day competitions linked to your participation.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push("/auth" as never)}>
            <Text style={styles.primaryText}>Sign In</Text>
          </Pressable>
        </View>
      ) : query.isLoading ? (
        <View style={styles.stateWrap}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonCard} />
          <View style={styles.skeletonCard} />
        </View>
      ) : query.isError ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>History couldn’t load</Text>
          <Text style={styles.stateText}>Your receipts are still here. Try the account history again.</Text>
          <Pressable style={styles.primaryButton} onPress={() => query.refetch()}>
            <Text style={styles.primaryText}>Try Again</Text>
          </Pressable>
        </View>
      ) : records.length === 0 ? (
        <View style={styles.stateCard}>
          <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>GD</Text></View>
          <Text style={styles.stateTitle}>No receipts yet</Text>
          <Text style={styles.stateText}>Your account-linked Game Days will appear here once results begin to settle.</Text>
          <Pressable style={styles.secondaryButton} onPress={() => router.replace("/(tabs)" as never)}>
            <Text style={styles.secondaryText}>Back to Game Day</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.listHeading}>
            <Text style={styles.sectionTitle}>ALL GAME DAYS</Text>
            <Text style={styles.total}>{records.length}</Text>
          </View>
          {visibleRecords.map((record) => (
            <HistoryRecordCard
              key={record.room.room_id}
              record={record}
              onPress={() => router.push(`/gameday/history/${encodeURIComponent(record.room.room_id)}` as never)}
            />
          ))}
          {visibleCount < records.length ? (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.loadMore, pressed && { opacity: 0.7 }]}
              onPress={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, records.length))}
            >
              <Text style={styles.loadMoreText}>Load older Game Days</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 18, maxWidth: 760, width: "100%", alignSelf: "center" },
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingRight: 18 },
  backText: { color: C.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  eyebrow: { color: C.tint, fontSize: 10, fontWeight: "800", letterSpacing: 1.8, marginTop: 18 },
  heading: {
    color: C.text,
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 42,
    lineHeight: 42,
    textTransform: "uppercase",
    marginTop: 7,
  },
  intro: { color: C.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 27 },
  listHeading: { flexDirection: "row", alignItems: "center", marginBottom: 13, paddingHorizontal: 2 },
  sectionTitle: { color: C.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  total: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 8,
    backgroundColor: C.surface,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9,
  },
  stateWrap: { paddingTop: 24, gap: 14 },
  stateCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    marginTop: 8,
  },
  stateTitle: { color: C.text, fontSize: 18, fontWeight: "700", marginBottom: 7 },
  stateText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 4 },
  primaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.tint,
    borderRadius: 12,
    marginTop: 17,
  },
  primaryText: { color: C.text, fontWeight: "800", fontSize: 14 },
  secondaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    marginTop: 17,
  },
  secondaryText: { color: C.text, fontWeight: "700", fontSize: 13 },
  emptyMark: {
    height: 42,
    width: 42,
    borderRadius: 13,
    backgroundColor: C.background,
    borderColor: C.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyMarkText: { color: C.accentGold, fontWeight: "900", letterSpacing: 1 },
  skeletonTitle: { width: 120, height: 10, borderRadius: 5, backgroundColor: C.surface, marginBottom: 2 },
  skeletonCard: { height: 132, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  loadMore: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    marginTop: 4,
  },
  loadMoreText: { color: C.tint, fontSize: 13, fontWeight: "700" },
});
