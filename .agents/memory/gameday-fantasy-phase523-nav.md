---
name: Gameday Fantasy Phase 5.2.3
description: Commissioner-assisted member recovery — token model, security architecture, test quirks, and lessons learned.
---

# Phase 5.2.3 — Commissioner-Assisted Member Recovery

## What was built
- Commissioner generates a single-use 24-hour recovery link for a guest-claimed member who lost device storage.
- Member authenticates and reclaims their existing identity (same `league_member_id`, picks, standings).
- Token model: 256-bit `randomBytes(32)` hex; only SHA-256 hash stored in DB; raw token returned once, never logged.

## Key files
- `supabase/gameday-fantasy-phase5-2-3-recovery.sql` — table + RLS + 3 SECURITY DEFINER RPCs (applied)
- `supabase/gameday-fantasy-phase5-2-3-recovery-security-fix.sql` — drops permissive policy, REVOKEs anon/authenticated (applied)
- `server/routes-fantasy.ts` — 4 new routes at end of registerFantasyRoutes
- `lib/fantasy-api.ts` — 4 new API functions + 3 new types; use `Session` directly in auth param, NOT `Parameters<typeof fantasyFetch>[2]["session"]` (which resolves to `| undefined`)
- `app/fantasy/recover/[token].tsx` — recovery landing screen
- `app/fantasy/manage/[leagueId]/[seasonId].tsx` — "Help Recover Access" button + recovery modal

## Security architecture
- `fantasy_member_recovery_tokens` accessible ONLY via service-role server routes or SECURITY DEFINER RPCs (run as postgres/BYPASSRLS).
- `anon` and `authenticated` have NO direct table access and NO EXECUTE on the three RPCs.
- The **server** always derives `p_redeeming_user_id` from the verified Bearer JWT.
- Wrong-account guard: token stays `pending` if redeeming user already holds a different seat in same league.

## Critical lessons

### Service-role direct table access is unreliable for SQL-editor-created tables
**Why:** Tables created via Supabase SQL Editor may not auto-grant to `service_role`, unlike tables created via Dashboard. SECURITY DEFINER RPCs (which run as `postgres`) always work. Direct `supa.from("fantasy_member_recovery_tokens")` queries may fail intermittently.
**How to apply:** For tests verifying state of this table, use the public GET `/api/fantasy/recover/:token` endpoint (which returns `status` field) instead of direct supa queries. To fix permanently, apply: `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fantasy_member_recovery_tokens TO service_role;`

### claim/upgrade endpoint path and required body fields
**Why:** `/api/fantasy/claim/upgrade` (NOT `/api/fantasy/leagues/:lid/seasons/:sid/claim/upgrade`) and requires BOTH `guest_token` AND `league_member_id` in the body. Missing `league_member_id` returns 400 and leaves the member as guest — the wrong-account guard will then not fire because `user_id` stays null.

### §I/§F test ordering — one-pending-per-member cascade
**Why:** Creating a new recovery token via the API automatically revokes any existing pending token. §I must use DELETE (not create) to revoke the pendingToken, and §F must create its own fresh token. Running §I's create before §F's redemption revokes the token §F needs.

### claim_type is commissioner-only in hub response
**Why:** Regular authenticated members don't see `claim_type` in participants array. Tests verifying `claim_type === "account"` post-recovery must call the hub with `commToken`, not the recovered user's token.

## Test suite
- `server/test-fantasy-phase5-2-3.ts` — 73/73 tests pass
- Regression baseline after Phase 5.2.3: all prior test files at 0 failures
