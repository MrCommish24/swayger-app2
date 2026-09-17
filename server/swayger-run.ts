/**
 * SWAYGER RUN V1A server-side presentation gate.
 *
 * This deliberately has no persistence or gameplay behavior. The allowlist is
 * read at request time. Replit development workflows must be restarted after
 * configuration changes, and published apps must be republished (see docs).
 */
export const SWAYGER_RUN_LEAGUE_IDS_ENV = "SWAYGER_RUN_LEAGUE_IDS";

export function parseSwaygerRunLeagueIds(value: string | undefined = process.env[SWAYGER_RUN_LEAGUE_IDS_ENV]): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function isSwaygerRunEnabled(
  leagueId: string,
  value: string | undefined = process.env[SWAYGER_RUN_LEAGUE_IDS_ENV],
): boolean {
  return parseSwaygerRunLeagueIds(value).has(leagueId.trim());
}

/** Add the API presentation field without changing any domain data. */
export function addSwaygerRunFlag<T extends object>(
  response: T,
  leagueId: string,
  value: string | undefined = process.env[SWAYGER_RUN_LEAGUE_IDS_ENV],
): T & { swayger_run_enabled: boolean } {
  return { ...response, swayger_run_enabled: isSwaygerRunEnabled(leagueId, value) };
}