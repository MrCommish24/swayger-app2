/** Only anonymous web visitors at the exact root get marketing.
 * Never apply this rule to invite, callback, gameplay, or native routes.
 */
export function isPublicHomepage(platform: string, pathname: string, hasSession: boolean): boolean {
  return platform === "web" && pathname === "/" && !hasSession;
}

/** Presentation only: do not alter session state or auth return destinations. */
export function homepageAccountLink(hasSession: boolean) {
  return hasSession
    ? { label: "Dashboard", href: "/" }
    : { label: "Sign In", href: "/auth" };
}

export type HomepageExperienceId = "game-day" | "fantasy" | "1v1";

export interface HomepageExperienceChoice {
  id: HomepageExperienceId;
  title: string;
  href: string;
  action: string;
  description: string;
}

/** Use only existing entry points; invite links continue through their own routes. */
export function homepageExperienceChoices(hasSession: boolean): HomepageExperienceChoice[] {
  return [
    {
      id: "game-day",
      title: "Game Day",
      href: "/gameday",
      action: "Open Game Day",
      description: hasSession
        ? "Open your Game Day home. Join a room from your host’s link."
        : "Room invites still open directly for guest play. Game Day home asks you to sign in.",
    },
    {
      id: "fantasy",
      title: "Fantasy",
      href: hasSession ? "/fantasy/setup" : "/auth",
      action: hasSession ? "Set up Fantasy" : "Sign in for Fantasy",
      description: hasSession
        ? "Create a league, or open a commissioner’s invite to join."
        : "Join from a league invite, including as a guest. Sign in to create a league.",
    },
    {
      id: "1v1",
      title: "1v1",
      href: hasSession ? "/(tabs)/create" : "/auth",
      action: hasSession ? "Create a 1v1" : "Sign in for 1v1",
      description: hasSession
        ? "Create a new challenge. Existing invites keep their preview and acceptance flow."
        : "Challenge invites still open for preview. Sign in to create or accept a challenge.",
    },
  ];
}

export const PUBLIC_SITE_ORIGIN = "https://www.swayger.app";
export const PUBLIC_HOME_TITLE = "Swayger — Make sports talk competitive.";
export const PUBLIC_HOME_DESCRIPTION =
  "Make your picks. Prove your takes. Keep the receipts. The competitive prediction layer for sports communities. Play Game Day, Fantasy, and 1v1.";
