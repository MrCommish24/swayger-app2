/**
 * gameday-normalize.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical normalization utilities for Game Day global settlement grouping.
 *
 * ── Event-date normalization ──────────────────────────────────────────────────
 * All dates are stored and compared as YYYY-MM-DD strings representing the
 * local game date. The normalizeDate() function accepts ISO strings (with or
 * without a time component) and Date objects, always returning only the date
 * portion. Dates stored in gameday_rooms.game_date are already in YYYY-MM-DD
 * format; ISO timestamps (e.g. created_at) are sliced to the date portion.
 * A null/missing game_date marks the room as ineligible for bulk grouping.
 * No UTC conversion is performed — we treat dates as local game dates.
 *
 * ── Team pair normalization ───────────────────────────────────────────────────
 * Team names are downcased, stripped of common organization suffixes (FC, SC,
 * United, City, University, etc.) and non-alphanumeric characters, then
 * whitespace-collapsed. The pair is sorted lexicographically before joining,
 * so "Celtics|Knicks" and "Knicks|Celtics" produce the same event key.
 *
 * ── Question normalization ────────────────────────────────────────────────────
 * Question text is lowercased and all non-alphanumeric characters replaced with
 * spaces, then whitespace-collapsed. Minor formatting differences (punctuation,
 * extra spaces) between rooms are ignored during grouping.
 *
 * ── Answer-option normalization ───────────────────────────────────────────────
 * Stored answer strings may embed team names or player names. The canonical
 * form lowercases, strips punctuation, and collapses whitespace. Options are
 * sorted before joining into the group key. At settlement time the operator
 * supplies a canonical answer string; mapNormalizedToStored() maps it back to
 * the exact stored string in each prop via three passes (exact, prefix,
 * substring). No prop is settled unless a stored match is found for its options.
 *
 * ── Group key schema ──────────────────────────────────────────────────────────
 * event_key = sport "|" sorted_team_pair "|" game_date
 * group_key = event_key "|" phase "|" normalized_question "|" sorted_normalized_options
 *
 * A null sport or null game_date produces a null event_key. Rooms with a null
 * event_key are legacy rooms and are never included in bulk settlement groups.
 */

// ─── Text primitives ──────────────────────────────────────────────────────────

/** Base normalization: lowercase, trim, collapse all whitespace to a single space. */
export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Normalize a team name for event-key grouping.
 * Strips common organization words, removes non-alphanumeric characters,
 * collapses whitespace. Keeps digits (years, numerals in proper nouns).
 *
 * Examples:
 *   "Boston Celtics"        → "boston celtics"
 *   "Manchester United FC"  → "manchester"          (United, FC stripped)
 *   "St. Louis City SC"     → "louis"               (St., City, SC stripped)
 *   "Oklahoma State"        → "oklahoma"            (State stripped)
 */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(university|college|state|st\.?|the|of|at|fc|sc|united|city|cf|afc|bfc|athletic|athletics)\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Produce a canonical sorted team-pair string.
 * Sorting ensures reversal of team_a / team_b does not create a different key.
 *
 * Example: ("Knicks", "Celtics") === ("Celtics", "Knicks") → "boston celtics|knicks"
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
 *   - "YYYY-MM-DD" string   → returned as-is
 *   - ISO 8601 timestamp    → date portion sliced off
 *   - Date object           → toISOString().slice(0, 10)
 *   - null / undefined / "" → returns null (room is ineligible for bulk grouping)
 */
export function normalizeDate(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  return null;
}

/**
 * Normalize a question string for grouping.
 * Replaces all non-alphanumeric characters with spaces, collapses whitespace.
 * Minor formatting differences (punctuation, capitalisation) collapse to the
 * same normalized form.
 */
export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize a single answer option for grouping.
 * Same treatment as normalizeQuestion — strips punctuation, lowercases,
 * collapses whitespace.
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
 * Example: ["Boston Celtics", "New York Knicks"]
 *       → "boston celtics||new york knicks"
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
 *   event_key = sport "|" sorted_normalized_team_pair "|" game_date
 *
 * Returns null when sport or game_date is missing — these rooms are legacy
 * rooms and must be settled individually, never in a bulk group.
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
 *   group_key = event_key "|" phase "|" normalized_question "|" sorted_normalized_options
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

// ─── Answer mapping ───────────────────────────────────────────────────────────

/**
 * Map a normalized canonical answer value back to the exact stored string in
 * a prop's answer_options array. This is the authoritative translation point —
 * the rest of the settlement pipeline uses the returned stored string, never
 * the normalized form.
 *
 * Three-pass matching (most-specific first):
 *   Pass 1 — Exact normalized match:  normalize(stored) === normalize(answer)
 *   Pass 2 — Prefix match:            normalize(stored).startsWith(normalize(answer))
 *   Pass 3 — Substring match:         normalize(stored).includes(normalize(answer))
 *
 * Returns null when no stored option can be matched. Callers must exclude
 * that prop from bulk settlement and flag it individually.
 */
export function mapNormalizedToStored(
  normalizedAnswer: string,
  storedOptions: string[]
): string | null {
  const normA = normalizeAnswerOption(normalizedAnswer);

  // Pass 1: exact normalized match
  for (const opt of storedOptions) {
    if (normalizeAnswerOption(opt) === normA) return opt;
  }
  // Pass 2: stored option starts with the normalized answer
  for (const opt of storedOptions) {
    if (normalizeAnswerOption(opt).startsWith(normA)) return opt;
  }
  // Pass 3: normalized answer is contained in the stored option
  for (const opt of storedOptions) {
    if (normalizeAnswerOption(opt).includes(normA)) return opt;
  }
  return null;
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
