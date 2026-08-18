---
name: Gameday Fantasy Phase 6F
description: Invite & QR Sharing — FantasyInviteSheet component, buildFantasyInviteUrl helper, hub/manage/bulk-import entry points, optional weekly QR, §AP-§AS tests. 312/312.
---

## Core architecture
- `buildFantasyInviteUrl(leagueId, seasonId)` exported from `lib/fantasy-api.ts`
  - Canonical URL for QR, Share, and Copy Link — all three use EXACTLY the same string
  - Path: `/fantasy/join/${leagueId}/${seasonId}`
  - Web: `window.location.origin`
  - Native: `EXPO_PUBLIC_DOMAIN` env var (same as `buildWeekUrl`)
- `components/fantasy/FantasyInviteSheet.tsx` — reusable Modal with QR + Share + Copy

## QR dependency
- `react-native-qrcode-svg` ^6.3.21 + `react-native-svg` ^15.12.1 — ALREADY installed
- No new dependencies needed

## FantasyInviteSheet props
- `leagueName: string` — shown above QR
- `inviteUrl: string` — canonical URL encoded in QR and copied/shared verbatim
- `visible: boolean`
- `onClose: () => void`
- QR: 260px (capped to 80% viewport), dark (#111111) on white (#ffffff)

## Security model
- QR encodes canonical join URL only — NO guest_token, user_id, recovery token, seat_id
- join-info endpoint is public (no auth required)
- join-info returns 404 for archived leagues (`is_active=false` check at line 1603)
- Seat claim still requires Bearer JWT or X-Fantasy-Guest-Token in /claim body

## Claim endpoint — critical finding
- The correct seat claim endpoint is `POST /api/fantasy/leagues/:id/seasons/:id/claim`
- Requires `X-Fantasy-Guest-Token` header for guest claims (or Bearer JWT for account claims)
- There is NO `/claim/guest` sub-route — existing `buildLeague` test fixture silently 404s on this path (harmless since guest token falls back to "")
- For tests needing real guest claims: generate `crypto.randomUUID()` and pass as 5th arg to `api()` → becomes `X-Fantasy-Guest-Token` header

## Entry points
- **Hub** (`[leagueId]/[seasonId].tsx`): "Invite Members" button → opens `FantasyInviteSheet`
- **Manage** (`manage/[leagueId]/[seasonId].tsx`): "🔗 Invite Your League" button in addActions row
- **Bulk-import** (`bulk-import/[leagueId]/[seasonId].tsx`): "🔗 Invite Your League" after success banner; leagueName passed via URL param from manage screen
- **Weekly QR** (optional): WeeklyCard `onShowQR` prop → opens FantasyInviteSheet with week URL

## Weekly QR
- `WeeklyCardProps` has `onShowQR?: () => void`
- "⬛ Show QR" button added to WeeklyCard secondary row (alongside Copy Link, Remind)
- Hub hub passes `onShowQR` that sets `weeklyQRUrl` + `weeklyQRLabel` + shows modal
- Weekly QR URL = `buildWeekUrl(leagueId, seasonId, wn)` — same as Copy Link

## Test counts
§AP–§AS: 31 new assertions; grand total 312/312.

## join-info archived behavior
- Archived league → `join-info` returns 404 (treated as "League not found")
- This is intentional — join screen shows generic "not found" error for archived leagues
- For pilot, this is acceptable (the claim endpoint also blocks with 409 LEAGUE_ARCHIVED)
- Post-pilot: update join-info to return a specific LEAGUE_ARCHIVED code for better UX
