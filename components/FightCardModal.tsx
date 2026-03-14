import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
} from "react-native-reanimated";

export type FightCardType = "game_on" | "run_it_back" | "double_or_nothing";

interface Props {
  visible: boolean;
  type: FightCardType;
  creatorInitial: string;
  opponentInitial: string;
  creatorUsername: string;
  opponentUsername: string;
  stakeUnits: number;
  onDismiss: () => void;
}

const CONFIG: Record<FightCardType, { label: string; emoji: string; color: string; bgColor: string }> = {
  game_on:           { label: "GAME ON",          emoji: "⚡", color: "#818CF8", bgColor: "rgba(129,140,248,0.12)" },
  run_it_back:       { label: "RUN IT BACK",       emoji: "⚡", color: "#818CF8", bgColor: "rgba(129,140,248,0.12)" },
  double_or_nothing: { label: "DOUBLE OR NOTHING", emoji: "🔥", color: "#F5A623", bgColor: "rgba(245,166,35,0.12)"  },
};

function Avatar({ initial, translateX, color }: { initial: string; translateX: Animated.SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  return (
    <Animated.View style={[styles.avatar, { borderColor: color }, style]}>
      <Text style={styles.avatarInitial}>{initial.toUpperCase()}</Text>
    </Animated.View>
  );
}

export default function FightCardModal({
  visible, type, creatorInitial, opponentInitial,
  creatorUsername, opponentUsername, stakeUnits, onDismiss,
}: Props) {
  const cfg = CONFIG[type];

  const backdropOpacity  = useSharedValue(0);
  const cardOpacity      = useSharedValue(0);
  const cardScale        = useSharedValue(0.88);
  const leftX            = useSharedValue(-200);
  const rightX           = useSharedValue(200);
  const flashScale       = useSharedValue(0);
  const titleTranslateY  = useSharedValue(-24);
  const titleOpacity     = useSharedValue(0);
  const stakeOpacity     = useSharedValue(0);

  function handleDismiss() {
    backdropOpacity.value = withTiming(0, { duration: 200 }, (done) => {
      if (done) runOnJS(onDismiss)();
    });
    cardOpacity.value = withTiming(0, { duration: 150 });
    cardScale.value   = withTiming(0.88, { duration: 200 });
  }

  useEffect(() => {
    if (!visible) return;

    // Reset
    backdropOpacity.value = 0;
    cardOpacity.value     = 0;
    cardScale.value       = 0.88;
    leftX.value           = -200;
    rightX.value          = 200;
    flashScale.value      = 0;
    titleTranslateY.value = -24;
    titleOpacity.value    = 0;
    stakeOpacity.value    = 0;

    // Backdrop + card fade in
    backdropOpacity.value = withTiming(1, { duration: 280 });
    cardOpacity.value     = withTiming(1, { duration: 200 });
    cardScale.value       = withSpring(1, { damping: 16, stiffness: 140 });

    // Avatars collide from both sides
    leftX.value  = withSpring(0, { damping: 14, stiffness: 120 });
    rightX.value = withSpring(0, { damping: 14, stiffness: 120 });

    // ⚡ flash after avatars land
    flashScale.value = withDelay(
      320,
      withSequence(
        withSpring(1.5, { damping: 5, stiffness: 200 }),
        withSpring(1.0, { damping: 10, stiffness: 180 })
      )
    );

    // Title slams in
    titleTranslateY.value = withDelay(430, withSpring(0, { damping: 14, stiffness: 160 }));
    titleOpacity.value    = withDelay(430, withTiming(1, { duration: 200 }));

    // Stakes fade in last
    stakeOpacity.value = withDelay(620, withTiming(1, { duration: 300 }));
  }, [visible]);

  const backdropStyle    = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const cardStyle        = useAnimatedStyle(() => ({ opacity: cardOpacity.value, transform: [{ scale: cardScale.value }] }));
  const flashStyle       = useAnimatedStyle(() => ({ transform: [{ scale: flashScale.value }] }));
  const titleStyle       = useAnimatedStyle(() => ({ opacity: titleOpacity.value, transform: [{ translateY: titleTranslateY.value }] }));
  const stakeStyle       = useAnimatedStyle(() => ({ opacity: stakeOpacity.value }));

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={handleDismiss}>
      <Pressable style={styles.overlay} onPress={handleDismiss}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />

        <Pressable onPress={handleDismiss}>
          <Animated.View style={[styles.card, { borderColor: cfg.color + "66", shadowColor: cfg.color }, cardStyle]}>

            {/* Avatars + Flash row */}
            <View style={styles.vsRow}>
              <View style={styles.playerSide}>
                <Avatar initial={creatorInitial} translateX={leftX} color={cfg.color} />
                <Animated.Text style={[styles.username, stakeStyle]} numberOfLines={1}>
                  @{creatorUsername}
                </Animated.Text>
              </View>

              <Animated.Text style={[styles.flash, flashStyle]}>{cfg.emoji}</Animated.Text>

              <View style={styles.playerSide}>
                <Avatar initial={opponentInitial} translateX={rightX} color={cfg.color} />
                <Animated.Text style={[styles.username, stakeStyle]} numberOfLines={1}>
                  @{opponentUsername}
                </Animated.Text>
              </View>
            </View>

            {/* Title */}
            <Animated.View style={[styles.titleRow, { backgroundColor: cfg.bgColor }, titleStyle]}>
              <Text style={[styles.title, { color: cfg.color }]}>{cfg.label}</Text>
            </Animated.View>

            {/* Stake */}
            <Animated.Text style={[styles.stake, stakeStyle]}>
              {stakeUnits} unit{stakeUnits !== 1 ? "s" : ""} on the line
            </Animated.Text>

            <Animated.Text style={[styles.tapHint, stakeStyle]}>tap to continue</Animated.Text>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center" },
  backdrop: { backgroundColor: "rgba(0,0,0,0.88)" },
  card: {
    alignItems: "center",
    backgroundColor: "#111111",
    borderRadius: 28,
    paddingHorizontal: 32,
    paddingTop: 36,
    paddingBottom: 28,
    borderWidth: 1.5,
    shadowOpacity: 0.3,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
    minWidth: 300,
  },
  vsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
  },
  playerSide: { alignItems: "center", gap: 8, width: 90 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    backgroundColor: "#1C1C1C",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: { fontSize: 26, fontWeight: "700", color: "#FFFFFF" },
  username: { fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: "500" },
  flash: { fontSize: 40, lineHeight: 48 },
  titleRow: {
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: 2.5,
    textAlign: "center",
  },
  stake: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    fontWeight: "500",
    marginBottom: 20,
  },
  tapHint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.25)",
    letterSpacing: 0.5,
  },
});
