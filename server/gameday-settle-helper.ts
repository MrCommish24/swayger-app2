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

type SupabaseClient = ReturnType<typeof createClient>;

export interface PropSettleSpec {
  propId: string;
  cardId: string;
  correctAnswer: string; // exact stored option string — validated by caller
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
 *   1. gameday_props → status = "settled", correct_answer = correctAnswer
 *   2. gameday_picks → is_correct = true  WHERE selected_answer = correctAnswer
 *   3. gameday_picks → is_correct = false WHERE selected_answer ≠ correctAnswer
 *   4. gameday_pick_cards → status = "settled" IFF all sibling props are settled
 *
 * Returns whether the parent card auto-settled after this write.
 */
export async function settlePropCore(
  supabase: SupabaseClient,
  { propId, cardId, correctAnswer }: PropSettleSpec,
): Promise<PropSettleResult> {
  // 1. Mark prop settled
  await supabase
    .from("gameday_props")
    .update({
      correct_answer: correctAnswer,
      status: "settled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", propId);

  // 2 & 3. Score picks — two bulk updates avoid per-pick queries
  await supabase
    .from("gameday_picks")
    .update({ is_correct: true })
    .eq("prop_id", propId)
    .eq("selected_answer", correctAnswer);

  await supabase
    .from("gameday_picks")
    .update({ is_correct: false })
    .eq("prop_id", propId)
    .neq("selected_answer", correctAnswer);

  // 4. Cascade: mark card settled if all its props are now done
  const { data: remaining } = await supabase
    .from("gameday_props")
    .select("id")
    .eq("card_id", cardId)
    .neq("status", "settled");

  const cardAutoSettled = !remaining?.length;
  if (cardAutoSettled) {
    await supabase
      .from("gameday_pick_cards")
      .update({ status: "settled", updated_at: new Date().toISOString() })
      .eq("id", cardId);
  }

  return { propId, cardId, cardAutoSettled };
}
