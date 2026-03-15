-- Migration 022: Add email column to profiles, synced from auth.users
-- Run this in the Supabase SQL Editor

-- 1. Add email column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

-- 2. Sync existing emails from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL;

-- 3. Function that keeps profiles.email in sync when auth.users.email changes
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_email_synced ON auth.users;
CREATE TRIGGER on_auth_user_email_synced
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_email();
