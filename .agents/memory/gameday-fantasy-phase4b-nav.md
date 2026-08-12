---
name: Gameday Fantasy Phase 4B
description: Member Draft Day picks — pick submission, participant creation, my_pick_count, answer validation, pick_count bug fix
---

## Key decisions and traps

### Routes use `app.get`/`app.post` directly — no `router` variable
`registerFantasyRoutes(app: Express)` registers all routes directly on `app`.
Never use `router.get`/`router.post` — `router` is not defined in that function.

### pick_count table bug fixed
`GET /draft-day` and `PATCH /draft-day/props` were querying nonexistent table
`gameday_prop_picks`. Correct table is `gameday_picks`. `gameday_picks` has no
`card_id` column — must join via `prop_id IN (prop IDs for this card)`.

### Global pick_count vs my_pick_count
- `pick_count` = total picks by ALL participants across the card's props
  → commissioner fairness invariant (cannot edit when > 0)
- `my_pick_count` = picks for the current viewer's participant only
  → member CTA label (Make My Picks vs View / Update My Picks)
Both returned by `GET /draft-day`. Only `my_pick_count` (+ more) in `GET /draft-day/play`.

### Participant creation: play screen ONLY
`GET /draft-day` derives `my_pick_count` read-only (no participant creation).
`GET /draft-day/play` and `POST /draft-day/picks` call `ensureFantasyParticipant`.
Hub rendering never creates phantom competition participants.

### Answer validation: published snapshot, not live template
`POST /draft-day/picks` validates `selected_answer` against `gameday_props.answer_options`
(the published JSONB snapshot), NOT the live `gameday_prop_library`.
"no_one" only valid if published prop contains `{id:"no_one"}`.

### gameday_participants display_name NOT NULL + UNIQUE(room_id, display_name)
Fantasy participants must provide display_name at insert. Use
`viewer.display_name ?? viewer.team_name ?? "Fantasy Member"` as fallback.
`season_member_id` uniqueness is enforced via partial unique index (Phase 4B SQL).
The classic UNIQUE(room_id, display_name) could theoretically conflict for Fantasy
members with identical display names — acceptable MVP limitation.

### Phase 4B SQL migration
Only contains the partial unique index (columns already exist from foundation):
`CREATE UNIQUE INDEX IF NOT EXISTS gameday_participants_room_season_member_uniq
  ON gameday_participants (room_id, season_member_id)
  WHERE season_member_id IS NOT NULL;`
Must check for duplicates BEFORE creating the index.

### File structure
- Commissioner screen: `app/fantasy/draft-day/[leagueId]/[seasonId]/index.tsx`
- Play screen:          `app/fantasy/draft-day/[leagueId]/[seasonId]/play.tsx`
- Nested layout:        `app/fantasy/draft-day/[leagueId]/[seasonId]/_layout.tsx`
- Parent layout names `[seasonId]` segment — Expo Router resolves to directory.

### Global auth guard defers to individual Fantasy screens (regression fix)
`app/_layout.tsx` `useProtectedRoute` was exempting only `fantasy/join/...` from the
"no session → /auth" rule. This caused guests to be redirected to /auth after claim
because the hub route `/fantasy/[leagueId]/[seasonId]` has `segments[1]=leagueId` not "join".
Fix: changed to `const inFantasy = segments[0] === "fantasy"; if (inFantasy && !session) return;`
matching the Game Day pattern. Individual screens handle their own auth:
- hub: `if (!session && !guestToken)` → sign-in (line ~450)
- play: same pattern (line ~283)
- draft-day setup (index.tsx): `if (!session) { router.replace("/auth"); }` — commissioner-only
- setup.tsx: added local `useEffect` guard (no session → /auth) since global guard now bypassed

**Why:** Global guard has no access to AsyncStorage guest token, only Supabase session.

### Test file
`server/test-fantasy-phase4b.ts` — 25 tests (17 original + 8 routing-fix tests 18-25).
Requires env vars: TEST_LEAGUE_ID, TEST_SEASON_ID, TEST_COMMISSIONER_TOKEN,
TEST_MEMBER_TOKEN_DARIUS, TEST_GUEST_TOKEN_MIKE.
