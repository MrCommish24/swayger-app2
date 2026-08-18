---
name: FK Preservation Invariant
description: gameday_participants.season_member_id FK is ON DELETE SET NULL — must never be changed to CASCADE. Approved permanent rule.
---

## Rule

`gameday_participants.season_member_id REFERENCES fantasy_season_members(id) ON DELETE SET NULL`

This constraint **must never be changed to CASCADE** in any future schema work.

**Why:** Removing a Fantasy season member (deactivation, roster management, etc.) must not delete the player's historical Game Day picks, participation records, or scores. The SET NULL behavior preserves the gameday_participants row and all its gameday_picks children while simply nulling the season_member_id FK.

**How to apply:**
- Any new migration that touches `gameday_participants` or `fantasy_season_members` must leave this FK unchanged.
- Any new FK from `gameday_participants` to a Fantasy table should use `ON DELETE SET NULL` (not CASCADE) unless the referenced entity is truly disposable (e.g., a transient session).
- The column is nullable (`UUID`, no `NOT NULL`) — this is intentional and must remain so.

## Constraint details (verified Aug 2026)

| Property | Value |
|---|---|
| Constraint name | `gameday_participants_season_member_id_fkey` |
| Source table / column | `gameday_participants.season_member_id` |
| Referenced table / column | `fantasy_season_members.id` |
| Nullable | YES |
| ON DELETE | SET NULL |
| Established in | `supabase/gameday-fantasy-foundation.sql` line 303 |
| Last audited | Aug 2026 — no subsequent migration has altered this FK |

## What is NOT approved

Do NOT implement until separately approved:
- Game Day history UI
- Historical receipt regeneration endpoints
- Guest Game Day claim flow
- Final standings snapshots
- Lifetime statistics
- New history navigation
