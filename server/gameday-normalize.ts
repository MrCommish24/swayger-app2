/**
 * gameday-normalize.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical normalization utilities for Game Day global settlement grouping.
 * This is the single source of truth for all text normalization used in the
 * settlement pipeline. No calling code should re-implement any of these rules.
 *
 * ── Event-date normalization ──────────────────────────────────────────────────
 * All dates are stored and compared as YYYY-MM-DD strings representing the
 * local game date. normalizeDate() accepts ISO strings (with or without a time
 * component) and Date objects, always returning only the date portion.
 * No UTC conversion is performed — game_date is a local game date, not a
 * UTC timestamp. A null/missing game_date marks the room as ineligible for
 * bulk grouping (legacy room).
 *
 * ── Team name normalization — conservative rules ──────────────────────────────
 * Goal: collapse trivial formatting differences (case, punctuation, extra spaces)
 * without losing team identity. MUST NOT produce collisions between genuinely
 * different teams.
 *
 * Rules:
 *   1. Lowercase.
 *   2. Strip ONLY leading articles: "the ", "a ", "an " at the very start.
 *   3. Strip ONLY trailing org-type suffixes: " fc", " sc", " cf", " afc",
 *      " bfc" at the very end (soccer organization type abbreviations that are
 *      never the primary identity of the team).
 *   4. Remove all remaining non-alphanumeric characters (punctuation, dots).
 *   5. Collapse whitespace.
 *
 * What is intentionally NOT stripped (would cause collisions):
 *   "state"    — "Oklahoma State" ≠ "Oklahoma"
 *   "united"   — "Manchester United" ≠ "Manchester City"
 *   "city"     — "Manchester City" ≠ "Manchester United"
 *   "st"       — "St. Louis" is a city, part of team identity
 *   "national" — "Team National" ≠ "Team"
 *   "athletic" / "athletics" — "Athletic Bilbao" identity, "Oakland Athletics"
 *   "university" / "college" — not stripped here; city suffix is the identity
 *
 * Collision verification (see gameday-normalize.test.ts):
 *   "Manchester United FC" → "manchester united"  ≠
 *   "Manchester City FC"   → "manchester city"
 *
 *   "Oklahoma State" → "oklahoma state"  ≠
 *   "Oklahoma"       → "oklahoma"
 *
 * ── Question normalization ────────────────────────────────────────────────────
 * Lowercase, replace all non-alphanumeric characters with spaces, collapse
 * whitespace. Minor punctuation and capitalisation differences between rooms
 * are ignored. The question text is a rendered string (placeholders substituted
 * at room creation time), so player and team names are embedded — they are
 * treated as opaque text for grouping, not parsed.
 *
 * ── Answer-option normalization ───────────────────────────────────────────────
 * Same treatment as question text. Options are sorted before joining into the
 * group key so option order within a prop does not affect grouping.
 *
 * ── mapNormalizedToStored — exact match only ──────────────────────────────────
 * When the admin selects a canonical answer at settlement time, this function
 * maps it back to the exact stored string in each prop's answer_options.
 *
 * ONLY two passes are allowed:
 *   Pass 1 — Exact stored match:    storedOption === answer  (string identity)
 *   Pass 2 — Exact normalized match: normalize(storedOption) === normalize(answer)
 *
 * Prefix and substring matching have been REMOVED. They produce ambiguous results
 * when multiple stored options share a common prefix or substring (e.g. "Yes -
 * First Half" and "Yes - Second Half" both match "Yes" as a prefix). If neither
 * exact pass matches, the function returns null and the prop is flagged as
 * requiring individual settlement. Callers must treat null as a hard block.
 *
 * ── Group key schema ──────────────────────────────────────────────────────────
 *   event_key = sport "|" sorted_normalized_team_pair "|" game_date
 *   group_key = event_key "|" phase "|" normalized_question "|" sorted_normalized_options
 *
 * Null sport or null game_date → null event_key → legacy room, never bulk-settled.
 *
 * ── Ambiguous options ─────────────────────────────────────────────────────────
 * detectAmbiguousOptions() checks whether any two stored options within a single
 * prop's option list normalize to the same canonical form. If they do, the
 * group's answer_map is ambiguous and the group is blocked from bulk settlement.
 * This is separate from cross-prop normalization drift; it applies to a single
 * prop's own option set.
 */

// ─── Text primitives ──────────────────────────────────────────────────────────

/** Base normalization: lowercase, trim, collapse all whitespace to a single space. */
export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Normalize a team name for event-key grouping.
 *
 * Conservative rules — see module header for the full rationale and collision
 * verification. Only trivial formatting differences are collapsed; no identity
 * terms are removed.
 *
 * Examples (see tests for the full collision matrix):
 *   "Boston Celtics"        → "boston celtics"
 *   "The Golden State Warriors" → "golden state warriors"  (leading "the" stripped)
 *   "Manchester United FC"  → "manchester united"          (trailing "fc" stripped)
 *   "Manchester City FC"    → "manchester city"            (trailing "fc" stripped — NOT "manchester")
 *   "Oklahoma State"        → "oklahoma state"             ("state" kept — NOT "oklahoma")
 *   "Real Madrid CF"        → "real madrid"                (trailing "cf" stripped)
 *   "St. Louis Blues"       → "st louis blues"             (dot removed, "st" kept)
 */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    // Strip leading articles only — never anything that could be identity
    .replace(/^(the|a|an)\s+/, "")
    // Strip trailing soccer org-type suffixes only (at end of string)
    .replace(/\s+(f\.?c\.?|s\.?c\.?|c\.?f\.?|a\.?f\.?c\.?|b\.?f\.?c\.?)$/, "")
    // Remove all remaining non-alphanumeric characters (keeps spaces and digits)
    .replace(/[^a-z0-9\s]/g, " ")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Produce a canonical sorted team-pair string.
 * Sorting ensures reversal of team_a / team_b does not create a different event key.
 *
 * Examples:
 *   ("New York Knicks", "Boston Celtics") → "boston celtics|new york knicks"
 *   ("Boston Celtics", "New York Knicks") → "boston celtics|new york knicks"  ← same
 */
export function normalizeTeamPair(teamA: string, teamB: string): string {
  const a = normalizeTeamName(teamA);
  const b = normalizeTeamName(teamB);
  return [a, b].sort().join("|");
}

/**
 * Canonical date string: always "YYYY-MM-DD", no time, no UTC conversion.
 *
 * Accepts:
 *   - "YYYY-MM-DD" string         → returned as-is
 *   - ISO 8601 timestamp string   → date portion sliced off (e.g. "2025-06-13T...Z" → "2025-06-13")
 *   - Date object                 → toISOString().slice(0, 10)
 *   - null / undefined / ""       → returns null  (room is ineligible for bulk grouping)
 *
 * Important: No UTC conversion is performed. A game played on June 13 local time
 * should be stored and compared as "2025-06-13" regardless of timezone.
 */
export function normalizeDate(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d).trim();
  if (!s) return null;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // ISO 8601 with time component
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  return null;
}

/**
 * Normalize a question string for grouping.
 * Replaces all non-alphanumeric characters with spaces, lowercases, collapses
 * whitespace. Player and team names embedded in the question are treated as
 * opaque — they are part of the normalized key without further transformation.
 *
 * Example:
 *   "Will LeBron James score 25+ points?"
 *   → "will lebron james score 25 points"
 */
export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize a single answer option for grouping and mapping.
 * Same treatment as normalizeQuestion — strips punctuation, lowercases,
 * collapses whitespace.
 *
 * Example:
 *   "Boston Celtics."  → "boston celtics"
 *   "BOSTON CELTICS"   → "boston celtics"
 */
export function normalizeAnswerOption(opt: string): string {
  return opt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Canonical sorted-options string for use in a group key.
 * Each option is individually normalized, then the array is sorted
 * lexicographically before joining with "||".
 *
 * Sorting ensures that options in a different order within different rooms
 * still produce the same group key.
 *
 * Example:
 *   ["New York Knicks", "Boston Celtics"]     → "boston celtics||new york knicks"
 *   ["Boston Celtics", "New York Knicks"]     → "boston celtics||new york knicks"  ← same
 */
export function normalizeAnswerOptions(options: string[]): string {
  return options
    .map(normalizeAnswerOption)
    .sort()
    .join("||");
}

// ─── Key builders ─────────────────────────────────────────────────────────────

/**
 * Build the event key identifying a unique real-world game.
 *
 *   event_key = normalize(sport) "|" sort(normalize(teamA), normalize(teamB)) "|" game_date
 *
 * Returns null when sport or game_date is missing. Rooms with a null event_key
 * are legacy rooms — they must be settled individually, never bulk-settled.
 */
export function buildEventKey(
  sport: string | null | undefined,
  teamA: string | null | undefined,
  teamB: string | null | undefined,
  gameDate: string | Date | null | undefined
): string | null {
  const normSport = sport ? normalizeText(sport) : null;
  const normDate = normalizeDate(gameDate);
  if (!normSport || !teamA || !teamB || !normDate) return null;
  const teamPair = normalizeTeamPair(teamA, teamB);
  return `${normSport}|${teamPair}|${normDate}`;
}

/**
 * Build the group key identifying a unique real-world question within a game.
 *
 *   group_key = event_key "|" normalize(phase) "|" normalize(question) "|" sort(normalize(options))
 *
 * All four components must be stable across rooms for the group to be safe to
 * bulk-settle. Drift in any component is surfaced as a conflict.
 */
export function buildGroupKey(
  eventKey: string,
  phase: string,
  question: string,
  answerOptions: string[]
): string {
  const normPhase = normalizeText(phase);
  const normQuestion = normalizeQuestion(question);
  const normOptions = normalizeAnswerOptions(answerOptions);
  return `${eventKey}|${normPhase}|${normQuestion}|${normOptions}`;
}

// ─── Answer mapping — exact match only ───────────────────────────────────────

/**
 * Map a canonical answer value back to the exact stored string in a prop's
 * answer_options array.
 *
 * EXACT MATCH ONLY — two passes:
 *   Pass 1 — Exact stored identity:     storedOption === answer
 *   Pass 2 — Exact normalized identity: normalize(storedOption) === normalize(answer)
 *
 * Prefix and substring matching are INTENTIONALLY EXCLUDED. They would succeed
 * ambiguously when multiple options share a common prefix or substring, which
 * is common in Game Day props (e.g. "Yes - First Half" / "Yes - Second Half"
 * both share "Yes" as a prefix). Ambiguous matches must be blocked, not guessed.
 *
 * If neither pass succeeds, returns null. The caller must treat null as a hard
 * block: the prop cannot be included in bulk settlement and must be flagged for
 * individual settlement.
 *
 * Examples:
 *   mapNormalizedToStored("Boston Celtics",  ["Boston Celtics", "New York Knicks"]) → "Boston Celtics"  ✓ pass 1
 *   mapNormalizedToStored("boston celtics.", ["Boston Celtics", "New York Knicks"]) → "Boston Celtics"  ✓ pass 2
 *   mapNormalizedToStored("Boston",          ["Boston Celtics", "New York Knicks"]) → null              ✗ blocked
 *   mapNormalizedToStored("Celtics",         ["Boston Celtics", "New York Knicks"]) → null              ✗ blocked
 */
export function mapNormalizedToStored(
  answer: string,
  storedOptions: string[]
): string | null {
  // Pass 1: exact stored string match (identity)
  for (const opt of storedOptions) {
    if (opt === answer) return opt;
  }
  // Pass 2: exact normalized match (case, punctuation, whitespace differences only)
  const normAnswer = normalizeAnswerOption(answer);
  for (const opt of storedOptions) {
    if (normalizeAnswerOption(opt) === normAnswer) return opt;
  }
  // No match — caller must block this prop from bulk settlement
  return null;
}

/**
 * Detect ambiguous options within a single prop's stored option list.
 *
 * An ambiguity occurs when two or more stored options normalize to the same
 * canonical string. In that case, mapNormalizedToStored() would always return
 * the first match, which may be the wrong option.
 *
 * Returns an array of collision descriptions (human-readable). Empty array = no
 * ambiguity, options are safe to use for bulk settlement answer selection.
 *
 * Example:
 *   detectAmbiguousOptions(["Yes.", "Yes!"])
 *   → ['Options "Yes." and "Yes!" both normalize to "yes" — ambiguous']
 *
 *   detectAmbiguousOptions(["Yes - First Half", "Yes - Second Half"])
 *   → []  (different normalized forms: "yes first half" vs "yes second half")
 */
export function detectAmbiguousOptions(options: string[]): string[] {
  const seen = new Map<string, string>(); // normalized → first stored
  const collisions: string[] = [];
  for (const opt of options) {
    const norm = normalizeAnswerOption(opt);
    if (seen.has(norm)) {
      collisions.push(
        `Options "${seen.get(norm)}" and "${opt}" both normalize to "${norm}" — ambiguous`
      );
    } else {
      seen.set(norm, opt);
    }
  }
  return collisions;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/** Human-readable game label: "Knicks vs. Celtics · Jul 30" */
export function gameLabel(
  teamA: string,
  teamB: string,
  gameDate: string | null
): string {
  const datePart = gameDate
    ? new Date(gameDate + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "Unknown date";
  return `${teamA} vs. ${teamB} · ${datePart}`;
}

/** Phase display label: "pregame" → "Pregame" */
export function phaseLabel(phase: string): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1).toLowerCase();
}
