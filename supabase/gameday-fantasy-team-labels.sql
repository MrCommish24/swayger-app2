-- Swayger Fantasy — Draft Day team-name answer labels
--
-- This migration is safe for a live Draft Day:
--   • Existing answer IDs and submitted picks are never changed.
--   • Only visible labels on active, non-finalized Draft Day cards are updated.
--   • Settled/archived cards remain historical snapshots.
--   • New Draft Day member options use team_name at creation time.
--
-- Run the whole file in the Supabase SQL Editor.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Backfill visible labels on current active Draft Day cards.
--
-- A season_member answer keeps its season_member UUID as `id`; only `label`
-- changes. This intentionally includes OPEN and LOCKED cards but excludes
-- settled cards and archived rooms.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.gameday_props AS gp
SET answer_options = (
  SELECT jsonb_agg(
           CASE
             WHEN team.team_name IS NOT NULL
             THEN jsonb_set(answer_elem.elem, '{label}', to_jsonb(team.team_name))
             ELSE answer_elem.elem
           END
           ORDER BY answer_elem.ordinality
         )
  FROM jsonb_array_elements(COALESCE(gp.answer_options, '[]'::jsonb))
       WITH ORDINALITY AS answer_elem(elem, ordinality)
  LEFT JOIN LATERAL (
    SELECT ft.team_name
    FROM public.fantasy_season_members AS sm
    JOIN public.fantasy_team_managers AS ftm
      ON ftm.season_member_id = sm.id
     AND ftm.is_active = true
    JOIN public.fantasy_teams AS ft
      ON ft.id = ftm.fantasy_team_id
     AND ft.is_active = true
    WHERE sm.league_season_id = room.league_season_id
      AND sm.id::text = answer_elem.elem ->> 'id'
      AND sm.is_active = true
    LIMIT 1
  ) AS team ON true
)
FROM public.gameday_pick_cards AS card
JOIN public.gameday_rooms AS room ON room.id = card.room_id
WHERE gp.card_id = card.id
  AND gp.answer_target_type = 'season_member'
  AND card.phase = 'draft_day'
  AND card.status <> 'settled'
  AND room.experience_type = 'fantasy'
  AND room.competition_type = 'draft_day'
  AND room.archived_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Keep active Draft Day labels team-based when a member is renamed.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_fantasy_member(
  p_season_member_id UUID,
  p_display_name     TEXT,
  p_team_name        TEXT,
  p_season_id        UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_member_id UUID;
  v_team_id          UUID;
  v_room_id          UUID;
  v_card_id          UUID;
  v_props_updated    INT  := 0;
  v_participant_rows INT  := 0;
  v_participant_upd  BOOL := false;
BEGIN
  IF trim(p_display_name) = '' THEN
    RAISE EXCEPTION 'display_name cannot be empty';
  END IF;
  IF trim(p_team_name) = '' THEN
    RAISE EXCEPTION 'team_name cannot be empty';
  END IF;

  SELECT league_member_id
  INTO   v_league_member_id
  FROM   fantasy_season_members
  WHERE  id = p_season_member_id;

  IF v_league_member_id IS NULL THEN
    RAISE EXCEPTION 'Season member not found';
  END IF;

  SELECT ftm.fantasy_team_id
  INTO   v_team_id
  FROM   fantasy_team_managers AS ftm
  WHERE  ftm.season_member_id = p_season_member_id
    AND  ftm.is_active = true
  LIMIT 1;

  UPDATE fantasy_league_members
  SET    display_name = trim(p_display_name),
         updated_at = NOW()
  WHERE  id = v_league_member_id;

  IF v_team_id IS NOT NULL THEN
    UPDATE fantasy_teams
    SET    team_name = trim(p_team_name),
           updated_at = NOW()
    WHERE  id = v_team_id;
  END IF;

  SELECT gr.id, gpc.id
  INTO   v_room_id, v_card_id
  FROM   gameday_rooms AS gr
  JOIN   gameday_pick_cards AS gpc ON gpc.room_id = gr.id
  WHERE  gr.league_season_id = p_season_id
    AND  gr.competition_type = 'draft_day'
    AND  gr.experience_type = 'fantasy'
    AND  gr.archived_at IS NULL
    AND  gpc.phase = 'draft_day'
    AND  gpc.status <> 'settled'
  LIMIT 1;

  IF v_card_id IS NOT NULL THEN
    -- Draft Day season_member options are labeled by team_name.
    UPDATE gameday_props
    SET answer_options = (
      SELECT jsonb_agg(
               CASE
                 WHEN (elem ->> 'id') = p_season_member_id::text
                 THEN jsonb_set(elem, '{label}', to_jsonb(trim(p_team_name)))
                 ELSE elem
               END
               ORDER BY ordinality
             )
      FROM jsonb_array_elements(answer_options)
           WITH ORDINALITY AS options(elem, ordinality)
    )
    WHERE card_id = v_card_id
      AND answer_target_type = 'season_member'
      AND answer_options @> ('[{"id":"' || p_season_member_id::text || '"}]')::jsonb;

    GET DIAGNOSTICS v_props_updated = ROW_COUNT;

    IF v_team_id IS NOT NULL THEN
      UPDATE gameday_props
      SET answer_options = (
        SELECT jsonb_agg(
                 CASE
                   WHEN (elem ->> 'id') = v_team_id::text
                   THEN jsonb_set(elem, '{label}', to_jsonb(trim(p_team_name)))
                   ELSE elem
                 END
                 ORDER BY ordinality
               )
        FROM jsonb_array_elements(answer_options)
             WITH ORDINALITY AS options(elem, ordinality)
      )
      WHERE card_id = v_card_id
        AND answer_target_type = 'fantasy_team'
        AND answer_options @> ('[{"id":"' || v_team_id::text || '"}]')::jsonb;
    END IF;

    UPDATE gameday_participants
    SET display_name = trim(p_display_name),
        team_name = trim(p_team_name)
    WHERE season_member_id = p_season_member_id
      AND room_id = v_room_id;

    GET DIAGNOSTICS v_participant_rows = ROW_COUNT;
    v_participant_upd := v_participant_rows > 0;
  END IF;

  RETURN json_build_object(
    'league_member_id', v_league_member_id,
    'team_id', v_team_id,
    'props_updated', v_props_updated,
    'participant_updated', v_participant_upd
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_fantasy_member(UUID, TEXT, TEXT, UUID)
  TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Use team_name for new season_member options appended to an open Draft Day.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_fantasy_season_participant_v2(
  p_league_id          UUID,
  p_league_season_id   UUID,
  p_display_name       TEXT,
  p_team_name          TEXT,
  p_league_member_id   UUID    DEFAULT NULL,
  p_draft_day_eligible BOOLEAN DEFAULT TRUE,
  p_room_id            UUID    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_member_id UUID;
  v_season_member_id UUID;
  v_team_id          UUID;
  v_manager_id       UUID;
  v_card_id          UUID;
  v_existing_sm_id   UUID;
  v_existing_team_id UUID;
BEGIN
  IF trim(p_display_name) = '' THEN
    RAISE EXCEPTION 'display_name cannot be empty';
  END IF;
  IF trim(p_team_name) = '' THEN
    RAISE EXCEPTION 'team_name cannot be empty';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fantasy_leagues
    WHERE id = p_league_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Fantasy league not found: %', p_league_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fantasy_league_seasons
    WHERE id = p_league_season_id AND league_id = p_league_id
  ) THEN
    RAISE EXCEPTION 'Season % does not belong to league %',
      p_league_season_id, p_league_id;
  END IF;

  IF p_league_member_id IS NOT NULL THEN
    SELECT sm.id, ftm.fantasy_team_id
    INTO v_existing_sm_id, v_existing_team_id
    FROM fantasy_season_members AS sm
    LEFT JOIN fantasy_team_managers AS ftm
      ON ftm.season_member_id = sm.id
     AND ftm.is_active = true
    WHERE sm.league_season_id = p_league_season_id
      AND sm.league_member_id = p_league_member_id
      AND sm.is_active = true
    LIMIT 1;

    IF v_existing_sm_id IS NOT NULL AND v_existing_team_id IS NOT NULL THEN
      SELECT id
      INTO v_manager_id
      FROM fantasy_team_managers
      WHERE fantasy_team_id = v_existing_team_id
        AND season_member_id = v_existing_sm_id
        AND is_active = true
      LIMIT 1;

      RETURN json_build_object(
        'already_exists', true,
        'league_member_id', p_league_member_id,
        'season_member_id', v_existing_sm_id,
        'team_id', v_existing_team_id,
        'manager_id', v_manager_id,
        'draft_day_eligible', p_draft_day_eligible
      );
    END IF;

    v_league_member_id := p_league_member_id;
  ELSE
    INSERT INTO fantasy_league_members (league_id, display_name, is_active)
    VALUES (p_league_id, trim(p_display_name), true)
    RETURNING id INTO v_league_member_id;
  END IF;

  INSERT INTO fantasy_season_members (
    league_season_id, league_member_id, role, is_active, draft_day_eligible
  )
  VALUES (
    p_league_season_id, v_league_member_id, 'member', true, p_draft_day_eligible
  )
  RETURNING id INTO v_season_member_id;

  INSERT INTO fantasy_teams (league_season_id, team_name)
  VALUES (p_league_season_id, trim(p_team_name))
  RETURNING id INTO v_team_id;

  INSERT INTO fantasy_team_managers (fantasy_team_id, season_member_id, role, is_active)
  VALUES (v_team_id, v_season_member_id, 'manager', true)
  RETURNING id INTO v_manager_id;

  IF p_room_id IS NOT NULL THEN
    SELECT id
    INTO v_card_id
    FROM gameday_pick_cards
    WHERE room_id = p_room_id
      AND phase = 'draft_day'
    LIMIT 1;

    IF v_card_id IS NOT NULL THEN
      UPDATE gameday_props
      SET answer_options = answer_options || jsonb_build_array(
        jsonb_build_object(
          'id', v_season_member_id::text,
          'label', trim(p_team_name),
          'type', 'season_member'
        )
      )
      WHERE card_id = v_card_id
        AND answer_target_type = 'season_member';

      UPDATE gameday_props
      SET answer_options = answer_options || jsonb_build_array(
        jsonb_build_object(
          'id', v_team_id::text,
          'label', trim(p_team_name),
          'type', 'fantasy_team'
        )
      )
      WHERE card_id = v_card_id
        AND answer_target_type = 'fantasy_team';

      UPDATE gameday_pick_cards
      SET roster_revision = roster_revision + 1
      WHERE id = v_card_id;
    END IF;
  END IF;

  RETURN json_build_object(
    'already_exists', false,
    'league_member_id', v_league_member_id,
    'season_member_id', v_season_member_id,
    'team_id', v_team_id,
    'manager_id', v_manager_id,
    'draft_day_eligible', p_draft_day_eligible
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_fantasy_season_participant_v2(
  UUID, UUID, TEXT, TEXT, UUID, BOOLEAN, UUID
) TO service_role, authenticated, anon;

COMMIT;