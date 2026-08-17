---
name: Gameday Fantasy Phase 5.2.1
description: Guest Return / Recovery UX — dead-end fix for incognito/lost-token guests on shared Week links.
---

# Phase 5.2.1 — Guest Return / Recovery UX

## Problem
Guest token (`fgt_` + 32 hex) lives in AsyncStorage (localStorage on web). Incognito tab close or cleared
storage → new session has no token → play endpoint 403 → non-member screen → all seats claimed → dead end.

## Hard constraints (spec)
- Never embed member identity / guest token / seat ID in shared Week links
- Never silently reclaim seats or create duplicate members
- Commissioner cannot impersonate members; no claim-reset UI yet

## Fixes shipped

### auth-callback.tsx
`navigateHome()` and `handleContinue()` now READ `PENDING_AUTH_REDIRECT_KEY` BEFORE removing it; route
to that URL if present, otherwise `/(tabs)`. This means "Sign In → return to Week N" actually works.

### play.tsx (non-member screen)
- Title: "You're not recognized for this league"
- Body: explains device-only guest + sign-in recovery
- [Sign In] button (hidden if session exists) → stores current week URL to PENDING_AUTH_REDIRECT_KEY → `/auth`
- "Join This League" → `/fantasy/join/${leagueId}/${seasonId}?wn=${weekNumber}`
- "← Back" is deterministic: `router.replace` not `router.back()`
- New styles: `outlineBtn`, `outlineBtnText` added to StyleSheet

### join/[leagueId]/[seasonId].tsx
- Accepts `wn?: string` param from `useLocalSearchParams`; parses to `weekNumber`
- `handleChooseAccount` preserves `?wn=` in the stored redirect path
- After successful claim: if weekNumber → route to Week N play; else → hub
- All-seats-claimed: replaced plain `noSeatsText` with `allClaimedCard` recovery UI
  - [Sign In] button if !session
  - [← Back to Week N] if weekNumber
  - [← Back to League] always
  - "Guest access is tied to the browser..." note if !session
- New styles: `allClaimedCard`, `allClaimedTitle`, `allClaimedBody`, `allClaimedNote`, `outlineBtn`, `outlineBtnText`

### routes-fantasy.ts — season detail endpoint
- Changed claim query to also select `user_id, guest_token` (was `league_member_id` only)
- Added `claimTypeByMemberId` map: `user_id set → "account"`, `guest_token set → "guest"`
- Adds `claim_type: "guest" | "account" | null` to each participant **only when viewer is commissioner**
- Non-commissioner viewers never see `claim_type` (privacy)

### lib/fantasy-api.ts
- Added `claim_type?: "guest" | "account" | null` to `FantasyParticipant`

### manage/[leagueId]/[seasonId].tsx
- Member rows now show claim type badges (commissioner-only data):
  - "Claimed as Guest · device-only access" (amber, §guestClaimBadge)
  - "Claimed with account" (tint, §accountClaimBadge)
  - "Not yet claimed" (muted, §unclaimedBadge)
- New styles: `guestClaimBadge`, `accountClaimBadge`, `unclaimedBadge`

## Test coverage
`server/test-fantasy-phase5-2-1.ts` — 55/55 passing (§74–§92)

## Full regression at completion
Phase 2: 64/64 · Phase 3: 60/60 · Phase 4A+4A.2: 100/100 · Phase 5: 91/91 · Phase 5.1: 67/67 · Phase 5.2: 93/93 · Phase 5.2.1: 55/55

## No SQL changes required
All needed columns existed. Upgrade endpoint (`POST /api/fantasy/claim/upgrade`) was already in routes-fantasy.ts.

## Known gap
No "claim-reset" or seat-reassignment tooling for commissioners yet (spec deferred).
