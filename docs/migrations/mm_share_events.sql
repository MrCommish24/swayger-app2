-- Run once in the Supabase SQL Editor to enable share event tracking.
-- Dashboard → SQL Editor → New query → paste and run.

CREATE TABLE IF NOT EXISTS mm_share_events (
  id         bigserial    PRIMARY KEY,
  user_id    uuid         NOT NULL,
  pick_type  text         NOT NULL,   -- 'upset' | 'blowout' | 'high_scorer'
  round_id   text         NOT NULL,   -- 'round-64' | 'round-32' | 'sweet-16' | etc.
  matchup_id text         NOT NULL,
  shared_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mm_share_events_user_idx  ON mm_share_events(user_id);
CREATE INDEX IF NOT EXISTS mm_share_events_round_idx ON mm_share_events(round_id);

-- Useful queries after data starts coming in:

-- Total share events by pick type
-- SELECT pick_type, COUNT(*) FROM mm_share_events GROUP BY pick_type ORDER BY COUNT(*) DESC;

-- Total share events by round
-- SELECT round_id, COUNT(*) FROM mm_share_events GROUP BY round_id ORDER BY round_id;

-- Most active sharers (join with profiles for names)
-- SELECT user_id, COUNT(*) AS shares FROM mm_share_events GROUP BY user_id ORDER BY shares DESC LIMIT 20;

-- Shares per round per pick type
-- SELECT round_id, pick_type, COUNT(*) FROM mm_share_events GROUP BY round_id, pick_type ORDER BY round_id, pick_type;
