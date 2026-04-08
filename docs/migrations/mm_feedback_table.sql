-- mm_feedback: stores one-time tournament wrap-up feedback from participants
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS mm_feedback (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  q1_ux           TEXT,          -- "Getting around the app was:"
  q2_next_use     TEXT,          -- "I could see using Swayger to:"
  q3_friction     TEXT,          -- "The moment I almost checked out:"
  q4_priority     TEXT,          -- "Swayger should focus on:"
  open_text       TEXT,          -- optional free text (max 280 chars)
  submitted_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mm_feedback ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (anon or authenticated) — no account required to give feedback
CREATE POLICY "mm_feedback_insert_anon"
  ON mm_feedback FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "mm_feedback_insert_auth"
  ON mm_feedback FOR INSERT TO authenticated
  WITH CHECK (true);

-- Only service role / Postgres superuser can read (admin-only)
-- Anon/authenticated cannot SELECT
CREATE POLICY "mm_feedback_no_public_read"
  ON mm_feedback FOR SELECT
  USING (false);
