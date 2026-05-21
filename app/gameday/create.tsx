import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Alert,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { gamedayFetch, GDPropTemplate } from "@/lib/gameday-api";
import Colors from "@/constants/colors";
import { Analytics } from "@/lib/posthog";

const C = Colors.dark;

interface TemplateResponse {
  template: GDPropTemplate[];
  defaultPropIds: string[];
}

export default function CreateGameDayRoom() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();

  // Host status resolved server-side — consistent with GAMEDAY_HOST_EMAILS env var.
  const [isHost, setIsHost] = useState<boolean | null>(null);

  const [template, setTemplate] = useState<GDPropTemplate[]>([]);
  const [defaultPropIds, setDefaultPropIds] = useState<string[]>([]);
  const [selectedPropIds, setSelectedPropIds] = useState<Set<string>>(new Set());

  const [roomName, setRoomName] = useState("");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [starA, setStarA] = useState("");
  const [starB, setStarB] = useState("");
  const [gameDate, setGameDate] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve host status server-side once auth finishes initialising.
  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      setIsHost(false);
      return;
    }
    gamedayFetch<{ isHost: boolean }>("/api/gameday/is-host", {}, { session })
      .then((d) => setIsHost(d.isHost))
      .catch(() => setIsHost(false));
  }, [authLoading, session?.access_token]);

  useEffect(() => {
    gamedayFetch<TemplateResponse>("/api/gameday/template")
      .then((r) => {
        setTemplate(r.template);
        setDefaultPropIds(r.defaultPropIds);
        setSelectedPropIds(new Set(r.defaultPropIds));
      })
      .catch(() => {});
  }, []);

  const toggleProp = useCallback((id: string) => {
    setSelectedPropIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCreate = async () => {
    if (!roomName.trim() || !teamA.trim() || !teamB.trim() || !starA.trim() || !starB.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    if (selectedPropIds.size === 0) {
      setError("Select at least one prop.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await gamedayFetch<{ ok: boolean; room_id: string }>(
        "/api/gameday/rooms",
        {
          method: "POST",
          body: JSON.stringify({
            room_name: roomName.trim(),
            team_a_name: teamA.trim(),
            team_b_name: teamB.trim(),
            team_a_star: starA.trim(),
            team_b_star: starB.trim(),
            game_date: gameDate.trim() || undefined,
            selected_prop_ids: Array.from(selectedPropIds),
          }),
        },
        { session }
      );
      Analytics.gamedayRoomCreated(result.room_id, selectedPropIds.size);
      router.replace(`/gameday/${result.room_id}/host` as never);
    } catch (e: any) {
      setError(e.message ?? "Failed to create room");
    } finally {
      setSubmitting(false);
    }
  };

  const phases: Array<{ key: "pregame" | "halftime" | "fourth"; label: string }> = [
    { key: "pregame", label: "Pregame Picks" },
    { key: "halftime", label: "Halftime Picks" },
    { key: "fourth", label: "4Q Clutch Picks" },
  ];

  if (isHost === null) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Sign in to create a Game Day Room.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace("/auth")}>
          <Text style={styles.btnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!isHost) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>You don't have host access.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.heading}>New Game Day Room</Text>
      <Text style={styles.subheading}>
        Create a private prediction room for tonight's game.
      </Text>

      {/* Room details */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ROOM DETAILS</Text>
        <TextInput
          style={styles.input}
          placeholder="Room name (e.g. Thunder vs Spurs — Game 2)"
          placeholderTextColor={C.textMuted}
          value={roomName}
          onChangeText={setRoomName}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.half]}
            placeholder="Team A"
            placeholderTextColor={C.textMuted}
            value={teamA}
            onChangeText={setTeamA}
          />
          <TextInput
            style={[styles.input, styles.half]}
            placeholder="Team B"
            placeholderTextColor={C.textMuted}
            value={teamB}
            onChangeText={setTeamB}
          />
        </View>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.half]}
            placeholder="Star player A"
            placeholderTextColor={C.textMuted}
            value={starA}
            onChangeText={setStarA}
          />
          <TextInput
            style={[styles.input, styles.half]}
            placeholder="Star player B"
            placeholderTextColor={C.textMuted}
            value={starB}
            onChangeText={setStarB}
          />
        </View>
        <TextInput
          style={styles.input}
          placeholder="Game date (optional, e.g. May 21)"
          placeholderTextColor={C.textMuted}
          value={gameDate}
          onChangeText={setGameDate}
        />
      </View>

      {/* Prop selection */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SELECT PROPS</Text>
        <Text style={styles.hint}>
          Aim for 2–4 per card. Default: 9 props recommended.
        </Text>

        {phases.map((phase) => {
          const phaseProps = template.filter((p) => p.phase === phase.key);
          const selectedCount = phaseProps.filter((p) =>
            selectedPropIds.has(p.id)
          ).length;
          return (
            <View key={phase.key} style={styles.phaseBlock}>
              <Text style={styles.phaseLabel}>
                {phase.label}{" "}
                <Text style={styles.phaseCount}>({selectedCount} selected)</Text>
              </Text>
              {phaseProps.map((prop) => {
                const isOn = selectedPropIds.has(prop.id);
                return (
                  <TouchableOpacity
                    key={prop.id}
                    style={[styles.propRow, isOn && styles.propRowActive]}
                    onPress={() => toggleProp(prop.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, isOn && styles.checkboxOn]}>
                      {isOn && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <View style={styles.propTextWrap}>
                      <Text style={styles.propQuestion}>{prop.question}</Text>
                      <Text style={styles.propAnswers}>
                        {prop.answers.join(" · ")}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </View>

      {error ? <Text style={styles.errorMsg}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.createBtn, submitting && styles.createBtnDisabled]}
        onPress={handleCreate}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.createBtnText}>Create Room →</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 20 },
  center: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  backBtn: { marginBottom: 20 },
  backText: { color: C.textSecondary, fontSize: 15 },
  heading: {
    fontSize: 28,
    fontWeight: "700",
    color: C.text,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    color: C.textSecondary,
    marginBottom: 28,
    lineHeight: 20,
  },
  section: { marginBottom: 28 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  input: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  hint: {
    fontSize: 13,
    color: C.textMuted,
    marginBottom: 14,
  },
  phaseBlock: { marginBottom: 20 },
  phaseLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: C.textSecondary,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  phaseCount: { fontWeight: "400", color: C.tint },
  propRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  propRowActive: { borderColor: C.tint },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxOn: { backgroundColor: C.tint, borderColor: C.tint },
  checkmark: { color: "#fff", fontSize: 13, fontWeight: "700" },
  propTextWrap: { flex: 1 },
  propQuestion: { fontSize: 14, color: C.text, marginBottom: 2, lineHeight: 20 },
  propAnswers: { fontSize: 12, color: C.textMuted },
  errorMsg: {
    color: C.danger,
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
  },
  errorText: { color: C.textSecondary, fontSize: 15, textAlign: "center" },
  btn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  createBtn: {
    backgroundColor: C.tint,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
