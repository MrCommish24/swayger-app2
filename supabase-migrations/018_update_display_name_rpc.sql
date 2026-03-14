-- RPC to update display name for the authenticated user
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
