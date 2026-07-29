import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";

const ADMIN_TOKEN_KEY = "swayger_admin_token";
const NBA_GOLD = "#FFC72C";

interface PropDef {
  id: string;
  stat: string;
  player_name: string;
  game: string;
  line: number;
  result: "over" | "under" | null;
  status: "open" | "voided";
}

interface Night {
  id: string;
  date: string;
  lock_time: string;
  status: "open" | "locked" | "resolved";
  props: PropDef[];
  sport?: string;
}

const SPORT_OPTIONS = ["NBA", "MLB", "Other"] as const;
type SportOption = typeof SPORT_OPTIONS[number];

const SPORT_COLORS: Record<SportOption | string, string> = {
  NBA: "#FFC72C",
  MLB: "#10B981",
  Other: "#6B7280",
};

function formatDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function formatLock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

// ── Convert "7:30 PM" CDT + date string → ISO UTC string ──
// CDT = UTC−5, so UTC = CDT + 5 hours
function cdtTimeToISO(date: string, timeStr: string): string {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    // fallback: 5:45 PM CDT = 22:45 UTC
    return `${date}T22:45:00.000Z`;
  }
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  const utcHours = hours + 5; // CDT → UTC
  const dayOffset = utcHours >= 24 ? 1 : 0;
  const utcH = utcHours % 24;
  const baseDate = new Date(date + "T00:00:00Z");
  baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);
  const finalDate = baseDate.toISOString().slice(0, 10);
  return `${finalDate}T${String(utcH).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00.000Z`;
}

const DEFAULT_CDT_TIME = "5:45 PM";

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const router = useRouter();

  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);

  // Create night form
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lockTimeCDT, setLockTimeCDT] = useState(DEFAULT_CDT_TIME);
  const [sport, setSport] = useState<string>("NBA");
  const [questions, setQuestions] = useState<string[]>(["", ""]);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  // Open nights
  const [nights, setNights] = useState<Night[]>([]);
  const [nightsLoading, setNightsLoading] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [pendingResults, setPendingResults] = useState<Record<string, Record<string, "over" | "under" | "voided">>>({});

  // Global Settlement
  const [gsSport, setGsSport] = useState<"nba" | "soccer">("nba");
  const [gsTemplProps, setGsTemplProps] = useState<any[]>([]);
  const [gsTemplLoading, setGsTemplLoading] = useState(false);
  const [gsSelectedProp, setGsSelectedProp] = useState<any | null>(null);
  const [gsAnswer, setGsAnswer] = useState<string | null>(null);
  const [gsPreview, setGsPreview] = useState<{ props_count: number; rooms_count: number; picks_count: number; rooms: { room_code: string; room_name: string }[] } | null>(null);
  const [gsPreviewLoading, setGsPreviewLoading] = useState(false);
  const [gsSettling, setGsSettling] = useState(false);
  const [gsMsg, setGsMsg] = useState<string | null>(null);

  // Prop Library
  const [libSport, setLibSport] = useState<"nba" | "soccer">("nba");
  const [libProps, setLibProps] = useState<any[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libTogglingId, setLibTogglingId] = useState<string | null>(null);
  const [showAddProp, setShowAddProp] = useState(false);
  const [newPropId, setNewPropId] = useState("");
  const [newPropPhase, setNewPropPhase] = useState("");
  const [newPropQuestion, setNewPropQuestion] = useState("");
  const [newPropAnswers, setNewPropAnswers] = useState("");
  const [newPropWindow, setNewPropWindow] = useState("");
  const [addingProp, setAddingProp] = useState(false);
  const [addPropMsg, setAddPropMsg] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(ADMIN_TOKEN_KEY).then((t) => {
      setSavedToken(t);
      setTokenLoading(false);
      if (t) { loadNights(t); loadPropLibrary(t, libSport); loadGsTemplProps(t, gsSport); }
    });
  }, []));

  async function loadPropLibrary(t: string, sport: "nba" | "soccer") {
    setLibLoading(true);
    try {
      const url = new URL(`/api/admin/gameday/prop-library?sport=${sport}`, getApiUrl());
      const res = await fetch(url.toString(), { headers: { "x-admin-token": t } });
      const json = await res.json();
      if (json.ok) setLibProps(json.props ?? []);
    } catch { /* ignore */ } finally {
      setLibLoading(false);
    }
  }

  async function handleTogglePropActive(propId: string, currentActive: boolean) {
    if (!savedToken) return;
    setLibTogglingId(propId);
    try {
      const url = new URL(`/api/admin/gameday/prop-library/${propId}`, getApiUrl());
      const res = await fetch(url.toString(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-token": savedToken },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      const json = await res.json();
      if (json.ok) {
        setLibProps((prev) => prev.map((p) => p.id === propId ? { ...p, is_active: !currentActive } : p));
      }
    } catch { /* ignore */ } finally {
      setLibTogglingId(null);
    }
  }

  async function handleAddProp() {
    if (!savedToken || !newPropId.trim() || !newPropPhase.trim() || !newPropQuestion.trim() || !newPropAnswers.trim()) {
      setAddPropMsg("❌ Fill in ID, phase, question, and answers.");
      return;
    }
    let parsedAnswers: string[];
    try {
      parsedAnswers = newPropAnswers.split("|").map((s) => s.trim()).filter(Boolean);
      if (parsedAnswers.length < 2) throw new Error("Need at least 2 answers");
    } catch {
      setAddPropMsg("❌ Answers: separate with | (e.g. Yes | No)");
      return;
    }
    setAddingProp(true);
    setAddPropMsg(null);
    try {
      const url = new URL("/api/admin/gameday/prop-library", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": savedToken },
        body: JSON.stringify({
          id: newPropId.trim().toLowerCase().replace(/\s+/g, "_"),
          sport: libSport,
          phase: newPropPhase.trim().toLowerCase(),
          question: newPropQuestion.trim(),
          answer_options: parsedAnswers,
          settlement_window: newPropWindow.trim(),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setAddPropMsg("✅ Prop added.");
        setNewPropId(""); setNewPropPhase(""); setNewPropQuestion("");
        setNewPropAnswers(""); setNewPropWindow("");
        setShowAddProp(false);
        loadPropLibrary(savedToken, libSport);
      } else {
        setAddPropMsg(`❌ ${json.error}`);
      }
    } catch (e) {
      setAddPropMsg(`❌ ${String(e)}`);
    } finally {
      setAddingProp(false);
    }
  }

  async function loadGsTemplProps(t: string, sport: "nba" | "soccer") {
    setGsTemplLoading(true);
    setGsSelectedProp(null);
    setGsAnswer(null);
    setGsPreview(null);
    setGsMsg(null);
    try {
      const url = new URL(`/api/admin/gameday/prop-library?sport=${sport}`, getApiUrl());
      const res = await fetch(url.toString(), { headers: { "x-admin-token": t } });
      const json = await res.json();
      if (json.ok) setGsTemplProps((json.props ?? []).filter((p: any) => p.is_active));
    } catch { /* ignore */ } finally {
      setGsTemplLoading(false);
    }
  }

  async function loadGsPreview(propId: string, answer: string) {
    if (!savedToken) return;
    setGsPreviewLoading(true);
    setGsPreview(null);
    setGsMsg(null);
    try {
      const url = new URL(
        `/api/admin/gameday/global-settle/preview?template_prop_id=${encodeURIComponent(propId)}&correct_answer=${encodeURIComponent(answer)}`,
        getApiUrl()
      );
      const res = await fetch(url.toString(), { headers: { "x-admin-token": savedToken } });
      const json = await res.json();
      if (json.ok) setGsPreview(json);
      else setGsMsg(`❌ ${json.error}`);
    } catch (e) {
      setGsMsg(`❌ ${String(e)}`);
    } finally {
      setGsPreviewLoading(false);
    }
  }

  async function handleGlobalSettle() {
    if (!savedToken || !gsSelectedProp || !gsAnswer || !gsPreview) return;
    if (gsPreview.props_count === 0) { setGsMsg("Nothing to settle."); return; }
    setGsSettling(true);
    setGsMsg(null);
    try {
      const url = new URL("/api/admin/gameday/global-settle", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": savedToken },
        body: JSON.stringify({ template_prop_id: gsSelectedProp.id, correct_answer: gsAnswer }),
      });
      const json = await res.json();
      if (json.ok) {
        setGsMsg(`✅ Settled ${json.settled} prop${json.settled === 1 ? "" : "s"} across ${json.rooms_count} room${json.rooms_count === 1 ? "" : "s"}.`);
        setGsSelectedProp(null);
        setGsAnswer(null);
        setGsPreview(null);
      } else {
        setGsMsg(`❌ ${json.error}`);
      }
    } catch (e) {
      setGsMsg(`❌ ${String(e)}`);
    } finally {
      setGsSettling(false);
    }
  }

  async function saveToken() {
    const t = token.trim();
    if (!t) return;
    // Validate against server before accepting
    try {
      const url = new URL("/api/admin/gameday/prop-library?sport=nba", getApiUrl());
      const res = await fetch(url.toString(), { headers: { "x-admin-token": t } });
      const json = await res.json();
      if (!json.ok) {
        Alert.alert("Invalid token", "That token wasn't accepted. Check your MM_ADMIN_TOKEN in Replit Secrets.");
        return;
      }
    } catch {
      Alert.alert("Error", "Could not reach the server to validate token.");
      return;
    }
    await AsyncStorage.setItem(ADMIN_TOKEN_KEY, t);
    setSavedToken(t);
    loadNights(t);
    loadPropLibrary(t, libSport);
    loadGsTemplProps(t, gsSport);
  }

  async function clearToken() {
    await AsyncStorage.removeItem(ADMIN_TOKEN_KEY);
    setSavedToken(null);
    setNights([]);
  }

  async function loadNights(t: string) {
    setNightsLoading(true);
    try {
      const url = new URL("/api/admin/props/open-nights", getApiUrl());
      const res = await fetch(url.toString(), { headers: { "x-admin-token": t } });
      const json = await res.json();
      if (json.ok) setNights(json.nights ?? []);
    } catch { /* ignore */ } finally {
      setNightsLoading(false);
    }
  }

  function updateDate(d: string) {
    setDate(d);
  }

  function setQuestion(i: number, v: string) {
    setQuestions((prev) => prev.map((q, idx) => idx === i ? v : q));
  }

  function addQuestion() {
    if (questions.length < 4) setQuestions((p) => [...p, ""]);
  }

  function removeQuestion(i: number) {
    if (questions.length <= 1) return;
    setQuestions((p) => p.filter((_, idx) => idx !== i));
  }

  async function handleCreateNight() {
    const validQs = questions.filter((q) => q.trim().length > 0);
    if (!date || validQs.length === 0) {
      Alert.alert("Missing fields", "Enter a date and at least one question.");
      return;
    }
    setCreating(true);
    setCreateMsg(null);
    try {
      const url = new URL("/api/admin/props/manual-night", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": savedToken! },
        body: JSON.stringify({ date, lock_time: cdtTimeToISO(date, lockTimeCDT), questions: validQs, sport }),
      });
      const json = await res.json();
      if (json.ok) {
        setCreateMsg(`✅ Night created: ${json.id.slice(0, 8)}…`);
        setQuestions(["", ""]);
        loadNights(savedToken!);
      } else {
        setCreateMsg(`❌ ${json.error}`);
      }
    } catch (e) {
      setCreateMsg(`❌ ${String(e)}`);
    } finally {
      setCreating(false);
    }
  }

  function setPropResult(nightId: string, propId: string, result: "over" | "under" | "voided") {
    setPendingResults((prev) => ({
      ...prev,
      [nightId]: { ...(prev[nightId] ?? {}), [propId]: result },
    }));
  }

  async function handleResolveNight(night: Night) {
    const results = pendingResults[night.id] ?? {};
    const activeProps = night.props.filter((p) => p.status !== "voided");
    const unresolved = activeProps.filter((p) => !results[p.id]);
    if (unresolved.length > 0) {
      Alert.alert(
        "Missing results",
        `Set a result for all ${activeProps.length} props before resolving.`,
      );
      return;
    }
    setResolving(night.id);
    try {
      const url = new URL(`/api/admin/props/manual-resolve/${night.id}`, getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": savedToken! },
        body: JSON.stringify({ results }),
      });
      const json = await res.json();
      if (json.ok) {
        Alert.alert("Resolved ✅", `${json.picksScored} user picks scored.`);
        setPendingResults((prev) => { const n = { ...prev }; delete n[night.id]; return n; });
        loadNights(savedToken!);
      } else {
        Alert.alert("Error", json.error);
      }
    } catch (e) {
      Alert.alert("Error", String(e));
    } finally {
      setResolving(null);
    }
  }

  if (tokenLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
        <ActivityIndicator color={NBA_GOLD} />
      </View>
    );
  }

  if (!savedToken) {
    return (
      <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}>
        <View style={styles.tokenScreen}>
          <Ionicons name="shield-checkmark-outline" size={40} color={NBA_GOLD} />
          <Text style={styles.tokenTitle}>Admin Access</Text>
          <Text style={styles.tokenSub}>Enter your admin token to continue.</Text>
          <TextInput
            style={styles.tokenInput}
            placeholder="Admin token"
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={token}
            onChangeText={setToken}
            secureTextEntry
            autoCapitalize="none"
          />
          <Pressable style={styles.primaryBtn} onPress={saveToken}>
            <Text style={styles.primaryBtnText}>Unlock</Text>
          </Pressable>
          <Pressable style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>← Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.pageTitle}>Props Admin</Text>
        <Pressable onPress={clearToken} style={styles.lockBtn}>
          <Ionicons name="lock-closed-outline" size={16} color={Colors.dark.tabIconDefault} />
        </Pressable>
      </View>

      {/* ── Create Manual Night ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>New Prediction Night</Text>
        <Text style={styles.sectionSub}>Create yes/no questions for an off-day or any night.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={updateDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.dark.tabIconDefault}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Lock Time (CDT)</Text>
          <TextInput
            style={styles.input}
            value={lockTimeCDT}
            onChangeText={setLockTimeCDT}
            placeholder="e.g. 7:30 PM"
            placeholderTextColor={Colors.dark.tabIconDefault}
            autoCapitalize="none"
          />
          <Text style={styles.hint}>Enter time in CDT — e.g. "5:45 PM" or "8:00 PM"</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Sport</Text>
          <View style={styles.sportRow}>
            {SPORT_OPTIONS.map((s) => {
              const active = sport === s;
              const color = SPORT_COLORS[s];
              return (
                <Pressable
                  key={s}
                  style={[styles.sportBtn, active && { borderColor: color, backgroundColor: color + "18" }]}
                  onPress={() => setSport(s)}
                >
                  <Text style={[styles.sportBtnText, active && { color }]}>{s}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Prediction Questions</Text>
          {questions.map((q, i) => (
            <View key={i} style={styles.questionRow}>
              <TextInput
                style={[styles.input, styles.questionInput]}
                value={q}
                onChangeText={(v) => setQuestion(i, v)}
                placeholder={`Question ${i + 1}…`}
                placeholderTextColor={Colors.dark.tabIconDefault}
              />
              {questions.length > 1 && (
                <Pressable onPress={() => removeQuestion(i)} style={styles.removeBtn}>
                  <Ionicons name="close-circle" size={20} color={Colors.dark.danger} />
                </Pressable>
              )}
            </View>
          ))}
          {questions.length < 4 && (
            <Pressable style={styles.addQuestionBtn} onPress={addQuestion}>
              <Ionicons name="add-circle-outline" size={16} color={Colors.dark.tint} />
              <Text style={styles.addQuestionText}>Add question</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.8 }, creating && { opacity: 0.5 }]}
          onPress={handleCreateNight}
          disabled={creating}
        >
          {creating
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.primaryBtnText}>Create Night →</Text>}
        </Pressable>

        {createMsg && <Text style={styles.createMsg}>{createMsg}</Text>}
      </View>

      {/* ── Open Nights ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Open Nights</Text>
          <Pressable onPress={() => loadNights(savedToken)} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={16} color={Colors.dark.tint} />
          </Pressable>
        </View>

        {nightsLoading ? (
          <ActivityIndicator color={NBA_GOLD} style={{ marginTop: 16 }} />
        ) : nights.length === 0 ? (
          <Text style={styles.emptyText}>No open nights right now.</Text>
        ) : (
          nights.map((night) => {
            const pending = pendingResults[night.id] ?? {};
            const activeProps = night.props.filter((p) => p.status !== "voided");
            const allSet = activeProps.every((p) => !!pending[p.id]);

            return (
              <View key={night.id} style={styles.nightCard}>
                <View style={styles.nightCardHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.nightDate}>{formatDate(night.date)}</Text>
                    {night.sport && (
                      <View style={[styles.sportBadge, { borderColor: (SPORT_COLORS[night.sport] || "#6B7280") + "55", backgroundColor: (SPORT_COLORS[night.sport] || "#6B7280") + "18" }]}>
                        <Text style={[styles.sportBadgeText, { color: SPORT_COLORS[night.sport] || "#6B7280" }]}>{night.sport}</Text>
                      </View>
                    )}
                  </View>
                  <View style={[styles.statusPill, night.status === "locked" && styles.statusPillLocked]}>
                    <Text style={styles.statusPillText}>{night.status.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.nightLock}>Locks {formatLock(night.lock_time)}</Text>

                {activeProps.map((prop) => {
                  const isManual = prop.stat === "yn";
                  const result = pending[prop.id];
                  return (
                    <View key={prop.id} style={styles.propRow}>
                      <Text style={styles.propQuestion} numberOfLines={2}>
                        {isManual ? prop.player_name : `${prop.player_name} ${prop.line} ${prop.stat}`}
                      </Text>
                      <View style={styles.resultBtns}>
                        <Pressable
                          style={[styles.resultBtn, result === "over" && styles.resultBtnYes]}
                          onPress={() => setPropResult(night.id, prop.id, "over")}
                        >
                          <Text style={[styles.resultBtnText, result === "over" && styles.resultBtnTextActive]}>
                            {isManual ? "YES" : "OVER"}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.resultBtn, result === "under" && styles.resultBtnNo]}
                          onPress={() => setPropResult(night.id, prop.id, "under")}
                        >
                          <Text style={[styles.resultBtnText, result === "under" && styles.resultBtnTextActive]}>
                            {isManual ? "NO" : "UNDER"}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.resultBtn, result === "voided" && styles.resultBtnVoid]}
                          onPress={() => setPropResult(night.id, prop.id, "voided")}
                        >
                          <Text style={[styles.resultBtnText, result === "voided" && styles.resultBtnTextActive]}>
                            VOID
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}

                <Pressable
                  style={({ pressed }) => [
                    styles.resolveBtn,
                    !allSet && styles.resolveBtnDisabled,
                    pressed && allSet && { opacity: 0.85 },
                  ]}
                  onPress={() => handleResolveNight(night)}
                  disabled={!allSet || resolving === night.id}
                >
                  {resolving === night.id
                    ? <ActivityIndicator color="#fff" size="small" />
                    : (
                      <>
                        <Ionicons name="checkmark-circle" size={16} color="#fff" />
                        <Text style={styles.resolveBtnText}>Resolve & Score All Picks</Text>
                      </>
                    )}
                </Pressable>
              </View>
            );
          })
        )}
      </View>

      {/* ── Global Settlement ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Global Settlement</Text>
            <Text style={styles.sectionSub}>Settle one prop across all active rooms at once.</Text>
          </View>
          <Pressable onPress={() => savedToken && loadGsTemplProps(savedToken, gsSport)} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={16} color={Colors.dark.tint} />
          </Pressable>
        </View>

        {/* Sport toggle */}
        <View style={styles.sportRow}>
          {(["nba", "soccer"] as const).map((s) => {
            const active = gsSport === s;
            return (
              <Pressable
                key={s}
                style={[styles.sportBtn, active && { borderColor: NBA_GOLD, backgroundColor: NBA_GOLD + "18" }]}
                onPress={() => {
                  setGsSport(s);
                  setGsSelectedProp(null);
                  setGsAnswer(null);
                  setGsPreview(null);
                  setGsMsg(null);
                  if (savedToken) loadGsTemplProps(savedToken, s);
                }}
              >
                <Text style={[styles.sportBtnText, active && { color: NBA_GOLD }]}>
                  {s === "nba" ? "🏀 NBA" : "⚽ Soccer"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Prop picker */}
        {gsTemplLoading ? (
          <ActivityIndicator color={NBA_GOLD} style={{ marginVertical: 8 }} />
        ) : gsTemplProps.length === 0 ? (
          <Text style={styles.emptyText}>No active props. Load the prop library first.</Text>
        ) : (
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Select a prop to settle</Text>
            {gsTemplProps.map((prop) => {
              const selected = gsSelectedProp?.id === prop.id;
              return (
                <Pressable
                  key={prop.id}
                  style={[
                    styles.nightCard,
                    selected && { borderColor: NBA_GOLD, backgroundColor: NBA_GOLD + "12" },
                  ]}
                  onPress={() => {
                    setGsSelectedProp(prop);
                    setGsAnswer(null);
                    setGsPreview(null);
                    setGsMsg(null);
                  }}
                >
                  <Text style={[styles.propQuestion, selected && { color: Colors.dark.text }]}>
                    {prop.question}
                  </Text>
                  <Text style={{ fontSize: 10, color: Colors.dark.tabIconDefault, marginTop: 2 }}>
                    {prop.phase.toUpperCase()} · {prop.settlement_window}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Answer picker */}
        {gsSelectedProp && (
          <View style={{ gap: 8, marginTop: 4 }}>
            <Text style={styles.label}>Winning answer</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(gsSelectedProp.answer_options as string[]).map((opt) => {
                const chosen = gsAnswer === opt;
                return (
                  <Pressable
                    key={opt}
                    style={[
                      styles.resultBtn,
                      { paddingHorizontal: 14, paddingVertical: 10, flex: 0 },
                      chosen && styles.resultBtnYes,
                    ]}
                    onPress={() => {
                      setGsAnswer(opt);
                      setGsPreview(null);
                      setGsMsg(null);
                      loadGsPreview(gsSelectedProp.id, opt);
                    }}
                  >
                    <Text style={[styles.resultBtnText, chosen && styles.resultBtnTextActive]}>
                      {opt}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Preview panel */}
        {gsPreviewLoading && <ActivityIndicator color={NBA_GOLD} style={{ marginTop: 8 }} />}
        {gsPreview && (
          <View style={{ backgroundColor: Colors.dark.background, borderRadius: 10, padding: 14, gap: 6, borderWidth: 1, borderColor: Colors.dark.border, marginTop: 4 }}>
            <Text style={{ fontSize: 13, color: Colors.dark.text, fontWeight: "700" }}>
              Settlement preview
            </Text>
            <Text style={{ fontSize: 13, color: Colors.dark.textSecondary }}>
              {gsPreview.props_count} prop{gsPreview.props_count !== 1 ? "s" : ""} · {gsPreview.rooms_count} room{gsPreview.rooms_count !== 1 ? "s" : ""} · {gsPreview.picks_count} pick{gsPreview.picks_count !== 1 ? "s" : ""} scored
            </Text>
            {gsPreview.rooms.length > 0 && (
              <View style={{ marginTop: 4, gap: 2 }}>
                {gsPreview.rooms.map((r) => (
                  <Text key={r.room_code} style={{ fontSize: 11, color: Colors.dark.tabIconDefault }}>
                    · {r.room_name} ({r.room_code})
                  </Text>
                ))}
              </View>
            )}
            {gsPreview.props_count === 0 && (
              <Text style={{ fontSize: 12, color: Colors.dark.tabIconDefault, fontStyle: "italic" }}>
                No unsettled props found in active rooms — nothing to do.
              </Text>
            )}
          </View>
        )}

        {/* Confirm button */}
        {gsPreview && gsPreview.props_count > 0 && (
          <Pressable
            style={({ pressed }) => [
              styles.resolveBtn,
              gsSettling && styles.resolveBtnDisabled,
              pressed && !gsSettling && { opacity: 0.85 },
            ]}
            onPress={handleGlobalSettle}
            disabled={gsSettling}
          >
            {gsSettling
              ? <ActivityIndicator color="#fff" size="small" />
              : (
                <>
                  <Ionicons name="flash" size={16} color="#fff" />
                  <Text style={styles.resolveBtnText}>
                    Settle {gsPreview.props_count} Prop{gsPreview.props_count !== 1 ? "s" : ""} in {gsPreview.rooms_count} Room{gsPreview.rooms_count !== 1 ? "s" : ""}
                  </Text>
                </>
              )}
          </Pressable>
        )}

        {gsMsg && <Text style={styles.createMsg}>{gsMsg}</Text>}
      </View>

      {/* ── Prop Library ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Prop Library</Text>
            <Text style={styles.sectionSub}>Enable/disable props available to hosts.</Text>
          </View>
          <Pressable onPress={() => savedToken && loadPropLibrary(savedToken, libSport)} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={16} color={Colors.dark.tint} />
          </Pressable>
        </View>

        {/* Sport filter */}
        <View style={[styles.sportRow, { marginBottom: 16 }]}>
          {(["nba", "soccer"] as const).map((s) => {
            const active = libSport === s;
            return (
              <Pressable
                key={s}
                style={[styles.sportBtn, active && { borderColor: NBA_GOLD, backgroundColor: NBA_GOLD + "18" }]}
                onPress={() => {
                  setLibSport(s);
                  if (savedToken) loadPropLibrary(savedToken, s);
                }}
              >
                <Text style={[styles.sportBtnText, active && { color: NBA_GOLD }]}>
                  {s === "nba" ? "🏀 NBA" : "⚽ Soccer"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {libLoading ? (
          <ActivityIndicator color={NBA_GOLD} style={{ marginVertical: 16 }} />
        ) : libProps.length === 0 ? (
          <Text style={styles.emptyText}>No props found. Run the phase 2 migration first.</Text>
        ) : (
          libProps.map((prop) => (
            <View key={prop.id} style={[styles.propRow, { flexDirection: "row", alignItems: "flex-start", gap: 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.propQuestion, !prop.is_active && { color: Colors.dark.tabIconDefault, textDecorationLine: "line-through" }]}>
                  {prop.question}
                </Text>
                <Text style={{ fontSize: 10, color: Colors.dark.tabIconDefault, marginTop: 2 }}>
                  {prop.phase.toUpperCase()} · {prop.settlement_window}
                </Text>
              </View>
              <Pressable
                onPress={() => handleTogglePropActive(prop.id, prop.is_active)}
                disabled={libTogglingId === prop.id}
                style={[
                  styles.resultBtn,
                  { paddingHorizontal: 10, paddingVertical: 6 },
                  prop.is_active ? styles.resultBtnYes : {},
                ]}
              >
                {libTogglingId === prop.id
                  ? <ActivityIndicator size="small" color={Colors.dark.text} />
                  : <Text style={[styles.resultBtnText, styles.resultBtnTextActive]}>
                      {prop.is_active ? "ON" : "OFF"}
                    </Text>
                }
              </Pressable>
            </View>
          ))
        )}

        {/* Add prop */}
        <Pressable
          style={[styles.addQuestionBtn, { marginTop: 12 }]}
          onPress={() => setShowAddProp((v) => !v)}
        >
          <Ionicons name={showAddProp ? "chevron-up" : "add-circle-outline"} size={16} color={Colors.dark.tint} />
          <Text style={styles.addQuestionText}>{showAddProp ? "Cancel" : "Add a prop"}</Text>
        </Pressable>

        {showAddProp && (
          <View style={{ gap: 8, marginTop: 12 }}>
            <TextInput style={styles.input} placeholder="ID (e.g. pg_new_prop)" placeholderTextColor={Colors.dark.tabIconDefault}
              value={newPropId} onChangeText={setNewPropId} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Phase (pregame / halftime / fourth / final_push / penalties)"
              placeholderTextColor={Colors.dark.tabIconDefault} value={newPropPhase} onChangeText={setNewPropPhase} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Question text" placeholderTextColor={Colors.dark.tabIconDefault}
              value={newPropQuestion} onChangeText={setNewPropQuestion} />
            <TextInput style={styles.input} placeholder="Answers separated by | (e.g. Yes | No)" placeholderTextColor={Colors.dark.tabIconDefault}
              value={newPropAnswers} onChangeText={setNewPropAnswers} />
            <TextInput style={styles.input} placeholder="Settlement window (e.g. End Game)" placeholderTextColor={Colors.dark.tabIconDefault}
              value={newPropWindow} onChangeText={setNewPropWindow} />
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.8 }, addingProp && { opacity: 0.5 }]}
              onPress={handleAddProp} disabled={addingProp}
            >
              {addingProp
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.primaryBtnText}>Add Prop →</Text>}
            </Pressable>
            {addPropMsg && <Text style={styles.createMsg}>{addPropMsg}</Text>}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  centered: { justifyContent: "center", alignItems: "center" },
  scrollContent: { paddingBottom: 100 },

  // Token screen
  tokenScreen: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 32, gap: 16, marginTop: 60,
  },
  tokenTitle: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 28, color: Colors.dark.text, textTransform: "uppercase",
  },
  tokenSub: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center" },
  tokenInput: {
    width: "100%", backgroundColor: Colors.dark.surface,
    borderWidth: 1, borderColor: Colors.dark.border, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15,
    color: Colors.dark.text,
  },
  backLink: { marginTop: 8 },
  backLinkText: { fontSize: 14, color: Colors.dark.tabIconDefault },

  // Header
  headerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
  },
  backBtn: { padding: 4 },
  pageTitle: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 22, color: Colors.dark.text, textTransform: "uppercase", letterSpacing: 1,
  },
  lockBtn: { padding: 4 },

  // Sections
  section: {
    marginHorizontal: 20, marginBottom: 28,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1, borderColor: Colors.dark.border,
    borderRadius: 16, padding: 16, gap: 16,
  },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 18, color: Colors.dark.text, textTransform: "uppercase", letterSpacing: 0.5,
  },
  sectionSub: { fontSize: 13, color: Colors.dark.textSecondary, marginTop: -8 },
  refreshBtn: { padding: 4 },

  // Form
  fieldGroup: { gap: 6 },
  label: {
    fontSize: 11, color: Colors.dark.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600",
  },
  input: {
    backgroundColor: Colors.dark.background,
    borderWidth: 1, borderColor: Colors.dark.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 14,
    color: Colors.dark.text,
  },
  hint: { fontSize: 11, color: Colors.dark.tabIconDefault },
  questionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  questionInput: { flex: 1, marginBottom: 0 },
  removeBtn: { padding: 2 },
  addQuestionBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 4, alignSelf: "flex-start",
  },
  addQuestionText: { fontSize: 13, color: Colors.dark.tint },

  primaryBtn: {
    backgroundColor: Colors.dark.tint, borderRadius: 12,
    paddingVertical: 14, alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff", fontSize: 16, fontWeight: "700",
  },
  createMsg: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center" },

  // Night cards
  nightCard: {
    backgroundColor: Colors.dark.background,
    borderWidth: 1, borderColor: Colors.dark.border, borderRadius: 12, padding: 14, gap: 12,
  },
  nightCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  nightDate: { fontWeight: "700", fontSize: 15, color: Colors.dark.text },
  statusPill: {
    backgroundColor: `${Colors.dark.tint}20`,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2,
  },
  statusPillLocked: { backgroundColor: `${Colors.dark.accentGold}20` },
  statusPillText: { fontSize: 10, color: Colors.dark.tint, fontWeight: "700" },
  nightLock: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: -8 },
  sportBadge: {
    borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  sportBadgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  sportRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  sportBtn: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },
  sportBtnText: { fontSize: 13, fontWeight: "600", color: Colors.dark.textSecondary },

  // Prop rows
  propRow: { gap: 6 },
  propQuestion: { fontSize: 13, color: Colors.dark.text, fontWeight: "500", lineHeight: 18 },
  resultBtns: { flexDirection: "row", gap: 8 },
  resultBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 8,
    borderWidth: 1.5, borderColor: Colors.dark.border,
    alignItems: "center",
  },
  resultBtnYes: { borderColor: Colors.dark.success, backgroundColor: `${Colors.dark.success}15` },
  resultBtnNo: { borderColor: Colors.dark.danger, backgroundColor: `${Colors.dark.danger}15` },
  resultBtnVoid: { borderColor: Colors.dark.textSecondary, backgroundColor: `${Colors.dark.textSecondary}15` },
  resultBtnText: { fontSize: 11, fontWeight: "700", color: Colors.dark.textSecondary },
  resultBtnTextActive: { color: Colors.dark.text },

  resolveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: Colors.dark.success,
    borderRadius: 10, paddingVertical: 13,
  },
  resolveBtnDisabled: { opacity: 0.35 },
  resolveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  emptyText: { fontSize: 13, color: Colors.dark.tabIconDefault, textAlign: "center", paddingVertical: 12 },
});
