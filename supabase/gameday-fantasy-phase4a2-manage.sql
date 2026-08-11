-- ════════════════════════════════════════════════════════════════════════════
-- Phase 4A.2 — Manage Draft Day: Atomic Prop Replacement
-- Apply via Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Idempotent: uses CREATE OR REPLACE FUNCTION.
-- ════════════════════════════════════════════════════════════════════════════

-- ── update_fantasy_draft_day_props ──────────────────────────────────────────
--
-- Atomically replaces ALL props on an existing Draft Day pick card.
-- Called by PATCH /api/fantasy/leagues/:id/seasons/:id/draft-day/props.
--
-- All-or-nothing: DELETE + INSERT happen in one PL/pgSQL transaction.
-- If the insert loop fails, the delete is rolled back — no zero-prop state.
--
-- Validation (commissioner + lifecycle guards) is performed in the Express
-- route before calling this function. This function only handles atomicity.
--
-- Args:
--   p_card_id  — gameday_pick_cards.id for the Draft Day card
--   p_props    — JSONB array matching the same shape as publish_fantasy_draft_day:
--                [{ library_id, question, answer_options, scoring_scope,
--                   point_value, answer_target_type, display_order }, ...]
--
-- Returns: JSONB { prop_count: INT }

CREATE OR REPLACE FUNCTION update_fantasy_draft_day_props(
  p_card_id UUID,
  p_props   JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prop  JSONB;
  v_count INT := 0;
BEGIN
  -- ── Delete existing props ─────────────────────────────────────────────────
  -- This and the insert below are in the same transaction.
  -- If the insert fails, this delete is automatically rolled back.
  DELETE FROM gameday_props WHERE card_id = p_card_id;

  -- ── Insert replacement prop set ───────────────────────────────────────────
  FOR v_prop IN SELECT * FROM jsonb_array_elements(p_props) LOOP
    INSERT INTO gameday_props (
      card_id,
      template_prop_id,
      question,
      answer_options,
      scoring_scope,
      point_value,
      answer_target_type,
      display_order,
      status
    )
    VALUES (
      p_card_id,
      v_prop->>'library_id',
      v_prop->>'question',
      v_prop->'answer_options',           -- JSONB: structured [{id,label,type}]
      v_prop->>'scoring_scope',
      (v_prop->>'point_value')::INTEGER,
      v_prop->>'answer_target_type',
      (v_prop->>'display_order')::INTEGER,
      'pending'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('prop_count', v_count);
END;
$$;

-- Grant execute to the service role (used by Express server-side).
-- Anon/authenticated roles do NOT need direct RPC access.
GRANT EXECUTE ON FUNCTION update_fantasy_draft_day_props TO service_role;
