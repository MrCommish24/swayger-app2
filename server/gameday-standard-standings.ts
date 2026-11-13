export type StandardStandingScore = {
  participant_id: string;
  game_day_sp: number;
  correct_picks: number;
  [key: string]: unknown;
};

export function isStandardGameDayScoringRoom(room: {
  experience_type?: string | null;
  sport?: string | null;
  template_type?: string | null;
  format_config?: unknown;
}): boolean {
  return (room.experience_type == null || room.experience_type === "game_day") &&
    room.format_config == null &&
    !(room.sport === "madden" && room.template_type === "weekly_pick_card");
}

/**
 * Soccer's penalties card is conditional. A finalized room may have left the
 * unused phase open; it is not a missing result unless somebody picked there.
 * Other unsettled phases, and any picked penalties card, remain required.
 */
export function standardGameDayScoringProps<T extends { id: string }>(
  room: { sport?: string | null; status?: string | null },
  cards: Array<{
    phase?: string | null;
    status?: string | null;
    gameday_props?: Array<{ id: string }> | null;
  }>,
  playableProps: T[],
  picks: Array<{ prop_id: string }>,
): T[] {
  if (room.sport !== "soccer" || room.status !== "finalized") return playableProps;
  const pickedIds = new Set(picks.map((pick) => pick.prop_id));
  const unusedPenaltyIds = new Set(cards
    .filter((card) => card.phase === "penalties" && card.status !== "settled" &&
      !(card.gameday_props ?? []).some((prop) => pickedIds.has(prop.id)))
    .flatMap((card) => (card.gameday_props ?? []).map((prop) => prop.id)));
  return playableProps.filter((prop) => !unusedPenaltyIds.has(prop.id));
}

/**
 * Standard Game Day uses correct picks × 10 SP, with no tiebreaker.
 * Competition ranks skip positions after ties (1, 1, 3). Winners are all
 * participants tied for first, but only after finalization and settlement.
 * Madden Pick Cards and Fantasy must use their own scoring rules.
 */
export function rankStandardGameDayStandings<T extends StandardStandingScore>(
  scores: T[],
  winnerDetermined: boolean,
): Array<T & { rank: number; is_winner: boolean }> {
  const sorted = [...scores].sort(
    (a, b) =>
      b.game_day_sp - a.game_day_sp ||
      b.correct_picks - a.correct_picks ||
      a.participant_id.localeCompare(b.participant_id),
  );
  let rank = 1;
  return sorted.map((score, index) => {
    if (index > 0 && score.game_day_sp < sorted[index - 1].game_day_sp) {
      rank = index + 1;
    }
    return {
      ...score,
      rank,
      is_winner: winnerDetermined && rank === 1,
    };
  });
}
