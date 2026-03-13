import { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import Colors from "@/constants/colors";

export default function JoinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const params = useLocalSearchParams<{ code?: string }>();

  const [code, setCode] = useState(params.code ? params.code.toUpperCase() : "");
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (params.code && params.code.trim().length >= 4) {
      const trimmed = params.code.trim().toUpperCase();
      setCode(trimmed);
      const timer = setTimeout(() => {
        router.push(`/invite/${trimmed}`);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [params.code]);

  function handleSubmitCode() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) return;
    router.push(`/invite/${trimmed}`);
  }

  function handleBarCodeScanned({ data }: { data: string }) {
    setScanning(false);
    let scannedCode = data.trim().toUpperCase();
    if (scannedCode.startsWith("SWAYGER:")) {
      scannedCode = scannedCode.replace("SWAYGER:", "");
    }
    if (scannedCode.length >= 4) {
      router.push(`/invite/${scannedCode}`);
    }
  }

  function handleStartScan() {
    if (Platform.OS === "web") return;
    if (!permission?.granted) {
      requestPermission().then((result) => {
        if (result.granted) setScanning(true);
      });
    } else {
      setScanning(true);
    }
  }

  async function handleOpenSettings() {
    if (Platform.OS !== "web") {
      try {
        const { Linking } = await import("react-native");
        Linking.openSettings();
      } catch {}
    }
  }

  if (scanning) {
    if (!permission) {
      return (
        <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
        </View>
      );
    }

    if (!permission.granted) {
      const showSettings = permission.status === "denied" && !permission.canAskAgain;
      return (
        <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}>
          <View style={styles.scanHeader}>
            <Pressable style={styles.backButton} onPress={() => setScanning(false)}>
              <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.scanTitle}>Camera Permission</Text>
          </View>
          <View style={styles.centered}>
            <Ionicons name="camera-outline" size={48} color={Colors.dark.tint} />
            <Text style={styles.permissionText}>Camera access is needed to scan QR codes.</Text>
            {showSettings ? (
              <Pressable
                style={({ pressed }) => [styles.joinButton, pressed && styles.btnPressed]}
                onPress={handleOpenSettings}
              >
                <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
                <Text style={styles.joinButtonText}>Open Settings</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.joinButton, pressed && styles.btnPressed]}
                onPress={() => requestPermission()}
              >
                <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
                <Text style={styles.joinButtonText}>Allow Camera</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setScanning(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}>
        <View style={styles.scanHeader}>
          <Pressable style={styles.backButton} onPress={() => setScanning(false)}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.scanTitle}>Scan QR Code</Text>
        </View>
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleBarCodeScanned}
          />
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame} />
          </View>
        </View>
        <Text style={styles.scanHint}>Point at a Swayger QR code</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.title}>Join Swayger</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.codeSection}>
          <Ionicons name="keypad-outline" size={32} color={Colors.dark.tint} />
          <Text style={styles.sectionLabel}>Enter Invite Code</Text>
          <TextInput
            style={styles.codeInput}
            placeholder="e.g. ABC123"
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            onSubmitEditing={handleSubmitCode}
            returnKeyType="go"
          />
          <Pressable
            style={({ pressed }) => [
              styles.joinButton,
              pressed && styles.btnPressed,
              code.trim().length < 4 && styles.btnDisabled,
            ]}
            onPress={handleSubmitCode}
            disabled={code.trim().length < 4}
          >
            <Ionicons name="enter-outline" size={20} color="#FFFFFF" />
            <Text style={styles.joinButtonText}>Look Up Swayger</Text>
          </Pressable>
        </View>

        {Platform.OS !== "web" && (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={({ pressed }) => [styles.scanButton, pressed && styles.btnPressed]}
              onPress={handleStartScan}
            >
              <Ionicons name="qr-code-outline" size={24} color={Colors.dark.tint} />
              <Text style={styles.scanButtonText}>Scan QR Code</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 24 },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.surface,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 24, fontWeight: "bold" as const, color: Colors.dark.text },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 24, gap: 32 },
  codeSection: { alignItems: "center", gap: 16 },
  sectionLabel: { fontSize: 16, fontWeight: "600" as const, color: Colors.dark.textSecondary },
  codeInput: {
    backgroundColor: Colors.dark.surface, borderWidth: 1, borderColor: Colors.dark.border,
    borderRadius: 14, paddingHorizontal: 20, paddingVertical: 16, fontSize: 24, color: Colors.dark.text,
    textAlign: "center", letterSpacing: 6, fontWeight: "bold" as const, width: "100%", maxWidth: 280,
  },
  joinButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.dark.accent, paddingVertical: 16, borderRadius: 12, width: "100%", maxWidth: 280,
  },
  joinButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" as const },
  btnPressed: { opacity: 0.8 },
  btnDisabled: { opacity: 0.5 },
  divider: { flexDirection: "row", alignItems: "center", gap: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.dark.border },
  dividerText: { fontSize: 14, fontWeight: "600" as const, color: Colors.dark.tabIconDefault },
  scanButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.dark.surface, borderWidth: 1, borderColor: Colors.dark.tint,
    paddingVertical: 18, borderRadius: 14,
  },
  scanButtonText: { fontSize: 16, fontWeight: "600" as const, color: Colors.dark.tint },
  scanHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 24 },
  scanTitle: { fontSize: 20, fontWeight: "bold" as const, color: Colors.dark.text },
  cameraContainer: { flex: 1, position: "relative", marginHorizontal: 24, borderRadius: 16, overflow: "hidden" },
  camera: { flex: 1 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  scanFrame: {
    width: 220, height: 220, borderWidth: 3, borderColor: Colors.dark.tint,
    borderRadius: 20, backgroundColor: "transparent",
  },
  scanHint: { textAlign: "center", color: Colors.dark.textSecondary, fontSize: 14, padding: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 40 },
  permissionText: { fontSize: 15, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 22 },
  cancelText: { fontSize: 14, color: Colors.dark.tabIconDefault, marginTop: 8 },
});
