/** Lower priority than every existing invite, referral, or interrupted route.
 * Kept separate so callbacks cannot consume it before username setup finishes.
 */
export const HOMEPAGE_RETURN_KEY = "swayger_homepage_return";
export const EXISTING_AUTH_RETURN_KEY = "swayger_pending_auth_redirect";
export const HOMEPAGE_RETURN_MAX_AGE = 60 * 60 * 1000;
export const HOMEPAGE_RETURN_ROUTES = ["/fantasy/setup", "/(tabs)/create", "/gameday/create"] as const;

export interface ReturnStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function isHomepageReturnRoute(value: unknown): value is string {
  return typeof value === "string" && (HOMEPAGE_RETURN_ROUTES as readonly string[]).includes(value);
}

export function canResumeHomepageReturn(context: {
  web: boolean; authenticated: boolean; needsUsername: boolean; profileError: boolean; pathname: string;
}) {
  return context.web && context.authenticated && !context.needsUsername && !context.profileError &&
    ["/", "/auth", "/username-setup"].includes(context.pathname);
}

export async function saveHomepageReturn(
  storage: ReturnStorage, destination: string, hasPendingInvite: () => Promise<boolean>, now = Date.now(),
): Promise<void> {
  if (!isHomepageReturnRoute(destination)) throw new Error("Unsupported homepage destination");
  if (await hasPendingInvite() || await storage.getItem(EXISTING_AUTH_RETURN_KEY) ||
      await storage.getItem("swayger_pending_referral")) {
    await storage.removeItem(HOMEPAGE_RETURN_KEY);
    return;
  }
  await storage.setItem(HOMEPAGE_RETURN_KEY, JSON.stringify({ destination, createdAt: now }));
}

export async function takeHomepageReturn(
  storage: ReturnStorage, hasPendingInvite: () => Promise<boolean>, now = Date.now(),
): Promise<string | null> {
  const raw = await storage.getItem(HOMEPAGE_RETURN_KEY);
  if (!raw) return null;
  // Consume once, including invalid/expired intents. Never touch another flow's keys.
  await storage.removeItem(HOMEPAGE_RETURN_KEY);
  if (await hasPendingInvite() || await storage.getItem(EXISTING_AUTH_RETURN_KEY) ||
      await storage.getItem("swayger_pending_referral")) return null;
  try {
    const value = JSON.parse(raw);
    return isHomepageReturnRoute(value.destination) && typeof value.createdAt === "number" &&
      value.createdAt <= now && now - value.createdAt < HOMEPAGE_RETURN_MAX_AGE
      ? value.destination : null;
  } catch {
    return null;
  }
}
