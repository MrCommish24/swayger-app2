-- ─── Step 1: Add notification_email column to profiles ───────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_email text;

-- ─── Step 2: Backfill from auth.users for all existing profiles ───────────────
UPDATE public.profiles p
SET notification_email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.notification_email IS NULL
  AND u.email IS NOT NULL;

-- ─── Step 3: Update new-user trigger to auto-set notification_email ───────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, notification_email, created_at, updated_at)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET notification_email = COALESCE(profiles.notification_email, new.email),
        updated_at = now();
  RETURN new;
END;
$$;
