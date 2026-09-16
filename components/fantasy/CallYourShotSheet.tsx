import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Colors from "@/constants/colors";
import type { PickShareMethod } from "@/lib/fantasy-pick-share";

const C = Colors.dark;

export type CallYourShotPick = {
  propId: string;
  momentTitle: string;
  answerLabel: string;
  shareText: string;
  shareUrl: string;
};

type Props = {
  visible: boolean;
  picks: CallYourShotPick[];
  initialPropId?: string | null;
  onClose: () => void;
  onShared?: (pick: CallYourShotPick, method: PickShareMethod) => void;
};

/**
 * Small, intentionally private composer. It receives a deliberately narrowed
 * list from play.tsx: no league distribution, IDs, or anyone else's picks.
 */
export function CallYourShotSheet({
  visible,
  picks,
  initialPropId,
  onClose,
  onShared,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(initialPropId ?? picks[0]?.propId ?? null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setSelectedId(initialPropId ?? picks[0]?.propId ?? null);
      setCopied(false);
      setCopyFailed(false);
    }
  }, [visible, initialPropId, picks]);

  const selected = useMemo(
    () => picks.find((pick) => pick.propId === selectedId) ?? null,
    [picks, selectedId],
  );

  const handleShare = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: selected.momentTitle, text: selected.shareText });
        onShared?.(selected, "web_share");
      } else {
        const result = await Share.share({ message: selected.shareText });
        if (result.action === Share.sharedAction) onShared?.(selected, "native");
      }
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        try {
          await Clipboard.setStringAsync(selected.shareText);
          setCopied(true);
          onShared?.(selected, "copy");
        } catch {
          setCopyFailed(true);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await Clipboard.setStringAsync(selected.shareText);
      setCopied(true);
      setCopyFailed(false);
      onShared?.(selected, "copy");
    } catch {
      setCopyFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.eyebrow}>CALL YOUR SHOT</Text>
              <Text style={styles.title}>Put one pick on the record.</Text>
            </View>
            <Pressable accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>
          <Text style={styles.subcopy}>Choose one prediction to share with your league.</Text>

          <View style={styles.list}>
            {picks.map((pick) => {
              const active = pick.propId === selectedId;
              return (
                <Pressable
                  key={pick.propId}
                  onPress={() => setSelectedId(pick.propId)}
                  style={[styles.pickRow, active && styles.pickRowActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active && <View style={styles.radioDot} />}
                  </View>
                  <View style={styles.pickCopy}>
                    <Text style={styles.moment}>{pick.momentTitle}</Text>
                    <Text style={styles.answer}>{pick.answerLabel}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={handleShare}
              disabled={!selected || busy}
              style={[styles.shareButton, (!selected || busy) && styles.disabled]}
            >
              {busy ? <ActivityIndicator color="#071013" /> : <Text style={styles.shareButtonText}>Share Pick</Text>}
            </Pressable>
            <Pressable onPress={handleCopy} disabled={!selected || busy} style={styles.copyButton}>
              <Text style={styles.copyText}>{copyFailed ? "Copy unavailable" : copied ? "Copied" : "Copy text + link"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.62)" },
  dismissArea: { flex: 1 },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
  },
  grabber: { alignSelf: "center", width: 38, height: 4, borderRadius: 4, backgroundColor: C.border, marginBottom: 18 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  eyebrow: { color: C.tint, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: C.text, fontSize: 20, fontWeight: "800", marginTop: 5 },
  close: { color: C.textMuted, fontSize: 30, lineHeight: 28 },
  subcopy: { color: C.textMuted, fontSize: 13, marginTop: 8, marginBottom: 16 },
  list: { gap: 8 },
  pickRow: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.background },
  pickRowActive: { borderColor: C.tint, backgroundColor: "#10232A" },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: C.textMuted, alignItems: "center", justifyContent: "center", marginRight: 11 },
  radioActive: { borderColor: C.tint },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.tint },
  pickCopy: { flex: 1 },
  moment: { color: C.tint, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  answer: { color: C.text, fontSize: 15, fontWeight: "700", marginTop: 3 },
  actions: { gap: 9, marginTop: 18 },
  shareButton: { minHeight: 46, borderRadius: 11, backgroundColor: C.tint, alignItems: "center", justifyContent: "center" },
  shareButtonText: { color: "#071013", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  copyButton: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  copyText: { color: C.textMuted, fontSize: 13, fontWeight: "700" },
});