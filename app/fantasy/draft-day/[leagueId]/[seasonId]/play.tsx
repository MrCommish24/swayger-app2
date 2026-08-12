/**
 * app/fantasy/draft-day/[leagueId]/[seasonId]/play.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Member-facing Draft Day pick experience (Phase 4B).
 *
 * Behavior:
 *   - Loads published props via GET /draft-day/play (also ensures participant).
 *   - Restores saved picks on mount / focus-return.
 *   - Per-pick auto-save: tapping an answer immediately posts to
 *     POST /draft-day/picks and shows "Saved · N of M picks made".
 *   - Optimistic UI: local state updates before the network round-trip.
 *   - If the card is locked while the screen is open, a failed POST (409)
 *     triggers a quiet refresh and shows the locked state.
 *   - Locked view: read-only answers, "🔒 PICKS LOCKED / Your predictions are
 *     in." banner, "No pick" for unanswered questions.
 *   - Season Receipts locked copy: "Receipt locked 🔒 · See you at the end of
 *     the season."
 *   - Does NOT score picks or show other members' selections.
 *
 * Works for:
 *   - Authenticated members (Bearer token)
 *   - Guest members (Fantasy guest token)
 *   - Commissioner (plays exactly like a member via their season seat)
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useFantasyGuestToken } from "@/lib/use-fantasy-guest-token";
import {
  getDraftDayPlay,
  submitDraftDayPick,
  DraftDayPlayState,
  DraftDayProp,
  DraftDayAnswerOption,
} from "@/lib/fantasy-api";
import Colors from "@/constants/colors";

const C = Colors.dark;

// ── Answer option button ─────────────────────────────────────────────────────

function AnswerOption({
  option,
  selected,
  locked,
  saving,
  onSelect,
}: {
  option: DraftDayAnswerOption;
  selected: boolean;
  locked: boolean;
  saving: boolean;
  onSelect: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.answerOption,
        selected && styles.answerOptionSelected,
        locked && selected && styles.answerOptionLockedSelected,
      ]}
      onPress={onSelect}
      disabled={locked || saving}
      activeOpacity={0.7}
    >
      {saving ? (
        <ActivityIndicator size="small" color={C.tint} style={styles.answerIndicator} />
      ) : selected ? (
        <Text style={[styles.answerCheck, locked && { color: C.accentGold }]}>
          {locked ? "🔒" : "✓"}
        </Text>
      ) : (
        <View style={styles.answerRadio} />
      )}
      <Text
        style={[
          styles.answerLabel,
          selected && styles.answerLabelSelected,
          locked && selected && { color: C.accentGold },
        ]}
      >
        {option.label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Single prop card ─────────────────────────────────────────────────────────

function PropCard({
  prop,
  selectedAnswer,
  locked,
  savingAnswerId,
  onSelect,
}: {
  prop: DraftDayProp;
  selectedAnswer: string | null;
  locked: boolean;
  savingAnswerId: string | null;
  onSelect: (answerId: string) => void;
}) {
  const options: DraftDayAnswerOption[] = Array.isArray(prop.answer_options)
    ? (prop.answer_options as any[]).map((o) =>
        typeof o === "object" ? (o as DraftDayAnswerOption) : { id: String(o), label: String(o), type: "static" }
      )
    : [];

  return (
    <View style={[styles.propCard, locked && styles.propCardLocked]}>
      {/* Question row */}
      <View style={styles.propHeader}>
        <Text style={styles.propQuestion}>{prop.question}</Text>
        {!locked && selectedAnswer && !savingAnswerId && (
          <Text style={styles.propSavedBadge}>✓ Saved</Text>
        )}
        {locked && !selectedAnswer && (
          <Text style={styles.noPick}>No pick</Text>
        )}
      </View>

      {/* Answers */}
      <View style={styles.answerList}>
        {options.map((opt) => (
          <AnswerOption
            key={opt.id}
            option={opt}
            selected={selectedAnswer === opt.id}
            locked={locked}
            saving={savingAnswerId === opt.id}
            onSelect={() => onSelect(opt.id)}
          />
        ))}
      </View>
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────

export default function DraftDayPlayScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { session, isLoading: authLoading } = useAuth();
  const { guestToken, guestTokenLoading }   = useFantasyGuestToken();
  const { leagueId, seasonId } = useLocalSearchParams<{
    leagueId: string;
    seasonId: string;
  }>();

  const [playState, setPlayState] = useState<DraftDayPlayState | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  // Optimistic local picks: propId → answerId
  const [picks, setPicks]         = useState<Record<string, string>>({});
  // propId → answerId currently in-flight (shows spinner on that answer)
  const [savingMap, setSavingMap] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [anyEverSaved, setAnyEverSaved] = useState(false);

  const initialFocusRef = useRef(true);

  const getAuth = useCallback(
    () => (session ? { session } : guestToken ? { guestToken } : {}),
    [session, guestToken]
  );

  const fetchPlayState = useCallback(
    async (quiet = false) => {
      if (!leagueId || !seasonId) return;
      if (!session && !guestToken) return;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const state = await getDraftDayPlay(leagueId, seasonId, getAuth());
        setPlayState(state);
        // Restore server-authoritative picks; don't clobber in-flight saves
        setPicks((prev) => {
          const merged = { ...(state.my_picks ?? {}) };
          // Keep any locally-optimistic picks that aren't yet returned by server
          for (const propId of Object.keys(savingMap)) {
            if (savingMap[propId]) merged[propId] = savingMap[propId];
          }
          return merged;
        });
        if (Object.keys(state.my_picks ?? {}).length > 0) setAnyEverSaved(true);
      } catch (e: any) {
        setError(e.message ?? "Failed to load Draft Day");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, guestToken, leagueId, seasonId, getAuth]
  );

  useEffect(() => {
    if (authLoading || guestTokenLoading) return;
    if (!session && !guestToken) { setLoading(false); return; }
    fetchPlayState();
  }, [authLoading, guestTokenLoading, session?.access_token, guestToken, leagueId, seasonId]);

  // Refresh on focus — handles lock transition while screen was in background
  useFocusEffect(
    useCallback(() => {
      if (initialFocusRef.current) { initialFocusRef.current = false; return; }
      if (authLoading || guestTokenLoading) return;
      if (!session && !guestToken) return;
      fetchPlayState(true);
    }, [authLoading, guestTokenLoading, session?.access_token, guestToken, fetchPlayState])
  );

  const handleSelectAnswer = useCallback(
    async (propId: string, answerId: string) => {
      if (!playState || !leagueId || !seasonId) return;
      if (playState.card_status !== "open") return;
      // Already saving this prop — debounce
      if (savingMap[propId]) return;

      setSaveError(null);

      // Optimistic update
      setPicks((prev) => ({ ...prev, [propId]: answerId }));
      setSavingMap((prev) => ({ ...prev, [propId]: answerId }));

      try {
        await submitDraftDayPick(leagueId, seasonId, propId, answerId, getAuth());
        setAnyEverSaved(true);
      } catch (e: any) {
        const msg: string = e.message ?? "";
        if (msg.includes("locked") || msg.includes("Picks are locked")) {
          // Picks were locked while screen was open — refresh to show locked state
          await fetchPlayState(true);
          setSaveError("Picks are locked.");
        } else if (msg.includes("not a member") || msg.includes("Unauthorized")) {
          setSaveError("You are not a member of this league.");
        } else {
          // Revert to last server-authoritative value
          setPicks((prev) => {
            const revert = { ...prev };
            const serverValue = playState.my_picks[propId];
            if (serverValue) {
              revert[propId] = serverValue;
            } else {
              delete revert[propId];
            }
            return revert;
          });
          setSaveError("Failed to save pick. Please try again.");
        }
      } finally {
        setSavingMap((prev) => {
          const next = { ...prev };
          delete next[propId];
          return next;
        });
      }
    },
    [playState, leagueId, seasonId, getAuth, fetchPlayState, savingMap]
  );

  // ── Loading / auth states ────────────────────────────────────────────────

  if (authLoading || guestTokenLoading || (loading && !playState)) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.tint} size="large" />
      </View>
    );
  }

  if (!session && !guestToken) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Sign in to make picks.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace("/auth")}>
          <Text style={styles.btnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => fetchPlayState()}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={styles.linkText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!playState) return null;

  const isLocked = playState.card_status === "locked" || playState.card_status === "settled";
  const picksMade = Object.keys(picks).length;
  const total     = playState.total_props;

  const competitionProps = playState.props.filter((p) => p.scoring_scope === "competition");
  const seasonProps      = playState.props.filter((p) => p.scoring_scope === "season");

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
      ]}
    >
      {/* Back */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.linkText}>← Back to League</Text>
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        {playState.league_name && (
          <Text style={styles.leagueLabel} numberOfLines={1}>
            {playState.league_name.toUpperCase()}
          </Text>
        )}
        <Text style={styles.title}>Draft Day Swayger</Text>

        {isLocked ? (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockedBannerIcon}>🔒  PICKS LOCKED</Text>
            <Text style={styles.lockedBannerSub}>Your predictions are in.</Text>
          </View>
        ) : (
          <View style={styles.progressBlock}>
            {/* Progress bar */}
            <View style={styles.progressBarOuter}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: total > 0 ? `${Math.round((picksMade / total) * 100)}%` as any : "0%" },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {picksMade} of {total} picks{" "}
              {picksMade === total && total > 0 ? "made  🎉" : "made"}
            </Text>
            {anyEverSaved && !saveError && Object.keys(savingMap).length === 0 && (
              <Text style={styles.savedText}>Saved</Text>
            )}
            {saveError && <Text style={styles.saveErrorText}>{saveError}</Text>}
          </View>
        )}
      </View>

      {/* ── Draft Day Picks (competition scope) ────────────────────────────── */}
      {competitionProps.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>DRAFT DAY PICKS</Text>
            <Text style={styles.sectionTagline}>
              {isLocked ? "Picks are locked." : "Score points today."}
            </Text>
          </View>
          {competitionProps.map((prop) => (
            <PropCard
              key={prop.id}
              prop={prop}
              selectedAnswer={picks[prop.id] ?? null}
              locked={isLocked}
              savingAnswerId={savingMap[prop.id] ?? null}
              onSelect={(answerId) => handleSelectAnswer(prop.id, answerId)}
            />
          ))}
        </View>
      )}

      {/* ── Season Receipts (season scope) ─────────────────────────────────── */}
      {seasonProps.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: C.accentGold }]}>SEASON RECEIPTS</Text>
            <Text style={styles.sectionTagline}>
              {isLocked
                ? "Receipt locked 🔒 · See you at the end of the season."
                : "Locked today. Settled later."}
            </Text>
          </View>
          {seasonProps.map((prop) => (
            <PropCard
              key={prop.id}
              prop={prop}
              selectedAnswer={picks[prop.id] ?? null}
              locked={isLocked}
              savingAnswerId={savingMap[prop.id] ?? null}
              onSelect={(answerId) => handleSelectAnswer(prop.id, answerId)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content:   { paddingHorizontal: 20 },
  center: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },

  backBtn: { marginBottom: 16 },

  header: { marginBottom: 28, gap: 8 },
  leagueLabel: { fontSize: 11, fontWeight: "700", color: C.textMuted, letterSpacing: 1 },
  title:       { fontSize: 26, fontWeight: "800", color: C.text },

  lockedBanner: {
    backgroundColor: "#1A1500",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.accentGold,
    padding: 14,
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  lockedBannerIcon: { fontSize: 15, fontWeight: "800", color: C.accentGold },
  lockedBannerSub:  { fontSize: 13, color: C.textSecondary },

  progressBlock: { gap: 6, marginTop: 4 },
  progressBarOuter: {
    height: 5,
    backgroundColor: C.surfaceLight,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: { height: "100%", backgroundColor: C.tint, borderRadius: 3 },
  progressText:    { fontSize: 13, color: C.textSecondary },
  savedText:       { fontSize: 12, color: "#22c55e", fontWeight: "600" },
  saveErrorText:   { fontSize: 12, color: C.danger, fontWeight: "600" },

  section:    { marginBottom: 32 },
  sectionHead: { marginBottom: 14, gap: 3 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: C.tint,
    letterSpacing: 1.2,
  },
  sectionTagline: { fontSize: 13, color: C.textMuted, lineHeight: 18 },

  propCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  propCardLocked: {
    backgroundColor: "#130F00",
    borderColor: "#4A3800",
  },
  propHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  propQuestion:   { flex: 1, fontSize: 15, fontWeight: "600", color: C.text, lineHeight: 22 },
  propSavedBadge: { fontSize: 11, color: "#22c55e", fontWeight: "700", paddingTop: 3 },
  noPick:         { fontSize: 11, color: C.textMuted, fontStyle: "italic", paddingTop: 3 },

  answerList: { gap: 8 },
  answerOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.background,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 12,
  },
  answerOptionSelected: {
    backgroundColor: "#06091A",
    borderColor: C.tint,
  },
  answerOptionLockedSelected: {
    backgroundColor: "#1A1200",
    borderColor: C.accentGold,
  },
  answerRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  answerIndicator: { width: 16, height: 16 },
  answerCheck:     { fontSize: 13, color: C.tint, width: 16, textAlign: "center" },
  answerLabel:     { flex: 1, fontSize: 14, color: C.textSecondary, fontWeight: "500" },
  answerLabelSelected: { color: C.text, fontWeight: "700" },

  btn: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    alignSelf: "stretch",
  },
  btnText:   { color: "#fff", fontWeight: "700", fontSize: 15 },
  linkText:  { color: C.tint, fontSize: 14, fontWeight: "600" },
  errorText: { color: C.danger, fontSize: 14, textAlign: "center" },
});
