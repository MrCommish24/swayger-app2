-- ============================================================================
-- 010: Fix settlement_proposals table — drop and recreate with correct schema
-- The table was created by migration 004 with "proposed_winner" column,
-- but the RPCs use "outcome". Drop and recreate cleanly.
-- ============================================================================

DROP TABLE IF EXISTS settlement_proposals CASCADE;

CREATE TABLE settlement_proposals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  swayger_id UUID NOT NULL REFERENCES swaygers(id) ON DELETE CASCADE,
  proposed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('creator','opponent','draw','no_contest')),
  creator_confirmed BOOLEAN NOT NULL DEFAULT false,
  opponent_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_settlement_proposals_swayger_v1 ON settlement_proposals(swayger_id);

ALTER TABLE settlement_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view proposals v1"
  ON settlement_proposals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM swaygers
      WHERE id = settlement_proposals.swayger_id
      AND (creator_id = auth.uid() OR opponent_id = auth.uid())
    )
  );

CREATE POLICY "Participants can insert proposals v1"
  ON settlement_proposals FOR INSERT
  WITH CHECK (
    auth.uid() = proposed_by
    AND EXISTS (
      SELECT 1 FROM swaygers
      WHERE id = settlement_proposals.swayger_id
      AND (creator_id = auth.uid() OR opponent_id = auth.uid())
    )
  );

CREATE POLICY "Participants can update proposals v1"
  ON settlement_proposals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM swaygers
      WHERE id = settlement_proposals.swayger_id
      AND (creator_id = auth.uid() OR opponent_id = auth.uid())
    )
  );

-- Verify
DO $$
DECLARE
  v_count INT;
  v_cols TEXT[] := ARRAY['id','swayger_id','proposed_by','outcome','creator_confirmed','opponent_confirmed','created_at','updated_at'];
  v_col TEXT;
BEGIN
  RAISE NOTICE '── 010 Verification ──';
  FOREACH v_col IN ARRAY v_cols LOOP
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema='public' AND table_name='settlement_proposals' AND column_name=v_col;
    IF v_count = 1 THEN RAISE NOTICE 'OK: settlement_proposals.%', v_col;
    ELSE RAISE WARNING 'MISSING: settlement_proposals.%', v_col;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='settlement_proposals';
  RAISE NOTICE 'RLS policies: % (expected 3)', v_count;
  RAISE NOTICE 'Done.';
END $$;
