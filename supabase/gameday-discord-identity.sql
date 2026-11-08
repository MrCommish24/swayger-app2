-- Additive Discord identity MVP. Run explicitly against the Swayger database.
BEGIN;
CREATE TABLE public.gameday_discord_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_guild_id text NOT NULL CHECK (discord_guild_id ~ '^[0-9]{1,32}$'),
  discord_user_id text NOT NULL CHECK (discord_user_id ~ '^[0-9]{1,32}$'),
  latest_display_name text NOT NULL CHECK (length(btrim(latest_display_name)) BETWEEN 1 AND 100 AND latest_display_name !~ '[[:cntrl:]]'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discord_guild_id, discord_user_id)
);
ALTER TABLE public.gameday_participants ADD COLUMN discord_identity_id uuid
  REFERENCES public.gameday_discord_identities(id) ON DELETE RESTRICT;
ALTER TABLE public.gameday_participants ADD CONSTRAINT gameday_participants_room_discord_key UNIQUE(room_id, discord_identity_id);
-- Discord names are not identities. Keep name uniqueness for all legacy paths.
ALTER TABLE public.gameday_participants DROP CONSTRAINT gameday_participants_room_id_display_name_key;
CREATE UNIQUE INDEX gameday_participants_legacy_room_name_key
  ON public.gameday_participants(room_id, display_name) WHERE discord_identity_id IS NULL;

CREATE TABLE public.gameday_discord_participant_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  room_id uuid NOT NULL REFERENCES public.gameday_rooms(id) ON DELETE CASCADE,
  discord_identity_id uuid NOT NULL REFERENCES public.gameday_discord_identities(id) ON DELETE CASCADE,
  display_name_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','redeemed','revoked'))
);
CREATE INDEX gameday_discord_links_identity_room_idx
  ON public.gameday_discord_participant_links(discord_identity_id, room_id);
CREATE TABLE public.gameday_discord_participant_sessions (
  session_hash text PRIMARY KEY CHECK (session_hash ~ '^[0-9a-f]{64}$'),
  participant_id uuid NOT NULL REFERENCES public.gameday_participants(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.gameday_rooms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX gameday_discord_sessions_participant_idx ON public.gameday_discord_participant_sessions(participant_id);
-- Never expose identity mappings, token hashes or session hashes to browser roles.
ALTER TABLE public.gameday_discord_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_discord_participant_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_discord_participant_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gameday_discord_identities, public.gameday_discord_participant_links,
  public.gameday_discord_participant_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.gameday_discord_identities, public.gameday_discord_participant_links,
  public.gameday_discord_participant_sessions TO service_role;

-- Both lifecycle functions serialize through the room, then identity/token.
-- Validate the authoritative card status/deadline again inside each transaction.
CREATE FUNCTION public.issue_gameday_discord_link(
  p_room_id uuid, p_guild_id text, p_user_id text, p_display_name text, p_token_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.gameday_rooms%ROWTYPE; c public.gameday_pick_cards%ROWTYPE;
  identity_id uuid; expiry timestamptz;
BEGIN
  SELECT * INTO r FROM public.gameday_rooms WHERE id=p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  IF r.source IS DISTINCT FROM 'discord' OR r.discord_guild_id IS DISTINCT FROM p_guild_id THEN
    RAISE EXCEPTION 'guild_mismatch'; END IF;
  IF r.sport IS DISTINCT FROM 'madden' OR r.template_type IS DISTINCT FROM 'weekly_pick_card' THEN
    RAISE EXCEPTION 'ineligible_room'; END IF;
  IF r.archived_at IS NOT NULL OR r.status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'room_closed'; END IF;
  SELECT * INTO c FROM public.gameday_pick_cards WHERE room_id=p_room_id ORDER BY display_order LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR c.status IS DISTINCT FROM 'open' OR
    (c.scheduled_lock_at IS NOT NULL AND c.scheduled_lock_at<=clock_timestamp()) THEN
    RAISE EXCEPTION 'room_closed'; END IF;
  INSERT INTO public.gameday_discord_identities(discord_guild_id,discord_user_id,latest_display_name)
    VALUES(p_guild_id,p_user_id,p_display_name)
    ON CONFLICT(discord_guild_id,discord_user_id) DO UPDATE SET
      latest_display_name=excluded.latest_display_name,last_seen_at=clock_timestamp(),updated_at=clock_timestamp()
    RETURNING id INTO identity_id;
  UPDATE public.gameday_discord_participant_links SET status='revoked'
    WHERE room_id=p_room_id AND discord_identity_id=identity_id AND status='pending';
  expiry := clock_timestamp()+interval '10 minutes';
  INSERT INTO public.gameday_discord_participant_links(token_hash,room_id,discord_identity_id,display_name_snapshot,expires_at)
    VALUES(p_token_hash,p_room_id,identity_id,p_display_name,expiry);
  RETURN jsonb_build_object('expires_at',expiry);
END $$;

CREATE FUNCTION public.redeem_gameday_discord_link(
  p_token_hash text, p_session_hash text, p_expected_room_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE l public.gameday_discord_participant_links%ROWTYPE;
  r public.gameday_rooms%ROWTYPE; c public.gameday_pick_cards%ROWTYPE;
  p public.gameday_participants%ROWTYPE; identity_guild text; target_room uuid; expiry timestamptz;
BEGIN
  -- Read the room first to keep lock ordering consistent with issuance.
  SELECT room_id INTO target_room FROM public.gameday_discord_participant_links WHERE token_hash=p_token_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF p_expected_room_id IS NOT NULL AND target_room<>p_expected_room_id THEN RAISE EXCEPTION 'wrong_room'; END IF;
  SELECT * INTO r FROM public.gameday_rooms WHERE id=target_room FOR UPDATE;
  SELECT * INTO l FROM public.gameday_discord_participant_links WHERE token_hash=p_token_hash FOR UPDATE;
  IF l.status='redeemed' THEN RAISE EXCEPTION 'token_used'; END IF;
  IF l.status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'token_revoked'; END IF;
  IF l.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'token_expired'; END IF;
  SELECT discord_guild_id INTO identity_guild FROM public.gameday_discord_identities WHERE id=l.discord_identity_id;
  IF r.source IS DISTINCT FROM 'discord' OR r.discord_guild_id IS DISTINCT FROM identity_guild
    OR r.sport IS DISTINCT FROM 'madden' OR r.template_type IS DISTINCT FROM 'weekly_pick_card' THEN
    RAISE EXCEPTION 'ineligible_room'; END IF;
  IF r.archived_at IS NOT NULL OR r.status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'room_closed'; END IF;
  SELECT * INTO c FROM public.gameday_pick_cards WHERE room_id=target_room ORDER BY display_order LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR c.status IS DISTINCT FROM 'open' OR
    (c.scheduled_lock_at IS NOT NULL AND c.scheduled_lock_at<=clock_timestamp()) THEN
    RAISE EXCEPTION 'room_closed'; END IF;
  INSERT INTO public.gameday_participants(room_id,discord_identity_id,display_name,is_guest)
    VALUES(target_room,l.discord_identity_id,l.display_name_snapshot,true)
    ON CONFLICT(room_id,discord_identity_id) DO NOTHING;
  SELECT * INTO p FROM public.gameday_participants
    WHERE room_id=target_room AND discord_identity_id=l.discord_identity_id;
  expiry:=clock_timestamp()+interval '30 days';
  INSERT INTO public.gameday_discord_participant_sessions(session_hash,participant_id,room_id,expires_at)
    VALUES(p_session_hash,p.id,target_room,expiry);
  UPDATE public.gameday_discord_participant_links SET status='redeemed',redeemed_at=clock_timestamp() WHERE id=l.id;
  RETURN jsonb_build_object('participant',jsonb_build_object(
    'id',p.id,'room_id',p.room_id,'display_name',p.display_name,'is_guest',true,'identity_provider','discord'
  ),'session_expires_at',expiry);
END $$;
REVOKE ALL ON FUNCTION public.issue_gameday_discord_link(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.redeem_gameday_discord_link(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_gameday_discord_link(uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_gameday_discord_link(text,text,uuid) TO service_role;
COMMIT;
