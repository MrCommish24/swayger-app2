---
name: Gameday Fantasy Phase 2 Navigation & Discovery
description: Route structure, entry points, and navigation decisions for Fantasy League setup (Phase 2 complete)
---

## Route Structure (all live)

| Route | File | Purpose |
|---|---|---|
| `/fantasy/setup` | `app/fantasy/setup.tsx` | Commissioner wizard (5 steps) |
| `/fantasy/:leagueId/:seasonId` | `app/fantasy/[leagueId]/[seasonId].tsx` | League Hub (read-only) |

Layouts:
- `app/fantasy/_layout.tsx` — Stack wrapping `setup`
- `app/fantasy/[leagueId]/_layout.tsx` — Stack wrapping hub screens

## Entry Points

Fantasy section added to `app/gameday/index.tsx` for all signed-in users (not just hosts).

- **No leagues**: shows "Create Fantasy League" card → `/fantasy/setup`
- **Has leagues**: shows league card(s) → `/fantasy/:leagueId/:seasonId` (most recent season)
- Appears at the bottom of both the host view (ScrollView) and the non-host ScrollView
- `onRefresh` triggers `fetchFantasyLeagues()` alongside `fetchRooms()`

## Post-Setup Navigation

After wizard completes: "Open My League →" button calls:
`router.replace(\`/fantasy/${setupResult.league_id}/${setupResult.season_id}\`)`

Previously routed to `/` — changed to go directly to the hub.

## Retry Safety (Bug fixed during QA)

`handleSubmit` in setup.tsx checks `setupResult` state at the start.
If already set (retry after participant failure), skips `POST /api/fantasy/leagues/setup`
and jumps straight to participant submissions. RPCs are idempotent.

## Auth Loading

`useAuth()` exports `isLoading`. Both `setup.tsx` and `[seasonId].tsx` handle it.
`gameday/index.tsx` already used `authLoading` — fantasy fetch gated on `!authLoading && session`.

## Screenshot Tool Behavior

The screenshot tool consistently captures before Expo web hydration completes (blank white).
Not a functional bug — backend logs confirm 200s for authenticated users.
