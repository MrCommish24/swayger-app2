import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { gamedayFetch, GDPropTemplate } from "@/lib/gameday-api";
import Colors from "@/constants/colors";
import { Analytics } from "@/lib/posthog";

const C = Colors.dark;

type Sport = "nba" | "soccer" | "nfl";

interface TemplateResponse {
  template: GDPropTemplate[];
  defaultPropIds: string[];
}

// Phase config per sport — determines which sections appear and their labels.
const NBA_PHASES: Array<{
  key: "pregame" | "halftime" | "fourth";
  label: string;
  range: string;
}> = [
  { key: "pregame",  label: "Pregame Picks",  range: "4–6 recommended" },
  { key: "halftime", label: "Halftime Picks",  range: "3–4 recommended" },
  { key: "fourth",   label: "4Q Clutch Picks", range: "2–3 recommended" },
];

const SOCCER_PHASES: Array<{
  key: "pregame" | "halftime" | "final_push" | "penalties";
  label: string;
  range: string;
}> = [
  { key: "pregame",    label: "Pregame Picks",         range: "4–6 recommended" },
  { key: "halftime",   label: "Halftime Picks",         range: "3–4 recommended" },
  { key: "final_push", label: "Final Push Picks 🔥",    range: "3–4 recommended" },
  { key: "penalties",  label: "Penalty Shootout ⚽",    range: "All 6 (optional)" },
];

const NFL_PHASES: Array<{
  key: "pregame" | "halftime" | "fourth";
  label: string;
  range: string;
}> = [
  { key: "pregame",  label: "Pregame Picks",    range: "6 default picks" },
  { key: "halftime", label: "Halftime Picks",   range: "4 default picks" },
  { key: "fourth",   label: "4Q / Clutch Picks", range: "3 default picks" },
];

// ── CDT time string → ISO UTC string ────────────────────────────────────────
// Mirrors the admin.tsx conversion. CDT = UTC−5.
function cdtToISO(dateStr: string, timeStr: string): string | null {
  if (!timeStr.trim()) return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  const utcHours = hours + 5; // CDT → UTC
  const dayOffset = utcHours >= 24 ? 1 : 0;
  const utcH = utcHours % 24;
  const baseDate = new Date(dateStr + "T00:00:00Z");
  baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);
  const finalDate = baseDate.toISOString().slice(0, 10);
  return `${finalDate}T${String(utcH).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00.000Z`;
}

export default function CreateGameDayRoom() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();

  const [isHost, setIsHost] = useState<boolean | null>(null);
  const [sport, setSport] = useState<Sport>("nba");

  const [template, setTemplate] = useState<GDPropTemplate[]>([]);
  const [defaultPropIds, setDefaultPropIds] = useState<string[]>([]);
  const [selectedPropIds, setSelectedPropIds] = useState<Set<string>>(new Set());
  const [templateLoading, setTemplateLoading] = useState(false);

  const [roomName, setRoomName] = useState("");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [starA, setStarA] = useState("");
  const [starB, setStarB] = useState("");
  const [gameDate, setGameDate] = useState("");

  // Card schedules: phase key → { openAt, lockAt } in "H:MM AM/PM" CDT format
  const [schedules, setSchedules] = useState<Record<string, { openAt: string; lockAt: string }>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve host status server-side.
  useEffect(() => {
    if (authLoading) return;
    if (!session) { setIsHost(false); return; }
    gamedayFetch<{ isHost: boolean }>("/api/gameday/is-host", {}, { session })
      .then((d) => setIsHost(d.isHost))
      .catch(() => setIsHost(false));
  }, [authLoading, session?.access_token]);

  // Fetch template whenever sport changes.
  useEffect(() => {
    setTemplateLoading(true);
    gamedayFetch<TemplateResponse>(`/api/gameday/template?sport=${sport}`)
      .then((r) => {
        setTemplate(r.template);
        setDefaultPropIds(r.defaultPropIds);
        setSelectedPropIds(new Set(r.defaultPropIds));
      })
      .catch(() => {})
      .finally(() => setTemplateLoading(false));
  }, [sport]);

  const toggleProp = useCallback((id: string) => {
    setSelectedPropIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  function setScheduleField(phase: string, field: "openAt" | "lockAt", value: string) {
    setSchedules((prev) => ({
      ...prev,
      [phase]: { ...((prev[phase]) ?? { openAt: "", lockAt: "" }), [field]: value },
    }));
  }

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

    // Build card_schedules — convert CDT time strings to ISO UTC for each phase.
    const resolvedDate = gameDate.trim() || new Date().toISOString().slice(0, 10);
    const card_schedules: Record<string, { open_at?: string; lock_at?: string }> = {};
    for (const [phase, times] of Object.entries(schedules)) {
      const open_at = times.openAt ? cdtToISO(resolvedDate, times.openAt) ?? undefined : undefined;
      const lock_at = times.lockAt ? cdtToISO(resolvedDate, times.lockAt) ?? undefined : undefined;
      if (open_at || lock_at) card_schedules[phase] = { open_at, lock_at };
    }

    try {
      const result = await gamedayFetch<{ ok: boolean; room_id: string; room?: { room_code?: string | null } }>(
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
            sport,
            card_schedules: Object.keys(card_schedules).length > 0 ? card_schedules : undefined,
          }),
        },
        { session }
      );
      Analytics.gamedayRoomCreated(
        {
          room_id: result.room_id,
          room_code: result.room?.room_code,
          room_source: "app",
          room_status: "draft",
        },
        {
          created_from: "app",
          team_a_name: teamA.trim(),
          team_b_name: teamB.trim(),
          room_name: roomName.trim(),
          prop_count_total: selectedPropIds.size,
          pregame_prop_count: template.filter(
            (p) => selectedPropIds.has(p.id) && p.phase === "pregame"
          ).length,
          halftime_prop_count: template.filter(
            (p) => selectedPropIds.has(p.id) && p.phase === "halftime"
          ).length,
          fourth_prop_count: template.filter(
            (p) => selectedPropIds.has(p.id) && p.phase === "fourth"
          ).length,
          creator_user_id: session?.user?.id,
        }
      );
      router.replace(`/gameday/${result.room_id}/host` as never);
    } catch (e: any) {
      setError(e.message ?? "Failed to create room");
    } finally {
      setSubmitting(false);
    }
  };

  const phases =
    sport === "soccer" ? SOCCER_PHASES : sport === "nfl" ? NFL_PHASES : NBA_PHASES;
  const isNfl = sport === "nfl";

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

      {/* Sport selector */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SPORT</Text>
        <View style={styles.sportRow}>
          {(["nba", "nfl", "soccer"] as Sport[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.sportBtn, sport === s && styles.sportBtnActive]}
              onPress={() => setSport(s)}
              activeOpacity={0.75}
            >
              <Text style={[styles.sportBtnText, sport === s && styles.sportBtnTextActive]}>
                {s === "nba" ? "🏀 NBA" : s === "nfl" ? "🏈 NFL" : "⚽ Soccer"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Room details */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ROOM DETAILS</Text>
        <TextInput
          style={styles.input}
          placeholder={isNfl ? "Room name (e.g. Bears vs Packers)" : "Room name (e.g. Thunder vs Spurs — Game 2)"}
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
            placeholder={isNfl ? "Starting QB A" : "Star player A"}
            placeholderTextColor={C.textMuted}
            value={starA}
            onChangeText={setStarA}
          />
          <TextInput
            style={[styles.input, styles.half]}
            placeholder={isNfl ? "Starting QB B" : "Star player B"}
            placeholderTextColor={C.textMuted}
            value={starB}
            onChangeText={setStarB}
          />
        </View>
        <TextInput
          style={styles.input}
          placeholder="Game date (e.g. 2025-06-12)"
          placeholderTextColor={C.textMuted}
          value={gameDate}
          onChangeText={setGameDate}
        />
        <Text style={styles.hint}>
          Date format YYYY-MM-DD is used for card schedule conversion. Leave blank to use today.
        </Text>
      </View>

      {/* Card schedule */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>CARD SCHEDULE (OPTIONAL)</Text>
        <View style={styles.helperBox}>
          <Text style={styles.helperText}>
            Set open/lock times so cards open automatically — no manual tapping during the game.
          </Text>
          <Text style={styles.helperSub}>
            Times in CDT (Central). Leave blank for manual control.
          </Text>
        </View>
        {phases.map(({ key, label }) => {
          const s = schedules[key] ?? { openAt: "", lockAt: "" };
          return (
            <View key={key} style={styles.scheduleBlock}>
              <Text style={styles.schedulePhaseLabel}>{label}</Text>
              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={styles.scheduleFieldLabel}>Opens at</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="7:30 PM"
                    placeholderTextColor={C.textMuted}
                    value={s.openAt}
                    onChangeText={(v) => setScheduleField(key, "openAt", v)}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.scheduleFieldLabel}>Locks at</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="8:05 PM"
                    placeholderTextColor={C.textMuted}
                    value={s.lockAt}
                    onChangeText={(v) => setScheduleField(key, "lockAt", v)}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* Prop selection */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SELECT PROPS</Text>

        <View style={styles.helperBox}>
          <Text style={styles.helperText}>
            Choose a mix of fast-settle and end-game props so the leaderboard moves throughout.
          </Text>
          <Text style={styles.helperSub}>
            Default: props marked ✓ are recommended. Adjust as needed.
          </Text>
        </View>

        {templateLoading ? (
          <ActivityIndicator color={C.tint} style={{ marginVertical: 20 }} />
        ) : (
          phases.map(({ key, label, range }) => {
            const phaseProps = template.filter((p) => p.phase === key);
            const selectedCount = phaseProps.filter((p) => selectedPropIds.has(p.id)).length;
            return (
              <View key={key} style={styles.phaseBlock}>
                <View style={styles.phaseHeaderRow}>
                  <Text style={styles.phaseLabel}>
                    {label}{" "}
                    <Text style={styles.phaseCount}>({selectedCount} selected)</Text>
                  </Text>
                  <Text style={styles.phaseRange}>{range}</Text>
                </View>
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
                        <Text style={styles.propAnswers}>{prop.answers.join(" · ")}</Text>
                        {prop.settlement_window ? (
                          <Text style={styles.windowText}>Settles: {prop.settlement_window}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })
        )}
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
    flex: 1, backgroundColor: C.background,
    alignItems: "center", justifyContent: "center",
    gap: 16, padding: 24,
  },
  backBtn: { marginBottom: 20 },
  backText: { color: C.textSecondary, fontSize: 15 },
  heading: { fontSize: 28, fontWeight: "700", color: C.text, marginBottom: 6 },
  subheading: { fontSize: 14, color: C.textSecondary, marginBottom: 28, lineHeight: 20 },
  section: { marginBottom: 28 },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: C.textMuted,
    letterSpacing: 1.2, marginBottom: 12,
  },
  // Sport selector
  sportRow: { flexDirection: "row", gap: 10 },
  sportBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: C.border,
    alignItems: "center", backgroundColor: C.surface,
  },
  sportBtnActive: { borderColor: C.tint, backgroundColor: `${C.tint}18` },
  sportBtnText: { fontSize: 15, fontWeight: "600", color: C.textSecondary },
  sportBtnTextActive: { color: C.tint },
  // Inputs
  input: {
    backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    color: C.text, fontSize: 15,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10,
  },
  hint: { fontSize: 11, color: C.textMuted, marginTop: -6, marginBottom: 4 },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  // Schedule
  scheduleBlock: { marginBottom: 16 },
  schedulePhaseLabel: {
    fontSize: 12, fontWeight: "700", color: C.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8,
  },
  scheduleFieldLabel: {
    fontSize: 11, color: C.textMuted, marginBottom: 4, letterSpacing: 0.5,
  },
  // Helper boxes
  helperBox: {
    backgroundColor: "#0D2A1A", borderRadius: 10,
    borderWidth: 1, borderColor: "#1A4A2E",
    padding: 14, marginBottom: 20,
  },
  helperText: { fontSize: 13, color: "#5EC97A", lineHeight: 19, marginBottom: 6 },
  helperSub: { fontSize: 12, color: C.textMuted },
  // Phase prop lists
  phaseBlock: { marginBottom: 24 },
  phaseHeaderRow: {
    flexDirection: "row", alignItems: "baseline",
    justifyContent: "space-between", marginBottom: 8,
  },
  phaseLabel: {
    fontSize: 13, fontWeight: "700", color: C.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.8,
  },
  phaseCount: { fontWeight: "400", color: C.tint },
  phaseRange: { fontSize: 11, color: C.textMuted },
  propRow: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    padding: 12, marginBottom: 8, gap: 10,
  },
  propRowActive: { borderColor: C.tint },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
    marginTop: 1, flexShrink: 0,
  },
  checkboxOn: { backgroundColor: C.tint, borderColor: C.tint },
  checkmark: { color: "#fff", fontSize: 13, fontWeight: "700" },
  propTextWrap: { flex: 1 },
  propQuestion: { fontSize: 14, color: C.text, marginBottom: 3, lineHeight: 20 },
  propAnswers: { fontSize: 12, color: C.textMuted, marginBottom: 3 },
  windowText: { fontSize: 11, color: "#4A9FC8", fontWeight: "500" },
  // Errors / buttons
  errorMsg: { color: C.danger, fontSize: 14, marginBottom: 16, textAlign: "center" },
  errorText: { color: C.textSecondary, fontSize: 15, textAlign: "center" },
  btn: {
    backgroundColor: C.tint, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 24,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  createBtn: {
    backgroundColor: C.tint, borderRadius: 12,
    paddingVertical: 16, alignItems: "center",
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
