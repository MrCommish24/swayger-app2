-- Atomic Game Day prop settlement.
-- Apply after gameday-madden-pick-card-v2-bonus.sql.

BEGIN;

-- Tighten the V2 exact-total contract now that typed columns are live.
ALTER TABLE public.gameday_props
  DROP CONSTRAINT IF EXISTS gameday_props_numeric_bounds_check;
ALTER TABLE public.gameday_props
  ADD CONSTRAINT gameday_props_numeric_bounds_check
  CHECK (
    (
      answer_type = 'choice'
      AND numeric_min IS NULL
      AND numeric_max IS NULL
      AND correct_numeric_answer IS NULL
    )
    OR (
      answer_type = 'integer'
      AND prop_role = 'bonus_total'
      AND numeric_min = 0
      AND numeric_max = 200
      AND jsonb_typeof(answer_options) = 'array'
      AND jsonb_array_length(answer_options) = 0
      AND (
        correct_numeric_answer IS NULL
        OR correct_numeric_answer BETWEEN 0 AND 200
      )
    )
  );

ALTER TABLE public.gameday_picks
  DROP CONSTRAINT IF EXISTS gameday_picks_numeric_answer_consistency_check;
ALTER TABLE public.gameday_picks
  ADD CONSTRAINT gameday_picks_numeric_answer_consistency_check
  CHECK (
    numeric_answer IS NULL
    OR (
      numeric_answer BETWEEN 0 AND 200
      AND selected_answer = numeric_answer::TEXT
    )
  );

CREATE OR REPLACE FUNCTION public.validate_gameday_pick_answer_shape()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prop RECORD;
BEGIN
  SELECT answer_type, numeric_min, numeric_max
  INTO v_prop
  FROM public.gameday_props
  WHERE id = NEW.prop_id;

  IF v_prop.answer_type = 'integer' THEN
    IF NEW.numeric_answer IS NULL
       OR NEW.numeric_answer < COALESCE(v_prop.numeric_min, 0)
       OR NEW.numeric_answer > COALESCE(v_prop.numeric_max, 200)
       OR NEW.selected_answer IS DISTINCT FROM NEW.numeric_answer::TEXT
    THEN
      RAISE EXCEPTION 'Invalid numeric answer for integer prop';
    END IF;
  ELSIF NEW.numeric_answer IS NOT NULL THEN
    RAISE EXCEPTION 'Numeric answer is not valid for choice prop';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gameday_picks_validate_answer_shape
  ON public.gameday_picks;
CREATE TRIGGER gameday_picks_validate_answer_shape
  BEFORE INSERT OR UPDATE OF prop_id, selected_answer, numeric_answer
  ON public.gameday_picks
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_gameday_pick_answer_shape();

REVOKE ALL ON FUNCTION public.validate_gameday_pick_answer_shape()
  FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.settle_gameday_prop_atomic(UUID, JSONB, INTEGER);
CREATE FUNCTION public.settle_gameday_prop_atomic(
  p_prop_id UUID,
  p_correct_answer_ids JSONB DEFAULT NULL,
  p_correct_numeric_answer INTEGER DEFAULT NULL
)
RETURNS TABLE (
  card_id UUID,
  card_auto_settled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prop RECORD;
  v_complete BOOLEAN;
BEGIN
  SELECT
    p.id,
    p.card_id,
    p.answer_type,
    p.numeric_min,
    p.numeric_max
  INTO v_prop
  FROM public.gameday_props p
  WHERE p.id = p_prop_id
  FOR UPDATE;

  IF v_prop.id IS NULL THEN
    RAISE EXCEPTION 'Prop not found';
  END IF;

  IF v_prop.answer_type = 'integer' THEN
    IF p_correct_numeric_answer IS NULL
       OR p_correct_numeric_answer < COALESCE(v_prop.numeric_min, 0)
       OR p_correct_numeric_answer > COALESCE(v_prop.numeric_max, 200)
       OR p_correct_answer_ids IS NOT NULL
    THEN
      RAISE EXCEPTION 'Invalid numeric settlement result';
    END IF;

    UPDATE public.gameday_props
    SET
      correct_answer = NULL,
      correct_answer_ids = NULL,
      correct_numeric_answer = p_correct_numeric_answer,
      status = 'settled',
      updated_at = now()
    WHERE id = p_prop_id;

    UPDATE public.gameday_picks
    SET is_correct = (numeric_answer = p_correct_numeric_answer)
    WHERE prop_id = p_prop_id;
  ELSE
    IF p_correct_numeric_answer IS NOT NULL
       OR jsonb_typeof(p_correct_answer_ids) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_correct_answer_ids) = 0
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(p_correct_answer_ids) item
         WHERE jsonb_typeof(item) IS DISTINCT FROM 'string'
       )
    THEN
      RAISE EXCEPTION 'At least one valid choice settlement answer is required';
    END IF;

    UPDATE public.gameday_props
    SET
      correct_answer = p_correct_answer_ids->>0,
      correct_answer_ids = p_correct_answer_ids,
      correct_numeric_answer = NULL,
      status = 'settled',
      updated_at = now()
    WHERE id = p_prop_id;

    UPDATE public.gameday_picks
    SET is_correct = (
      selected_answer IN (
        SELECT jsonb_array_elements_text(p_correct_answer_ids)
      )
    )
    WHERE prop_id = p_prop_id;
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.gameday_props sibling
    WHERE sibling.card_id = v_prop.card_id
      AND sibling.status <> 'settled'
  )
  INTO v_complete;

  IF v_complete THEN
    UPDATE public.gameday_pick_cards
    SET status = 'settled', updated_at = now()
    WHERE id = v_prop.card_id;
  END IF;

  RETURN QUERY SELECT v_prop.card_id, v_complete;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_gameday_prop_atomic(UUID, JSONB, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_gameday_prop_atomic(UUID, JSONB, INTEGER)
  TO service_role;

COMMIT;