import { getWeeklyMoment } from "./fantasy-weekly-moments";

export type PickShareMethod = "native" | "web_share" | "copy";
export type PickShareSurface = "question_card" | "completion_state";

export interface FantasyPickShareInput {
  templatePropId: string;
  selectedAnswerLabel: string;
  participantDisplayName?: string | null;
  leagueName?: string | null;
  weekNumber: number;
  participationUrl: string;
  isMyLock?: boolean;
}

export interface FantasyPickSharePackage {
  title: string;
  sentence: string;
  text: string;
  url: string;
}

/** Add only coarse source attribution to an existing canonical Weekly URL. */
export function addPickShareSource(participationUrl: string): string {
  const url = new URL(participationUrl);
  url.searchParams.set("source", "pick_share");
  return url.toString();
}

function safeLabel(value: string | null | undefined, maxLength: number): string {
  return (value ?? "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function namedSentence(
  templatePropId: string,
  answer: string,
  participantName: string,
): string {
  const subject = participantName || "This Swayger player";
  const isYes = answer.toLowerCase() === "yes";

  switch (templatePropId) {
    case "fantasy_weekly_nfl_highest_scoring_team":
      return `${subject} has ${answer} putting up the highest fantasy score this week.`;
    case "fantasy_weekly_nfl_lowest_scoring_team":
      return `${subject} has ${answer} finishing with the fewest fantasy points this week.`;
    case "fantasy_weekly_nfl_largest_margin_winner":
      return `${subject} has ${answer} delivering the Biggest Blowout this week.`;
    case "fantasy_weekly_nfl_smallest_margin_winner":
      return `${subject} has ${answer} surviving the closest win this week.`;
    case "fantasy_weekly_nfl_highest_player_team":
      return `${subject} has ${answer} rostering the week’s highest-scoring player.`;
    case "fantasy_weekly_nfl_score_150_plus":
      return isYes
        ? `${subject} says somebody is joining the 150 Club this week.`
        : `${subject} says nobody is cracking 150 this week.`;
    case "fantasy_weekly_nfl_matchup_under_5":
      return isYes
        ? `${subject} is calling a Photo Finish this week.`
        : `${subject} says no matchup finishes within 5 points this week.`;
    case "fantasy_weekly_nfl_bad_beat":
      return `${subject} has ${answer} scoring big and still taking the L.`;
    case "fantasy_weekly_nfl_got_away_with_one":
      return `${subject} has ${answer} getting away with one this week.`;
    case "fantasy_weekly_nfl_win_under_100":
      return isYes
        ? `${subject} is calling Fraud Watch: somebody wins with fewer than 100.`
        : `${subject} says nobody is getting away with a sub-100 win this week.`;
    case "fantasy_weekly_nfl_130_plus_loss":
      return isYes
        ? `${subject} is calling a Heartbreaker: somebody scores 130+ and still loses.`
        : `${subject} says nobody drops 130+ in a loss this week.`;
    case "fantasy_weekly_nfl_30_plus_blowout":
      return isYes
        ? `${subject} is calling a Statement Win: somebody wins by 30+.`
        : `${subject} says nobody wins by 30+ this week.`;
    default:
      return `${subject} picked ${answer}.`;
  }
}

export function buildFantasyPickSharePackage(
  input: FantasyPickShareInput,
): FantasyPickSharePackage {
  const moment = getWeeklyMoment(input.templatePropId);
  const answer = safeLabel(input.selectedAnswerLabel, 120);
  const participantName = safeLabel(input.participantDisplayName, 60);
  const url = safeLabel(input.participationUrl, 500);
  if (!moment) throw new Error("Unknown Swayger Moment");
  if (!answer) throw new Error("A selected answer label is required");
  if (!url) throw new Error("A Weekly participation URL is required");

  const sentence = participantName
    ? namedSentence(input.templatePropId, answer, participantName)
    : `My pick: ${answer} for ${moment.title}.`;
  const title = moment.title;
  const leagueName = safeLabel(input.leagueName, 80);
  const contextLine = `Swayger Fantasy${leagueName ? ` • ${leagueName}` : ""} • Week ${input.weekNumber}`;
  const lockLabel = input.isMyLock ? "🔒 MY LOCK\n\n" : "";
  const text = `${lockLabel}${title}\n\n${sentence}\n\n${contextLine}\nWho you got?\n${url}`;

  return { title, sentence, text, url };
}