---
name: Gameday Fantasy Phase 5.2.2
description: Guest Access Durability + Auth Return E2E — upgrade nudge, hub banner, Playwright E2E
---

## Key decisions

**Guest upgrade nudge — two paths:**
- **Week-context path** (`?wn=` present on join screen): after guest claims, show inline upgrade nudge screen inside the join screen. "Save My Spot" stores `FANTASY_PENDING_UPGRADE_KEY` + `PENDING_AUTH_REDIRECT_KEY` then pushes `/auth`. "Maybe Later" routes to Week N play.
- **Hub path** (no `?wn=`): route guest to hub with `?joined=1` so the welcome banner shows (was missing `?joined=1` — bug fixed).

**Hub guest banner**: dismissible amber banner for returning device-only guests. Session-only dismissal state (`guestBannerDismissed`). "Save My Spot" stores upgrade keys → `/auth`. No DB needed.

**MY TEAM guest link bug fixed**: was `router.push('/auth')` with no upgrade context. Now stores `FANTASY_PENDING_UPGRADE_KEY` + `PENDING_AUTH_REDIRECT_KEY` before routing.

**No SQL required**: all identity preservation goes through existing `fantasy_member_claims`, guest→auth upgrade RPC, and auth return URL.

## Test suite
- Server: `server/test-fantasy-phase5-2-2.ts` — 39 tests (§93–§113)
- Playwright E2E: `e2e/fantasy-auth-return.spec.ts` — 3 tests (spec §9, §11)

## Playwright setup
- Config: `playwright.config.ts` — uses Nix Chromium (`/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome`). Downloaded chromium-headless-shell fails with libglib-2.0.so.0 missing on NixOS.
- `@playwright/test` installed as devDep; run `npx playwright install chromium` to re-download if needed (but Nix binary is faster).

## Expo Web + Playwright gotchas
1. `TouchableOpacity` renders as `div[role="button"]` on Expo Web — `getByRole("button")` should work but may miss elements if hidden behind conditional rendering (`!session`).
2. `AsyncStorage.setItem` on Expo Web wraps `localStorage.setItem` but the `try { ... } catch {}` in `handleSignIn` silently swallows errors in headless Playwright. Set localStorage directly in tests via `page.evaluate`.
3. Must navigate to the app origin before `page.evaluate` can access `localStorage` (about:blank has no localStorage).
4. Test users need a profile row in `profiles` table (`id`, `username`) or the layout redirects to `/username-setup` before the pending redirect fires.

## DB column names (fantasy_season_members)
- FK to `fantasy_league_members`: column is `league_member_id` ✓
- FK to season: column is `league_season_id` (NOT `season_id` — common mistake)
- No `fantasy_team_id` column directly; team is linked via `fantasy_team_managers(season_member_id)`

## Known guest limitations remaining
- Guest token lost on different device/browser with no upgrade → seat permanently occupied (no self-service recovery)
- No persistent banner dismissal (session-only state, banner reappears next visit)
- No email/SMS/magic-link recovery path
