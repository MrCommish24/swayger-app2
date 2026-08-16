---
name: Gameday Fantasy Open Roster
description: open-card adds always eligible; roster_revision + answer_universe_revision columns; stale-pick detection; PATCH /leagues/:leagueId rename; Migration 002 full history including Part D fix.
---

## Schema (Migration 002 — fully applied)
- `gameday_pick_cards.roster_revision` INTEGER NOT NULL DEFAULT 0
- `gameday_picks.answer_universe_revision` INTEGER NOT NULL DEFAULT 0
- `add_fantasy_season_participant_v2` — updated open-roster body (Parts A+B+D)

## Migration 002 history
- Part A: ALTER TABLE (two columns) — applied, verified
- Part B: CREATE OR REPLACE FUNCTION v2 — applied but introduced `fantasy_season_members.fantasy_team_id` bug (column doesn't exist; link is via `fantasy_team_managers`)
- Part C: CREATE OR REPLACE attempt to fix — ran but wrong body persisted in DB (unclear why; possibly DO-block rollback in Part D context)
- Part D: DROP FUNCTION + CREATE FUNCTION + CREATE OR REPLACE wrapper — fixed it. Verified by calling v2 with real league/season IDs.

**Key lesson**: `fantasy_season_members` does NOT have a `fantasy_team_id` column. The team–member link is stored exclusively in `fantasy_team_managers`. Any new version of `add_fantasy_season_participant_v2` must use a LEFT JOIN to `fantasy_team_managers` for the recovery path, never `sm.fantasy_team_id`.

**Why**: Migration Part B incorrectly assumed the column existed. The correct reference is `supabase/gameday-fantasy-manage-league.sql` v2 body which uses fantasy_team_managers correctly.

## Route behavior (server/routes-fantasy.ts)
- POST /participants: calls `add_fantasy_season_participant_idempotent`
- Route computes `eligible` from card status (open→true, locked/settled→false)
- Route passes `roomIdForSnapshot` (room_id) only for open cards
- RPC atomically appends season_member/fantasy_team to answer_options + increments roster_revision

## Stale-pick detection
- GET /draft-day/play returns `roster_revision` and `stale_pick_prop_ids`
- `stale_pick_prop_ids` = prop IDs where pick.answer_universe_revision < card.roster_revision
- POST /draft-day/picks updates pick.answer_universe_revision = card.roster_revision
- Client clears local stale set on save; re-fetches quietly after each successful pick

## Member-facing UX (play.tsx)
- `staleProps` state (Set<string>) synced from server on every fetchPlayState
- Banner "League roster updated" shown when staleProps.size > 0 and card is open
- Per-prop "↺ Updated — review your pick" indicator on stale + saved props only
- Quiet re-fetch after each successful pick submission
- Unanswered props never marked stale (server already filters)

## Test suites (all green after Part D)
- Open Roster: 64/64
- Phase 4B + Manage: 153/153
- Phase 2/3/3B/4A: all green
- Grand total: 483/483
