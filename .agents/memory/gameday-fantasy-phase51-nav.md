---
name: Gameday Fantasy Phase 5.1
description: Commissioner share/nudge loop — participation data, Share Week CTA, Reminder CTA, finalized banner in play screen, non-member error handling.
---

## What was built

**Backend** — `GET /weeks/:weekNumber` hub endpoint extended (no schema changes):
- `eligible_count` = active `fantasy_season_members` for the season
- `played_count` = distinct season_member_ids with ≥1 pick on any prop in the room
- `waiting_count` = eligible_count − played_count
- `participants_status[]` (commissioner-only) = `[{ season_member_id, display_name, has_played }]`
- `resolveViewer` lifted out of inner try-catch and called once; role used for commissioner gate
- `GET /weeks/:weekNumber/play` response now includes `room_status`

**Frontend** — `WeeklyCard` in hub:
- New props: `onShare`, `onShareReminder` (callbacks, URL built in hub via `buildWeekUrl`)
- Participation stat block in `draftDayCounts` row: "X / Y Have Played"
- Collapsible participants list (commissioner, open state only): toggles via `showParticipants` state
- `📣 Share Week N` button (teal, `#0E7490`) — open state, commissioner only
- `🔔 Share Reminder (N waiting)` button — open state, commissioner, only when `waiting_count > 0`
- `buildWeekUrl(leagueId, seasonId, weekNumber)` local function mirrors `buildInviteUrl` pattern
- `Share.share()` used for share; iOS passes `{ message, url }`, other platforms just `{ message }`
- No Share CTAs visible when locked (commissioner settlement flow takes over)

**Frontend** — `play.tsx` weekly pick screen:
- `room_status` now in `WeeklyPlayState` type
- `errorIsNonMember` state: set when error contains "not a member" or "unauthorized"
- Non-member error shows: emoji + friendly message + "Join This League" CTA → `/fantasy/join/:leagueId/:seasonId`
- Finalized state: `isFinalized = state.room_status === "finalized"` (checked before isLocked)
- Finalized banner (gold, tappable) navigates to results screen; replaces generic locked banner

## Key decisions

**Why:** `resolveViewer` was called inside a try-catch that swallowed errors. Lifting it outside ensures commissioner gate works reliably. Viewer null = not a member, returns 0 myPickCount without crashing.

**Why no SQL change:** eligible_count derived from `fantasy_season_members` + `gameday_participants` + `gameday_picks`. No new columns needed for V1. "New member after lock excluded from eligible_count" is a known V1 limitation — not built.

**Why participants_status is commissioner-only:** Members must not see who else has played (peer pressure / gaming concern). Gate is `role === "commissioner" || role === "co_commissioner"`.

**Why play screen checks room_status not card_status for finalized:** card_status=settled is not unique to finalized — all props can be settled before commissioner finalizes. Only room_status=finalized means results are public.

## Tests: 48/48 (Phase 5.1), 91/91 (Phase 5 regression)

§37 Hub participation data — eligible/played/waiting counts
§38 Commissioner-only participants_status
§39 played_count increments after picks
§40 participants_status.has_played updates
§41 eligible_count increases when new member joins while open
§42 Member does not see participants_status
§43 Play endpoint returns room_status
§44 Hub room_status = "finalized" after finalization
§45 Unauthenticated play link → 401
§46 Non-member play link → 403 (no silent participant creation)
§47 Share URL path contains leagueId, seasonId, /weeks/1, /play
