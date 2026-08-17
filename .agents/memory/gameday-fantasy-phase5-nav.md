---
name: Gameday Fantasy Phase 5 — Weekly Competitions & Season Standings
description: Weekly competition routes, hub WeeklyCard, auto-settle quirk, test suite, 91/91 pass
---

## What was built
- `POST /weeks/:wn/publish` — calls `publish_fantasy_weekly` RPC; idempotent (returns `already_existed`)
- `GET /weeks/:wn` — hub state (null when not published)
- `POST /weeks/:wn/lock|unlock`
- `GET /weeks/:wn/play` — creates participant, returns props + my_picks
- `POST /weeks/:wn/picks` — upsert; validates answer snapshot; locked-card guard
- `GET|POST /weeks/:wn/settlement`
- `POST /weeks/:wn/settle` — result-correction safe; idempotent same-answer
- `POST /weeks/:wn/finalize`
- `GET /weeks/:wn/results` — post-finalization only
- `GET /standings` — season standings derived on demand

## Critical: settlePropCore auto-settles the card

When ALL props on a pick card are settled, `settlePropCore` sets `card.status = 'settled'`
(not 'locked'). The Phase 5 finalize and re-settle endpoints must accept both:

```typescript
!["locked", "settled"].includes(card.status)
```

If you check `card.status !== "locked"` only, finalize returns 409 after all props are resolved.

**Why:** `gameday-settle-helper.ts` line 78 auto-upgrades card status when remaining unsettled props drop to zero.

## Hub screen additions
- `WeeklyCard` component in `app/fantasy/[leagueId]/[seasonId].tsx` (after `DraftDayCard`)
- State: `weeklyWeek1`, `lockingWeekly`, `unlockingWeekly`, `finalizingWeekly`, `weeklyLockError`, `weeklyFinalizeError`
- `fetchDetail` fetches `getWeekStatus(…, 1, auth)` in parallel with existing calls
- Season Standings quick-access row: visible once Draft Day OR Week 1 is finalized

## Test file
`server/test-fantasy-phase5.ts` — 91 standalone assertions, no pre-set env vars required.
Covers §25-§36: publish, hub, templates, play, picks, auth guards, lock/unlock, settlement, finalize, results, standings.

**Claim endpoint returns 201 (not 200)** — test assertion uses `[200, 201].includes(status)`.

## Add-member endpoint requirements
`POST /api/fantasy/.../participants` requires:
- `display_name` (required)
- `team_name` (required)
- `Idempotency-Key` header (required)

## Route registration
Routes appended to `server/routes-fantasy.ts` inside `registerFantasyRoutes` function (line 380).
After editing the file, always **restart the backend** — tsx does not hot-reload route additions.
