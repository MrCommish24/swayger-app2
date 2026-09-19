/**
 * gameday-settle-helper.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared core settle logic.  Used by:
 *   • PATCH /api/gameday/props/:propId/settle  (individual host settlement)
 *   • POST  /api/admin/gameday/settle-group    (bulk group settlement)
 *
 * Callers are responsible for all auth checks and answer validation before
 * calling settlePropCore.  This function only performs DB writes.
 *
 * No internal HTTP calls — all writes go directly to the database via the
 * service-role Supabase client supplied by the caller.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";
import { normalizeCorrectAnswers } from "./correct-answers.js";

type SupabaseClient = ReturnType<typeof createClient>;

export interface PropSettleSpec {
  propId: string;
  cardId: string;
  /** New normalized set. */
  correctAnswers?: string[];
  /** Legacy single-answer callers remain supported. */
  correctAnswer?: string;
}

export interface PropSettleResult {
  propId: string;
  cardId: string;
  cardAutoSettled: boolean;
}

/**
 * Settle a single prop and score all player picks for it.
 *
 * Writes performed (in order):
 *   1. gameday_props → status = "settled", correct_answer_ids = correctAnswers
 *   2. gameday_picks → is_correct = false for all picks on this prop
 *   3. gameday_picks → is_correct = true  WHERE selected_answer IN correctAnswers
 *   4. gameday_pick_cards → status = "settled" IFF all sibling props are settled
 *
 * Returns whether the parent card auto-settled after this write.
 */
export async function settlePropCore(
  supabase: SupabaseClient,
  { propId, cardId, correctAnswers, correctAnswer }: PropSettleSpec,
): Promise<PropSettleResult> {
  const answers = normalizeCorrectAnswers(correctAnswers, correctAnswer);
  if (answers.length === 0) throw new Error("At least one correct answer is required");

  const { data, error } = await (supabase as any).rpc(
    "settle_gameday_prop_atomic",
    {
      p_prop_id: propId,
      p_correct_answer_ids: answers,
      p_correct_numeric_answer: null,
    },
  );
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error("Atomic prop settlement returned no result");
  if (result.card_id !== cardId) {
    throw new Error("Atomic prop settlement returned the wrong parent card");
  }
  return {
    propId,
    cardId,
    cardAutoSettled: result.card_auto_settled === true,
  };
}

export async function settleNumericPropCore(
  supabase: SupabaseClient,
  {
    propId,
    cardId,
    correctNumericAnswer,
  }: {
    propId: string;
    cardId: string;
    correctNumericAnswer: number;
  },
): Promise<PropSettleResult> {
  const { data, error } = await (supabase as any).rpc(
    "settle_gameday_prop_atomic",
    {
      p_prop_id: propId,
      p_correct_answer_ids: null,
      p_correct_numeric_answer: correctNumericAnswer,
    },
  );
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error("Atomic numeric settlement returned no result");
  if (result.card_id !== cardId) {
    throw new Error("Atomic numeric settlement returned the wrong parent card");
  }
  return {
    propId,
    cardId,
    cardAutoSettled: result.card_auto_settled === true,
  };
}
