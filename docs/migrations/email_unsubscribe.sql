-- ════════════════════════════════════════════════════════════════════════════
-- Swayger — Email Unsubscribe Migration
-- Run this in the Supabase SQL Editor to enable the unsubscribe flow.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Add email_unsubscribed to profiles ────────────────────────────────────
-- When a user clicks the unsubscribe link in any bulk email, the backend sets
-- this to true. All blast functions check this column before sending.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_unsubscribed boolean DEFAULT false;

-- ─── 2. Update get_all_notification_profiles RPC ─────────────────────────────
-- This function is used by all email blast endpoints to fetch recipients.
-- It must return email_unsubscribed so the blast functions can skip opted-out users.
-- If this RPC doesn't exist yet, it will be created. If it already exists, it is
-- replaced safely (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION get_all_notification_profiles()
RETURNS TABLE (
  id                  uuid,
  username            text,
  display_name        text,
  notification_email  text,
  email_unsubscribed  boolean
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, username, display_name, notification_email,
         COALESCE(email_unsubscribed, false) AS email_unsubscribed
  FROM profiles
  WHERE notification_email IS NOT NULL AND notification_email != '';
$$;
