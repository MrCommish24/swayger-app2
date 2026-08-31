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
import { correctAnswerWriteFields, normalizeCorrectAnswers } from "./correct-answers.js";

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

  // 1. Mark prop settled
  const { error: propError } = await (supabase
    .from("gameday_props")
    .update({
      ...correctAnswerWriteFields(answers),
      status: "settled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", propId) as any);
  if (propError) throw propError;

  // 2 & 3. Reset then mark qualifying picks. This avoids fragile text `neq`
  // filters and keeps corrections correct for any set size.
  const { error: resetError } = await (supabase
    .from("gameday_picks")
    .update({ is_correct: false })
    .eq("prop_id", propId) as any);
  if (resetError) throw resetError;

  const { error: scoreError } = await (supabase
    .from("gameday_picks")
    .update({ is_correct: true })
    .eq("prop_id", propId)
    .in("selected_answer", answers) as any);
  if (scoreError) throw scoreError;

  // 4. Cascade: mark card settled if all its props are now done
  const { data: remaining } = await supabase
    .from("gameday_props")
    .select("id")
    .eq("card_id", cardId)
    .neq("status", "settled");

  const cardAutoSettled = !remaining?.length;
  if (cardAutoSettled) {
    await (supabase
      .from("gameday_pick_cards")
      .update({ status: "settled", updated_at: new Date().toISOString() })
      .eq("id", cardId) as any);
  }

  return { propId, cardId, cardAutoSettled };
}
