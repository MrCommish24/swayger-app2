-- Public submitted Madden Pick Cards in the existing Discord delivery outbox.
-- Apply after gameday-madden-participation-events.sql.
--
-- Historical madden_picks_completed rows remain unchanged. New eligible writes
-- emit a complete public-display snapshot with participant-scoped versions.

BEGIN;

ALTER TABLE public.gameday_madden_participation_events
  ADD COLUMN IF NOT EXISTS submission_version INTEGER,
  ADD COLUMN IF NOT EXISTS picks JSONB,
  ADD COLUMN IF NOT EXISTS delivery_sequence BIGINT;

CREATE SEQUENCE IF NOT EXISTS public.gameday_madden_participation_delivery_seq;

CREATE UNIQUE INDEX IF NOT EXISTS gameday_madden_participation_events_delivery_sequence_uniq
  ON public.gameday_madden_participation_events (delivery_sequence)
  WHERE delivery_sequence IS NOT NULL;

ALTER TABLE public.gameday_madden_participation_events
  DROP CONSTRAINT IF EXISTS gameday_madden_participation_events_type_room_participant_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS gameday_madden_participation_events_legacy_completion_uniq
  ON public.gameday_madden_participation_events (room_id, participant_id)
  WHERE event_type = 'madden_picks_completed';

CREATE UNIQUE INDEX IF NOT EXISTS gameday_madden_participation_events_submission_version_uniq
  ON public.gameday_madden_participation_events (room_id, participant_id, submission_version)
  WHERE event_type IN ('pick_card_picks_submitted', 'pick_card_picks_updated');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gameday_madden_participation_events_public_pick_shape_check'
  ) THEN
    ALTER TABLE public.gameday_madden_participation_events
      ADD CONSTRAINT gameday_madden_participation_events_public_pick_shape_check
      CHECK (
        (
          event_type = 'madden_picks_completed'
          AND submission_version IS NULL
          AND picks IS NULL
        )
        OR (
          event_type IN ('pick_card_picks_submitted', 'pick_card_picks_updated')
          AND submission_version > 0
          AND jsonb_typeof(picks) = 'array'
          AND jsonb_array_length(picks) > 0
        )
      );
  END IF;
END;
$$;

ALTER TABLE public.gameday_madden_participation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_madden_participation_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gameday_madden_participation_events FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.gameday_madden_participation_events TO service_role;

DROP FUNCTION IF EXISTS public.submit_madden_pick_with_activity(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.submit_madden_pick_with_activity(
  p_prop_id UUID,
  p_participant_id UUID,
  p_selected_answer TEXT,
  p_public_pick_events_enabled BOOLEAN DEFAULT false
)
RETURNS TABLE (
  pick_id UUID,
  prop_id UUID,
  participant_id UUID,
  selected_answer TEXT,
  is_correct BOOLEAN,
  submitted_at TIMESTAMPTZ,
  event_id UUID,
  event_inserted BOOLEAN,
  completed_participant_count INTEGER,
  event_type TEXT,
  submission_version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room RECORD;
  v_card RECORD;
  v_prop RECORD;
  v_participant RECORD;
  v_previous_answer TEXT;
  v_required_count INTEGER;
  v_saved_count_before INTEGER;
  v_saved_count_after INTEGER;
  v_material_change BOOLEAN := false;
  v_existing RECORD;
  v_event_id UUID;
  v_event_type TEXT;
  v_version INTEGER;
  v_count INTEGER;
  v_picks JSONB;
  v_was_counted BOOLEAN;
BEGIN
  SELECT
    r.id, r.room_code, r.room_name, r.source, r.sport, r.template_type,
    r.discord_guild_id, r.discord_channel_id, r.archived_at, r.status,
    r.format_config
  INTO v_room
  FROM public.gameday_rooms r
  JOIN public.gameday_pick_cards c ON c.room_id = r.id
  JOIN public.gameday_props p ON p.card_id = c.id
  WHERE p.id = p_prop_id
  FOR UPDATE OF r, c;

  SELECT c.id, c.room_id, c.status, c.scheduled_lock_at
  INTO v_card
  FROM public.gameday_pick_cards c
  JOIN public.gameday_props p ON p.card_id = c.id
  WHERE p.id = p_prop_id
  FOR UPDATE;

  SELECT p.id, p.card_id, p.answer_options
  INTO v_prop
  FROM public.gameday_props p
  WHERE p.id = p_prop_id;

  SELECT participant.id, participant.room_id
  INTO v_participant
  FROM public.gameday_participants participant
  WHERE participant.id = p_participant_id;

  IF v_room.id IS NULL OR v_card.id IS NULL OR v_prop.id IS NULL
     OR v_participant.id IS NULL OR v_participant.room_id IS DISTINCT FROM v_room.id
  THEN
    RAISE EXCEPTION 'Participant, prop, and room do not match';
  END IF;

  IF v_room.source IS DISTINCT FROM 'discord'
     OR v_room.sport IS DISTINCT FROM 'madden'
     OR v_room.template_type IS DISTINCT FROM 'weekly_pick_card'
     OR NULLIF(btrim(v_room.discord_guild_id), '') IS NULL
     OR NULLIF(btrim(v_room.discord_channel_id), '') IS NULL
     OR v_room.archived_at IS NOT NULL
     OR v_room.status IS DISTINCT FROM 'active'
     OR v_card.status IS DISTINCT FROM 'open'
     OR (v_card.scheduled_lock_at IS NOT NULL AND v_card.scheduled_lock_at <= now())
  THEN
    RAISE EXCEPTION 'Madden picks are closed for this card';
  END IF;

  IF jsonb_typeof(v_prop.answer_options) IS DISTINCT FROM 'array'
     OR NOT (p_selected_answer IN (SELECT jsonb_array_elements_text(v_prop.answer_options)))
  THEN
    RAISE EXCEPTION 'Invalid answer option';
  END IF;

  -- Serializes answer comparison, version assignment, completion count, and
  -- event insertion for this room. Concurrent duplicate writes become no-ops.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_room.id::TEXT, 0));

  SELECT gp.selected_answer
  INTO v_previous_answer
  FROM public.gameday_picks gp
  WHERE gp.prop_id = p_prop_id
    AND gp.participant_id = p_participant_id;

  SELECT count(*) FILTER (
    WHERE jsonb_typeof(p.answer_options) = 'array'
      AND jsonb_array_length(p.answer_options) > 0
  )::INTEGER
  INTO v_required_count
  FROM public.gameday_props p
  WHERE p.card_id = v_card.id;

  SELECT count(*)::INTEGER
  INTO v_saved_count_before
  FROM public.gameday_picks gp
  JOIN public.gameday_props p ON p.id = gp.prop_id
  WHERE gp.participant_id = p_participant_id
    AND p.card_id = v_card.id
    AND jsonb_typeof(p.answer_options) = 'array'
    AND jsonb_array_length(p.answer_options) > 0
    AND gp.selected_answer IN (SELECT jsonb_array_elements_text(p.answer_options));

  v_material_change :=
    v_previous_answer IS NOT NULL
    AND v_previous_answer IS DISTINCT FROM p_selected_answer;

  INSERT INTO public.gameday_picks AS saved_pick (
    prop_id, participant_id, selected_answer, is_correct
  )
  VALUES (p_prop_id, p_participant_id, p_selected_answer, NULL)
  ON CONFLICT ON CONSTRAINT gameday_picks_prop_id_participant_id_key DO UPDATE
    SET selected_answer = EXCLUDED.selected_answer,
        is_correct = NULL,
        submitted_at = CASE
          WHEN saved_pick.selected_answer IS DISTINCT FROM EXCLUDED.selected_answer THEN now()
          ELSE saved_pick.submitted_at
        END
  RETURNING saved_pick.id, saved_pick.prop_id, saved_pick.participant_id,
    saved_pick.selected_answer, saved_pick.is_correct, saved_pick.submitted_at
  INTO pick_id, prop_id, participant_id, selected_answer, is_correct, submitted_at;

  IF v_required_count IS NULL OR v_required_count = 0 THEN
    RETURN QUERY SELECT pick_id, prop_id, participant_id, selected_answer,
      is_correct, submitted_at, NULL::UUID, false, NULL::INTEGER, NULL::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT count(*)::INTEGER
  INTO v_saved_count_after
  FROM public.gameday_picks gp
  JOIN public.gameday_props p ON p.id = gp.prop_id
  WHERE gp.participant_id = p_participant_id
    AND p.card_id = v_card.id
    AND jsonb_typeof(p.answer_options) = 'array'
    AND jsonb_array_length(p.answer_options) > 0
    AND gp.selected_answer IN (SELECT jsonb_array_elements_text(p.answer_options));

  IF v_saved_count_after IS DISTINCT FROM v_required_count
     OR (
       v_saved_count_before IS NOT DISTINCT FROM v_required_count
       AND NOT v_material_change
     )
  THEN
    RETURN QUERY SELECT pick_id, prop_id, participant_id, selected_answer,
      is_correct, submitted_at, NULL::UUID, false, NULL::INTEGER, NULL::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  -- Rollout compatibility: callers deployed before this migration omit the
  -- fourth argument and retain the historical completion-only behavior.
  IF NOT p_public_pick_events_enabled THEN
    SELECT e.id, e.event_type, e.completed_participant_count
    INTO v_existing
    FROM public.gameday_madden_participation_events e
    WHERE e.room_id = v_room.id
      AND e.participant_id = p_participant_id
    ORDER BY e.delivery_sequence DESC NULLS LAST, e.created_at DESC, e.id DESC
    LIMIT 1;

    IF v_existing.id IS NOT NULL
       AND v_existing.event_type = 'madden_picks_completed'
    THEN
      RETURN QUERY SELECT pick_id, prop_id, participant_id, selected_answer,
        is_correct, submitted_at, v_existing.id, false,
        v_existing.completed_participant_count, 'madden_picks_completed'::TEXT,
        NULL::INTEGER;
      RETURN;
    END IF;

    IF v_existing.id IS NULL THEN
      SELECT count(DISTINCT e.participant_id)::INTEGER + 1
      INTO v_count
      FROM public.gameday_madden_participation_events e
      WHERE e.room_id = v_room.id
        AND e.event_type IN (
          'madden_picks_completed',
          'pick_card_picks_submitted',
          'pick_card_picks_updated'
        );

      INSERT INTO public.gameday_madden_participation_events (
        event_type, room_id, card_id, participant_id, room_code, room_name,
        week_label, discord_guild_id, discord_channel_id, participant_display_name,
        completed_participant_count, delivery_sequence
      )
      SELECT
        'madden_picks_completed', v_room.id, v_card.id, p_participant_id,
        v_room.room_code, v_room.room_name,
        NULLIF(v_room.format_config->>'week_label', ''),
        v_room.discord_guild_id, v_room.discord_channel_id,
        participant.display_name, v_count,
        nextval('public.gameday_madden_participation_delivery_seq')
      FROM public.gameday_participants participant
      WHERE participant.id = p_participant_id
        AND participant.room_id = v_room.id
      RETURNING id INTO v_event_id;

      RETURN QUERY SELECT pick_id, prop_id, participant_id, selected_answer,
        is_correct, submitted_at, v_event_id, true, v_count,
        'madden_picks_completed'::TEXT, NULL::INTEGER;
      RETURN;
    END IF;

    -- Once any public event exists for this participant/card, even an older
    -- caller must continue the versioned public stream for material edits.
  END IF;

  SELECT COALESCE(max(e.submission_version), 0) + 1
  INTO v_version
  FROM public.gameday_madden_participation_events e
  WHERE e.room_id = v_room.id
    AND e.participant_id = p_participant_id
    AND e.event_type IN ('pick_card_picks_submitted', 'pick_card_picks_updated');

  v_event_type := CASE
    WHEN v_saved_count_before IS DISTINCT FROM v_required_count
      THEN 'pick_card_picks_submitted'
    ELSE 'pick_card_picks_updated'
  END;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'prop_id', p.id,
        'matchup_label', CASE
          WHEN jsonb_array_length(p.answer_options) >= 2
            THEN concat(p.answer_options->>0, ' vs ', p.answer_options->>1)
          ELSE p.question
        END,
        'selected_option', gp.selected_answer,
        'line_text', p.line_text,
        'display_order', p.display_order
      )
      ORDER BY p.display_order, p.id
    ),
    '[]'::JSONB
  )
  INTO v_picks
  FROM public.gameday_props p
  JOIN public.gameday_picks gp
    ON gp.prop_id = p.id
   AND gp.participant_id = p_participant_id
  WHERE p.card_id = v_card.id
    AND jsonb_typeof(p.answer_options) = 'array'
    AND jsonb_array_length(p.answer_options) > 0;

  SELECT EXISTS (
    SELECT 1
    FROM public.gameday_madden_participation_events e
    WHERE e.room_id = v_room.id
      AND e.participant_id = p_participant_id
      AND e.event_type IN (
        'madden_picks_completed',
        'pick_card_picks_submitted',
        'pick_card_picks_updated'
      )
  )
  INTO v_was_counted;

  SELECT count(DISTINCT e.participant_id)::INTEGER
    + CASE WHEN v_was_counted THEN 0 ELSE 1 END
  INTO v_count
  FROM public.gameday_madden_participation_events e
  WHERE e.room_id = v_room.id
    AND e.event_type IN (
      'madden_picks_completed',
      'pick_card_picks_submitted',
      'pick_card_picks_updated'
    );

  INSERT INTO public.gameday_madden_participation_events (
    event_type, room_id, card_id, participant_id, room_code, room_name,
    week_label, discord_guild_id, discord_channel_id, participant_display_name,
    completed_participant_count, submission_version, picks, delivery_sequence
  )
  SELECT
    v_event_type, v_room.id, v_card.id, p_participant_id,
    v_room.room_code, v_room.room_name,
    NULLIF(v_room.format_config->>'week_label', ''),
    v_room.discord_guild_id, v_room.discord_channel_id,
    participant.display_name, v_count, v_version, v_picks,
    nextval('public.gameday_madden_participation_delivery_seq')
  FROM public.gameday_participants participant
  WHERE participant.id = p_participant_id
    AND participant.room_id = v_room.id
  RETURNING id INTO v_event_id;

  RETURN QUERY SELECT pick_id, prop_id, participant_id, selected_answer,
    is_correct, submitted_at, v_event_id, true, v_count, v_event_type, v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_madden_pick_with_activity(UUID, UUID, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_madden_pick_with_activity(UUID, UUID, TEXT, BOOLEAN)
  TO service_role;

COMMIT;