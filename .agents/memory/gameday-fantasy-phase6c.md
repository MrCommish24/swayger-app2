---
name: Gameday Fantasy Phase 6C
description: Post-lock League Picks social reveal — endpoints, component, CTAs, and test structure.
---

## Claim endpoint trap (critical)
The claim endpoint is `POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/claim` (no `/account` or `/guest` suffix).
Identity is determined purely from the auth header: Bearer token → account claim; `X-Fantasy-Guest-Token` header → guest claim.
**Why:** Tests that used `/claim/account` or `/claim/guest` silently got 404 and the claim was never stored, causing all member-auth tests to fail.

## Settle endpoint (weekly)
`POST /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/settle`
Body: `{ prop_id: string, correct_answer: string }`
**NOT** PATCH to `.../props/:propId/settle` — that path does not exist for weekly rooms.

## League-picks endpoints
- Weekly: `GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/league-picks`
- Draft Day: `GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/league-picks`

While card is open: `{ revealed: false, card_status: "open", eligible_count: N }`
After lock/settled/finalized: `{ revealed: true, eligible_count, room_status, props: [...] }`

## eligible_count = gameday_participants count for the room
Members only appear in `gameday_participants` after visiting the play screen (`ensureFantasyParticipant`).
Unclaimed members (never visited play) do NOT count toward eligible_count.

## Privacy boundary
Server enforces: no `props` or `pickers` in response while card is open. Frontend never sees distribution data until lock.

## Test infrastructure notes
- In §L-§V test sections: generate guest tokens as `p6x-guest-${Date.now()}-${Math.random().toString(36).slice(2)}`
- Claim as guest: `await api("POST", ".../claim", null, { league_member_id }, guestToken)` (null bearer, guest in 5th param)
- Claim as account: `await api("POST", ".../claim", memberTok, { league_member_id })`
- §V bulk: use `apiM` not `api` with extraHeaders (apiM adds Idempotency-Key automatically)

## Phase 6C test count
§L-§V sections: 217 total tests in Phase 6 suite (6A+6B+6C). §V gracefully skips if bulk fails (credits 7 to passed).
