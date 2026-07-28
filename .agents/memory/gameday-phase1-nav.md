---
name: Gameday Phase 1 Navigation Restructure
description: Binding decisions and baseline for the Gameday-first tab restructure (Phase 1).
---

## Binding decisions

- **Tab order**: Game Day (index) → My Swaygers (challenges) → Leaderboard → Profile
- **`create` tab**: hidden from bar via `options={{ href: null }}` in ClassicTabLayout; no NativeTabs.Trigger entry; still routable via `router.push("/(tabs)/create")`
- **`challenges.tsx`**: full 1v1 experience — SwaygerActionModal, ResultsModal, ChallengeCards, StatsStrip, DashboardScreen, filter bar, SectionList, modal queue. Exports `DashboardScreen` as default.
- **`index.tsx`**: Gameday-first home — FeaturedRoomCard (first room as hero), MoreRoomsStrip (rooms[1:] horizontal), empty state, "My 1v1 Swaygers →" link. Exports `GameDayHomeScreen` as default.
- **No new backend endpoints for Phase 1** — index.tsx uses only existing `/api/gameday/public-rooms`.
- **`Analytics.dashboardViewed()`** fires on both tabs (challenges for backward compat, index for Gameday home focus).

## Test account baseline (dgrand2 / Mr Roarke, uid 0fb8373d)

Captured before any Phase 1 code changes:
- SP balance: **1,671** (column: `user_balances.swayger_points`)
- Total swaygers: 104 — active: 3, settled: 41, canceled: 31, invite_expired: 12, settlement_expired: 11, declined: 6
- Wins: 25, Losses: 14
- Leaderboard rank: 1 / 11

**Why:** Regression baseline — if these numbers shift after Phase 1, something touched 1v1 data.

## Files touched in Phase 1

| File | Change |
|---|---|
| `app/(tabs)/index.tsx` | Replaced with Gameday-first home (GameDayHomeScreen) |
| `app/(tabs)/challenges.tsx` | Created — copy of old index.tsx minus LiveGameDayRooms/gdStyles |
| `app/(tabs)/_layout.tsx` | 4-tab structure, create hidden from bar |
