/**
 * Shared presentation contract for named Swayger Moments.
 *
 * The template_prop_id is the only key used here. Published question copy and
 * answer ids stay owned by the API; this layer only adds a memorable name and
 * a short bit of settlement context.
 */
export interface WeeklyMoment {
  title: string;
  shortDefinition: string;
  prompt: string;
  settlementNote: string;
  answerTargetType: "fantasy_team" | "yes_no";
}

export const WEEKLY_MOMENTS: Record<string, WeeklyMoment> = {
  fantasy_weekly_nfl_highest_scoring_team: {
    title: "SCOREBOARD KING",
    shortDefinition: "Highest fantasy score",
    prompt: "Who will post the highest fantasy score this week?",
    settlementNote: "Fantasy team with the highest final weekly fantasy score.",
    answerTargetType: "fantasy_team",
  },
  fantasy_weekly_nfl_lowest_scoring_team: {
    title: "BASEMENT WATCH",
    shortDefinition: "Fewest fantasy points",
    prompt: "Who will finish with the fewest fantasy points this week?",
    settlementNote: "Fantasy team with the lowest final weekly fantasy score.",
    answerTargetType: "fantasy_team",
  },
  fantasy_weekly_nfl_largest_margin_winner: {
    title: "BIGGEST BLOWOUT",
    shortDefinition: "Largest-margin winner",
    prompt: "Who will deliver the biggest win of the week?",
    settlementNote: "Winning fantasy team with the largest margin of victory.",
    answerTargetType: "fantasy_team",
  },
  fantasy_weekly_nfl_smallest_margin_winner: {
    title: "ESCAPE ARTIST",
    shortDefinition: "Smallest-margin winner",
    prompt: "Who will win by the smallest margin this week?",
    settlementNote: "Winning fantasy team with the smallest margin of victory.",
    answerTargetType: "fantasy_team",
  },
  fantasy_weekly_nfl_highest_player_team: {
    title: "STAR POWER",
    shortDefinition: "Team with the top individual player",
    prompt: "Which team will roster the highest-scoring individual player this week?",
    settlementNote: "Fantasy team containing the highest-scoring individual fantasy player for the completed week.",
    answerTargetType: "fantasy_team",
  },
  fantasy_weekly_nfl_score_150_plus: {
    title: "THE 150 CLUB",
    shortDefinition: "Any team scores 150+",
    prompt: "Will anyone score 150+ fantasy points this week?",
    settlementNote: "Yes if at least one fantasy team finishes with 150.0+ points.",
    answerTargetType: "yes_no",
  },
  fantasy_weekly_nfl_matchup_under_5: {
    title: "PHOTO FINISH",
    shortDefinition: "Any matchup decided by fewer than 5",
    prompt: "Will any matchup be decided by fewer than 5 fantasy points?",
    settlementNote: "Yes if at least one completed matchup has an absolute final margin below 5.0 fantasy points.",
    answerTargetType: "yes_no",
  },
  fantasy_weekly_nfl_bad_beat: {
    title: "BAD BEAT OF THE WEEK",
    shortDefinition: "Highest-scoring team that loses",
    prompt: "Who will be the highest-scoring team that still loses?",
    settlementNote: "Among all losing fantasy teams, select the team with the highest final fantasy score.",
    answerTargetType: "fantasy_team",
  },
  fantasy_weekly_nfl_got_away_with_one: {
    title: "WHO GETS AWAY WITH ONE?",
    shortDefinition: "Lowest-scoring team that wins",
    prompt: "Who will be the lowest-scoring team that still wins?",
    settlementNote: "Among all winning fantasy teams, select the team with the lowest final fantasy score.",
    answerTargetType: "fantasy_team",
  },
  fantasy_weekly_nfl_win_under_100: {
    title: "FRAUD WATCH",
    shortDefinition: "Any winner scores under 100",
    prompt: "Will somebody win with fewer than 100 fantasy points?",
    settlementNote: "Yes if at least one winning fantasy team scores less than 100.0 points.",
    answerTargetType: "yes_no",
  },
  fantasy_weekly_nfl_130_plus_loss: {
    title: "HEARTBREAKER",
    shortDefinition: "Any 130+ score still loses",
    prompt: "Will somebody score 130+ fantasy points and still lose?",
    settlementNote: "Yes if at least one losing fantasy team finishes with 130.0+ points.",
    answerTargetType: "yes_no",
  },
  fantasy_weekly_nfl_30_plus_blowout: {
    title: "STATEMENT WIN",
    shortDefinition: "Any winner by 30+ points",
    prompt: "Will somebody win by 30+ fantasy points?",
    settlementNote: "Yes if at least one matchup has a winning margin of 30.0+ fantasy points.",
    answerTargetType: "yes_no",
  },
};

export function getWeeklyMoment(templatePropId?: string | null): WeeklyMoment | null {
  if (!templatePropId) return null;
  return WEEKLY_MOMENTS[templatePropId] ?? null;
}

export function getMomentTitle(templatePropId?: string | null): string | null {
  return getWeeklyMoment(templatePropId)?.title ?? null;
}

export function getMomentShortDefinition(templatePropId?: string | null): string | null {
  return getWeeklyMoment(templatePropId)?.shortDefinition ?? null;
}

export function getMomentSettlementNote(templatePropId?: string | null): string | null {
  return getWeeklyMoment(templatePropId)?.settlementNote ?? null;
}