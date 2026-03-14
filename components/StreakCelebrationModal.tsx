import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
} from "react-native-reanimated";

interface Props {
  visible: boolean;
  streak: number;
  onDismiss: () => void;
}

export default function StreakCelebrationModal({ visible, streak, onDismiss }: Props) {
  const backdropOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.5);
  const cardOpacity = useSharedValue(0);
  const fireScale = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  const [displayedStreak, setDisplayedStreak] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (dismissTimerRef.current) { clearTimeout(dismissTimerRef.current); dismissTimerRef.current = null; }
  }

  function startCountUp(target: number) {
    clearTimers();
    setDisplayedStreak(0);
    const steps = Math.min(target, 20);
    const duration = 600;
    const interval = duration / steps;
    let current = 0;
    intervalRef.current = setInterval(() => {
      current++;
      setDisplayedStreak(current);
      if (current >= target) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
      }
    }, interval);
  }

  useEffect(() => {
    if (visible) {
      // Reset
      backdropOpacity.value = 0;
      cardScale.value = 0.5;
      cardOpacity.value = 0;
      fireScale.value = 0;
      glowOpacity.value = 0;

      // Backdrop fades in
      backdropOpacity.value = withTiming(1, { duration: 250 });

      // Card bounces in
      cardOpacity.value = withTiming(1, { duration: 150 });
      cardScale.value = withSpring(1, { damping: 12, stiffness: 130 });

      // 🔥 mega bounce with delay
      fireScale.value = withDelay(
        150,
        withSequence(
          withSpring(1.35, { damping: 6, stiffness: 180 }),
          withSpring(1.0, { damping: 10, stiffness: 200 })
        )
      );

      // Glow pulse
      glowOpacity.value = withDelay(200, withTiming(1, { duration: 300 }));

      // Count up the streak number
      startCountUp(streak);

      // Auto-dismiss after 2.8s
      dismissTimerRef.current = setTimeout(() => {
        handleDismiss();
      }, 2800);
    } else {
      clearTimers();
      setDisplayedStreak(0);
    }

    return () => clearTimers();
  }, [visible, streak]);

  function handleDismiss() {
    clearTimers();
    backdropOpacity.value = withTiming(0, { duration: 200 }, (done) => {
      if (done) runOnJS(onDismiss)();
    });
    cardOpacity.value = withTiming(0, { duration: 150 });
    cardScale.value = withTiming(0.8, { duration: 200 });
  }

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const fireStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fireScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={handleDismiss}>
      <Pressable style={styles.overlay} onPress={handleDismiss}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />

        <Pressable onPress={handleDismiss}>
          <Animated.View style={[styles.card, cardStyle]}>
            {/* Glow ring behind fire */}
            <Animated.View style={[styles.glowRing, glowStyle]} />

            {/* Fire emoji */}
            <Animated.Text style={[styles.fireEmoji, fireStyle]}>🔥</Animated.Text>

            {/* Streak count */}
            <Text style={styles.streakNumber}>{displayedStreak}</Text>
            <Text style={styles.streakLabel}>WIN STREAK</Text>

            <View style={styles.divider} />

            <Text style={styles.subtext}>
              {streak >= 5 ? "Unstoppable 👑" : streak >= 3 ? "On a heater 🌶️" : "Keep it going!"}
            </Text>

            <Text style={styles.tapToDismiss}>tap to continue</Text>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.85)",
  },
  card: {
    alignItems: "center",
    backgroundColor: "#111111",
    borderRadius: 28,
    paddingHorizontal: 48,
    paddingVertical: 40,
    borderWidth: 1.5,
    borderColor: "rgba(251, 146, 60, 0.4)",
    shadowColor: "#FB923C",
    shadowOpacity: 0.35,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
    minWidth: 260,
  },
  glowRing: {
    position: "absolute",
    top: 20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(251, 146, 60, 0.12)",
  },
  fireEmoji: {
    fontSize: 72,
    marginBottom: 12,
    lineHeight: 88,
  },
  streakNumber: {
    fontSize: 72,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 80,
    letterSpacing: -2,
  },
  streakLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FB923C",
    letterSpacing: 3,
    marginTop: 4,
    marginBottom: 20,
  },
  divider: {
    width: 40,
    height: 2,
    backgroundColor: "rgba(251, 146, 60, 0.3)",
    borderRadius: 1,
    marginBottom: 16,
  },
  subtext: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 20,
  },
  tapToDismiss: {
    fontSize: 12,
    color: "rgba(255,255,255,0.3)",
    letterSpacing: 0.5,
  },
});
