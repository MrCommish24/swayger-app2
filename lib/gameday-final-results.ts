import { buildTeamPickDisplay, getPickType, type PickDisplayOption, type PickType } from "./gameday-pick-type";

/**
 * Presentation-only helpers for finalized Madden Weekly Pick Card results.
 * Shared by the backend final-standings response and the web/share UI so labels
 * are built in exactly one place. Nothing here affects scoring or settlement.
 */

export interface FinalResultProp {
  id: string;
  question?: string | null;
  answer_options?: string[] | null;
  line_text?: string | null;
  prop_role?: string | null;
  answer_type?: string | null;
  status?: string | null;
  display_order?: number | null;
  correct_answer?: string | null;
  correct_answer_ids?: string[] | null;
  correct_numeric_answer?: number | null;
}

export interface FinalMainResult {
  prop_id: string;
  display_order: number;
  prop_role: "main_matchup";
  pick_type: PickType;
  team_a: string | null;
  team_b: string | null;
  line_text: string | null;
  status: "pending" | "settled";
  correct_answer: string | null;
  correct_answer_label: string | null;
  opponent_answer: string | null;
  opponent_label: string | null;
  matchup_label: string | null;
  /** e.g. "Giants +6.5 over Cowboys -6.5"; null until settled or when labels are unavailable. */
  result_label: string | null;
  display_options: PickDisplayOption[];
}

export interface FinalBonusGameResult {
  prop_id: string;
  display_order: number;
  prop_role: "bonus_game";
  pick_type: PickType;
  team_a: string | null;
  team_b: string | null;
  line_text: string | null;
  status: "pending" | "settled";
  correct_answer: string | null;
  correct_answer_label: string | null;
  matchup_label: string | null;
  result_label: string | null;
  display_options: PickDisplayOption[];
}

export function pickTypeLabel(pickType: unknown): string {
  return getPickType(pickType) === "spread" ? "Against the Spread" : "Straight Up";
}

export function winConditionLabel(mode: unknown): string {
  return mode === "most_correct" ? "Most Correct" : "Perfect Card";
}

function resolvedValue(prop: FinalResultProp): string | null {
  if (prop.status !== "settled") return null;
  const ids = Array.isArray(prop.correct_answer_ids) ? prop.correct_answer_ids : [];
  // More than one stored correct value is a commissioner-handled push; never pick a side.
  if (ids.length > 1) return null;
  return prop.correct_answer ?? ids[0] ?? null;
}

function buildTeamResult(prop: FinalResultProp, pickType: PickType) {
  const options = Array.isArray(prop.answer_options) ? prop.answer_options : [];
  const display = buildTeamPickDisplay(pickType, options, prop.line_text);
  const correct = resolvedValue(prop);
  const label = (value: string | null) =>
    value === null ? null : display?.display_options.find((o) => o.value === value)?.label ?? null;
  const correctLabel = display ? label(correct) : null;
  const opponent = correct !== null && options.length === 2 ? options.find((o) => o !== correct) ?? null : null;
  const opponentLabel = label(opponent);
  return {
    team_a: options[0] ?? null,
    team_b: options[1] ?? null,
    line_text: prop.line_text ?? null,
    status: (prop.status === "settled" ? "settled" : "pending") as "pending" | "settled",
    correct_answer: correct,
    correct_answer_label: correctLabel,
    opponent_answer: opponent,
    opponent_label: opponentLabel,
    matchup_label: display?.matchup_label ?? null,
    result_label: correctLabel && opponentLabel ? `${correctLabel} over ${opponentLabel}` : null,
    display_options: display?.display_options ?? [],
  };
}

const byOrder = (a: FinalResultProp, b: FinalResultProp) => (a.display_order ?? 0) - (b.display_order ?? 0);

export function buildMainResults(props: FinalResultProp[], rawPickType: unknown): FinalMainResult[] {
  const pickType = getPickType(rawPickType);
  return props
    .filter((prop) => prop.prop_role === "main_matchup" && prop.answer_type !== "integer")
    .sort(byOrder)
    .map((prop) => ({
      prop_id: prop.id,
      display_order: prop.display_order ?? 0,
      prop_role: "main_matchup" as const,
      pick_type: pickType,
      ...buildTeamResult(prop, pickType),
    }));
}

/**
 * Bonus Game labels use the card mode only when the prop is genuinely a team
 * matchup (ATS cards always are; Winner cards only when two team options exist
 * and `bonusTeams` matches). Otherwise labels are the stored values.
 */
export function buildBonusGameResult(
  props: FinalResultProp[],
  rawPickType: unknown,
  bonusTeams?: string[] | null,
): FinalBonusGameResult | null {
  const prop = props.find((p) => p.prop_role === "bonus_game" && p.answer_type !== "integer");
  if (!prop) return null;
  const pickType = getPickType(rawPickType);
  const options = Array.isArray(prop.answer_options) ? prop.answer_options : [];
  const teamBased =
    options.length === 2 &&
    (pickType === "spread" || (!!bonusTeams && bonusTeams.length === 2 && bonusTeams.every((t) => options.includes(t))));
  if (teamBased) {
    return { prop_id: prop.id, display_order: prop.display_order ?? 0, prop_role: "bonus_game", pick_type: pickType, ...buildTeamResult(prop, pickType) };
  }
  const correct = resolvedValue(prop);
  return {
    prop_id: prop.id,
    display_order: prop.display_order ?? 0,
    prop_role: "bonus_game",
    pick_type: pickType,
    team_a: null,
    team_b: null,
    line_text: prop.line_text ?? null,
    status: prop.status === "settled" ? "settled" : "pending",
    correct_answer: correct,
    correct_answer_label: correct,
    matchup_label: null,
    result_label: correct,
    display_options: options.map((value) => ({ value, label: value })),
  };
}

export interface ReceiptHeaderInput {
  roomName?: string | null;
  teamA?: string | null;
  teamB?: string | null;
  /** Present only for Pick Cards. */
  pickCard?: { pickType: unknown; scoringMode?: unknown } | null;
}

export interface ReceiptHeader {
  title: string | null;
  subtitle: string | null;
}

const present = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "" && value.trim() !== "null" && value.trim() !== "undefined";

/**
 * Header lines for the Final Standings share image. Pick Cards have no
 * room-level Team A/B so they use card name + mode; single-game rooms keep
 * "Team A vs Team B"; invalid team values are dropped, never rendered.
 */
export function buildReceiptHeader(input: ReceiptHeaderInput): ReceiptHeader {
  const name = present(input.roomName) ? input.roomName.trim() : null;
  if (input.pickCard) {
    return {
      title: name,
      subtitle: `${pickTypeLabel(input.pickCard.pickType)} · ${winConditionLabel(input.pickCard.scoringMode)}`,
    };
  }
  if (present(input.teamA) && present(input.teamB)) {
    return { title: `${input.teamA.trim()} vs ${input.teamB.trim()}`, subtitle: name };
  }
  return { title: name, subtitle: null };
}

/** Concise Pick Card share-image payload derived from cards; never lists every matchup. */
export function buildReceiptPickCard(
  cards: Array<{ pick_type?: unknown; display_order?: number | null; gameday_props: FinalResultProp[] }>,
  bonusTeams?: string[] | null,
): { pickType: PickType; mainTotal: number; summaryLines: string[] } {
  const ordered = [...cards].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  const pickType = getPickType(ordered[0]?.pick_type);
  const props = ordered.flatMap((card) => card.gameday_props ?? []);
  const summaryLines: string[] = [];
  const bonus = buildBonusGameResult(props, pickType, bonusTeams);
  if (bonus?.result_label) summaryLines.push(`Bonus Game: ${bonus.result_label}`);
  const total = props.find((p) => p.prop_role === "bonus_total");
  if (total?.status === "settled" && total.correct_numeric_answer != null) {
    summaryLines.push(`Total Points: ${total.correct_numeric_answer}`);
  }
  return {
    pickType,
    mainTotal: props.filter((p) => p.prop_role === "main_matchup").length,
    summaryLines,
  };
}
