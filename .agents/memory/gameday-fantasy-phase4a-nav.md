---
name: Gameday Fantasy Phase 4A
description: Draft Day setup architecture, DDL status, inline publish pattern, key decisions.
---

# Phase 4A — Fantasy Draft Day Commissioner Setup + Publish

## Status (as of Phase 4A completion)
- 49/49 Phase 4A tests ✅
- 169/169 P2+P3+P3B regression tests ✅
- Two DDL items still need Supabase SQL Editor (see below)

## Architecture decisions

### requireFantasyCommissioner (CRITICAL naming trap)
The outer-scope `requireFantasyCommissioner(req, res, supabase, leagueId, seasonId)` at line ~99 in `routes-fantasy.ts` has a 5-arg signature. Never add a same-named function inside `registerFantasyRoutes` — it will shadow the outer one and break all commissioner checks. Use the outer function directly in Phase 4A routes: `const commissioner = await requireFantasyCommissioner(req, res, supabase, leagueId, seasonId)`.

### No PL/pgSQL RPC for publish (yet)
`publish_fantasy_draft_day` PL/pgSQL function exists in `supabase/gameday-fantasy-phase4a-draft-day.sql` but hasn't been applied to Supabase. The publish route uses **inline JS sequential inserts** with rollback-on-error as a substitute. Once the RPC is applied, switch the route to call `.rpc("publish_fantasy_draft_day", {...})` for true atomicity.

### answer_target_type column on gameday_props
DDL NOT yet applied to Supabase. Prop rows are inserted without this column via fallback. The server route tries the column, falls back gracefully on error. Once DDL is applied, answer_target_type will be set on every prop row automatically.

## DDL still needed in Supabase SQL Editor
1. `ALTER TABLE gameday_props ADD COLUMN IF NOT EXISTS answer_target_type TEXT;`
   `ALTER TABLE gameday_props ADD CONSTRAINT gameday_props_answer_target_type_check CHECK (answer_target_type IS NULL OR answer_target_type IN ('season_member','fantasy_team','player','yes_no','static'));`
2. The full `CREATE OR REPLACE FUNCTION publish_fantasy_draft_day(...)` from `supabase/gameday-fantasy-phase4a-draft-day.sql` lines 279–376.
3. `GRANT EXECUTE ON FUNCTION publish_fantasy_draft_day TO service_role;`

## Prop library (seeded ✅)
- 21 rows seeded via `server/scripts/apply-phase4a-seed.ts`
- Football: 7 competition + 4 season
- Basketball: 3 competition + 2 season
- Baseball: 3 competition + 2 season
- All `answer_target_type = 'season_member'` — options built at publish time from live roster

## answer_options snapshot shape
At publish time, the route builds structured `[{id: sm.id, label: sm.display_name, type: "season_member"}]` from the live `fantasy_season_members` roster. This snapshot is immutable — stored in `gameday_props.answer_options` as JSONB. Later display_name changes don't affect it.

## Scoring compatibility note for Phase 4B
`correct * 10` is hardcoded in `server/routes-gameday.ts` at lines ~2041, 2138, 2328. Phase 4B must change these to `SUM(prop.point_value)` filtered by `scoring_scope = 'competition'` for Fantasy rooms while preserving Game Day behavior.

## Hub Draft Day card
`DraftDayCard` component is inlined in `app/fantasy/[leagueId]/[seasonId].tsx`. Three states: unset / published (card closed) / locked. `draftDay` state fetched alongside hub detail in `fetchDetail` via `Promise.all`.

## Files written in Phase 4A
- `lib/fantasy-api.ts` — DraftDayTemplate, DraftDayTemplates, DraftDayStatus, getDraftDayTemplates, getDraftDay, publishDraftDay, lockDraftDay
- `server/routes-fantasy.ts` — 4 new endpoints + helpers
- `app/fantasy/draft-day/[leagueId]/[seasonId].tsx` — setup screen (2-step: choose → preview → publish)
- `app/fantasy/draft-day/[leagueId]/_layout.tsx` — Stack layout
- `app/fantasy/[leagueId]/[seasonId].tsx` — DraftDayCard component + draftDay state
- `supabase/gameday-fantasy-phase4a-draft-day.sql` — DDL (NOT yet applied to Supabase)
- `server/scripts/apply-phase4a-seed.ts` — prop library seed script (already run)
- `server/test-fantasy-phase4a.ts` — 49 tests (all green)
