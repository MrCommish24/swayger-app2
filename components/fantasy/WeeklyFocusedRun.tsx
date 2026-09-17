import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, findNodeHandle, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { ImpactFeedbackStyle, NotificationFeedbackType } from "expo-haptics";
import { DraftDayProp } from "@/lib/fantasy-api";
import Colors from "@/constants/colors";
import { WeeklyFocusMoment } from "@/components/fantasy/WeeklyFocusMoment";
import { WeeklyFocusProgress } from "@/components/fantasy/WeeklyFocusProgress";
import { canFinishCompletedReview, firstUnanswered, nextUnanswered, progressState, shouldAutoAdvance } from "@/lib/fantasy-focused-run";
import { getWeeklyMoment } from "@/lib/fantasy-weekly-moments";
import { MyLockPick, MyLockSheet } from "@/components/fantasy/MyLockSheet";

const C = Colors.dark;

type Props = {
  weekNumber: number;
  props: DraftDayProp[];
  picks: Record<string, string>;
  confirmedPicks: Record<string, string>;
  statuses: Record<string, string>;
  stalePropIds: string[];
  locked: boolean;
  finalized: boolean;
  onPick: (propId: string, answerId: string) => Promise<boolean>;
  onShare: (propId: string, surface?: "question_card" | "completion_state") => void;
  myLock: { prop_id: string } | null;
  onSetMyLock: (propId: string) => Promise<boolean>;
  onBack: () => void;
  onLeaguePicks: () => void;
  onResults: () => void;
  shareSheet?: React.ReactNode;
};

export function WeeklyFocusedRun({ weekNumber, props, picks, confirmedPicks, statuses, stalePropIds, locked, finalized, onPick, onShare, myLock, onSetMyLock, onBack, onLeaguePicks, onResults, shareSheet }: Props) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [ackLabel, setAckLabel] = useState<"ON THE RECORD" | "CALL UPDATED">("ON THE RECORD");
  const [ackPropId, setAckPropId] = useState<string | null>(null);
  const [updatedSummary, setUpdatedSummary] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const didHydrate = useRef(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [lockSheetOpen, setLockSheetOpen] = useState(false);
  const currentIdRef = useRef<string | null>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const momentHeadingRef = useRef<React.ElementRef<typeof Text>>(null);
  const completionHeadingRef = useRef<React.ElementRef<typeof Text>>(null);
  const lockTriggerRef = useRef<any>(null);
  currentIdRef.current = currentId;

  const ids = useMemo(() => props.map((prop) => prop.id), [props]);
  const firstOpen = useMemo(() => firstUnanswered(ids, confirmedPicks), [ids, confirmedPicks]);
  const current = Math.max(0, ids.indexOf(currentId ?? ""));
  const completedRef = useRef(false);

  useEffect(() => {
    let active = true;
    if (active && !didHydrate.current) {
      didHydrate.current = true;
      setCurrentId(ids[firstOpen] ?? null);
      setHydrated(true);
    }
    return () => { active = false; };
  }, [firstOpen, ids]);

  useEffect(() => {
    const query = AccessibilityInfo.isReduceMotionEnabled?.();
    if (query) void query.then(setReducedMotion).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReducedMotion);
    return () => subscription?.remove();
  }, []);

  const moveTo = useCallback((index: number) => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    const safe = Math.max(0, Math.min(props.length - 1, index));
    setCurrentId(props[safe]?.id ?? null);
  }, [props]);

  const closeLockSheet = useCallback(() => {
    setLockSheetOpen(false);
    setTimeout(() => {
      const target = lockTriggerRef.current;
      if (Platform.OS === "web") {
        target?.focus?.();
        return;
      }
      const node = target ? findNodeHandle(target) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 0);
  }, []);

  useEffect(() => () => {
    if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
    if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
  }, []);

  const handlePick = useCallback(async (propId: string, answerId: string) => {
    const wasAnswered = Boolean(confirmedPicks[propId]);
    const confirmed = await onPick(propId, answerId);
    if (!confirmed) return false;
    setAckLabel(wasAnswered ? "CALL UPDATED" : "ON THE RECORD");
    if (wasAnswered) setUpdatedSummary(true);
    setAckPropId(propId);
    if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
    ackTimerRef.current = setTimeout(() => {
      ackTimerRef.current = null;
      setAckPropId((active) => active === propId ? null : active);
    }, 1200);
    // Auto-advance is deliberately only for a newly answered active Moment.
    const nextConfirmed = { ...confirmedPicks, [propId]: answerId };
    const isFinal = props.every((item) => Boolean(nextConfirmed[item.id]));
    if (!wasAnswered && !isFinal && Platform.OS !== "web") {
      void Haptics.impactAsync(ImpactFeedbackStyle.Light).catch(() => undefined);
    }
    const answerLabel = props
      .find((item) => item.id === propId)
      ?.answer_options.find((answer) => answer.id === answerId)?.label;
    if (answerLabel) {
      AccessibilityInfo.announceForAccessibility(
        `Pick saved. ${answerLabel} is on the record.`,
      );
    }
    if (shouldAutoAdvance({ newlyConfirmed: true, wasAnswered, activeId: currentIdRef.current ?? "", confirmedId: propId, reducedMotion, failed: false, manuallyNavigated: false, final: isFinal })) {
      autoAdvanceTimerRef.current = setTimeout(() => {
        autoAdvanceTimerRef.current = null;
        if (currentIdRef.current === propId) {
          moveTo(nextUnanswered(ids, nextConfirmed, ids.indexOf(propId)));
        }
      }, 600);
    }
    if (!completedRef.current && props.length > 0 && isFinal) {
      completedRef.current = true;
      if (Platform.OS !== "web") void Haptics.notificationAsync(NotificationFeedbackType.Success).catch(() => undefined);
    }
    return true;
  }, [onPick, confirmedPicks, props, ids, reducedMotion, moveTo]);

  const allAnswered = props.every((prop) => Boolean(confirmedPicks[prop.id]));
  if (allAnswered) completedRef.current = true;
  const activeProp = props[current];

  useEffect(() => {
    const target = allAnswered && !editing ? completionHeadingRef.current : momentHeadingRef.current;
    if (Platform.OS === "web") {
      (target as any)?.focus?.();
      return;
    }
    const node = target ? findNodeHandle(target) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [allAnswered, current, editing]);

  if (!hydrated || !props.length || !activeProp) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.brandRow}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to league"><Text style={styles.back}>Back to league</Text></Pressable>
        <Text style={styles.brand}>SWAYGER RUN</Text>
      </View>
      <View style={styles.titleBlock}>
        <Text style={styles.eyebrow}>WEEK {weekNumber} / YOUR RECORD</Text>
        <Text style={styles.title}>{allAnswered ? "Your card is on the record." : "Make your read."}</Text>
        <Text style={styles.subtitle}>{allAnswered ? "Review every Moment before you leave." : "One Moment at a time. No second-guessing required."}</Text>
      </View>
      {stalePropIds.length > 0 && (
        <View style={styles.staleBanner} accessibilityLiveRegion="polite">
          <Text style={styles.staleTitle}>Roster updated</Text>
          <Text style={styles.staleBody}>A new member joined after you picked. Review the affected Moments and resubmit.</Text>
        </View>
      )}
      <WeeklyFocusProgress total={props.length} currentIndex={current} items={props.map((prop, index) => ({ title: getWeeklyMoment(prop.template_prop_id)?.title ?? `Moment ${index + 1}`, stale: stalePropIds.includes(prop.id), ...progressState(prop.id, confirmedPicks, statuses[prop.id] as any, index === current) }))} onSelect={moveTo} disabled={false} />
      {!allAnswered || editing ? (
        <WeeklyFocusMoment
          prop={activeProp}
          index={current}
          total={props.length}
          selectedId={picks[activeProp.id] ?? null}
          status={statuses[activeProp.id] as "saving" | "saved" | "error" | undefined}
          locked={locked}
          stale={stalePropIds.includes(activeProp.id)}
          onSelect={(id) => handlePick(activeProp.id, id)}
          onPrevious={() => moveTo(current - 1)}
          onNext={() => moveTo(current + 1)}
          reviewing={editing}
          onFinishReview={() => setEditing(false)}
           onShare={() => onShare(activeProp.id)}
            canFinishReview={canFinishCompletedReview(confirmedPicks[activeProp.id], picks[activeProp.id], statuses[activeProp.id] as any)}
          ackLabel={ackLabel}
          showAcknowledgment={ackPropId === activeProp.id}
          headingRef={momentHeadingRef}
          confirmedAnswerLabel={
            activeProp.answer_options.find((answer) => answer.id === confirmedPicks[activeProp.id])?.label ?? null
          }
        />
      ) : (
        <View style={styles.summary}>
          <Text style={styles.summaryEyebrow}>CARD COMPLETE</Text>
          <Text ref={completionHeadingRef} {...(Platform.OS === "web" ? ({ tabIndex: -1 } as any) : {})} accessibilityRole="header" style={styles.summaryTitle}>YOUR SWAYGER IS IN</Text>
          <Text style={styles.summarySub}>{props.length} calls on the record. Receipt pending.</Text>
          {updatedSummary && <Text style={styles.updated}>CALL UPDATED</Text>}
          <View style={styles.summaryRule} />
           {myLock && (() => {
             const lockProp = props.find((prop) => prop.id === myLock.prop_id);
             const lockAnswer = lockProp?.answer_options.find((answer) => answer.id === confirmedPicks[lockProp.id]);
             if (!lockProp || !lockAnswer) return null;
             return (
               <View style={styles.lockSummary} accessibilityLiveRegion="polite">
                 <Text style={styles.lockEyebrow}>🔒 MY LOCK</Text>
                 <Text style={styles.lockTitle}>{getWeeklyMoment(lockProp.template_prop_id)?.title ?? "Swayger Moment"}</Text>
                 <Text style={styles.lockAnswer}>{lockAnswer.label}</Text>
                 <Text style={styles.lockBody}>This is the one you’re standing on.</Text>
                  {!locked && <Pressable ref={lockTriggerRef} onPress={() => setLockSheetOpen(true)} accessibilityRole="button" accessibilityLabel="Change My Lock" style={styles.lockChange}><Text style={styles.lockChangeText}>Change My Lock</Text></Pressable>}
                  {!locked && <Pressable onPress={() => onShare(lockProp.id, "completion_state")} accessibilityRole="button" accessibilityLabel="Share My Lock" style={styles.lockShare}><Text style={styles.lockShareText}>Share My Lock</Text></Pressable>}
               </View>
             );
           })()}
           {!myLock && !locked && (
              <Pressable ref={lockTriggerRef} onPress={() => setLockSheetOpen(true)} accessibilityRole="button" accessibilityLabel="Choose My Lock" style={styles.callYourShot}>
               <Text style={styles.callYourShotLabel}>CALL YOUR SHOT</Text>
               <Text style={styles.callYourShotText}>Which pick are you most confident in?</Text>
               <Text style={styles.callYourShotButton}>Choose My Lock</Text>
             </Pressable>
           )}
           {props.map((prop, index) => {
            const answer = prop.answer_options.find((item) => item.id === confirmedPicks[prop.id]);
            const momentTitle = getWeeklyMoment(prop.template_prop_id)?.title ?? `Moment ${index + 1}`;
            return (
              <Pressable key={prop.id} onPress={() => { moveTo(index); setEditing(true); }} accessibilityRole="button" accessibilityLabel={`${locked ? "Review" : "Edit"} Pick ${index + 1}${stalePropIds.includes(prop.id) ? ", needs review" : ""}`} style={[styles.reviewRow, stalePropIds.includes(prop.id) && styles.reviewRowStale]}>
                <Text style={styles.reviewIndex}>{String(index + 1).padStart(2, "0")}</Text>
                <View style={styles.reviewCopy}><Text style={styles.reviewQuestion} numberOfLines={2}>{momentTitle}</Text><Text style={styles.reviewAnswer} numberOfLines={1}>{answer?.label ?? "No answer"}</Text></View>
                <Text style={styles.edit}>{locked ? "View" : "Edit"}</Text>
              </Pressable>
            );
          })}
           {!locked && <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel="Edit picks" style={styles.done}><Text style={styles.doneText}>Edit Picks</Text></Pressable>}
          <Pressable onPress={onBack} accessibilityRole="button" style={styles.done}><Text style={styles.doneText}>Back to league</Text></Pressable>
        </View>
      )}
      {finalized && <Pressable onPress={onResults} accessibilityRole="button" style={styles.secondary}><Text style={styles.secondaryText}>View Results</Text></Pressable>}
      {locked && !finalized && <Pressable onPress={onLeaguePicks} accessibilityRole="button" style={styles.secondary}><Text style={styles.secondaryText}>See League Picks</Text></Pressable>}
      {shareSheet}
      <MyLockSheet
        visible={lockSheetOpen}
        picks={props.flatMap((prop, index) => {
          const answer = prop.answer_options.find((item) => item.id === confirmedPicks[prop.id]);
          return answer ? [{ propId: prop.id, momentTitle: getWeeklyMoment(prop.template_prop_id)?.title ?? `Pick ${index + 1}`, answerLabel: answer.label }] : [];
        }) as MyLockPick[]}
        currentPropId={myLock?.prop_id}
        onClose={closeLockSheet}
        onSave={onSetMyLock}
        onShare={(propId) => { setLockSheetOpen(false); onShare(propId, "completion_state"); }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 18 },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  back: { color: C.tint, fontSize: 13, fontWeight: "700" },
  brand: { color: C.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.8 },
  titleBlock: { gap: 6, marginTop: 10 },
  eyebrow: { color: C.tint, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: C.text, fontSize: 32, lineHeight: 36, fontWeight: "900", letterSpacing: -0.8 },
  subtitle: { color: C.textMuted, fontSize: 14, lineHeight: 20 },
  summary: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 18, gap: 12 },
  summaryEyebrow: { color: C.tint, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  summaryTitle: { color: C.text, fontSize: 25, fontWeight: "900" },
  summarySub: { color: C.textMuted, fontSize: 13, lineHeight: 19 },
  updated: { color: C.tint, fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  summaryRule: { height: 1, backgroundColor: C.border, marginVertical: 2 },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 7 },
  reviewRowStale: { borderLeftWidth: 3, borderLeftColor: "#F59E0B", paddingLeft: 8 },
  reviewIndex: { color: C.textMuted, fontSize: 11, fontWeight: "900", width: 20 },
  reviewCopy: { flex: 1, gap: 3 },
  reviewQuestion: { color: C.text, fontSize: 13, fontWeight: "700" },
  reviewAnswer: { color: C.tint, fontSize: 12, fontWeight: "700" },
  edit: { color: C.textMuted, fontSize: 12, fontWeight: "800" },
  share: { minHeight: 48, borderRadius: 11, backgroundColor: C.tint, justifyContent: "center", alignItems: "center", marginTop: 6 },
  shareText: { color: "#071013", fontSize: 14, fontWeight: "900" },
  secondary: { minHeight: 48, borderRadius: 11, borderWidth: 1, borderColor: C.tint, justifyContent: "center", alignItems: "center" },
  secondaryText: { color: C.tint, fontSize: 14, fontWeight: "900" },
  done: { minHeight: 42, justifyContent: "center", alignItems: "center" },
  doneText: { color: C.textMuted, fontSize: 13, fontWeight: "700" },
  lockSummary: { backgroundColor: "#10232A", borderRadius: 14, borderWidth: 1, borderColor: C.tint, padding: 14, gap: 5 },
  lockEyebrow: { color: C.tint, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  lockTitle: { color: C.textMuted, fontSize: 12, fontWeight: "800", marginTop: 2 },
  lockAnswer: { color: C.text, fontSize: 17, fontWeight: "900" },
  lockBody: { color: C.textMuted, fontSize: 12, lineHeight: 17 },
  lockShare: { minHeight: 42, borderRadius: 9, backgroundColor: C.tint, justifyContent: "center", alignItems: "center", marginTop: 5 },
  lockShareText: { color: "#071013", fontSize: 13, fontWeight: "900" },
  lockChange: { minHeight: 36, justifyContent: "center", alignItems: "center" },
  lockChangeText: { color: C.tint, fontSize: 12, fontWeight: "800" },
  callYourShot: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, gap: 5 },
  callYourShotLabel: { color: C.tint, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  callYourShotText: { color: C.text, fontSize: 15, fontWeight: "800" },
  callYourShotButton: { color: C.tint, fontSize: 13, fontWeight: "900", marginTop: 4 },
  staleBanner: { backgroundColor: "#1F1500", borderRadius: 10, borderWidth: 1, borderColor: "#F59E0B", padding: 12, gap: 4 },
  staleTitle: { color: "#F59E0B", fontSize: 14, fontWeight: "800" },
  staleBody: { color: C.textMuted, fontSize: 13, lineHeight: 18 },
});