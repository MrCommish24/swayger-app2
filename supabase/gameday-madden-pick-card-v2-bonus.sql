-- Madden Pick Card v2: bonus props and typed integer submissions.
-- Additive/idempotent; apply after gameday-madden-public-pick-events.sql.
BEGIN;

ALTER TABLE public.gameday_props
  ADD COLUMN IF NOT EXISTS prop_role TEXT NOT NULL DEFAULT 'main_matchup',
  ADD COLUMN IF NOT EXISTS answer_type TEXT NOT NULL DEFAULT 'choice',
  ADD COLUMN IF NOT EXISTS numeric_min INTEGER,
  ADD COLUMN IF NOT EXISTS numeric_max INTEGER,
  ADD COLUMN IF NOT EXISTS correct_numeric_answer INTEGER;

ALTER TABLE public.gameday_picks
  ADD COLUMN IF NOT EXISTS numeric_answer INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gameday_props_prop_role_check') THEN
    ALTER TABLE public.gameday_props ADD CONSTRAINT gameday_props_prop_role_check
      CHECK (prop_role IN ('main_matchup', 'bonus_game', 'bonus_total')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gameday_props_answer_type_check') THEN
    ALTER TABLE public.gameday_props ADD CONSTRAINT gameday_props_answer_type_check
      CHECK (answer_type IN ('choice', 'integer')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gameday_props_numeric_bounds_check') THEN
    ALTER TABLE public.gameday_props ADD CONSTRAINT gameday_props_numeric_bounds_check
      CHECK (
        (numeric_min IS NULL OR numeric_min BETWEEN 0 AND 200)
        AND (numeric_max IS NULL OR numeric_max BETWEEN 0 AND 200)
        AND (numeric_min IS NULL OR numeric_max IS NULL OR numeric_min <= numeric_max)
        AND (correct_numeric_answer IS NULL OR correct_numeric_answer BETWEEN 0 AND 200)
        AND (correct_numeric_answer IS NULL OR numeric_min IS NULL OR correct_numeric_answer >= numeric_min)
        AND (correct_numeric_answer IS NULL OR numeric_max IS NULL OR correct_numeric_answer <= numeric_max)
        AND (
          prop_role <> 'bonus_total'
          OR (answer_type = 'integer' AND numeric_min IS NOT NULL AND numeric_max IS NOT NULL
              AND numeric_min >= 0 AND numeric_max <= 200)
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gameday_picks_numeric_answer_consistency_check') THEN
    ALTER TABLE public.gameday_picks ADD CONSTRAINT gameday_picks_numeric_answer_consistency_check
      CHECK (numeric_answer IS NULL OR selected_answer = numeric_answer::TEXT) NOT VALID;
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.submit_madden_pick_with_activity(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.submit_madden_pick_with_activity(UUID, UUID, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.submit_madden_pick_with_activity(UUID, UUID, TEXT, BOOLEAN, INTEGER);

CREATE OR REPLACE FUNCTION public.submit_madden_pick_with_activity(
  p_prop_id UUID,
  p_participant_id UUID,
  p_selected_answer TEXT,
  p_public_pick_events_enabled BOOLEAN DEFAULT false,
  p_numeric_answer INTEGER DEFAULT NULL
)
RETURNS TABLE (
  pick_id UUID, prop_id UUID, participant_id UUID, selected_answer TEXT,
  is_correct BOOLEAN, submitted_at TIMESTAMPTZ, event_id UUID,
  event_inserted BOOLEAN, completed_participant_count INTEGER,
  event_type TEXT, submission_version INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_room RECORD; v_card RECORD; v_prop RECORD; v_participant RECORD;
  v_previous_answer TEXT; v_previous_numeric INTEGER;
  v_canonical_answer TEXT; v_required_count INTEGER;
  v_saved_count_before INTEGER; v_saved_count_after INTEGER;
  v_material_change BOOLEAN := false; v_existing RECORD;
  v_event_id UUID; v_event_type TEXT; v_version INTEGER;
  v_count INTEGER; v_picks JSONB; v_was_counted BOOLEAN;
BEGIN
  SELECT r.id, r.room_code, r.room_name, r.source, r.sport, r.template_type,
    r.discord_guild_id, r.discord_channel_id, r.archived_at, r.status, r.format_config
  INTO v_room
  FROM public.gameday_rooms r
  JOIN public.gameday_pick_cards c ON c.room_id = r.id
  JOIN public.gameday_props p ON p.card_id = c.id
  WHERE p.id = p_prop_id FOR UPDATE OF r, c;

  SELECT c.id, c.room_id, c.status, c.scheduled_lock_at INTO v_card
  FROM public.gameday_pick_cards c JOIN public.gameday_props p ON p.card_id = c.id
  WHERE p.id = p_prop_id FOR UPDATE;
  SELECT p.id, p.card_id, p.answer_options, p.prop_role, p.answer_type,
    p.numeric_min, p.numeric_max, p.line_text, p.question, p.display_order
  INTO v_prop FROM public.gameday_props p WHERE p.id = p_prop_id;
  SELECT participant.id, participant.room_id INTO v_participant
  FROM public.gameday_participants participant WHERE participant.id = p_participant_id;

  IF v_room.id IS NULL OR v_card.id IS NULL OR v_prop.id IS NULL
     OR v_participant.id IS NULL OR v_participant.room_id IS DISTINCT FROM v_room.id
  THEN RAISE EXCEPTION 'Participant, prop, and room do not match'; END IF;
  IF v_room.source IS DISTINCT FROM 'discord' OR v_room.sport IS DISTINCT FROM 'madden'
     OR v_room.template_type IS DISTINCT FROM 'weekly_pick_card'
     OR NULLIF(btrim(v_room.discord_guild_id), '') IS NULL
     OR NULLIF(btrim(v_room.discord_channel_id), '') IS NULL OR v_room.archived_at IS NOT NULL
     OR v_room.status IS DISTINCT FROM 'active' OR v_card.status IS DISTINCT FROM 'open'
     OR (v_card.scheduled_lock_at IS NOT NULL AND v_card.scheduled_lock_at <= now())
  THEN RAISE EXCEPTION 'Madden picks are closed for this card'; END IF;

  IF v_prop.answer_type = 'choice' THEN
    IF jsonb_typeof(v_prop.answer_options) IS DISTINCT FROM 'array'
       OR NOT (p_selected_answer IN (SELECT jsonb_array_elements_text(v_prop.answer_options)))
    THEN RAISE EXCEPTION 'Invalid answer option'; END IF;
    v_canonical_answer := p_selected_answer;
    IF p_numeric_answer IS NOT NULL THEN RAISE EXCEPTION 'Numeric answer is not valid for choice prop'; END IF;
  ELSIF v_prop.answer_type = 'integer' THEN
    IF p_numeric_answer IS NULL OR p_numeric_answer < COALESCE(v_prop.numeric_min, 0)
       OR p_numeric_answer > COALESCE(v_prop.numeric_max, 200)
    THEN RAISE EXCEPTION 'Numeric answer is outside the prop bounds'; END IF;
    v_canonical_answer := p_numeric_answer::TEXT;
  ELSE
    RAISE EXCEPTION 'Invalid prop answer type';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_room.id::TEXT, 0));
  SELECT gp.selected_answer, gp.numeric_answer INTO v_previous_answer, v_previous_numeric
  FROM public.gameday_picks gp WHERE gp.prop_id = p_prop_id AND gp.participant_id = p_participant_id;

  SELECT count(*)::INTEGER INTO v_required_count FROM public.gameday_props p
  WHERE p.card_id = v_card.id AND (
    (p.answer_type = 'choice' AND jsonb_typeof(p.answer_options) = 'array' AND jsonb_array_length(p.answer_options) > 0)
    OR (p.answer_type = 'integer')
  );
  SELECT count(*)::INTEGER INTO v_saved_count_before
  FROM public.gameday_picks gp JOIN public.gameday_props p ON p.id = gp.prop_id
  WHERE gp.participant_id = p_participant_id AND p.card_id = v_card.id AND (
    (p.answer_type = 'choice' AND jsonb_typeof(p.answer_options) = 'array' AND jsonb_array_length(p.answer_options) > 0
      AND gp.selected_answer IN (SELECT jsonb_array_elements_text(p.answer_options)))
    OR (p.answer_type = 'integer' AND gp.numeric_answer IS NOT NULL
      AND gp.numeric_answer BETWEEN COALESCE(p.numeric_min, 0) AND COALESCE(p.numeric_max, 200))
  );
  v_material_change := v_previous_answer IS NOT NULL
    AND (v_previous_answer IS DISTINCT FROM v_canonical_answer
         OR v_previous_numeric IS DISTINCT FROM p_numeric_answer);

  INSERT INTO public.gameday_picks AS saved_pick
    (prop_id, participant_id, selected_answer, numeric_answer, is_correct)
  VALUES (p_prop_id, p_participant_id, v_canonical_answer,
    CASE WHEN v_prop.answer_type = 'integer' THEN p_numeric_answer ELSE NULL END, NULL)
  ON CONFLICT ON CONSTRAINT gameday_picks_prop_id_participant_id_key DO UPDATE
    SET selected_answer = EXCLUDED.selected_answer, numeric_answer = EXCLUDED.numeric_answer,
        is_correct = NULL,
        submitted_at = CASE WHEN saved_pick.selected_answer IS DISTINCT FROM EXCLUDED.selected_answer
                                  OR saved_pick.numeric_answer IS DISTINCT FROM EXCLUDED.numeric_answer
                            THEN now() ELSE saved_pick.submitted_at END
  RETURNING saved_pick.id, saved_pick.prop_id, saved_pick.participant_id,
    saved_pick.selected_answer, saved_pick.is_correct, saved_pick.submitted_at
  INTO pick_id, prop_id, participant_id, selected_answer, is_correct, submitted_at;

  IF v_required_count = 0 THEN
    RETURN QUERY SELECT pick_id, prop_id, participant_id, selected_answer, is_correct, submitted_at,
      NULL::UUID, false, NULL::INTEGER, NULL::TEXT, NULL::INTEGER; RETURN;
  END IF;
  SELECT count(*)::INTEGER INTO v_saved_count_after
  FROM public.gameday_picks gp JOIN public.gameday_props p ON p.id = gp.prop_id
  WHERE gp.participant_id = p_participant_id AND p.card_id = v_card.id AND (
    (p.answer_type = 'choice' AND jsonb_typeof(p.answer_options) = 'array' AND jsonb_array_length(p.answer_options) > 0
      AND gp.selected_answer IN (SELECT jsonb_array_elements_text(p.answer_options)))
    OR (p.answer_type = 'integer' AND gp.numeric_answer IS NOT NULL
      AND gp.numeric_answer BETWEEN COALESCE(p.numeric_min, 0) AND COALESCE(p.numeric_max, 200))
  );
  IF v_saved_count_after IS DISTINCT FROM v_required_count
     OR (v_saved_count_before IS NOT DISTINCT FROM v_required_count AND NOT v_material_change) THEN
    RETURN QUERY SELECT pick_id, prop_id, participant_id, selected_answer, is_correct, submitted_at,
      NULL::UUID, false, NULL::INTEGER, NULL::TEXT, NULL::INTEGER; RETURN;
  END IF;

  IF NOT p_public_pick_events_enabled THEN
    SELECT e.id, e.event_type, e.completed_participant_count INTO v_existing
    FROM public.gameday_madden_participation_events e
    WHERE e.room_id = v_room.id AND e.participant_id = p_participant_id
    ORDER BY e.delivery_sequence DESC NULLS LAST, e.created_at DESC, e.id DESC LIMIT 1;
    IF v_existing.id IS NOT NULL AND v_existing.event_type = 'madden_picks_completed' THEN
      RETURN QUERY SELECT pick_id, prop_id, participant_id, selected_answer, is_correct, submitted_at,
        v_existing.id, false, v_existing.completed_participant_count, 'madden_picks_completed'::TEXT, NULL::INTEGER; RETURN;
    END IF;
    IF v_existing.id IS NULL THEN
      SELECT count(DISTINCT e.participant_id)::INTEGER + 1 INTO v_count
      FROM public.gameday_madden_participation_events e WHERE e.room_id = v_room.id
        AND e.event_type IN ('madden_picks_completed','pick_card_picks_submitted','pick_card_picks_updated');
      INSERT INTO public.gameday_madden_participation_events
        (event_type, room_id, card_id, participant_id, room_code, room_name, week_label,
         discord_guild_id, discord_channel_id, participant_display_name, completed_participant_count, delivery_sequence)
      SELECT 'madden_picks_completed', v_room.id, v_card.id, p_participant_id, v_room.room_code, v_room.room_name,
        NULLIF(v_room.format_config->>'week_label',''), v_room.discord_guild_id, v_room.discord_channel_id,
        participant.display_name, v_count, nextval('public.gameday_madden_participation_delivery_seq')
      FROM public.gameday_participants participant WHERE participant.id = p_participant_id
        AND participant.room_id = v_room.id RETURNING id INTO v_event_id;
      RETURN QUERY SELECT pick_id, prop_id, participant_id, selected_answer, is_correct, submitted_at,
        v_event_id, true, v_count, 'madden_picks_completed'::TEXT, NULL::INTEGER; RETURN;
    END IF;
  END IF;

  SELECT COALESCE(max(e.submission_version),0)+1 INTO v_version
  FROM public.gameday_madden_participation_events e WHERE e.room_id = v_room.id
    AND e.participant_id = p_participant_id
    AND e.event_type IN ('pick_card_picks_submitted','pick_card_picks_updated');
  v_event_type := CASE WHEN v_saved_count_before IS DISTINCT FROM v_required_count
    THEN 'pick_card_picks_submitted' ELSE 'pick_card_picks_updated' END;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'prop_id', p.id, 'matchup_label', CASE WHEN p.answer_type = 'choice'
      AND jsonb_array_length(p.answer_options) >= 2 THEN concat(p.answer_options->>0,' vs ',p.answer_options->>1) ELSE p.question END,
    'prop_role', p.prop_role, 'answer_type', p.answer_type,
    'selected_option', CASE WHEN p.answer_type = 'choice' THEN gp.selected_answer ELSE NULL END,
    'numeric_prediction', gp.numeric_answer, 'line_text', p.line_text, 'display_order', p.display_order
  ) ORDER BY p.display_order,p.id),'[]'::JSONB) INTO v_picks
  FROM public.gameday_props p JOIN public.gameday_picks gp ON gp.prop_id=p.id AND gp.participant_id=p_participant_id
  WHERE p.card_id=v_card.id;
  SELECT EXISTS (SELECT 1 FROM public.gameday_madden_participation_events e WHERE e.room_id=v_room.id
    AND e.participant_id=p_participant_id AND e.event_type IN ('madden_picks_completed','pick_card_picks_submitted','pick_card_picks_updated'))
  INTO v_was_counted;
  SELECT count(DISTINCT e.participant_id)::INTEGER + CASE WHEN v_was_counted THEN 0 ELSE 1 END INTO v_count
  FROM public.gameday_madden_participation_events e WHERE e.room_id=v_room.id
    AND e.event_type IN ('madden_picks_completed','pick_card_picks_submitted','pick_card_picks_updated');
  INSERT INTO public.gameday_madden_participation_events
    (event_type, room_id, card_id, participant_id, room_code, room_name, week_label, discord_guild_id,
     discord_channel_id, participant_display_name, completed_participant_count, submission_version, picks, delivery_sequence)
  SELECT v_event_type,v_room.id,v_card.id,p_participant_id,v_room.room_code,v_room.room_name,
    NULLIF(v_room.format_config->>'week_label',''),v_room.discord_guild_id,v_room.discord_channel_id,
    participant.display_name,v_count,v_version,v_picks,nextval('public.gameday_madden_participation_delivery_seq')
  FROM public.gameday_participants participant WHERE participant.id=p_participant_id AND participant.room_id=v_room.id
  RETURNING id INTO v_event_id;
  RETURN QUERY SELECT pick_id,prop_id,participant_id,selected_answer,is_correct,submitted_at,
    v_event_id,true,v_count,v_event_type,v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_madden_pick_with_activity(UUID, UUID, TEXT, BOOLEAN, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_madden_pick_with_activity(UUID, UUID, TEXT, BOOLEAN, INTEGER)
  TO service_role;
COMMIT;