/**
 * Shared normalization for prop settlement answers.
 *
 * `correct_answer` is the legacy scalar field. New writes also persist the
 * normalized array in `correct_answer_ids`, while keeping the scalar as the
 * first answer for old clients.
 */

export type CorrectAnswerValue = string | string[] | null | undefined;

export function normalizeCorrectAnswers(
  value: CorrectAnswerValue,
  legacyValue?: CorrectAnswerValue,
): string[] {
  const candidate = Array.isArray(value) ? value : value ?? legacyValue;
  if (Array.isArray(candidate)) {
    return candidate.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  }
  return typeof candidate === "string" && candidate.trim().length > 0 ? [candidate] : [];
}

export function sameCorrectAnswerSet(left: CorrectAnswerValue, right: CorrectAnswerValue): boolean {
  const a = [...new Set(normalizeCorrectAnswers(left))].sort();
  const b = [...new Set(normalizeCorrectAnswers(right))].sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function parseSettlementCorrectAnswers(body: {
  correct_answers?: unknown;
  correct_answer?: unknown;
}): { ok: true; answers: string[]; usedLegacyField: boolean } | { ok: false; error: string } {
  const hasArrayField = body.correct_answers !== undefined;
  const hasLegacyField = body.correct_answer !== undefined;

  if (hasArrayField) {
    if (!Array.isArray(body.correct_answers)) {
      return { ok: false, error: "correct_answers must be an array" };
    }
    if (body.correct_answers.length === 0) {
      return { ok: false, error: "correct_answers must contain at least one answer ID" };
    }
    if (!body.correct_answers.every((id) => typeof id === "string" && id.trim().length > 0)) {
      return { ok: false, error: "correct_answers must contain non-empty answer IDs" };
    }
    const answers = body.correct_answers as string[];
    if (new Set(answers).size !== answers.length) {
      return { ok: false, error: "correct_answers must not contain duplicate answer IDs" };
    }
    if (hasLegacyField && typeof body.correct_answer === "string" && body.correct_answer !== answers[0]) {
      return { ok: false, error: "correct_answer and correct_answers do not match" };
    }
    return { ok: true, answers, usedLegacyField: false };
  }

  if (typeof body.correct_answer !== "string" || body.correct_answer.trim().length === 0) {
    return { ok: false, error: "correct_answer or correct_answers is required" };
  }
  return { ok: true, answers: [body.correct_answer], usedLegacyField: true };
}

export function correctAnswerWriteFields(answers: string[]): {
  correct_answer: string | null;
  correct_answer_ids: string[];
} {
  return {
    // Keep the first answer visible to legacy scalar consumers.
    correct_answer: answers[0] ?? null,
    correct_answer_ids: answers,
  };
}
