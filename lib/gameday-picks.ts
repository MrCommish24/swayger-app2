import type { GDProp } from "@/lib/gameday-api";

export type PickPayload =
  | { selected_answer: string }
  | { numeric_answer: number };

export function getIntegerBounds(prop: GDProp): { min: number; max: number } {
  return {
    min: prop.numeric_min ?? 0,
    max: prop.numeric_max ?? 200,
  };
}

export function parseIntegerPick(
  prop: GDProp,
  value: string | undefined,
): number | null {
  if (prop.answer_type !== "integer" || value === undefined) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const numericValue = Number(trimmed);
  const { min, max } = getIntegerBounds(prop);
  if (
    !Number.isSafeInteger(numericValue) ||
    numericValue < min ||
    numericValue > max
  ) {
    return null;
  }
  return numericValue;
}

export function isPropAnswered(
  prop: GDProp,
  value: string | undefined,
): boolean {
  if (prop.answer_type === "integer") {
    return parseIntegerPick(prop, value) !== null;
  }
  return value !== undefined && value !== "";
}

export function buildPickPayload(
  prop: GDProp,
  value: string | undefined,
): PickPayload | null {
  if (prop.answer_type === "integer") {
    const numericValue = parseIntegerPick(prop, value);
    return numericValue === null ? null : { numeric_answer: numericValue };
  }
  return value ? { selected_answer: value } : null;
}