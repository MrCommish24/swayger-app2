-- Fix profiles UPDATE policy to include explicit WITH CHECK clause
-- (Some PostgREST versions require this for client-side updates to work)

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
END $$;

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Ensure update_display_name RPC exists (re-create in case migration 018 was not run)
CREATE OR REPLACE FUNCTION update_display_name(p_display_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET display_name = NULLIF(TRIM(p_display_name), ''),
      updated_at = now()
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', auth.uid();
  END IF;
END;
$$;
