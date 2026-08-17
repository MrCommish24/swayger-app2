/**
 * lib/bulk-import-parser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic client-side parser for the Paste League Roster flow.
 *
 * Parsing order per line (after splitting on newline):
 *   1. TAB  — split on first tab
 *   2. PIPE — split on first |
 *   3. COMMA — split on first comma  (team name may contain further commas)
 *   4. else — row is incomplete (only one field found)
 *
 * Trims both fields.  Ignores blank lines.  Windows \r\n handled.
 */

export interface ParsedRow {
  /** Stable local key for React lists */
  id: string;
  display_name: string;
  team_name: string;
  /** Missing display_name */
  nameError: string | null;
  /** Missing team_name */
  teamError: string | null;
  /** Case-insensitive duplicate display_name within this paste */
  dupNameWarning: string | null;
  /** Case-insensitive duplicate team_name within this paste */
  dupTeamWarning: string | null;
  /** display_name matches an existing league member (case-insensitive) */
  existingNameWarning: boolean;
  /** team_name matches an existing league team (case-insensitive) */
  existingTeamWarning: boolean;
  /** This row looks like the commissioner's own entry */
  commissionerMatch: boolean;
}

/**
 * Parse a block of pasted text into candidate rows.
 * Does NOT yet compare against existing league data — call
 * `applyExistingLeagueFlags` after to layer in those warnings.
 */
export function parsePasteText(raw: string): ParsedRow[] {
  // Normalise line endings
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  const rows: ParsedRow[] = [];
  let idCounter = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue; // ignore blank lines

    let displayName = "";
    let teamName = "";

    if (trimmed.includes("\t")) {
      const idx = trimmed.indexOf("\t");
      displayName = trimmed.slice(0, idx).trim();
      teamName    = trimmed.slice(idx + 1).trim();
    } else if (trimmed.includes("|")) {
      const idx = trimmed.indexOf("|");
      displayName = trimmed.slice(0, idx).trim();
      teamName    = trimmed.slice(idx + 1).trim();
    } else if (trimmed.includes(",")) {
      const idx = trimmed.indexOf(",");
      displayName = trimmed.slice(0, idx).trim();
      // Use the rest (after first comma) as team_name so "Team, LLC" is preserved
      teamName    = trimmed.slice(idx + 1).trim();
    } else {
      // Only one field — might be just a name with no team
      displayName = trimmed;
      teamName    = "";
    }

    rows.push({
      id:                   String(idCounter++),
      display_name:         displayName,
      team_name:            teamName,
      nameError:            displayName ? null : "Member name required",
      teamError:            teamName    ? null : "Team name required",
      dupNameWarning:       null,
      dupTeamWarning:       null,
      existingNameWarning:  false,
      existingTeamWarning:  false,
      commissionerMatch:    false,
    });
  }

  // Detect within-paste duplicates (case-insensitive)
  const nameCounts = new Map<string, number>();
  const teamCounts = new Map<string, number>();

  for (const r of rows) {
    const nk = r.display_name.toLowerCase();
    const tk = r.team_name.toLowerCase();
    nameCounts.set(nk, (nameCounts.get(nk) ?? 0) + 1);
    if (tk) teamCounts.set(tk, (teamCounts.get(tk) ?? 0) + 1);
  }

  for (const r of rows) {
    const nk = r.display_name.toLowerCase();
    const tk = r.team_name.toLowerCase();
    if (nameCounts.get(nk)! > 1) {
      r.dupNameWarning = "Possible duplicate member name";
    }
    if (tk && teamCounts.get(tk)! > 1) {
      r.dupTeamWarning = "Possible duplicate team name";
    }
  }

  return rows;
}

/**
 * Layer in warnings based on existing league data.
 * Returns a new array (does not mutate in place).
 */
export function applyExistingLeagueFlags(
  rows: ParsedRow[],
  existingDisplayNames: string[],
  existingTeamNames:    string[],
  commissionerDisplayName: string | null,
  commissionerTeamName:    string | null,
): ParsedRow[] {
  const existingNames = new Set(existingDisplayNames.map((n) => n.toLowerCase()));
  const existingTeams = new Set(existingTeamNames.map((t) => t.toLowerCase()));
  const commName = commissionerDisplayName?.toLowerCase() ?? null;
  const commTeam = commissionerTeamName?.toLowerCase() ?? null;

  return rows.map((r) => ({
    ...r,
    existingNameWarning: existingNames.has(r.display_name.toLowerCase()),
    existingTeamWarning: !!r.team_name && existingTeams.has(r.team_name.toLowerCase()),
    commissionerMatch:
      commName !== null && r.display_name.toLowerCase() === commName &&
      (commTeam === null || r.team_name.toLowerCase() === commTeam),
  }));
}

/** True when a row is valid and ready to submit */
export function rowIsValid(r: ParsedRow): boolean {
  return !r.nameError && !r.teamError;
}

/** True when a row has any warning that should be surfaced */
export function rowHasWarning(r: ParsedRow): boolean {
  return !!(
    r.dupNameWarning ||
    r.dupTeamWarning ||
    r.existingNameWarning ||
    r.existingTeamWarning ||
    r.commissionerMatch
  );
}

/** Count valid rows */
export function countValid(rows: ParsedRow[]): number {
  return rows.filter(rowIsValid).length;
}

/** Count rows with errors */
export function countErrors(rows: ParsedRow[]): number {
  return rows.filter((r) => !rowIsValid(r)).length;
}
