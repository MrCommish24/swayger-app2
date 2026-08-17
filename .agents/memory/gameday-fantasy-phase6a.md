---
name: Gameday Fantasy Phase 6A
description: Bulk member import — parser, batch endpoint, UI screen, idempotency replay detection, open-roster behavior for weekly vs Draft Day rooms.
---

## Core rule: replay detection requires a pre-check query

The `add_fantasy_season_participant_idempotent` RPC returns the **original** `result_json` unchanged on replay. If the original call created a new member (`already_exists = false`), the replay also returns `already_exists = false`. Do NOT use `already_exists` to detect replays.

**Correct approach**: before the RPC loop, bulk-query `fantasy_participant_operations` for all per-row keys in one shot, build a Set of already-recorded keys, then check membership per row.

```typescript
const allRowKeys = members.map((_, i) => `${bk}:${i}`);
const { data: existingOps } = await supabase
  .from("fantasy_participant_operations")
  .select("idempotency_key")
  .eq("operator_user_id", commissioner.userId)
  .in("idempotency_key", allRowKeys);
const alreadyRecordedKeys = new Set(...);
// then: status = alreadyRecordedKeys.has(key) ? "replayed" : "created"
```

**Why:** The RPC replays the stored `result_json` which preserves the original `already_exists` value (false for fresh creates). Without the pre-check, all retries are incorrectly counted as `created`.

## Weekly rooms vs Draft Day rooms for open-roster snapshot

The server's member-add path (single-add and batch) only passes `p_room_id` to the RPC for **Draft Day** rooms — not weekly rooms. This is intentional:

- Weekly answer_options are snapshotted at publish time.
- New members added after a weekly is published appear in the NEXT weekly Swayger.
- Weekly `pick_card.roster_revision` does NOT increment on member add.
- Batch-add must match this single-add behavior exactly.

**How to apply:** Tests expecting roster_revision to increment or answer_options to grow after bulk-add during an open weekly are wrong. Assert `rosterRevisionAfter === rosterRevisionBefore`.

## Batch idempotency key scheme

Per-row key: `${batch_key}:${rowIndex}` — same commissioner + batch_key + rowIndex = replay. Any edit to a row after a submission attempt requires a fresh UUID `batch_key` (not just a new rowIndex) so the hash guard doesn't fire a 409 on changed content.

## Parser format detection priority

Tab → Pipe → Comma. Comma uses first-comma semantics (everything after the first comma is the team name) so team names can contain commas.

## Files

- `lib/bulk-import-parser.ts` — parser (shared by screen + tests)
- `server/routes-fantasy.ts` — `POST .../participants/batch` endpoint
- `lib/fantasy-api.ts` — BatchMemberInput, BatchMemberResult, batchImportParticipants()
- `app/fantasy/bulk-import/[leagueId]/[seasonId].tsx` — 3-step import screen
- `app/fantasy/manage/[leagueId]/[seasonId].tsx` — "📋 Paste League Roster" button + addActions/pasteBtn/pasteBtnText styles
- `server/test-fantasy-phase6-pilot-readiness.ts` — §A–§F (103 tests)
