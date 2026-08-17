-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 5.2.3: Commissioner-Assisted Member Recovery
-- File: supabase/gameday-fantasy-phase5-2-3-recovery.sql
--
-- Apply manually in Supabase SQL Editor BEFORE deploying server code.
-- STOP — do not auto-apply.
-- https://app.supabase.com/project/vlxvoienyxzhyaiimccp/sql/new
--
-- What this migration adds (additive only — no existing data touched):
--   1. fantasy_member_recovery_tokens table
--   2. Indexes: hash lookup + member/status enforcement
--   3. create_member_recovery_token RPC (SECURITY DEFINER)
--   4. redeem_member_recovery_token  RPC (SECURITY DEFINER)
--   5. revoke_member_recovery_token  RPC (SECURITY DEFINER)
--
-- What does NOT change:
--   - fantasy_member_claims     — schema, data, constraints, partial unique index
--   - fantasy_league_members    — untouched
--   - fantasy_season_members    — untouched
--   - fantasy_teams             — untouched
--   - gameday_picks             — untouched
--   - gameday_participants      — untouched
--   - fantasy_league_seasons    — untouched (roster_revision/answer_universe_revision)
--   - any historical pick/score/standings data
--
-- Identity transfer mechanism:
--   The redemption RPC reuses the EXACT same UPDATE that POST /claim/upgrade uses:
--     UPDATE fantasy_member_claims
--       SET user_id = <new_user>, guest_token = NULL
--     WHERE id = <claim_id>
--   Same row. No new record. Partial unique index never violated.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fantasy_member_recovery_tokens
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE fantasy_member_recovery_tokens (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context: which league / season / seat this token authorizes recovery of.
  -- league_season_id is stored for routing after successful redemption.
  -- league_member_id is the key identity anchor; cascade-deletes with the member.
  league_id            UUID        NOT NULL REFERENCES fantasy_leagues(id)        ON DELETE CASCADE,
  league_season_id     UUID                 REFERENCES fantasy_league_seasons(id) ON DELETE SET NULL,
  league_member_id     UUID        NOT NULL REFERENCES fantasy_league_members(id) ON DELETE CASCADE,

  -- Audit: who created this token and when
  created_by_user_id   UUID        NOT NULL REFERENCES auth.users(id)             ON DELETE CASCADE,

  -- The raw token is NEVER stored. This is SHA-256(raw_token) in hex (64 chars).
  -- UNIQUE enforces one hash cannot appear twice; lookup is always by this hash.
  token_hash           TEXT        NOT NULL UNIQUE,

  -- Lifecycle: pending → redeemed | revoked | expired (expired is a read-time
  -- classification based on expires_at; the status column value remains 'pending'
  -- until explicitly expired, revoked, or redeemed).
  status               TEXT        NOT NULL DEFAULT 'pending',

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at           TIMESTAMPTZ NOT NULL,

  -- Redemption audit
  redeemed_at          TIMESTAMPTZ,
  redeemed_by_user_id  UUID                 REFERENCES auth.users(id)             ON DELETE SET NULL,

  -- Revocation audit
  revoked_at           TIMESTAMPTZ,

  CONSTRAINT fmrt_status_check
    CHECK (status IN ('pending', 'redeemed', 'revoked'))
);

COMMENT ON TABLE fantasy_member_recovery_tokens IS
  'Single-use commissioner-generated recovery tokens. Raw token never stored; '
  'only SHA-256 hash is persisted. Enables guest member recovery without seat release.';

COMMENT ON COLUMN fantasy_member_recovery_tokens.token_hash IS
  'SHA-256(raw_token) hex string. The raw 256-bit token is returned once to the '
  'commissioner and never persisted.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Primary lookup path: GET + POST /api/fantasy/recover/:token
-- (token_hash is already UNIQUE, so this index is implicit; explicit for clarity)
CREATE INDEX IF NOT EXISTS fantasy_member_recovery_tokens_hash_idx
  ON fantasy_member_recovery_tokens (token_hash);

-- Supports the "revoke existing pending before creating new" logic in
-- create_member_recovery_token, and the one-pending-per-member invariant.
CREATE INDEX IF NOT EXISTS fantasy_member_recovery_tokens_member_status_idx
  ON fantasy_member_recovery_tokens (league_member_id, status);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. create_member_recovery_token
--
-- Called by: POST /api/fantasy/leagues/:lid/seasons/:sid/members/:mid/recovery-token
--   Commissioner authority is verified by the server BEFORE calling this RPC.
--
-- Validates:
--   • target member currently has an active GUEST claim
--     (not unclaimed → normal join flow, not account-claimed → sign-in guidance)
--
-- Atomically:
--   • revokes any existing pending recovery token for this member
--   • inserts new pending token record
--
-- Returns: { token_record_id }
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_member_recovery_token(
  p_league_id          UUID,
  p_season_id          UUID,
  p_league_member_id   UUID,
  p_created_by_user_id UUID,
  p_token_hash         TEXT,         -- SHA-256(raw_token) hex; raw is never sent here
  p_expires_at         TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claim_type  TEXT;
  v_token_id    UUID;
BEGIN
  -- 1. Determine the current active claim type for this member seat
  SELECT
    CASE
      WHEN user_id     IS NOT NULL THEN 'account'
      WHEN guest_token IS NOT NULL THEN 'guest'
    END
  INTO v_claim_type
  FROM fantasy_member_claims
  WHERE league_member_id = p_league_member_id
    AND is_active        = true
  LIMIT 1;

  -- 2. Reject if not currently a guest claim
  --    account → caller should return sign-in guidance
  --    NULL    → unclaimed → normal join flow handles this
  IF v_claim_type IS DISTINCT FROM 'guest' THEN
    RAISE EXCEPTION 'not_guest_claimed:%', COALESCE(v_claim_type, 'unclaimed');
  END IF;

  -- 3. Revoke any existing pending token for this member (one-pending-per-member)
  UPDATE fantasy_member_recovery_tokens
  SET    status     = 'revoked',
         revoked_at = now()
  WHERE  league_member_id = p_league_member_id
    AND  status           = 'pending';

  -- 4. Insert the new pending token
  INSERT INTO fantasy_member_recovery_tokens (
    league_id,
    league_season_id,
    league_member_id,
    created_by_user_id,
    token_hash,
    status,
    expires_at
  )
  VALUES (
    p_league_id,
    p_season_id,
    p_league_member_id,
    p_created_by_user_id,
    p_token_hash,
    'pending',
    p_expires_at
  )
  RETURNING id INTO v_token_id;

  RETURN json_build_object('token_record_id', v_token_id);
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. redeem_member_recovery_token
--
-- Called by: POST /api/fantasy/recover/:token (requires authenticated user JWT)
--   Server hashes the raw token before passing to this RPC.
--
-- Validates (all atomic, with row-level lock):
--   • token exists by hash
--   • status = 'pending'
--   • now() < expires_at
--   • target member still has an active GUEST claim
--   • target member does NOT already have an account-linked claim
--   • redeeming user is not ALREADY an active member of this same league
--     (wrong-account guard; token stays pending on this error so right person can use it)
--
-- Idempotency:
--   • same user, already redeemed → { already_redeemed_by_you: true, ...context }
--   • different user on already-redeemed token → exception token_not_pending:redeemed
--
-- Atomic on success:
--   • UPDATE fantasy_member_claims: user_id = redeemer, guest_token = NULL  (same row)
--   • UPDATE token: status = 'redeemed', redeemed_at, redeemed_by_user_id
--
-- Returns JSON:
--   { redeemed, already_redeemed_by_you, league_member_id, display_name,
--     team_name, league_name, league_id, season_id }
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION redeem_member_recovery_token(
  p_token_hash        TEXT,
  p_redeeming_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token             fantasy_member_recovery_tokens%ROWTYPE;
  v_claim_id          UUID;
  v_claim_user_id     UUID;
  v_display_name      TEXT;
  v_team_name         TEXT;
  v_league_name       TEXT;
  v_season_id         UUID;
  v_conflict_member   UUID;
BEGIN
  -- 1. Lock and fetch the token record (prevents concurrent redemption races)
  SELECT * INTO v_token
  FROM   fantasy_member_recovery_tokens
  WHERE  token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_not_found';
  END IF;

  -- 2. Idempotency: already redeemed by the SAME authenticated user (safe retry)
  IF v_token.status = 'redeemed'
     AND v_token.redeemed_by_user_id = p_redeeming_user_id THEN

    SELECT lm.display_name INTO v_display_name
    FROM   fantasy_league_members lm
    WHERE  lm.id = v_token.league_member_id;

    SELECT ft.team_name INTO v_team_name
    FROM   fantasy_team_managers ftm
    JOIN   fantasy_teams         ft  ON ft.id  = ftm.fantasy_team_id
    JOIN   fantasy_season_members sm ON sm.id = ftm.season_member_id
    WHERE  sm.league_member_id = v_token.league_member_id
      AND  sm.is_active        = true
      AND  ftm.is_active       = true
    LIMIT 1;

    SELECT league_name INTO v_league_name
    FROM   fantasy_leagues
    WHERE  id = v_token.league_id;

    v_season_id := v_token.league_season_id;
    IF v_season_id IS NULL THEN
      SELECT id INTO v_season_id
      FROM   fantasy_league_seasons
      WHERE  league_id = v_token.league_id AND status = 'active'
      ORDER  BY created_at DESC LIMIT 1;
    END IF;

    RETURN json_build_object(
      'already_redeemed_by_you', true,
      'league_member_id',        v_token.league_member_id,
      'display_name',            v_display_name,
      'team_name',               v_team_name,
      'league_name',             v_league_name,
      'league_id',               v_token.league_id,
      'season_id',               v_season_id
    );
  END IF;

  -- 3. Reject if not in pending state
  IF v_token.status != 'pending' THEN
    RAISE EXCEPTION 'token_not_pending:%', v_token.status;
  END IF;

  -- 4. Reject if expired
  IF now() > v_token.expires_at THEN
    RAISE EXCEPTION 'token_expired';
  END IF;

  -- 5. Fetch and lock the active claim for the target member
  SELECT id, user_id
  INTO   v_claim_id, v_claim_user_id
  FROM   fantasy_member_claims
  WHERE  league_member_id = v_token.league_member_id
    AND  is_active        = true
  FOR UPDATE;

  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION 'no_active_claim';
  END IF;

  -- 6. Must still be a guest claim (not already account-linked)
  IF v_claim_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_account_claimed';
  END IF;

  -- 7. Wrong-account guard: redeeming user already holds a DIFFERENT seat in this league.
  --    Token intentionally stays 'pending' so the correct person can still redeem it.
  SELECT lm.id INTO v_conflict_member
  FROM   fantasy_member_claims fmc
  JOIN   fantasy_league_members lm ON lm.id = fmc.league_member_id
  WHERE  fmc.user_id    = p_redeeming_user_id
    AND  fmc.is_active  = true
    AND  lm.league_id   = v_token.league_id
    AND  lm.id         != v_token.league_member_id
  LIMIT 1;

  IF v_conflict_member IS NOT NULL THEN
    -- Token stays pending — wrong account, not a burn event.
    RAISE EXCEPTION 'wrong_account_already_member';
  END IF;

  -- 8. Fetch display context for the response
  SELECT lm.display_name INTO v_display_name
  FROM   fantasy_league_members lm
  WHERE  lm.id = v_token.league_member_id;

  SELECT ft.team_name INTO v_team_name
  FROM   fantasy_team_managers ftm
  JOIN   fantasy_teams         ft  ON ft.id  = ftm.fantasy_team_id
  JOIN   fantasy_season_members sm ON sm.id = ftm.season_member_id
  WHERE  sm.league_member_id = v_token.league_member_id
    AND  sm.is_active        = true
    AND  ftm.is_active       = true
  LIMIT 1;

  SELECT league_name INTO v_league_name
  FROM   fantasy_leagues
  WHERE  id = v_token.league_id;

  v_season_id := v_token.league_season_id;
  IF v_season_id IS NULL THEN
    SELECT id INTO v_season_id
    FROM   fantasy_league_seasons
    WHERE  league_id = v_token.league_id AND status = 'active'
    ORDER  BY created_at DESC LIMIT 1;
  END IF;

  -- 9. ATOMIC IDENTITY TRANSFER
  --    Identical to the existing POST /claim/upgrade mechanism:
  --    UPDATE the SAME row — no new record, partial unique index never violated.
  --    Old guest_token is cleared; old device can no longer authenticate as this member.
  UPDATE fantasy_member_claims
  SET    user_id     = p_redeeming_user_id,
         guest_token = NULL
  WHERE  id = v_claim_id;

  -- 10. Mark token as redeemed (atomic with the claim transfer above)
  UPDATE fantasy_member_recovery_tokens
  SET    status              = 'redeemed',
         redeemed_at         = now(),
         redeemed_by_user_id = p_redeeming_user_id
  WHERE  id = v_token.id;

  RETURN json_build_object(
    'redeemed',          true,
    'league_member_id',  v_token.league_member_id,
    'display_name',      v_display_name,
    'team_name',         v_team_name,
    'league_name',       v_league_name,
    'league_id',         v_token.league_id,
    'season_id',         v_season_id
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. revoke_member_recovery_token
--
-- Called by: DELETE /api/fantasy/leagues/:lid/seasons/:sid/members/:mid/recovery-token
--   Commissioner authority verified by the server before calling this RPC.
--
-- Revokes all pending tokens for the given member.
-- No-op if no pending token exists (safe to call idempotently).
--
-- Returns: { revoked_count }
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION revoke_member_recovery_token(
  p_league_member_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE fantasy_member_recovery_tokens
  SET    status     = 'revoked',
         revoked_at = now()
  WHERE  league_member_id = p_league_member_id
    AND  status           = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN json_build_object('revoked_count', v_count);
END;
$$;
