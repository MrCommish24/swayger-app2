import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const C = Colors.dark;

interface Step {
  number: number;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    number: 1,
    icon: "enter-outline",
    title: "Join a Room",
    body: "Get an invite link or room code from a friend or host. Tap it to join before the pick window opens — no account required to jump in as a guest.",
  },
  {
    number: 2,
    icon: "checkmark-circle-outline",
    title: "Make Your Picks",
    body: "Pick windows open before tip-off and again at halftime. Answer each question and lock in your takes before the countdown hits zero — you can update picks until the window closes.",
  },
  {
    number: 3,
    icon: "podium-outline",
    title: "Track the Leaderboard",
    body: "Swayger Points update in real time as results come in. Watch your rank climb with every correct pick and see exactly where you stand against everyone else in the room.",
  },
  {
    number: 4,
    icon: "receipt-outline",
    title: "Check Your Receipt",
    body: "Once the game is final, your Receipt shows every pick you made, which ones hit, your total SP earned, and your final rank. Share it to settle the debate.",
  },
];

export default function HowGameDayWorksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={styles.screenTitle}>How Game Day Rooms Work</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Game Day Rooms are group pick'em competitions built around live games.
          Here's how a room works from start to finish.
        </Text>

        {STEPS.map((step, index) => (
          <View key={step.number} style={styles.stepWrap}>
            <View style={styles.stepCard}>
              {/* Step number + icon row */}
              <View style={styles.stepHeader}>
                <View style={styles.stepNumberWrap}>
                  <Text style={styles.stepNumber}>{step.number}</Text>
                </View>
                <View style={styles.stepIconWrap}>
                  <Ionicons name={step.icon} size={22} color={C.tint} />
                </View>
                <Text style={styles.stepTitle}>{step.title}</Text>
              </View>

              <Text style={styles.stepBody}>{step.body}</Text>
            </View>

            {/* Connector line between cards */}
            {index < STEPS.length - 1 && (
              <View style={styles.connector}>
                <View style={styles.connectorLine} />
                <Ionicons name="chevron-down" size={14} color={C.border} />
              </View>
            )}
          </View>
        ))}

        {/* Footer tip */}
        <View style={styles.tip}>
          <Ionicons name="flash-outline" size={16} color={C.accentGold} />
          <Text style={styles.tipText}>
            Rooms are invite-only — you need a link or code from a host to join.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 36,
    alignItems: "center",
  },
  screenTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "DMSans_500Medium",
    fontSize: 15,
    color: C.text,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 0,
  },
  intro: {
    fontSize: 14,
    color: C.textSecondary,
    lineHeight: 22,
    marginBottom: 28,
    textAlign: "center",
    paddingHorizontal: 4,
  },
  stepWrap: {
    // wrapper so connector sits between cards cleanly
  },
  stepCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    gap: 12,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepNumberWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: "#FFFFFF",
    lineHeight: 14,
  },
  stepIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: `${C.tint}18`,
    alignItems: "center",
    justifyContent: "center",
  },
  stepTitle: {
    fontFamily: "BarlowCondensed_700Bold",
    fontSize: 20,
    color: C.text,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    flex: 1,
  },
  stepBody: {
    fontSize: 14,
    color: C.textSecondary,
    lineHeight: 22,
  },
  connector: {
    alignItems: "center",
    paddingVertical: 4,
  },
  connectorLine: {
    width: 1,
    height: 12,
    backgroundColor: C.border,
  },
  tip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 28,
    backgroundColor: `${C.accentGold}10`,
    borderWidth: 1,
    borderColor: `${C.accentGold}30`,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 20,
  },
});
