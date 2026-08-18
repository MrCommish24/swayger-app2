---
name: Gameday Fantasy Phase 6E
description: Safe league archive — primary-commissioner-only archive/restore via is_active flag, server-side write guard, archived list branch, frontend archived banner + restore.
---

## Core operation
- Archive: `UPDATE fantasy_leagues SET is_active = false`
- Restore: `UPDATE fantasy_leagues SET is_active = true`
- No data deleted; all picks, rooms, participants, standings, rewards intact

## Authorization
- `requirePrimaryLeagueCommissioner` — new helper: role = 'commissioner' ONLY (not co_commissioner)
- Co-commissioner is intentionally blocked from archive/restore (lifecycle authority distinction)
- Member, guest, unauth all 403/401

## Active competition safeguard
- Queries ALL seasons of the league for rooms with `experience_type='fantasy'`, `archived_at IS NULL`, `status != 'finalized'`
- Blocks with 409 / code: UNRESOLVED_COMPETITION / "Finish or finalize..."
- No-competition league archives freely; finalized-only league archives freely

## Idempotency patterns
- Archive already-archived → `{ archived: true, already_archived: true }` (200)
- Restore already-active → `{ restored: true, already_active: true }` (200)

## Write-guard pattern (`requireLeagueActive`)
- Applied to: POST participants, POST participants/batch, POST draft-day/publish, POST weeks/:n/publish, POST recovery-token, POST claim (for new seat claims)
- Returns 409 / code: LEAGUE_ARCHIVED / "This league is archived. Restore it before making changes."
- Historical GETs are explicitly NOT blocked: season detail, weekly-summary, results, league-picks all still work

## Archived list query
- `GET /api/fantasy/leagues?status=archived` — explicit branch, `.eq("is_active", false)` only
- Never mixes archived leagues into the `is_active = true` active list

## Recovery token redemption
- Intentionally NOT blocked by `requireLeagueActive` — existing members can recover identity into an archived league and see read-only state

## Frontend
- **manage/[leagueId]/[seasonId].tsx**: "LEAGUE MANAGEMENT" section with Archive League button, shown only to `viewer.role === 'commissioner'`; uses Alert.alert for confirmation
- **[leagueId]/[seasonId].tsx** (hub): archived banner with Restore button for primary commissioner; invite/manage buttons hidden when archived
- **index.tsx** (FantasySection): "Archived Leagues" collapsed section at bottom; separate `getArchivedLeagues` call; per-row View + Restore buttons

## Test counts
§AF–§AO: 35 new assertions; grand total 281/281.

## Key insight
The claim endpoint (`POST /claim`) gets the archive guard — new seat claims into archived leagues are blocked. But recovery token REDEMPTION (separate endpoint) is intentionally not blocked, consistent with spec §25.
