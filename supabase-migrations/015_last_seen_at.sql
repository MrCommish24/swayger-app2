-- Add last_seen_at to profiles for retention tracking
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- RPC: called on app launch once per session to stamp the user as active
CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET last_seen_at = now()
  WHERE id = auth.uid();
END;
$$;
