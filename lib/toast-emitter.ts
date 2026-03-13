type ToastListener = (title: string, message: string, type: "error" | "success" | "info") => void;

let listener: ToastListener | null = null;

export function setToastListener(fn: ToastListener) {
  listener = fn;
}

export function emitToast(title: string, message: string, type: "error" | "success" | "info" = "info") {
  if (listener) {
    listener(title, message, type);
  } else {
    console.warn("[toast]", title, message);
  }
}
