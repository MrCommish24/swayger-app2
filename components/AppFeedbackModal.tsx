/**
 * AppFeedbackModal
 *
 * One-tap sentiment prompt shown on app open for existing users.
 * Shown once per device via AsyncStorage key PROMPT_SHOWN_KEY.
 *
 * ADJUST FREQUENCY:
 *   - To reset and show again for testing: clear AsyncStorage key below, or
 *     set PROMPT_SHOWN_KEY to a new value (e.g. "v2") to re-show for everyone.
 *   - To show once per N days: replace the boolean flag with a timestamp and
 *     check if Date.now() - lastShown > N * 86400000.
 *   - To show to all users again: bump PROMPT_SHOWN_KEY constant to "v2", etc.
 *
 * ELIGIBILITY (checked in TabLayout before mounting this):
 *   - User account created before today (existing user, not brand new).
 *   - AsyncStorage flag not set (not yet shown on this device).
 *   - Shown after a 2-second delay so it doesn't interrupt navigation.
 */

import { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import FeedbackSheet from "@/components/FeedbackSheet";

// ─── Config ───────────────────────────────────────────────────────────────────
// Bump this key (e.g. "v2") to re-show the prompt for all users on next open.
export const PROMPT_SHOWN_KEY = "@swayger/app_feedback_prompt_v1";

// Delay (ms) after the tabs screen mounts before showing the modal.
const SHOW_DELAY_MS = 2000;
// ──────────────────────────────────────────────────────────────────────────────

type QuickResponse = "Good" | "Confusing" | "Had an issue";

interface Option {
  label: QuickResponse;
  emoji: string;
  category: "positive" | "confusing" | "bug";
  color: string;
}

const OPTIONS: Option[] = [
  { label: "Good",         emoji: "👍", category: "positive",  color: "#22C55E" },
  { label: "Confusing",    emoji: "🤔", category: "confusing", color: "#F59E0B" },
  { label: "Had an issue", emoji: "⚠️", category: "bug",       color: "#EF4444" },
];

interface Props {
  /** Called when the modal fully closes so the parent can unmount it. */
  onDone: () => void;
}

type Phase = "prompt" | "saving" | "thanks";

export default function AppFeedbackModal({ onDone }: Props) {
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const [phase, setPhase] = useState<Phase>("prompt");
  const [sheetOpen, setSheetOpen] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // useNativeDriver is not supported on web — use JS driver there
  const nativeDriver = Platform.OS !== "web";

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: nativeDriver,
    }).start();
  }, []);

  function fadeOut(cb: () => void) {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: nativeDriver,
    }).start(cb);
  }

  async function handleQuickTap(option: Option) {
    setPhase("saving");
    try {
      await supabase.from("feedback_submissions").insert({
        user_id:               user?.id ?? null,
        email:                 profile?.email ?? null,
        category:              option.category,
        // quick_feedback_response stores the raw button label for analytics
        quick_feedback_response: option.label,
        message:               option.label,
        trigger:               "app_open_feedback_prompt",
        current_screen:        "app_open",
      });
    } catch {
      // Non-blocking — if the insert fails we still show thanks and close
    }
    setPhase("thanks");
    // Auto-dismiss after 1.6s
    setTimeout(() => fadeOut(onDone), 1600);
  }

  function handleShareMore() {
    // Close the modal backdrop, open the full FeedbackSheet
    setSheetOpen(true);
  }

  function handleDismiss() {
    fadeOut(onDone);
  }

  return (
    <>
      <Modal
        visible={!sheetOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={handleDismiss}
      >
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />

          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            {phase === "prompt" && (
              <>
                <View style={styles.handle} />

                <Text style={styles.title}>How's Swayger been so far?</Text>
                <Text style={styles.body}>
                  You've been one of our early users — your take matters.
                </Text>

                {/* Quick-tap options */}
                <View style={styles.optionsRow}>
                  {OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.label}
                      style={({ pressed }) => [
                        styles.optionBtn,
                        { borderColor: opt.color, opacity: pressed ? 0.75 : 1 },
                      ]}
                      onPress={() => handleQuickTap(opt)}
                    >
                      <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                      <Text style={[styles.optionLabel, { color: opt.color }]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Share more CTA */}
                <Pressable
                  style={({ pressed }) => [styles.shareBtn, { opacity: pressed ? 0.75 : 1 }]}
                  onPress={handleShareMore}
                >
                  <Text style={styles.shareBtnText}>Want to share more →</Text>
                </Pressable>

                {/* Not now */}
                <Pressable onPress={handleDismiss} hitSlop={12} style={styles.notNowBtn}>
                  <Text style={styles.notNowText}>Not now</Text>
                </Pressable>
              </>
            )}

            {phase === "saving" && (
              <View style={styles.centeredState}>
                <ActivityIndicator color={Colors.dark.tint} />
              </View>
            )}

            {phase === "thanks" && (
              <View style={styles.centeredState}>
                <Text style={styles.thanksEmoji}>🙏</Text>
                <Text style={styles.thanksText}>Thanks — this really helps.</Text>
              </View>
            )}
          </View>
        </Animated.View>
      </Modal>

      {/* Full feedback form — opens when user taps "Want to share more" */}
      <FeedbackSheet
        visible={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          onDone();
        }}
        trigger="app_open_feedback_prompt"
      />
    </>
  );
}

// ─── Eligibility helper ───────────────────────────────────────────────────────
/**
 * Returns true if this user should see the app-open feedback prompt.
 * Call this before mounting AppFeedbackModal.
 *
 * Criteria:
 *   1. User account was created before today (not a brand-new user).
 *   2. The prompt has not already been shown on this device (AsyncStorage).
 */
export async function shouldShowAppFeedbackPrompt(
  profileCreatedAt: string | null | undefined
): Promise<boolean> {
  // Must be an existing user (created before today)
  if (!profileCreatedAt) return false;
  const createdDate = new Date(profileCreatedAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (createdDate >= today) return false;

  // Must not have been shown on this device already
  try {
    const shown = await AsyncStorage.getItem(PROMPT_SHOWN_KEY);
    if (shown) return false;
  } catch {
    return false;
  }

  return true;
}

/**
 * Mark the prompt as shown so it won't appear again on this device.
 * Call this immediately when the modal becomes visible.
 */
export async function markAppFeedbackPromptShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMPT_SHOWN_KEY, "1");
  } catch {
    // Non-blocking
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.border,
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  optionsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  optionBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: Colors.dark.surfaceLight,
    gap: 6,
  },
  optionEmoji: {
    fontSize: 22,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  shareBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: `${Colors.dark.tint}1A`,
    borderWidth: 1,
    borderColor: `${Colors.dark.tint}40`,
    marginBottom: 12,
  },
  shareBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.tint,
  },
  notNowBtn: {
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 4,
  },
  notNowText: {
    fontSize: 13,
    color: Colors.dark.tabIconDefault,
  },
  centeredState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 12,
  },
  thanksEmoji: {
    fontSize: 32,
  },
  thanksText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
});
