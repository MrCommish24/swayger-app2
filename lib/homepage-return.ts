import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { peekPendingInvite } from "@/lib/pending-invite";
import { HOMEPAGE_RETURN_KEY, saveHomepageReturn, takeHomepageReturn, clearHomepageOrganizerReturn } from "@/lib/homepage-return-state";

const hasPendingInvite = async () => !!(await peekPendingInvite())?.code;

/** Explicitly switching to Play must not resume an earlier organizer action.
 * Let storage errors reach the UI instead of silently retaining that action.
 */
export async function prepareHomepagePlay(): Promise<void> {
  if (Platform.OS !== "web") return;
  await clearHomepageOrganizerReturn(AsyncStorage);
}

/** Called only by explicit anonymous organizer actions, never by guest/invite links. */
export async function prepareHomepageReturn(destination: string): Promise<void> {
  if (Platform.OS !== "web") return;
  await saveHomepageReturn(AsyncStorage, destination, hasPendingInvite);
}

/** Existing auth returns and invitations always win. Native startup is unchanged. */
export async function consumeHomepageReturn(): Promise<string | null> {
  if (Platform.OS !== "web") return null;
  try {
    return await takeHomepageReturn(AsyncStorage, hasPendingInvite);
  } catch {
    console.warn("[homepage] Saved organizer destination could not be restored");
    return null;
  }
}

/** An explicit invite or existing auth return supersedes the marketing choice. */
export async function discardHomepageReturn(): Promise<void> {
  if (Platform.OS !== "web") return;
  try {
    await AsyncStorage.removeItem(HOMEPAGE_RETURN_KEY);
  } catch {
    console.warn("[homepage] Superseded organizer destination could not be cleared");
  }
}
