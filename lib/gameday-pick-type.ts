/** Pick type is card metadata; stored choice values always remain bare teams. */
export type PickType = "straight_up" | "spread";

export function normalizePickType(value: unknown): PickType | null {
  if (value === undefined) return "straight_up";
  return value === "straight_up" || value === "spread" ? value : null;
}

/** Missing metadata is a legacy Winner card, never inferred from line text. */
export function getPickType(value: unknown): PickType {
  return value === "spread" ? "spread" : "straight_up";
}

/** Only a signed integer/half-point or PK is a usable Team B spread. */
export function parseTeamBSpread(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length > 120) return null;
  if (/^PK$/i.test(text)) return 0;
  if (!/^[+-]\d+(?:\.[05])?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && Number.isSafeInteger(number * 2)
    ? (number === 0 ? 0 : number)
    : null;
}

export function formatTeamSpread(value: number): string {
  return value === 0 ? "PK" : `${value > 0 ? "+" : ""}${value}`;
}

export function normalizeAtsLine(value: unknown): string | null {
  const spread = parseTeamBSpread(value);
  return spread === null ? null : formatTeamSpread(spread);
}

export type PickDisplayOption = { value: string; label: string };

/** Returns null rather than guessing when an ATS matchup has invalid metadata. */
export function buildTeamPickDisplay(
  pickType: PickType,
  options: string[],
  lineText: unknown,
): { matchup_label: string; display_options: PickDisplayOption[] } | null {
  if (options.length !== 2) return null;
  const spread = pickType === "spread" ? parseTeamBSpread(lineText) : null;
  if (pickType === "spread" && spread === null) return null;
  const display_options = options.map((value, index) => ({
    value,
    label: pickType === "spread"
      ? `${value} ${formatTeamSpread(index === 0 ? -spread! : spread!)}`
      : value,
  }));
  return {
    matchup_label: display_options.map((option) => option.label).join(" vs "),
    display_options,
  };
}
