/**
 * lib/use-fantasy-guest-token.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Generates and persists a durable per-device guest token for Fantasy seat
 * claims. Stored in AsyncStorage under STORAGE_KEY so it survives app restarts
 * on the same device.
 *
 * Design:
 *   • Token is generated once per device install and never changes.
 *   • Authenticated users get user_id claims instead — this token is only
 *     used when the user has NOT signed in.
 *   • Cross-device recognition requires a Swayger account (by design).
 *   • The token is NOT a security credential — it's opaque to the user and
 *     is only meaningful within fantasy_member_claims.
 *
 * Token format: "fgt_<32 hex chars>" (fgt = Fantasy Guest Token)
 * AsyncStorage key: "fantasy_guest_token"
 */

import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "fantasy_guest_token";

/** Generate a cryptographically-random guest token. */
function generateGuestToken(): string {
  const prefix = "fgt_";
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return prefix + Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback (older environments)
  return (
    prefix +
    Math.random().toString(36).slice(2).padEnd(8, "0") +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2).padEnd(8, "0")
  );
}

interface FantasyGuestTokenState {
  /** The durable guest token, or null while loading from storage. */
  guestToken: string | null;
  /** True until the token has been read (or generated) from AsyncStorage. */
  guestTokenLoading: boolean;
}

/**
 * Returns the device's durable Fantasy guest token.
 * Generates one on first use and persists it in AsyncStorage.
 */
export function useFantasyGuestToken(): FantasyGuestTokenState {
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [guestTokenLoading, setGuestTokenLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let token = await AsyncStorage.getItem(STORAGE_KEY);
        if (!token) {
          token = generateGuestToken();
          await AsyncStorage.setItem(STORAGE_KEY, token);
        }
        if (!cancelled) setGuestToken(token);
      } catch {
        // AsyncStorage unavailable (e.g. Expo web without storage polyfill).
        // Generate an in-memory token — it won't survive page reload but
        // prevents a hard failure.
        if (!cancelled) setGuestToken(generateGuestToken());
      } finally {
        if (!cancelled) setGuestTokenLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { guestToken, guestTokenLoading };
}
