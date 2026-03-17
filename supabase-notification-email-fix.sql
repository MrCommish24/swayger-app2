-- ─── Backfill notification_email for all existing profiles ───────────────────
-- notification_email is the field the email scheduler queries.
-- It was never auto-populated on signup, so this backfills it from auth.users.
-- Run this once in the Supabase SQL Editor.

UPDATE public.profiles p
SET notification_email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.notification_email IS NULL
  AND u.email IS NOT NULL;

-- ─── Update the new-user trigger to auto-set notification_email ───────────────
-- This ensures future signups automatically get their email recorded.
-- Replace your existing handle_new_user function with this version.

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
