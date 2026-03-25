import { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import FeedbackSheet from "./FeedbackSheet";

interface Props {
  visible: boolean;
  onDismiss: () => void;
  trigger: string;
}

const AUTO_DISMISS_MS = 8000;

export default function FeedbackNudge({ visible, onDismiss, trigger }: Props) {
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [visible, onDismiss]);

  function openSheet() {
    onDismiss();
    setSheetOpen(true);
  }

  if (!visible && !sheetOpen) return null;

  return (
    <>
      {visible && (
        <View
          style={[
            styles.nudge,
            { bottom: Math.max(insets.bottom, 16) + 70 },
          ]}
        >
          <View style={styles.body}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={15}
              color={Colors.dark.textSecondary}
              style={{ marginTop: 1 }}
            />
            <Text style={styles.text}>Got feedback? Tell us what worked or felt off.</Text>
          </View>
          <Pressable style={styles.shareBtn} onPress={openSheet}>
            <Text style={styles.shareBtnText}>Share →</Text>
          </Pressable>
          <Pressable onPress={onDismiss} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={15} color={Colors.dark.tabIconDefault} />
          </Pressable>
        </View>
      )}
      <FeedbackSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        trigger={trigger}
      />
    </>
  );
}

const styles = StyleSheet.create({
  nudge: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    gap: 8,
    zIndex: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 17,
  },
  shareBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: `${Colors.dark.tint}18`,
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.tint,
  },
  closeBtn: {
    paddingLeft: 4,
  },
});
