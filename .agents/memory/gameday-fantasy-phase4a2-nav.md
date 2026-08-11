---
name: Gameday Fantasy Phase 4A.2
description: Manage Draft Day (edit-before-picks) and Lock Picks web fix — architecture decisions and SQL status.
---

# Phase 4A.2 — Manage Draft Day + Lock Fix

## Lock Picks — Web Fix
**Problem:** `Alert.alert` on React Native Web does not invoke button-specific `onPress` callbacks — browser `window.confirm()` fires but the "Lock Picks" callback is silently dropped. POST to `/draft-day/lock` never reaches server.

**Fix:** Replaced Alert.alert with inline confirmation state (`confirmingLock: boolean`) inside `DraftDayCard`. Cancel stays client-only; Lock Picks calls `onLock()` directly (API call in hub, no dialog).

**Why:** This is a React Native Web limitation. All future commissioner confirmation UX should use inline confirm states, not `Alert.alert` for critical actions on web.

**How to apply:** In DraftDayCard (hub file), use local `confirmingLock` state with two rendered states: button (idle) → confirm box (confirming). `useEffect` resets confirmingLock when card becomes locked.

## Manage Draft Day
**New API endpoint:** `PATCH /api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/props`
- Commissioner-only
- Guards: card.status === 'open' AND pick_count === 0
- Grandfathering rule: templates already in the selection are allowed even if now inactive; only NEW templates must be `is_active = true`
- Calls `update_fantasy_draft_day_props` RPC (atomic delete+insert)

**New SQL function:** `update_fantasy_draft_day_props(p_card_id, p_props)`
- File: `supabase/gameday-fantasy-phase4a2-manage.sql`
- **Must be applied manually in Supabase before PATCH endpoint works**

**GET /draft-day extended:** Now also returns `pick_count: number` and `current_props: DraftDayCurrentProp[]` with `is_active` from library. Used by manage mode.

**Hub changes:**
- "Manage Draft Day" CTA: routes to `/fantasy/draft-day/${leagueId}/${seasonId}?manage=1`
- `canEdit = card_status === 'open' && pick_count === 0`
- Shows "Manage Draft Day" when canEdit, "View Draft Day" when open+picks or locked
- `lockError: string | null` state surfaced to DraftDayCard on lock failure

**Setup screen manage mode** (`?manage=1`):
- Detects `manage === "1"` via `useLocalSearchParams`
- If existing + manage=1 + editable: pre-selects from `current_props`, shows legacy templates
- Legacy (inactive) templates: shown with "⚠ No longer recommended" dashed badge; can be deselected; once removed and saved they cannot be re-added
- If existing + manage=1 + NOT editable: `manage_readonly` step with reason text
- "Save Changes" CTA in review (manage mode) vs "Publish Draft Day" (setup mode)
- Calls `updateDraftDayProps` (PATCH) not `publishDraftDay` on save

## RPC Live-State (Phase 4A.2 verified)
`publish_fantasy_draft_day` creates card.status='open' — confirmed live in Supabase (§22c passes). The corrected RPC SQL was applied.

## Test Count
93 tests: 93 pass, 0 fail (§22b PATCH has 1 skip if Phase 4A.2 SQL not yet applied — skip becomes pass after SQL application).

## SQL Still Required
`supabase/gameday-fantasy-phase4a2-manage.sql` — must be applied manually. Without it:
- PATCH /draft-day/props → 500 "Is the Phase 4A.2 SQL applied?"
- Hub "Manage Draft Day" CTA and save flow fail on server

## Phase 4B Gate
Edit guard: even after Phase 4B picks exist, `pick_count > 0` blocks editing. The guard is already in place server-side; no Phase 4A.2 code needs to change when Phase 4B ships.
