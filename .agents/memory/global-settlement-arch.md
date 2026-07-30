---
name: Global Settlement Architecture
description: Normalization module, grouping key schema, queue route, write path, admin UI structure, flags
---

## Milestone 1 (Read Path) — COMPLETE
- `GET /api/admin/gameday/settlement-queue` returns grouped queue
- Logic lives in `buildSettlementQueue(supabase)` — module-level async function in `server/routes-gameday.ts`
- Returns `GSDQueueResult` (also module-level type); GET handler is now 4 lines

## Milestone 2 (Write Path) — COMPLETE, flag off
- `POST /api/admin/gameday/settle-group` in `server/routes-gameday.ts`
- Shared settle logic: `server/gameday-settle-helper.ts` → `settlePropCore(supabase, { propId, cardId, correctAnswer })`
- Individual settle (`PATCH /api/gameday/props/:id/settle`) now delegates to `settlePropCore`
- Feature flag: `GLOBAL_SETTLEMENT_WRITE_ENABLED = process.env.GLOBAL_SETTLE_ENABLED === "true"`
- Admin UI flag: `const GLOBAL_SETTLEMENT_WRITE_ENABLED = false` in `app/admin.tsx` (both must be true to expose controls)
- In-memory idempotency cache with 24h TTL — `_idemCache Map` + `_checkIdem` / `_storeIdem` / `_genOpId`

## Settlement Flow (POST settle-group)
1. Flag gate → 503 FLAG_DISABLED
2. `checkPropLibraryAdmin` (x-admin-token) → 401
3. Parse + validate body (group_key, prop_ids, expected_count, canonical_answer_normalized, idempotency_key)
4. `_checkIdem` → return cached response if replay
5. `buildSettlementQueue` → find matching `group_key` → 409 GROUP_NOT_FOUND if gone
6. Validate `settlement_status === "safe"` → 409 NOT_SAFE
7. Stale detection: live prop_id Set must exactly equal submitted Set → 409 STALE_GROUP
8. Fetch per-prop data (answer_options, card_id, room_id) for canonical answer mapping
9. `mapNormalizedToStored(canonical, opts)` per prop → 409 MAPPING_FAILED if null
10. `settlePropCore` for each prop (all-or-nothing; error mid-op → 500 PARTIAL_SETTLE_ERROR)
11. `logEvent` per affected room with shared `operation_id` (format: `gso-<ts36>-<rand5>`)
12. `_storeIdem` + return response

## Key Design Rules
- **`buildSettlementQueue` is the single source of truth** for both GET (display) and POST (stale detection)
- **answer mapping is per-prop** not per-group (individual props may have different option orderings across rooms)
- **Audit log uses real room IDs only** — no fabricated IDs ever passed to `logEvent`
- **TOCTOU race with in-memory idem**: truly parallel requests can both win before cache is populated; settlePropCore writes are idempotent so no data corruption — DB-backed lock deferred to post-approval
- **Legacy rooms** (null event_key): `settlement_status = "manual_only"`, never bulk-settable

## Test Suite
- `server/test-settle-group.ts` — 29/29 passing
- Run with: `GLOBAL_SETTLE_ENABLED=true npx tsx server/test-settle-group.ts` (after seeding)
- Seed: `npx tsx server/seed-test-settlement-queue.ts`

## Files Changed (Milestone 2)
- `server/gameday-settle-helper.ts` — NEW: `settlePropCore`
- `server/test-settle-group.ts` — NEW: 29-test write-path suite
- `server/routes-gameday.ts` — added `buildSettlementQueue`, POST route, module-scope types + flags + idem cache; GET handler simplified to 4 lines; individual settle refactored to use `settlePropCore`
- `app/admin.tsx` — added `Modal` import, `GLOBAL_SETTLEMENT_WRITE_ENABLED` flag, settle state + `handleSettleConfirm`, Settle Group button (flag-gated on safe groups), confirmation bottom sheet Modal, all required styles

## To Enable for Production
1. Founder reviews test results (29/29 passing, all scenarios covered)
2. Set `GLOBAL_SETTLE_ENABLED=true` in Replit Secrets → restart backend
3. Change `GLOBAL_SETTLEMENT_WRITE_ENABLED = true` in `app/admin.tsx` → rebuild frontend
4. Upgrade in-memory idem cache to DB-backed table (deferred)
