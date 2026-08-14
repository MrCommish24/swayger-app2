---
name: Gameday Fantasy Open Roster
description: Open-roster rule, pick revision tracking, league rename — implementation decisions and SQL migration details.
---

## The rule change

**Before:** Adding a member while card=`open` + `pick_count > 0` → `eligible=false`, no snapshot append (route passed `p_room_id=null` to RPC).

**After:** Adding a member while card=`open` (any pick_count) → `eligible=true`, snapshot appended, `roster_revision` incremented. Only `locked` and `settled` cards produce `eligible=false`.

## New columns (Migration 002 — must be applied manually in Supabase)

- `gameday_pick_cards.roster_revision INTEGER NOT NULL DEFAULT 0` — counts open-card roster expansions
- `gameday_picks.answer_universe_revision INTEGER NOT NULL DEFAULT 0` — mirrors `roster_revision` at pick submission time

Migration file: `server/migrations/002_open_roster.sql`

## RPC change

`add_fantasy_season_participant_v2` updated to:
1. When `p_room_id IS NOT NULL`: append + increment `gameday_pick_cards.roster_revision` atomically
2. The idempotent wrapper (`add_fantasy_season_participant_idempotent`) replay path returns cached `result_json` WITHOUT re-calling v2 → roster_revision is NOT double-incremented on replay

**Why:** Route now always passes `p_room_id` when card is open, so the RPC must handle the increment. Replay safety is inherited from the existing idempotency design.

## Route changes (server/routes-fantasy.ts)

- **POST /participants lifecycle block**: removed `pick_count > 0 → eligible=false` branch; when `cardStatus === 'open'` always set `eligible=true` + `roomIdForSnapshot=ddRoomId`
- **GET /draft-day/play**: select `roster_revision` on card, `answer_universe_revision` on picks, `answer_target_type` on props; returns `roster_revision` + `stale_pick_prop_ids` (prop IDs where pick is stale on roster-target props)
- **POST /draft-day/picks**: select `roster_revision` on card; store `answer_universe_revision: cardRosterRevision` in the upsert
- **PATCH /api/fantasy/leagues/:leagueId**: new endpoint — league-level commissioner rename; uses new `requireFantasyLeagueCommissioner` helper (doesn't require seasonId, checks commissioner role in any active season)
- **CORS**: `Idempotency-Key` added to `Access-Control-Allow-Headers` in `server/index.ts`

## UI changes (app/fantasy/manage/[leagueId]/[seasonId].tsx)

- `DraftDayLifecycle`: simplified from 5 variants to 4: `none | open | locked | settled` (removed `open_no_picks` and `picks_exist`)
- `getLifecycle`: always returns `"open"` when card is open (no pick_count check)
- `needsLeagueOnlyConfirm`: only `locked | settled` (removed `picks_exist`)
- Removed `picks_exist` notice card; kept `locked` notice
- Added **League Details** section above Members & Teams with inline edit for league name
- Imports `updateLeagueName` from lib/fantasy-api.ts

## Types (lib/fantasy-api.ts)

- `DraftDayStatus`: added `roster_revision?: number`
- `DraftDayPlayState`: added `roster_revision: number` and `stale_pick_prop_ids: string[]`
- New export: `updateLeagueName(leagueId, leagueName, auth)` → PATCH /api/fantasy/leagues/:leagueId

## Tests

- **Updated**: `server/test-fantasy-phase4b-manage-combined.ts`
  - §DB: added DB-9 (roster_revision column) + DB-10 (answer_universe_revision column) checks
  - §4B-13b: rewritten — now asserts eligible=true + snapshots updated + roster_revision incremented
  - §4B-14: adds "LockedLateArrival" member while card is locked → eligible=false; stored as `locked_sm_id`
  - §EL: restructured to use `locked_sm_id` (not LateArrival which is now eligible)
  - §B3: asserts eligible=true (open card) instead of false
  - §ML-D: new section — 6 league rename tests (non-comm 403, no-token 401, blank 400, rename 200, GET reflects, restore)
- **New**: `server/test-fantasy-open-roster.ts` — comprehensive open-roster + pick revision + league rename suite (~55 tests)

## Key invariants to preserve

- `pick_count > 0` still blocks `PATCH /draft-day/props` (question fairness) — this guard is in the PATCH endpoint, not the add-member flow
- `roster_revision` increments on every UNIQUE add while open; replay (same idempotency key) does NOT increment again
- Stale picks: `pick.answer_universe_revision < card.roster_revision` AND prop is `season_member` or `fantasy_team` target type
- Non-roster props (yes_no, static, player) are never flagged stale
