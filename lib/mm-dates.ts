// ─── March Madness 2026 — Round date utilities ────────────────────────────────
// Pure date/time logic with NO external imports so it can be safely used
// on both the frontend (React Native) and the backend (Node/tsx) without
// pulling in react-native or supabase.

// Per-round lock dates for special picks (upset / blowout / high-scorer)
export const ROUND_LOCK_DATES: Record<string, string> = {
  "first-four":   "2026-03-17T12:00:00-05:00",
  "round-64":     "2026-03-19T11:00:00-05:00",
  "round-32":     "2026-03-21T12:00:00-05:00",
  "sweet-16":     "2026-03-26T18:00:00-05:00",  // 6pm CDT Mar 26, first tip 6:10pm CDT
  "elite-8":      "2026-03-28T12:00:00-05:00",
  "final-four":   "2026-04-04T18:00:00-05:00",
};

// When a round's picks first become available to make.
export const ROUND_PICKS_OPEN_DATES: Record<string, string> = {
  "round-64":      "2026-03-19T11:00:00-05:00",
  "round-32":      "2026-03-21T00:00:00-05:00",
  "sweet-16":      "2026-03-22T00:00:00-05:00",  // open now (backdated so it's definitely past)
  "elite-8":       "2026-03-28T06:00:00-05:00",
  "final-four":    "2026-04-03T00:00:00-05:00",
  "championship":  "2026-04-05T00:00:00-05:00",
};

// Bracket locked takes lock before the tournament starts
export const BRACKET_LOCK_DATE = "2026-03-19T11:00:00-05:00";

export function isPicksLocked(): boolean {
  return new Date() >= new Date(BRACKET_LOCK_DATE);
}

export function isRoundLocked(roundId: string): boolean {
  const lockDate = ROUND_LOCK_DATES[roundId];
  if (!lockDate) return true;
  return new Date() >= new Date(lockDate);
}

export function getRoundLockDate(roundId: string): Date | null {
  const lockDate = ROUND_LOCK_DATES[roundId];
  return lockDate ? new Date(lockDate) : null;
}

const PICKS_ROUND_ORDER = [
  "round-64", "round-32", "sweet-16", "elite-8", "final-four", "championship",
];

export function getActivePicksRoundId(_unused?: string): string {
  const now = Date.now();
  let result = PICKS_ROUND_ORDER[0];

  for (let i = 0; i < PICKS_ROUND_ORDER.length; i++) {
    const r = PICKS_ROUND_ORDER[i];

    const openDateStr = ROUND_PICKS_OPEN_DATES[r];
    if (openDateStr && now < new Date(openDateStr).getTime()) {
      break;
    }

    result = r;

    if (!isRoundLocked(r)) break;

    const next = PICKS_ROUND_ORDER[i + 1];
    if (!next) break;
    const nextOpenStr = ROUND_PICKS_OPEN_DATES[next];
    if (!nextOpenStr || now < new Date(nextOpenStr).getTime()) {
      break;
    }
  }

  return result;
}
