---
name: Gameday Fantasy Manage League
description: Manage League feature — atomic rename, lifecycle-aware add, Draft Day eligibility enforcement, commissioner-only screens.
---

## Feature summary
Commissioner-only Manage League feature. Commissioner sees "⚙ Manage League" button on the Fantasy League Hub, navigates to the manage screen.

## What was built
- `supabase/gameday-fantasy-manage-league.sql` — **must be applied manually in Supabase SQL Editor before anything works**
  - `ALTER TABLE fantasy_season_members ADD COLUMN IF NOT EXISTS draft_day_eligible BOOLEAN NOT NULL DEFAULT TRUE`
  - `update_fantasy_member(p_season_member_id, p_display_name, p_team_name, p_season_id)` — atomic rename RPC; propagates labels into unsettled Draft Day `answer_options` and `gameday_participants` snapshot
  - `add_fantasy_season_participant_v2(p_league_id, p_league_season_id, p_display_name, p_team_name, p_league_member_id DEFAULT NULL, p_draft_day_eligible DEFAULT TRUE, p_room_id DEFAULT NULL)` — atomic add with eligibility + optional snapshot append

## Server changes (`server/routes-fantasy.ts`)
- `resolveViewer` — now SELECTs `draft_day_eligible` from `fantasy_season_members` and returns it in the viewer object
- `POST /participants` — replaced `add_fantasy_season_participant` with `add_fantasy_season_participant_v2`; server determines lifecycle and sets eligible/room_id before calling RPC
- `GET /draft-day/play` — eligibility guard: `viewer.draft_day_eligible === false` → 403
- `POST /draft-day/picks` — same eligibility guard
- `PATCH /leagues/:leagueId/seasons/:seasonId/members/:seasonMemberId` — new endpoint; commissioner-only; calls `update_fantasy_member` RPC

## Client changes
- `lib/fantasy-api.ts` — `UpdateMemberPayload`, `UpdateMemberResponse` types; `updateMember()` function; `AddParticipantResponse` extended with `draft_day_eligible`
- `app/fantasy/[leagueId]/[seasonId].tsx` — "⚙ Manage League" button added (commissioner-only, navigates to `/fantasy/manage/:leagueId/:seasonId`)
- `app/fantasy/manage/[leagueId]/[seasonId].tsx` — new screen; member list with Edit per row; edit modal (atomic PATCH); add member form with lifecycle-aware confirmation step

## Lifecycle decision tree (server-enforced)
| Draft Day state | eligible | room_id for snapshot |
|---|---|---|
| None | true | null |
| Open, pick_count=0 | true | <room_id> |
| Open, pick_count>0 | false | null |
| Locked | false | null |
| Settled | false | null |

## Tests
`server/test-fantasy-manage-league.ts` — 18 tests covering:
- A: Rename (auth guard, blank validation, wrong SM ID, success, reflection, stable ID, restore)
- B: Add member (auth guard, blank validation, success with lifecycle, idempotency)
- C: Eligibility enforcement (403 guards, existing eligible member, guest eligible member, auth guards)
- D: Regression (existing endpoints unchanged)

**Why:** Server determines eligibility at atomic INSERT time — never trust client value. Late adds must never silently enter with eligible=true. `selected_answer` stores UUID so renames are safe without touching picks.
