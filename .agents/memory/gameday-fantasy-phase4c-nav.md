---
name: Gameday Fantasy Phase 4C
description: Draft Day settlement, scoring, winner declaration — settlement routes, results, hub CTAs, Phase 4C architecture decisions and verified bugs.
---

## Core architecture decisions

**Finalization marker is `room.status = 'finalized'`**, NOT `card.status = 'settled'`.
- After finalization, card stays `status='locked'` permanently — including after all season props settle.
- `settlePropCore` has a cascade that auto-settles the card when ALL props are settled. For Fantasy
  rooms, after settling the last season prop post-finalization, this cascade fires.
- Fix: in `POST /draft-day/settle`, after calling `settlePropCore`, if `result.cardAutoSettled &&
  room.status === 'finalized'`, immediately restore `card_status = 'locked'`.
- Hub screen uses `room_status === 'finalized'` (not `card_status === 'settled'`) to detect finalization.

**Why:** `card_status = 'settled'` would require all props (including season receipts) to be settled
first, which contradicts the spec that season props settle later.

## Scoring

`SUM(point_value)` for `is_correct = true` competition picks — NOT `correct_count * 10`.
- `gameday_props.point_value` stores the actual weight.
- `gameday_picks.is_correct` set by `settlePropCore`.
- Leaderboard computed in server JS (`_buildLeaderboard`), not SQL.
- Test fixture must set point_values to 5, 15, 25 (non-multiples of 10) to prove correctness.

## Settlement route design

`POST /draft-day/settle` handles BOTH competition and season props:
- Competition props: blocked if `room.status = 'finalized'` (history sealed).
- Season props: allowed even after finalization (for late season settlement = §27).
- Card must be `locked` regardless of scope.
- Idempotent: same prop + same answer → 200 with `idempotent: true`.
- Conflict: same prop + different answer → 409.
- `correct_answer` validated against published `answer_options[].id` (JSONB objects, not strings).

## Critical invariant: leaderboard stability after season settlement

`_buildLeaderboard` queries ALL `gameday_participants` for the room. Any call to `GET /play`
creates a new participant row. In the Phase 4C test's `suite_late_season_settlement`, the test
must use `MEMBER_TOKEN_DARIUS` (not `COMMISSIONER_TOKEN`) to avoid creating a new participant
for the commissioner (who made no competition picks), which would inflate the leaderboard count.

## Global settlement queue exclusion

`buildSettlementQueue` in `routes-gameday.ts` excludes Fantasy rooms via `experience_type !== 'fantasy'`
filter in the `eligible` array. Fantasy rooms have JSONB answer_options (objects), not strings —
normalization would fail without this exclusion.

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

## Stale hub regression

Hub uses `useFocusEffect` → `fetchDetail(true)` on every focus return. Settle screen and results
screen both navigate via `router.back()` → hub regains focus → fresh `room_status` re-fetched.
No stale state path exists. `onFinalize` on the hub also calls `fetchDetail(true)` immediately.

## New API types in lib/fantasy-api.ts

- `DraftDayStatus.settled_competition_count` — added field
- `DraftDaySettlementState` — GET /settlement response
- `DraftDayResults` — GET /results response
- Functions: `getDraftDaySettlement`, `settleDraftDayProp`, `finalizeDraftDay`, `getDraftDayResults`

## New screens

- `app/fantasy/draft-day/[leagueId]/[seasonId]/settle.tsx` — commissioner resolution screen
- `app/fantasy/draft-day/[leagueId]/[seasonId]/results.tsx` — member results screen

## Result correction (Game Day parity — QA bug fix)

Classic Game Day's `PATCH /props/:propId/settle` has NO guard for already-settled props.
Calling it again with a different answer simply re-runs `settlePropCore` (new answer correct,
old answer picks flipped) — no 409, no block.

Fantasy originally blocked this with a 409. Fixed by removing the conflict block.
New behavior before finalization:
- Same answer → idempotent 200 (`idempotent: true, was_correction: false`)
- Different answer → correction 200 (`idempotent: false, was_correction: true`)
- After finalization → 409 (room_status=finalized guard, same as Game Day's 400)

UI: settle.tsx PropCard has options always tappable (removed `disabled={isSettled}` and
`!isSettled &&` guards). Non-selected options shown at 60% opacity with "✎ tap to change"
hint. Optimistic update does NOT increment `settled_count` on corrections (checks
`wasAlreadySettled` before incrementing).

## Tests

`server/test-fantasy-phase4c.ts` — 111 assertions (added §37 with RC-1..RC-12), all pass.
`server/test-fantasy-phase4c-run.ts` — self-bootstrapping runner (creates users, fixture, runs tests).
Run via: `npm run test:fantasy:4c`

Bugs found and fixed during verification:
1. `card_status` became `'settled'` after season prop post-finalization settlement → fixed in settle route.
2. Leaderboard count inflated when `GET /play` called with commissioner token → fixed in test.
3. Pre-finalization result correction blocked with 409 → fixed: removed conflict block, added `was_correction` field.
