---
name: Gameday Fantasy Phase 5.2
description: Repeatable weekly season — dynamic week numbers, weekly-summary endpoint, sequencing guards, hub refactor
---

## Core changes

### Backend (`server/routes-fantasy.ts`)
- **`GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/weekly-summary`** — new season-level endpoint returning all weekly rooms in one request. Returns `{ current_week: WeeklyStatus | null, past_weeks: PastWeekSummary[], next_week_number, can_create_next }`. Eliminates N+1 fetching as weeks accumulate.
- **Sequencing guard on `POST /weeks/:weekNumber/publish`** — inserted after commissioner check, before body validation. Skips guard if room already exists (idempotent re-publish is safe). For new rooms: checks prev week exists AND is finalized, rejects with 409 + user-readable message. No guard on Week 1.

### API types (`lib/fantasy-api.ts`)
- `PastWeekSummary` — compact type for finalized past weeks (no participation detail).
- `WeeklySummaryResponse` — full season summary shape: `current_week`, `past_weeks`, `next_week_number`, `can_create_next`.
- `getWeeklySummary(leagueId, seasonId, auth)` — fetches the new endpoint.

### Hub screen (`app/fantasy/[leagueId]/[seasonId].tsx`)
- Replaced `weeklyWeek1: WeeklyStatus | null | undefined` state with `weeklySummary: WeeklySummaryResponse | null | undefined`.
- `fetchDetail` now calls `getWeeklySummary` (one request for all weeks) instead of `getWeekStatus(..., 1, ...)`.
- All WeeklyCard callbacks (lock/unlock/finalize/share/reminder/copyLink) read `weeklySummary.current_week.week_number` dynamically — **no hardcoded `1`**.
- Optimistic state updates: `setWeeklySummary((prev) => ({ ...prev, current_week: { ...prev.current_week, card_status: '...' } }))`.
- New JSX structure: CURRENT SWAYGER section (full WeeklyCard for latest week) + "Set Up Week N" CTA when `can_create_next && isCommissioner` + PAST SWAYGERS compact list for `past_weeks` with `room_status === "finalized"`.
- New `PastWeekRow` component for compact finalized-week history.
- Season Standings quick-access condition now checks `weeklySummary?.current_week?.room_status === "finalized" || past_weeks.length > 0`.

## Key design decisions

**Why season-level endpoint instead of per-week:** As weeks accumulate, the old approach (`Promise.all([getWeekStatus(..., 1), getWeekStatus(..., 2),...])`) grows linearly. One `GET /weekly-summary` serves all weeks via a single DB fan-out.

**Why sequencing guard skips idempotent re-publishes:** If Week 2 was already created (its room exists), the guard would have been satisfied at creation time. Checking again on re-publish is redundant and can block in edge cases (e.g., Week 1 re-opened for unlock → re-settled).

**Why `current_week` = latest week regardless of status:** A week can be open, locked, or finalized — all are "current" until Week N+1 is published. The hub shows it with full WeeklyCard regardless. `can_create_next` signals readiness for the next week.

**Past Swaygers scope:** Only past_weeks with `room_status === "finalized"` appear in the Past Swaygers section. Open/locked weeks before the current are treated as anomalous (legacy data) and skipped from the compact list.

## Test coverage

`server/test-fantasy-phase5-2.ts` — 93 assertions covering:
- §50–§54: sequencing guards (blocked/allowed/skip/idempotent)
- §55: route guard (weekNumber < 1)
- §56–§60: weekly-summary endpoint correctness across lifecycle states
- §61–§64: member continuity + late-member roster
- §65: Week 2 settlement + finalization
- §66–§68: Season Standings aggregate across weeks
- §69: Week 1 results isolation after Week 2 finalized
- §70–§72: URL path generics, share copy, commissioner-only gate
- §73: max week guard (non-crash)

## No SQL changes required
Existing `gameday_rooms.week_number` + unique index `(league_season_id, competition_type, week_number)` fully supports arbitrary week numbers. No migration needed.
