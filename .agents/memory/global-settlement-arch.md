---
name: Global Settlement Architecture
description: Design decisions for the new grouped Game Day global settlement system (Milestone 1 complete, Milestone 2 pending approval).
---

## Core files

- `server/gameday-normalize.ts` — all normalization utilities (canonical, single source of truth)
- `server/routes-gameday.ts` — queue route at `GET /api/admin/gameday/settlement-queue`
- `app/admin.tsx` — Settlement Queue section (read-only preview), legacy GS hidden behind `LEGACY_GS_ENABLED = false`

## Grouping key schema

```
event_key  = normalize(sport) | sort(normalize(teamA), normalize(teamB)) | YYYY-MM-DD
group_key  = event_key | normalize(phase) | normalize(question) | sort(normalize(options)).join("||")
```

Null sport or null game_date → null event_key → room is marked `is_legacy: true`, never bulk-settled.

## Answer mapping

`mapNormalizedToStored(normalizedAnswer, storedOptions)` — three-pass (exact, prefix, substring).
Never use direct string equality across rooms after normalized grouping.

## Legacy rooms

All 17 rooms created before sport/game_date columns were populated will show as `is_legacy: true`.
They appear in the queue with a notice to settle individually from the host panel.
`LEGACY_GS_ENABLED = false` hides the old template-based GS tool but does NOT delete it — set to `true` for rollback.

## Auth

Token stored in `AsyncStorage` under `"swayger_admin_token"`. Sent as `x-admin-token` header.
Token is never put in a URL. `checkPropLibraryAdmin()` in routes-gameday.ts validates against `MM_ADMIN_TOKEN` env var.
Admin panel is a responsive web workspace — same screen serves mobile and desktop browser.

## Normalization rules (conservative, as of Milestone 1 revision)

Team names: strip ONLY leading articles (the/a/an) and trailing soccer org suffixes (fc/sc/cf/afc/bfc).
Do NOT strip: state, united, city, st., national, athletic/athletics, university, college.
Verified no collision: "Manchester United FC" → "manchester united" ≠ "Manchester City FC" → "manchester city".

mapNormalizedToStored: TWO passes only — (1) exact stored string identity, (2) exact normalized match.
Prefix and substring matching are permanently removed — they were ambiguous for options sharing a common prefix.
null return = hard block; prop must be settled individually.

Fixture tests: server/gameday-normalize.test.ts — 75/75 passing.
Run with: npx tsx server/gameday-normalize.test.ts

## Milestone 1 (complete)

- `GET /api/admin/gameday/settlement-queue` — read-only grouped queue with grouping preview, conflict flags, template consistency metadata
- Admin Settlement Queue section — expandable event → phase → group hierarchy, normalized option display, conflict warnings
- No write path exists yet

## Milestone 2 (pending founder approval after reviewing real grouping output)

- `POST /api/admin/gameday/settle-group` — per-group bulk settlement
- Per-prop: validate prop still pending, card still locked, room still active, answer maps to stored option
- Reuse existing single-prop settlement core logic as shared helper (do NOT make internal HTTP calls or duplicate scoring)
- Answer selection UI + confirmation sheet + result feedback
- Expected prop count guard (idempotency_key optional)

**Why:** Writes are gated until founder reviews real grouping output to confirm groups are correct before any settlement executes.
