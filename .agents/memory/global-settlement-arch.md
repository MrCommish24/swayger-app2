---
name: Global Settlement Architecture
description: DB-backed idempotency, grouping key schema, settlement flow, migration status, and all 5 lease-race safeguards for the global settlement system.
---

# Global Settlement Architecture

## Key decisions
- **Grouping key**: `event_key = sport|sorted_team_pair|game_date`; `group_key = event_key|phase|normalized_question|sorted_normalized_options`
- **Legacy rooms** (null sport or game_date): `manual_only`, never bulk-settled
- **Answer mapping**: exact-only, two passes; `mapNormalizedToStored` returns null on failure → blocks the group
- **Admin auth**: `x-admin-token` header vs `MM_ADMIN_TOKEN` env var (`checkPropLibraryAdmin`)
- **Flags**: backend `GLOBAL_SETTLE_ENABLED=true` env var; UI `GLOBAL_SETTLEMENT_WRITE_ENABLED = false` in `app/admin.tsx` — both must be true
- **Audit**: `logEvent(supabase, roomId, null, null, "global_prop_settled", {...})` per affected room; shared `operation_id`

## Route files
- `server/gameday-normalize.ts` — normalization, grouping, mapping; 75/75 fixture tests
- `server/gameday-settle-helper.ts` — `settlePropCore(supabase, {propId, cardId, correctAnswer})`
- `server/routes-gameday.ts` — `buildSettlementQueue()`, GET queue, POST settle-group (full DB-backed pipeline)
- `app/admin.tsx` — mobile admin UI, `GLOBAL_SETTLEMENT_WRITE_ENABLED = false`

## DB-backed idempotency (Migration 001)
Table: `public.gameday_settlement_operations`
Migration SQL: `server/migrations/001_gameday_settlement_operations.sql`
Migration runner script: `server/migrations/run-001-settlement-ops.ts`

**Migration status**: NOT YET APPLIED to Supabase. Apply via SQL editor:
https://app.supabase.com/project/vlxvoienyxzhyaiimccp/sql/new

**Until migration is applied**: server logs a warning and proceeds without DB idempotency (graceful degradation — `42P01` code detection).

## Operator identity
- `operator_user_id` — nullable; for when admin users get Supabase JWT auth (not yet implemented)
- `operator_token_fingerprint` — SHA-256(token).hex[0..15], always present as current fallback
- Raw token is never stored

## 5 lease-race safeguards (all implemented in routes-gameday.ts)
1. **Guarded terminal updates**: WHERE idempotency_key + operation_id + status='in_progress'
2. **Lease refresh during work**: extended before loop starts + every 20 props via `_refreshSettleLease()`
3. **Zero-rows-updated handling**: reads current row state → returns appropriate conflict/replay response
4. **Atomic lease-expiry abandonment**: WHERE status='in_progress' AND lease_expires_at < NOW(); inspects row count to detect concurrent abandonment
5. **Mid-flight abandonment detection**: `_isSettleOpActive()` check every 20 props → stops further settlement and returns 409 OPERATION_ABANDONED_MID_FLIGHT

## Partial failure behavior
- `settlePropCore` errors are caught per-prop and accumulated into `partialErrors`
- Loop continues to remaining props (no hard abort)
- Status: `completed` (0 errors) | `partial_success` (207, some errors) | `failed` (500, all failed)
- `partial_results_json` stored in DB; `response_status_code` replayed on idempotency hits

## Startup recovery
`_recoverStaleSettleOps()` called via `setImmediate()` at `registerGamedayRoutes()` start.
Atomically marks `abandoned` any `in_progress` rows with `lease_expires_at < NOW()`.
Handles 42P01 gracefully (table not yet created).

## Test suite
`server/test-settle-group.ts` — 16 tests (T1–T16)
- T1–T12: original Milestone 2 tests (all passing when seeded)
- T13: DB row written with correct fields (requires migration)
- T14: key reuse with different payload → 409 KEY_REUSED
- T15: replay returns original HTTP status code from DB
- T16: UNIQUE constraint prevents duplicate DB rows on concurrent double-tap

## 2-phase claim design
Phase 1 (fast path before queue rebuild): SELECT by idempotency_key → replay if terminal, abandon if in_progress+expired
Phase 2 (after full validation): INSERT with full context (event_key, phase, room_count, prop_count)
If concurrent INSERT races: UNIQUE constraint → 23505 → re-read → 409 OPERATION_IN_PROGRESS

**Why:**  Ensures replays return quickly without rebuilding the queue, while new operations include full context for rich audit records.
