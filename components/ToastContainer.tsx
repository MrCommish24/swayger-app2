import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setToastListener } from "@/lib/toast-emitter";
import Colors from "@/constants/colors";

interface ToastItem {
  id: number;
  title: string;
  message: string;
  type: "error" | "success" | "info";
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const insets = useSafeAreaInsets();
  const idRef = useRef(0);

  useEffect(() => {
    setToastListener((title, message, type) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, title, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    });
  }, []);

  if (toasts.length === 0) return null;

  const topOffset = Platform.OS === "web" ? 67 : insets.top + 8;

  return (
    <View style={[styles.container, { top: topOffset }]} pointerEvents="none">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </View>
  );
}

function ToastCard({ toast }: { toast: ToastItem }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(3200),
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const bgColor =
    toast.type === "error"
      ? "#7f1d1d"
      : toast.type === "success"
      ? "#14532d"
      : "#1e3a5f";

  const borderColor =
    toast.type === "error"
      ? "#ef4444"
      : toast.type === "success"
      ? "#22c55e"
      : Colors.dark.tint;

  return (
    <Animated.View style={[styles.toast, { backgroundColor: bgColor, borderLeftColor: borderColor, opacity }]}>
      {toast.title ? <Text style={styles.title}>{toast.title}</Text> : null}
      <Text style={styles.message}>{toast.message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    borderRadius: 12,
    borderLeftWidth: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    color: "#ffffff",
    fontWeight: "700" as const,
    fontSize: 14,
    marginBottom: 2,
  },
  message: {
    color: "#e2e8f0",
    fontSize: 14,
    lineHeight: 20,
  },
});
