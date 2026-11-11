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
  returnTo?: string;
}

/** Organizer entry points only. Participant invites retain their own routes. */
export function homepageExperienceChoices(hasSession: boolean, _intent: "organize" = "organize"): HomepageExperienceChoice[] {
  return [
    {
      id: "game-day",
      title: "Game Day",
      href: hasSession ? "/gameday/create" : "/auth",
      returnTo: hasSession ? undefined : "/gameday/create",
      action: hasSession ? "Check host access" : "Sign in to check host access",
      description: "Create a room only if your account has Game Day host access. Sign in to check; if access is unavailable, join from a host’s invite instead.",
    },
    {
      id: "fantasy",
      title: "Fantasy",
      href: hasSession ? "/fantasy/setup" : "/auth",
      returnTo: hasSession ? undefined : "/fantasy/setup",
      action: hasSession ? "Set up Fantasy" : "Sign in for Fantasy",
      description: "Commissioners set up a league, invite members, and confirm results. Joining an existing league? Use your commissioner’s invite.",
    },
    {
      id: "1v1",
      title: "1v1",
      href: hasSession ? "/(tabs)/create" : "/auth",
      returnTo: hasSession ? undefined : "/(tabs)/create",
      action: hasSession ? "Create a 1v1" : "Sign in for 1v1",
      description: "Create a sports prediction challenge and invite a friend. Have an invite already? Open it to preview the challenge.",
    },
  ];
}

export const PUBLIC_SITE_ORIGIN = "https://www.swayger.app";
export const PUBLIC_HOME_TITLE = "Swayger — Make sports talk competitive.";
export const PUBLIC_HOME_DESCRIPTION =
  "Make your picks. Prove your takes. Keep the receipts. The competitive prediction layer for sports communities. Play Game Day, Fantasy, and 1v1.";
