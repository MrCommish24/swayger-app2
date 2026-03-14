-- Migration 017: Add accepted_at and settled_at timestamps to swaygers
-- Run this in the Supabase SQL Editor.
--
-- accepted_at: stamped when accept_swayger sets status → active
-- settled_at:  stamped when confirm_settlement mutually confirms both parties

-- ── Add columns ───────────────────────────────────────────────────────────────
ALTER TABLE swaygers
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_at  TIMESTAMPTZ;

-- Backfill best approximation for existing rows
UPDATE swaygers SET accepted_at = updated_at
WHERE accepted_at IS NULL AND status IN ('active','settlement_proposed','settled','expired_active');

UPDATE swaygers SET settled_at = updated_at
WHERE settled_at IS NULL AND status = 'settled';

-- ── accept_swayger: stamp accepted_at ────────────────────────────────────────
DROP FUNCTION IF EXISTS accept_swayger(UUID, TEXT);

CREATE OR REPLACE FUNCTION accept_swayger(p_swayger_id UUID, p_opponent_pick TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id     UUID;
  v_status      TEXT;
  v_opponent_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT status::text, opponent_id INTO v_status, v_opponent_id
  FROM swaygers WHERE id = p_swayger_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;
  IF v_status != 'pending_invite' THEN
    RETURN json_build_object('error', 'This Swayger is not pending.');
  END IF;
  IF v_opponent_id != v_user_id THEN
    RETURN json_build_object('error', 'You are not the opponent for this Swayger.');
  END IF;

  UPDATE swaygers
  SET opponent_pick = TRIM(p_opponent_pick),
      status        = 'active'::swayger_status,
      accepted_at   = now(),
      updated_at    = now()
  WHERE id = p_swayger_id;

  RETURN json_build_object('error', NULL);
END;
$$;

-- ── confirm_settlement: stamp settled_at ─────────────────────────────────────
-- Full replacement preserving win-streak logic from migration 014.
DROP FUNCTION IF EXISTS confirm_settlement(UUID, UUID);

CREATE OR REPLACE FUNCTION confirm_settlement(p_swayger_id UUID, p_proposal_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id            UUID;
  v_creator_id         UUID;
  v_opponent_id        UUID;
  v_status             TEXT;
  v_outcome            TEXT;
  v_creator_confirmed  BOOLEAN;
  v_opponent_confirmed BOOLEAN;
  v_is_creator         BOOLEAN;
  v_both_confirmed     BOOLEAN;
  v_winner_id          UUID;
  v_loser_id           UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT status::text, creator_id, opponent_id
    INTO v_status, v_creator_id, v_opponent_id
    FROM swaygers WHERE id = p_swayger_id;

  IF v_status IS NULL THEN RETURN json_build_object('error', 'Swayger not found.'); END IF;
  IF v_status NOT IN ('active', 'settlement_proposed') THEN
    RETURN json_build_object('error', 'Cannot confirm settlement on this Swayger.');
  END IF;
  IF v_user_id != v_creator_id AND v_user_id != v_opponent_id THEN
    RETURN json_build_object('error', 'Only participants can confirm settlement.');
  END IF;

  SELECT outcome, creator_confirmed, opponent_confirmed
    INTO v_outcome, v_creator_confirmed, v_opponent_confirmed
    FROM settlement_proposals
    WHERE id = p_proposal_id AND swayger_id = p_swayger_id;

  IF v_outcome IS NULL THEN RETURN json_build_object('error', 'Proposal not found.'); END IF;

  v_is_creator := (v_user_id = v_creator_id);
  IF v_is_creator THEN
    UPDATE settlement_proposals SET creator_confirmed = true, updated_at = now() WHERE id = p_proposal_id;
    v_creator_confirmed := true;
  ELSE
    UPDATE settlement_proposals SET opponent_confirmed = true, updated_at = now() WHERE id = p_proposal_id;
    v_opponent_confirmed := true;
  END IF;

  v_both_confirmed := v_creator_confirmed AND v_opponent_confirmed;

  IF v_both_confirmed THEN
    UPDATE swaygers
    SET status          = 'settled'::swayger_status,
        settled_outcome = v_outcome,
        settled_at      = now(),
        updated_at      = now()
    WHERE id = p_swayger_id;

    IF v_outcome = 'creator' THEN
      v_winner_id := v_creator_id; v_loser_id := v_opponent_id;
    ELSIF v_outcome = 'opponent' THEN
      v_winner_id := v_opponent_id; v_loser_id := v_creator_id;
    END IF;

    IF v_winner_id IS NOT NULL THEN
      UPDATE profiles
         SET current_win_streak = current_win_streak + 1,
             best_win_streak    = GREATEST(best_win_streak, current_win_streak + 1),
             updated_at         = now()
       WHERE id = v_winner_id;

      IF v_loser_id IS NOT NULL THEN
        UPDATE profiles SET current_win_streak = 0, updated_at = now() WHERE id = v_loser_id;
      END IF;
    END IF;
  END IF;

  RETURN json_build_object('error', NULL, 'settled', v_both_confirmed);
END;
$$;
