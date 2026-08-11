---
name: Gameday Fantasy Phase 3 — Member Claim
description: Route structure, claim architecture, SQL migration, and test results for Phase 3 (member invite + seat claim).
---

# Phase 3 — Member Claim + Role-Aware Hub

**Status:** Complete. 60/60 Phase 3 tests pass. 67/67 Phase 2 regression green.

## SQL Migration Applied
`supabase/gameday-fantasy-phase3-claim.sql` — must be applied BEFORE deploying server code.
- Partial unique index: `fantasy_member_claims_one_active_per_seat WHERE is_active = true`
- RPC: `claim_fantasy_seat(p_league_id, p_season_id, p_member_id, p_user_id, p_guest_token)`
  - Returns JSON: `{ claim_id, league_member_id, season_member_id, display_name, team_name, role, already_existed }`
  - Idempotent: same identity + same seat → 200 `already_existed=true`
  - Conflict: different identity on claimed seat → raises `seat_already_claimed` → server 409

## Routes (all in server/routes-fantasy.ts)
- `GET /api/fantasy/leagues/:lid/seasons/:sid/join-info` — public; returns seats + claim status; optional caller pre-identification via Bearer or `X-Fantasy-Guest-Token`
- `POST /api/fantasy/leagues/:lid/seasons/:sid/claim` — requires auth OR guest token; calls `claim_fantasy_seat` RPC
- `GET /api/fantasy/leagues/:lid/seasons/:sid` — now includes `viewer: FantasyViewer | null` based on active claim
- `GET /api/fantasy/leagues` — now claim-based: members see their leagues via `fantasy_member_claims`

## Key Helpers in routes-fantasy.ts
- `getCallerIdentity(req)` — reads Bearer OR `X-Fantasy-Guest-Token`, no 401
- `resolveViewer(supabase, identity, seasonId, leagueId)` — looks up participant info via active claim

## Screens Written
- `app/fantasy/join/[leagueId]/[seasonId].tsx` — seat selection + claim screen
- `app/fantasy/[leagueId]/[seasonId].tsx` — role-aware hub (MY TEAM card, Invite Members share button for commissioner)
- `app/fantasy/join/[leagueId]/_layout.tsx` — Expo Router Stack layout

## Guest Token
- Hook: `lib/use-fantasy-guest-token.ts` — generates `fgt_<hex>` UUID, persists in AsyncStorage
- Header: `X-Fantasy-Guest-Token`
- Guest claims are device-specific only (user_id=null, guest_token=<fgt>)
- **Why separate from Game Day tokens:** Game Day uses ephemeral per-room session IDs; Fantasy needs a durable persistent device identity

## Invite URL Format
`/fantasy/join/:leagueId/:seasonId` — deterministic, built client-side, no server lookup needed

## Phase 3B fixes (post-QA)
- **CORS root cause:** `X-Fantasy-Guest-Token` was missing from `Access-Control-Allow-Headers` in `server/index.ts`. Browser CORS preflight blocked all guest-token requests (Node.js tests passed because they ignore CORS). Fix: added the header to the allowed list.
- **Commissioner claim visibility:** `GET /seasons/:id` now queries `fantasy_member_claims` and adds `is_claimed: boolean` to each participant. Hub shows "Joined"/"Waiting" badges (commissioner-only).
- **Guest post-claim UX:** Hub detects `?joined=1` query param and shows a welcome banner ("You're in!", team info, "Open My League", "Create Account", "Back to Swayger").
- **Guest → Auth upgrade (identity-safe):** `POST /api/fantasy/claim/upgrade` requires BOTH `guest_token` AND `league_member_id`. Upgrade is claim-specific (one seat, not all seats sharing that token). Hub writes `FANTASY_PENDING_UPGRADE_KEY` to AsyncStorage ONLY when user explicitly taps "Create Account / Sign In" from welcome banner. A plain sign-in on a device with an old token does NOT trigger upgrade (no pending context = no transfer). Idempotent: if token already cleared, checks if caller already holds auth claim on that seat → `already_upgraded: true`.
- Test file: `server/test-fantasy-phase3b.ts` (36 tests, all green)

## Phase 4 (not yet built)
- Draft Day — prop assignment and matchup management
- Score tracking / weekly results
- Push notifications for results
