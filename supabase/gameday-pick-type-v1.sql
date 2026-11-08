-- Pick Card V1: explicit Winner/ATS metadata; additive to existing Game Day.
-- Apply after the Madden V2 bonus and public-event migrations.
BEGIN;

ALTER TABLE public.gameday_pick_cards ADD COLUMN IF NOT EXISTS pick_type TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='gameday_pick_cards_pick_type_check') THEN
    ALTER TABLE public.gameday_pick_cards ADD CONSTRAINT gameday_pick_cards_pick_type_check
      CHECK (pick_type IS NULL OR pick_type IN ('straight_up','spread'));
  END IF;
END $$;
UPDATE public.gameday_pick_cards c SET pick_type='straight_up'
FROM public.gameday_rooms r WHERE r.id=c.room_id AND r.sport='madden'
  AND r.template_type='weekly_pick_card' AND c.pick_type IS NULL;
COMMENT ON COLUMN public.gameday_pick_cards.pick_type IS
  'Explicit team-picking mode for Madden Weekly. NULL for unrelated/legacy formats. Never inferred from line_text.';

ALTER TABLE public.gameday_madden_participation_events ADD COLUMN IF NOT EXISTS pick_type TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='gameday_madden_events_pick_type_check') THEN
    ALTER TABLE public.gameday_madden_participation_events ADD CONSTRAINT gameday_madden_events_pick_type_check
      CHECK (pick_type IS NULL OR pick_type IN ('straight_up','spread'));
  END IF;
END $$;

-- Shared SQL equivalent of lib/gameday-pick-type.ts. Only signed whole/half
-- points or PK are valid ATS lines; no extraction from free-form strings.
CREATE OR REPLACE FUNCTION public.gameday_pick_display_options(
  p_pick_type TEXT, p_options JSONB, p_line TEXT
) RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE spread NUMERIC; labels JSONB; raw TEXT := btrim(p_line);
BEGIN
  IF jsonb_typeof(p_options) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_options) <> 2 THEN RETURN NULL; END IF;
  IF p_pick_type='spread' THEN
    IF upper(raw)='PK' THEN spread:=0;
    ELSIF raw ~ '^[+-][0-9]+([.][05])?$' AND length(raw)<=120 THEN
      spread:=raw::NUMERIC;
      IF abs(spread * 2)>9007199254740991 THEN RAISE EXCEPTION 'ATS spread outside safe numeric range'; END IF;
    ELSE RAISE EXCEPTION 'ATS requires Team B signed integer/half-point spread or PK';
    END IF;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('value', value, 'label',
    CASE WHEN p_pick_type='spread' THEN value || ' ' ||
      CASE WHEN spread=0 THEN 'PK'
           WHEN (CASE WHEN ord=1 THEN -spread ELSE spread END)>0
             THEN '+' || trim_scale(CASE WHEN ord=1 THEN -spread ELSE spread END)::TEXT
           ELSE trim_scale(CASE WHEN ord=1 THEN -spread ELSE spread END)::TEXT END
    ELSE value END) ORDER BY ord) INTO labels
  FROM jsonb_array_elements_text(p_options) WITH ORDINALITY AS opt(value,ord);
  RETURN labels;
END $$;

-- BEFORE INSERT runs inside the existing pick+outbox transaction. Only NEW
-- events get labels: fetch/ack/retries never rebuild historical snapshots.
CREATE OR REPLACE FUNCTION public.snapshot_gameday_pick_type_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE mode TEXT; item JSONB; options JSONB; display JSONB; snapshot JSONB:='[]'::JSONB;
BEGIN
  SELECT COALESCE(c.pick_type,'straight_up') INTO mode
    FROM public.gameday_pick_cards c WHERE c.id=NEW.card_id;
  NEW.pick_type:=mode;
  IF NEW.picks IS NOT NULL THEN
    FOR item IN SELECT value FROM jsonb_array_elements(NEW.picks) LOOP
      IF COALESCE(item->>'answer_type','choice')='choice' THEN
        SELECT p.answer_options INTO options FROM public.gameday_props p
          WHERE p.id=(item->>'prop_id')::UUID AND p.card_id=NEW.card_id;
        display:=public.gameday_pick_display_options(mode,options,item->>'line_text');
        IF mode='spread' AND display IS NULL THEN
          RAISE EXCEPTION 'ATS event requires two-team matchup metadata';
        END IF;
        IF display IS NOT NULL THEN
          item:=item || jsonb_build_object('display_options',display);
        END IF;
      END IF;
      snapshot:=snapshot || jsonb_build_array(item);
    END LOOP;
    NEW.picks:=snapshot;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gameday_pick_type_event_snapshot ON public.gameday_madden_participation_events;
CREATE TRIGGER gameday_pick_type_event_snapshot
  BEFORE INSERT ON public.gameday_madden_participation_events
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_gameday_pick_type_event();

REVOKE ALL ON FUNCTION public.gameday_pick_display_options(TEXT,JSONB,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gameday_pick_display_options(TEXT,JSONB,TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.snapshot_gameday_pick_type_event() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_gameday_pick_type_event() TO service_role;
COMMIT;
