-- Madden Discord participation activity outbox
-- Apply after the Game Day and Madden Weekly Pick Card migrations.
--
-- This table is intentionally service-role-only. The Express API is the
-- participant and Discord-bot boundary; neither browser role needs direct
-- access to delivery records.

BEGIN;

CREATE TABLE IF NOT EXISTS public.gameday_madden_participation_events (
  id                          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type                  TEXT        NOT NULL DEFAULT 'madden_picks_completed',
  room_id                     UUID        NOT NULL REFERENCES public.gameday_rooms(id) ON DELETE CASCADE,
  card_id                     UUID        NOT NULL REFERENCES public.gameday_pick_cards(id) ON DELETE CASCADE,
  participant_id              UUID        NOT NULL REFERENCES public.gameday_participants(id) ON DELETE CASCADE,
  room_code                   TEXT,
  room_name                   TEXT        NOT NULL,
  week_label                  TEXT,
  discord_guild_id            TEXT        NOT NULL,
  discord_channel_id          TEXT        NOT NULL,
  participant_display_name    TEXT        NOT NULL,
  completed_participant_count INTEGER     NOT NULL CHECK (completed_participant_count > 0),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at                TIMESTAMPTZ,
  CONSTRAINT gameday_madden_participation_events_type_room_participant_uniq
    UNIQUE (event_type, room_id, participant_id)
);

CREATE INDEX IF NOT EXISTS gameday_madden_participation_events_pending_idx
  ON public.gameday_madden_participation_events (discord_guild_id, created_at)
  WHERE delivered_at IS NULL;

ALTER TABLE public.gameday_madden_participation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_madden_participation_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gameday_madden_participation_events FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.gameday_madden_participation_events TO service_role;

-- Eligible Madden writes use this one transaction. The room/card row locks
-- linearize a pick against archive/finalize/lock updates, while the advisory
-- lock serializes completion claims so counts are 1, 2, ... under concurrency.
CREATE OR REPLACE FUNCTION public.submit_madden_pick_with_activity(
  p_prop_id UUID,
  p_participant_id UUID,
  p_selected_answer TEXT
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
  completed_participant_count INTEGER
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
  v_required_count INTEGER;
  v_saved_count INTEGER;
  v_existing RECORD;
  v_event_id UUID;
  v_count INTEGER;
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

  IF v_room.id IS NULL OR v_card.id IS NULL
     OR v_room.source IS DISTINCT FROM 'discord'
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

  PERFORM pg_advisory_xact_lock(hashtextextended(v_room.id::TEXT, 0));

  INSERT INTO public.gameday_picks AS saved_pick (
    prop_id, participant_id, selected_answer, is_correct
  )
  VALUES (p_prop_id, p_participant_id, p_selected_answer, NULL)
  ON CONFLICT ON CONSTRAINT gameday_picks_prop_id_participant_id_key DO UPDATE
    SET selected_answer = EXCLUDED.selected_answer, is_correct = NULL,
        submitted_at = now()
  RETURNING saved_pick.id, saved_pick.prop_id, saved_pick.participant_id,
    saved_pick.selected_answer, saved_pick.is_correct, saved_pick.submitted_at
  INTO pick_id, prop_id, participant_id, selected_answer, is_correct, submitted_at;

  -- Completion is calculated from every playable prop on this card, not only
  -- the current prop. Enabled choice bonuses are ordinary playable props.
  SELECT
    count(*) FILTER (
      WHERE jsonb_typeof(p.answer_options) = 'array'
        AND jsonb_array_length(p.answer_options) > 0
    )::INTEGER
  INTO v_required_count
  FROM public.gameday_props p
  WHERE p.card_id = v_card.id;

  IF v_required_count IS NULL OR v_required_count = 0 THEN
    RETURN QUERY SELECT pick_id, prop_id, participant_id, selected_answer,
      is_correct, submitted_at, NULL::UUID, false, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT count(*)::INTEGER
  INTO v_saved_count
  FROM public.gameday_picks gp
  JOIN public.gameday_props p ON p.id = gp.prop_id
  WHERE gp.participant_id = p_participant_id
    AND p.card_id = v_card.id
    AND jsonb_typeof(p.answer_options) = 'array'
    AND jsonb_array_length(p.answer_options) > 0
    AND gp.selected_answer IN (
      SELECT jsonb_array_elements_text(p.answer_options)
    );

  IF v_saved_count IS DISTINCT FROM v_required_count THEN
    RETURN QUERY SELECT pick_id, prop_id, participant_id, selected_answer,
      is_correct, submitted_at, NULL::UUID, false, NULL::INTEGER;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_room.id::TEXT, 0));
  SELECT e.id, e.completed_participant_count
  INTO v_existing
  FROM public.gameday_madden_participation_events e
  WHERE e.event_type = 'madden_picks_completed'
    AND e.room_id = v_room.id
    AND e.participant_id = p_participant_id;

  IF v_existing.id IS NOT NULL THEN
    RETURN QUERY SELECT pick_id, prop_id, participant_id, selected_answer,
      is_correct, submitted_at, v_existing.id, false, v_existing.completed_participant_count;
    RETURN;
  END IF;

  SELECT count(*)::INTEGER + 1
  INTO v_count
  FROM public.gameday_madden_participation_events e
  WHERE e.event_type = 'madden_picks_completed'
    AND e.room_id = v_room.id;

  INSERT INTO public.gameday_madden_participation_events (
    event_type, room_id, card_id, participant_id, room_code, room_name,
    week_label, discord_guild_id, discord_channel_id, participant_display_name,
    completed_participant_count
  )
  SELECT
    'madden_picks_completed', v_room.id, v_card.id, p_participant_id,
    v_room.room_code, v_room.room_name,
    NULLIF(v_room.format_config->>'week_label', ''),
    v_room.discord_guild_id, v_room.discord_channel_id,
    participant.display_name, v_count
  FROM public.gameday_participants participant
  WHERE participant.id = p_participant_id
    AND participant.room_id = v_room.id
  RETURNING id INTO v_event_id;

  IF v_event_id IS NOT NULL THEN
    RETURN QUERY SELECT pick_id, prop_id, participant_id, selected_answer,
      is_correct, submitted_at, v_event_id, true, v_count;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_madden_pick_with_activity(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_madden_pick_with_activity(UUID, UUID, TEXT)
  TO service_role;

COMMIT;