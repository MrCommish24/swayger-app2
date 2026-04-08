-- outreach_feedback table
-- Stores responses from the general user outreach email blast (non-MM segments).
-- segment: 'no_swayger' (created account, never placed a bet)
--          'swayger_no_mm' (placed swayger(s), skipped March Madness)
--
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS outreach_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text,
  segment     text NOT NULL CHECK (segment IN ('no_swayger', 'swayger_no_mm')),
  q1          text,
  q2          text,
  q3          text,
  q4          text,
  open_text   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Anyone can insert (feedback page has no auth), nobody can read via anon key.
ALTER TABLE outreach_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon insert outreach_feedback"
  ON outreach_feedback FOR INSERT
  TO anon
  WITH CHECK (true);

-- No SELECT policy for anon — read via Supabase dashboard / service role only.
