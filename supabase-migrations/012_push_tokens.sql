-- Push tokens for Expo push notifications

CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own push tokens" ON push_tokens;
CREATE POLICY "Users can manage their own push tokens"
  ON push_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- SECURITY DEFINER: any authenticated user can look up a push token
-- (needed so the sender can notify the recipient)
CREATE OR REPLACE FUNCTION get_push_token(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT token FROM push_tokens WHERE user_id = p_user_id LIMIT 1;
$$;

-- Verify
DO $$
DECLARE
  v_col_count INT;
BEGIN
  SELECT COUNT(*) INTO v_col_count
  FROM information_schema.columns
  WHERE table_name = 'push_tokens' AND column_name IN ('user_id', 'token', 'platform');
  ASSERT v_col_count = 3, 'push_tokens table missing expected columns';
  RAISE NOTICE 'push_tokens table OK';
END $$;
