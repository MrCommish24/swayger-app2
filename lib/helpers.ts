import { Alert, Platform } from "react-native";
import { emitToast } from "@/lib/toast-emitter";

export function showError(message: string) {
  if (Platform.OS === "web") {
    emitToast("Error", message, "error");
  } else {
    Alert.alert("Error", message);
  }
}

export function showMessage(title: string, message: string) {
  if (Platform.OS === "web") {
    emitToast(title, message, title.toLowerCase().includes("error") ? "error" : "success");
  } else {
    Alert.alert(title, message);
  }
}

export function formatDate(dateString: string | null): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(dateString: string | null): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function validateUsername(username: string): string | null {
  if (username.length < 3) return "Username must be at least 3 characters";
  if (username.length > 20) return "Username must be 20 characters or less";
  if (!/^[a-z0-9_]+$/.test(username))
    return "Only lowercase letters, numbers, and underscores";
  return null;
}
