import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const C = Colors.dark;

export type MyLockPick = {
  propId: string;
  momentTitle: string;
  answerLabel: string;
};

type Props = {
  visible: boolean;
  picks: MyLockPick[];
  currentPropId?: string | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (propId: string) => Promise<boolean>;
  onShare?: (propId: string) => void;
};

export function MyLockSheet({ visible, picks, currentPropId, busy = false, onClose, onSave, onShare }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(currentPropId ?? picks[0]?.propId ?? null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const wasVisible = useRef(false);
  const selected = useMemo(() => picks.find((pick) => pick.propId === selectedId) ?? null, [picks, selectedId]);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      setSelectedId(currentPropId ?? picks[0]?.propId ?? null);
      setSaved(false);
      setSaving(false);
    }
    wasVisible.current = visible;
  }, [visible, currentPropId, picks]);

  const choose = async () => {
    if (!selected || busy || saving) return;
    setSaving(true);
    try {
      const ok = await onSave(selected.propId);
      if (!ok) return;
      setSaved(true);
      AccessibilityInfo.announceForAccessibility("Locked in. My Lock saved.");
      if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={styles.dismissArea} onPress={onClose} accessibilityLabel="Close My Lock picker" />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>CALL YOUR SHOT</Text>
              <Text style={styles.title}>{saved ? "You’re standing on it." : "Which pick are you most confident in?"}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>
          <Text style={styles.subcopy}>{saved ? "My Lock saved. Sharing is optional." : "Choose one confirmed pick. You can change it before the Week locks."}</Text>
          <ScrollView style={styles.listScroll} contentContainerStyle={styles.list} accessibilityRole="radiogroup" accessibilityLabel="Confirmed picks for My Lock">
            {picks.map((pick) => {
              const active = pick.propId === selectedId;
              return (
                <Pressable
                  key={pick.propId}
                  onPress={() => { setSelectedId(pick.propId); setSaved(false); }}
                  style={[styles.pickRow, active && styles.pickRowActive]}
                  accessibilityRole="radio"
                  accessibilityLabel={`${pick.momentTitle}, ${pick.answerLabel}${active ? ", selected My Lock" : ""}`}
                  accessibilityState={{ selected: active }}
                >
                  <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioDot} />}</View>
                  <View style={styles.pickCopy}>
                    <Text style={styles.moment}>{pick.momentTitle}</Text>
                    <Text style={styles.answer}>{pick.answerLabel}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          {saved && selected ? (
            <View style={styles.confirmed} accessibilityLiveRegion="polite">
              <Text style={styles.confirmedLabel}>LOCKED IN</Text>
              <Text style={styles.confirmedCopy}>🔒 MY LOCK · {selected.momentTitle}</Text>
              <View style={styles.actions}>
                {onShare && <Pressable onPress={() => onShare(selected.propId)} style={styles.primary} accessibilityRole="button" accessibilityLabel="Share My Lock"><Text style={styles.primaryText}>Share My Lock</Text></Pressable>}
                <Pressable onPress={onClose} style={styles.secondary} accessibilityRole="button"><Text style={styles.secondaryText}>Done</Text></Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={choose} disabled={!selected || busy || saving} style={[styles.primary, (!selected || busy || saving) && styles.disabled]} accessibilityRole="button" accessibilityLabel="Choose My Lock">
              {busy || saving ? <ActivityIndicator color="#071013" /> : <Text style={styles.primaryText}>{currentPropId ? "Change My Lock" : "Choose My Lock"}</Text>}
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.62)" },
  dismissArea: { flex: 1 },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: C.border, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30 },
  grabber: { alignSelf: "center", width: 38, height: 4, borderRadius: 4, backgroundColor: C.border, marginBottom: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  eyebrow: { color: C.tint, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: C.text, fontSize: 20, fontWeight: "800", marginTop: 5, maxWidth: 300 },
  close: { color: C.textMuted, fontSize: 30, lineHeight: 28 },
  subcopy: { color: C.textMuted, fontSize: 13, marginTop: 8, marginBottom: 16 },
  listScroll: { maxHeight: 360 },
  list: { gap: 8 },
  pickRow: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.background },
  pickRowActive: { borderColor: C.tint, backgroundColor: "#10232A" },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: C.textMuted, alignItems: "center", justifyContent: "center", marginRight: 11 },
  radioActive: { borderColor: C.tint },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.tint },
  pickCopy: { flex: 1 },
  moment: { color: C.tint, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  answer: { color: C.text, fontSize: 15, fontWeight: "700", marginTop: 3 },
  confirmed: { marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: "#10232A", borderWidth: 1, borderColor: C.tint },
  confirmedLabel: { color: C.tint, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  confirmedCopy: { color: C.text, fontSize: 14, fontWeight: "800", marginTop: 5 },
  actions: { gap: 9, marginTop: 12 },
  primary: { minHeight: 46, borderRadius: 11, backgroundColor: C.tint, alignItems: "center", justifyContent: "center", marginTop: 18 },
  primaryText: { color: "#071013", fontSize: 14, fontWeight: "900" },
  secondary: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: C.textMuted, fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.55 },
});