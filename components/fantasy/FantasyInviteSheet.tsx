/**
 * FantasyInviteSheet — Phase 6F
 *
 * Reusable bottom-sheet that displays:
 *  - League name
 *  - Large QR code (dark on white for maximum scan reliability)
 *  - Share Invite button (React Native Share)
 *  - Copy Link button (expo-clipboard, 2-second feedback)
 *
 * Props
 *  leagueName  — display name shown above the QR
 *  inviteUrl   — canonical https:// invite URL; encoded in QR, shared, and copied verbatim
 *  visible     — controls Modal visibility
 *  onClose     — called when user taps Close or backdrop
 *
 * Security: inviteUrl must be the canonical join URL only.
 * It must NOT contain guest_token, recovery token, user_id, seat_id, or credentials.
 */

import React, { useState, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Share,
  Platform,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import Colors from "@/constants/colors";

const C = Colors.dark;

interface FantasyInviteSheetProps {
  leagueName: string;
  inviteUrl: string;
  visible: boolean;
  onClose: () => void;
}

export function FantasyInviteSheet({
  leagueName,
  inviteUrl,
  visible,
  onClose,
}: FantasyInviteSheetProps) {
  const [copied, setCopied]   = useState(false);
  const [sharing, setSharing] = useState(false);

  const screenWidth  = Dimensions.get("window").width;
  // Target 260 but cap to 80% of screen width on small devices
  const qrSize = Math.min(260, Math.floor(screenWidth * 0.8));
  // QR container has 20px padding each side → inner cell is qrSize × qrSize
  const qrContainerSize = qrSize + 40;

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const message =
        `Join our Swayger Fantasy league: ${leagueName}\n\n` +
        `Make your Draft Day and weekly picks and see who knows the league best.\n\n` +
        `${inviteUrl}`;
      if (Platform.OS === "ios") {
        await Share.share({ message, url: inviteUrl });
      } else {
        await Share.share({ message });
      }
    } catch {
      // User cancelled or dismissed — no-op
    } finally {
      setSharing(false);
    }
  }, [leagueName, inviteUrl, sharing]);

  const handleCopy = useCallback(async () => {
    if (copied) return;
    await Clipboard.setStringAsync(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [inviteUrl, copied]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Sheet */}
      <View style={styles.sheet}>
        {/* Drag indicator */}
        <View style={styles.dragHandle} />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Header */}
          <Text style={styles.eyebrow}>INVITE YOUR LEAGUE</Text>
          <Text style={styles.leagueName} numberOfLines={2}>{leagueName}</Text>
          <Text style={styles.tagline}>
            Scan to join Swayger Fantasy.{"\n"}
            Make your picks. See who knows the league best.
          </Text>

          {/* QR — white background for maximum contrast & scan reliability */}
          <View
            style={[
              styles.qrContainer,
              { width: qrContainerSize, height: qrContainerSize },
            ]}
            accessible
            accessibilityLabel={`QR code for joining ${leagueName}. You can also use the Copy Link or Share Invite buttons below.`}
          >
            <QRCode
              value={inviteUrl}
              size={qrSize}
              color="#111111"
              backgroundColor="#ffffff"
              quietZone={0}
            />
          </View>

          <Text style={styles.scanHint}>
            Point your phone's camera at the code.
          </Text>

          {/* Action buttons */}
          <TouchableOpacity
            style={[styles.shareBtn, sharing && styles.btnDisabled]}
            onPress={handleShare}
            disabled={sharing}
            activeOpacity={0.8}
            accessibilityLabel="Share Invite"
          >
            {sharing
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.shareBtnText}>Share Invite</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.copyBtn, copied && styles.copyBtnCopied]}
            onPress={handleCopy}
            activeOpacity={0.8}
            accessibilityLabel="Copy Invite Link"
          >
            <Text style={[styles.copyBtnText, copied && styles.copyBtnTextCopied]}>
              {copied ? "✓ Link copied!" : "Copy Link"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.orHint}>Or send the invite link directly.</Text>

          {/* Close */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.8}
            accessibilityLabel="Close"
          >
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: C.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    // Shadow for lift
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  scrollContent: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 0,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: C.textMuted,
    marginBottom: 6,
  },
  leagueName: {
    fontSize: 22,
    fontWeight: "800",
    color: C.text,
    textAlign: "center",
    marginBottom: 10,
  },
  tagline: {
    fontSize: 13,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 24,
  },
  qrContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    // Subtle shadow to float QR against dark sheet
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  scanHint: {
    fontSize: 12,
    color: C.textMuted,
    textAlign: "center",
    marginBottom: 24,
  },
  shareBtn: {
    backgroundColor: C.tint,
    borderRadius: 12,
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
    marginBottom: 10,
    minHeight: 48,
    justifyContent: "center",
  },
  shareBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  copyBtn: {
    backgroundColor: "transparent",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 13,
    width: "100%",
    alignItems: "center",
    marginBottom: 10,
    minHeight: 48,
    justifyContent: "center",
  },
  copyBtnCopied: {
    borderColor: "#22c55e",
    backgroundColor: "rgba(34,197,94,0.08)",
  },
  copyBtnText: {
    color: C.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
  copyBtnTextCopied: {
    color: "#22c55e",
  },
  orHint: {
    fontSize: 12,
    color: C.textMuted,
    marginBottom: 16,
  },
  closeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  closeBtnText: {
    color: C.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
