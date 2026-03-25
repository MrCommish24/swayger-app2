import { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";

type Category = "bug" | "confusing" | "feature" | "general";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "bug", label: "Bug" },
  { key: "confusing", label: "Confusing" },
  { key: "feature", label: "Feature Request" },
  { key: "general", label: "General" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  trigger?: string;
  defaultCategory?: Category;
}

export default function FeedbackSheet({ visible, onClose, trigger, defaultCategory = "general" }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function reset() {
    setCategory(defaultCategory);
    setMessage("");
    setDone(false);
    setSubmitting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    try {
      await supabase.from("feedback_submissions").insert({
        user_id: user?.id ?? null,
        email: user?.email ?? null,
        category,
        message: message.trim(),
        trigger: trigger ?? "profile",
      });
      setDone(true);
      setTimeout(() => handleClose(), 1600);
    } catch {
      handleClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.sheetWrapper}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Send Feedback</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>

          {done ? (
            <View style={styles.doneState}>
              <Ionicons name="checkmark-circle" size={44} color="#22C55E" />
              <Text style={styles.doneText}>Thanks, we got it.</Text>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.helper}>
                What's working, what's confusing, or what should we add?
              </Text>

              <View style={styles.chips}>
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat.key}
                    style={[styles.chip, category === cat.key && styles.chipActive]}
                    onPress={() => setCategory(cat.key)}
                  >
                    <Text style={[styles.chipText, category === cat.key && styles.chipTextActive]}>
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                style={styles.textArea}
                placeholder="Your feedback..."
                placeholderTextColor={Colors.dark.tabIconDefault}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                value={message}
                onChangeText={setMessage}
                maxLength={1000}
                editable={!submitting}
              />

              <Pressable
                style={[styles.submitBtn, (!message.trim() || submitting) && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!message.trim() || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitText}>Submit</Text>
                )}
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheetWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: Colors.dark.border,
    maxHeight: "85%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  helper: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surfaceLight,
  },
  chipActive: {
    borderColor: Colors.dark.tint,
    backgroundColor: `${Colors.dark.tint}18`,
  },
  chipText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  chipTextActive: {
    color: Colors.dark.tint,
    fontWeight: "600",
  },
  textArea: {
    backgroundColor: Colors.dark.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 10,
    padding: 14,
    color: Colors.dark.text,
    fontSize: 14,
    minHeight: 110,
    marginBottom: 16,
  },
  submitBtn: {
    backgroundColor: Colors.dark.tint,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  doneState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 14,
  },
  doneText: {
    fontSize: 17,
    fontWeight: "600",
    color: Colors.dark.text,
  },
});
