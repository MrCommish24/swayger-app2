import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { gamedayFetch } from "@/lib/gameday-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

export default function GameDayShortLink() {
  // Capture ALL params — roomCode plus any tracking params (src, utm_source, utm_campaign, etc.)
  const params = useLocalSearchParams<Record<string, string>>();
  const { roomCode } = params;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode) return;
    const code = String(roomCode).toUpperCase().trim();
    gamedayFetch<{ room_id: string }>(`/api/gameday/rooms/by-code/${code}`)
      .then(({ room_id }) => {
        // Forward all tracking params so attribution survives the redirect
        const forwarded = Object.entries(params)
          .filter(([k]) => k !== "roomCode")
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join("&");
        const dest = forwarded ? `/gameday/${room_id}?${forwarded}` : `/gameday/${room_id}`;
        router.replace(dest as never);
      })
      .catch((e: any) => {
        setError(e?.message ?? "Room not found");
      });
  }, [roomCode]);

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.icon}>🏀</Text>
        <Text style={styles.title}>Room Not Found</Text>
        <Text style={styles.sub}>
          The link "{roomCode}" doesn't match any active room. Ask your host for the latest link.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.center, { paddingTop: insets.top }]}>
      <ActivityIndicator color={C.tint} size="large" />
      <Text style={styles.sub}>Loading room…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 32,
  },
  icon: { fontSize: 48 },
  title: { fontSize: 20, fontWeight: "700", color: C.text, textAlign: "center" },
  sub: { fontSize: 14, color: C.textSecondary, textAlign: "center", lineHeight: 22 },
});
