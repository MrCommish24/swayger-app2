---
name: Fantasy Draft Day team labels
description: Rules for changing Fantasy Draft Day answer labels from member names to team names without invalidating picks.
---

Draft Day `season_member` answers use the season-member UUID as their stable identity, while the visible label is the fantasy team's current `team_name`.

**Why:** Submitted picks store the stable answer ID, so active cards can safely receive a label-only repair; finalized cards must remain historical snapshots.

**How to apply:** Backfill only non-settled, non-archived Fantasy Draft Day props, preserve option order and IDs, and use team names for publish, open-roster append, and active rename paths.