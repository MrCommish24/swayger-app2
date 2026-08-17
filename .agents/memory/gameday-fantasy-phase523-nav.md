---
name: Gameday Fantasy Phase 5.2.3
description: Commissioner-assisted member recovery — checkpoint before SQL application. Recovery token architecture, invariant mapping, migration file location.
---

# Phase 5.2.3 — Commissioner-Assisted Member Recovery

## Status at checkpoint
SQL migration written, NOT yet applied. Awaiting user confirmation that SQL is live before any application code is written.

## Migration file
`supabase/gameday-fantasy-phase5-2-3-recovery.sql`

## New table
`fantasy_member_recovery_tokens` — additive only, no existing tables touched.
RLS enabled with permissive policy (matches all other Fantasy tables).
Three SECURITY DEFINER RPCs: create / redeem / revoke.

## Recovery mechanism
Recovery reuses the EXACT same UPDATE that `POST /claim/upgrade` uses:
```sql
UPDATE fantasy_member_claims
SET    user_id     = <new_user_id>,
       guest_token = NULL
WHERE  id = <claim_id>;
```
Same row, no new record, partial unique index never violated.
Old guest_token cleared atomically → old device loses access immediately.

## Token security model
- 256-bit crypto-random opaque token (Node.js `crypto.randomBytes(32).toString("hex")`)
- Only SHA-256 hash stored in DB; raw token returned once and discarded
- 24-hour expiry
- One pending token per member (create revokes prior pending)
- Single-use: redeemed status is set atomically with the claim transfer
- Wrong-account: token stays PENDING if wrong user opens it

## Wrong-account guard
Step 9 of redeem RPC checks if redeeming user already holds a DIFFERENT active seat
in the same league. If so → exception `wrong_account_already_member`, token stays
pending. Rob's claim and Mike's claim both untouched.

## Idempotency
Same user retries after server success → `already_redeemed_by_you: true` (safe).
Different user on already-redeemed token → `token_not_pending:redeemed` (rejected).

## Planned API routes (after SQL confirmed)
- POST /api/fantasy/leagues/:lid/seasons/:sid/members/:mid/recovery-token  (commissioner)
- GET  /api/fantasy/recover/:token  (public — landing page context, no transfer)
- POST /api/fantasy/recover/:token  (Bearer JWT — authenticated redemption)
- DELETE /api/fantasy/leagues/:lid/seasons/:sid/members/:mid/recovery-token  (commissioner revoke)

## Planned frontend screens
- app/fantasy/recover/[token].tsx — pre-auth landing + post-auth redemption + success
- app/fantasy/manage/[leagueId]/[seasonId].tsx — "Help Recover Access" per guest-claimed member

## Auth return
Recovery screen stores `/fantasy/recover/<token>` in PENDING_AUTH_REDIRECT_KEY before
pushing to /auth. auth-callback.tsx reads and replaces to that path after sign-in.
No _layout.tsx changes needed — inFantasy guard already allows unauthenticated visitors.

## All 13 Phase 5.2.2 invariants confirmed preserved
Recovery touches ONLY fantasy_member_claims (one row UPDATE). All picks, participants,
standings, teams, roster_revision, answer_universe_revision are untouched.
