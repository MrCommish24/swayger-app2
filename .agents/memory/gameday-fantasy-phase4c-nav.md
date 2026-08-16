---
name: Gameday Fantasy Phase 4C
description: Draft Day settlement, scoring, winner declaration — settlement routes, results, hub CTAs, Phase 4C architecture decisions.
---

## Core architecture decisions

**Finalization marker is `room.status = 'finalized'`**, NOT `card.status = 'settled'`.
- After finalization, card stays `status='locked'` (because season props still pending).
- `settlePropCore` only auto-settles the card when ALL sibling props are settled — since season props remain `pending`, the card never auto-settles to `settled`. This is intentional.
- Hub screen uses `room_status === 'finalized'` (not `card_status === 'settled'`) to detect finalization.

**Why:** `card_status = 'settled'` would require all props (including season receipts) to be settled first, which contradicts the spec that season props settle later.

## Scoring

`SUM(point_value)` for `is_correct = true` competition picks — NOT `correct_count * 10`.
- `gameday_props.point_value` stores the actual weight.
- `gameday_picks.is_correct` set by `settlePropCore`.
- Leaderboard computed in server JS, not SQL.

## Settlement route design

`POST /draft-day/settle` handles BOTH competition and season props:
- Competition props: blocked if `room.status = 'finalized'` (history sealed).
- Season props: allowed even after finalization (for late season settlement = §27).
- Card must be `locked` regardless of scope.
- Idempotent: same prop + same answer → 200 with `idempotent: true`.
- Conflict: same prop + different answer → 409.
- correct_answer validated against published `answer_options[].id` (JSONB objects, not strings).

## Global settlement queue exclusion

`buildSettlementQueue` in `routes-gameday.ts` excludes Fantasy rooms via `experience_type !== 'fantasy'` filter in the `eligible` array. Fantasy rooms have JSONB answer_options (objects), not strings — normalization would fail without this exclusion.

## Hub lifecycle states (Phase 4C)

```
room_status='finalized' (isFinalized=true)
  → All: [ View Draft Day Results ] (gold button)
  → No commissioner settlement controls

card_status='locked' + room_status='active' (isLocked=true)
  + settled_count=0        → Commissioner: [ Resolve Draft Day ] + [ Unlock Picks ]
  + 0 < settled < total   → Commissioner: [ Continue Resolving ] (no unlock)
  + settled=total         → Commissioner: [ Finalize Draft Day ] (inline confirm)
```

## New API types in lib/fantasy-api.ts

- `DraftDayStatus.settled_competition_count` — added field
- `DraftDaySettlementState` — GET /settlement response
- `DraftDayResults` — GET /results response
- `DraftDayResultsPickEntry`, `DraftDayResultsLeaderboardEntry`
- Functions: `getDraftDaySettlement`, `settleDraftDayProp`, `finalizeDraftDay`, `getDraftDayResults`

## New screens

- `app/fantasy/draft-day/[leagueId]/[seasonId]/settle.tsx` — commissioner resolution screen
- `app/fantasy/draft-day/[leagueId]/[seasonId]/results.tsx` — member results screen

## Tests

`server/test-fantasy-phase4c.ts` — run via `npm run test:fantasy:4c`
Key test: §34 (late season settlement after finalization doesn't change Draft Day winner).
Finalization is irreversible in the fixture — test suite runs suite_finalize before suite_results.

## Important: `_getDdRoomAndCard` helper

Defined as an inner async function inside `setupFantasyRoutes`. Used by all 4 settlement routes to look up room + card. This pattern is consistent with how other inner helpers work in routes-fantasy.ts.
