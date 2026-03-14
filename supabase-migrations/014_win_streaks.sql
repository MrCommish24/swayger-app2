-- Win streaks on profiles + streak tracking in confirm_settlement

-- 1. Add streak columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS current_win_streak INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_win_streak    INT NOT NULL DEFAULT 0;

-- 2. Replace confirm_settlement to track streaks when a swayger settles
DROP FUNCTION IF EXISTS confirm_settlement(UUID, UUID);

CREATE OR REPLACE FUNCTION confirm_settlement(p_swayger_id UUID, p_proposal_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id          UUID;
  v_creator_id       UUID;
  v_opponent_id      UUID;
  v_status           TEXT;
  v_outcome          TEXT;
  v_creator_confirmed BOOLEAN;
  v_opponent_confirmed BOOLEAN;
  v_is_creator       BOOLEAN;
  v_both_confirmed   BOOLEAN;
  v_winner_id        UUID;
  v_loser_id         UUID;
  v_new_streak       INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT status::text, creator_id, opponent_id
    INTO v_status, v_creator_id, v_opponent_id
    FROM swaygers WHERE id = p_swayger_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('error', 'Swayger not found.');
  END IF;

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

  IF v_outcome IS NULL THEN
    RETURN json_build_object('error', 'Proposal not found.');
  END IF;

  v_is_creator := (v_user_id = v_creator_id);

  IF v_is_creator THEN
    UPDATE settlement_proposals
       SET creator_confirmed = true, updated_at = now()
     WHERE id = p_proposal_id;
    v_creator_confirmed := true;
  ELSE
    UPDATE settlement_proposals
       SET opponent_confirmed = true, updated_at = now()
     WHERE id = p_proposal_id;
    v_opponent_confirmed := true;
  END IF;

  v_both_confirmed := v_creator_confirmed AND v_opponent_confirmed;

  IF v_both_confirmed THEN
    -- Settle the swayger
    UPDATE swaygers
       SET status = 'settled'::swayger_status,
           settled_outcome = v_outcome,
           updated_at = now()
     WHERE id = p_swayger_id;

    -- Update streaks only for decisive outcomes (not draw / no_contest)
    IF v_outcome = 'creator' THEN
      v_winner_id := v_creator_id;
      v_loser_id  := v_opponent_id;
    ELSIF v_outcome = 'opponent' THEN
      v_winner_id := v_opponent_id;
      v_loser_id  := v_creator_id;
    END IF;

    IF v_winner_id IS NOT NULL THEN
      -- Increment winner streak and update best
      UPDATE profiles
         SET current_win_streak = current_win_streak + 1,
             best_win_streak    = GREATEST(best_win_streak, current_win_streak + 1),
             updated_at         = now()
       WHERE id = v_winner_id;

      -- Reset loser streak to 0
      IF v_loser_id IS NOT NULL THEN
        UPDATE profiles
           SET current_win_streak = 0,
               updated_at         = now()
         WHERE id = v_loser_id;
      END IF;
    END IF;
    -- Draw / no_contest: streaks unchanged (pause, not reset)
  END IF;

  RETURN json_build_object('error', NULL, 'settled', v_both_confirmed);
END;
$$;

-- Verify
DO $$
DECLARE
  v_has_streak INT;
BEGIN
  SELECT COUNT(*) INTO v_has_streak
    FROM information_schema.columns
   WHERE table_name = 'profiles'
     AND column_name IN ('current_win_streak', 'best_win_streak');
  ASSERT v_has_streak = 2, 'streak columns not found on profiles';

  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'confirm_settlement') > 0,
    'confirm_settlement function not found';

  RAISE NOTICE 'win_streaks migration: OK';
END $$;
