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

export const PUBLIC_SITE_ORIGIN = "https://www.swayger.app";
export const PUBLIC_HOME_TITLE = "Swayger — Make sports talk competitive.";
export const PUBLIC_HOME_DESCRIPTION =
  "Make your picks. Prove your takes. Keep the receipts. The competitive prediction layer for sports communities. Play Game Day, Fantasy, and 1v1.";
