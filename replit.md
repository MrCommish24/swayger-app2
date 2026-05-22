# Swayger

A mobile-first app built with Expo (React Native) and an Express backend, using Supabase for auth and data. A "Swayger" is a simple 1v1 social wager contract between two users, settled by mutual agreement.

## Architecture

- **Frontend**: Expo (v54) with Expo Router v6 for file-based navigation
- **Backend**: Express v5 on port 5000 (placeholder, not yet used for app logic)
- **Auth**: Supabase OTP code + magic link + password sign-in via `@supabase/supabase-js`
- **Data**: Supabase (`swaygers`, `swayger_invites`, `profiles`, `settlement_proposals`, `user_balances` tables)
- **State Management**: TanStack React Query v5, React Context for auth
- **Styling**: React Native StyleSheet with a dark theme
- **Session Storage**: AsyncStorage (native), localStorage (web)

## Environment Variables

- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL (https://xxx.supabase.co)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key

## Folder Structure

```
app/
  _layout.tsx          # Root layout with providers + auth routing guard
  auth.tsx             # Sign-in screen (OTP code, magic link, password)
  auth-callback.tsx    # Deep link callback for magic link auth
  username-setup.tsx   # First-login username selection
  (tabs)/
    _layout.tsx        # Tab navigator (Swaygers, Create, Leaderboard, Profile)
    index.tsx          # Dashboard — "My Swaygers" with Create/Join buttons
    create.tsx         # Create Swayger form (title, description, category, stake units, creator pick)
    leaderboard.tsx    # Leaderboard screen (ranked by wins from settled Swaygers)
    profile.tsx        # Profile screen with set password + sign-out + dev schema panel
  swayger/
    [id].tsx           # Swayger detail (contract view, accept/decline, settlement, rematch)
  invite/
    [code].tsx         # Invite join flow — preview swayger, accept/decline with opponent pick
  h2h/
    index.tsx          # H2H opponents list — all opponents + aggregate records
    [opponentId].tsx   # Detailed H2H receipt (scoreboard, category breakdown, game log, share)
  playoffs/
    _layout.tsx        # NBA Playoffs stack layout
    index.tsx          # NBA Playoffs hub (hero, bracket CTA, live games w/ odds, leaderboard snippet, prizes)
    bracket.tsx        # Bracket picks UI — pick series winner + games per round (locks per round)
    leaderboard.tsx    # NBA Playoffs points race leaderboard with per-round breakdown
  march-madness/
    index.tsx          # March Madness hub (INACTIVE — MARCH_MADNESS_ACTIVE=false)
  join.tsx             # Join Swayger screen — enter code or scan QR
components/
  ErrorBoundary.tsx    # Error boundary + fallback with dev error details modal
  ReceiptCard.tsx      # Shareable receipt card for settled Swaygers (captured via react-native-view-shot)
  H2HReceiptCard.tsx   # Shareable H2H record card (scoreboard + category breakdown, image export)
constants/
  colors.ts            # Dark theme color palette (brand colors)
lib/
  supabase.ts          # Supabase client initialization (AsyncStorage adapter)
  auth-context.tsx     # Auth context provider (session, profile, routing)
  swayger.ts           # Swayger CRUD + gameplay functions — all ops log errors with [swayger] prefix
  verify-schema.ts     # Schema verification utility — probes tables/RPCs (dev only), logs [schema-verify]
  helpers.ts           # Error handling, date formatting, username validation
  query-client.ts      # React Query client configuration
types/
  index.ts             # TypeScript types: Profile, SwaygerData, SwaygerInvite, SettlementProposal
supabase-migrations/
  001_workspaces.sql       # SQL for original workspaces, workspace_members, profiles + RLS
  002_fix_rls_recursion.sql # Fix RLS recursion with SECURITY DEFINER helper
  003_swayger_gameplay.sql  # (LEGACY v0 — legs/responses model, superseded)
  003_verify_and_fix.sql    # (LEGACY v0 — verification for legs model)
  004_v1_refactor.sql       # V1 refactor: adds 1v1 wager columns to workspaces (intermediate step)
  005_fix_schema_to_swaygers.sql # V1.1: Creates dedicated `swaygers` table, `swayger_invites`, all gameplay RPCs
server/
  index.ts             # Express entry point
  routes.ts            # API routes (placeholder)
```

## Auth Flow

1. Unauthenticated → `/auth` (email + OTP code, or password sign-in)
2. OTP code entered → verified in-app via `verifyOtp`; or magic link → `/auth-callback`
3. Authenticated, no profile → `/username-setup` (choose username)
4. Authenticated + profile → `/(tabs)` (My Swaygers dashboard)

Deep linking configured with scheme `swayger://` for magic link callbacks.

## Swayger v1.1 System (1v1 Wager Contracts)

### Core Loop

Create → Invite → Accept (opponent_pick) → Active → Propose Settlement → Mutual Confirm → Settled → Leaderboard → Rematch

### How It Works

- Users create a Swayger with: title, description (optional), category (Sports/Entertainment/Gaming/Lifestyle/Politics/Other), stake units (1-100), and their pick/prediction
- Each Swayger gets a unique invite code (6 chars, A-Z, 2-9) stored in `swayger_invites` table
- Creator can share via: Copy Code, OS Share sheet, or QR code (encodes "SWAYGER:XXXXXX")
- Opponents can join via: entering code on Join screen, or scanning QR code (expo-camera barcode scanner)
- `join_swayger_by_code` validates the code and returns the swayger ID (does NOT set `opponent_id`)
- On the invite screen, opponent enters their pick and accepts — `accept_swayger` sets `opponent_id` and activates the wager
- Accepting locks both picks and activates the Swayger
- Either participant can propose a settlement outcome: Creator Wins, Opponent Wins, Draw, or No Contest
- The other participant must confirm the same proposal for it to settle
- Settled Swaygers feed into the leaderboard (wins, losses, units won/lost)
- Creators of settled Swaygers can create rematches: "Run it Back" (same stake) or "Double or Nothing" (2x stake)

### Statuses

- `pending_invite` — created, waiting for opponent to accept
- `active` — both picks locked, wager is live
- `settlement_proposed` — one party proposed an outcome, awaiting other's confirmation
- `settled` — both parties confirmed, final outcome recorded
- `declined` — opponent declined the invite
- `canceled` — creator canceled the Swayger
- `expired` / `expired_active` — past expiry date

### Key DB Columns on `swaygers`

- `creator_id` — creator's user UUID
- `opponent_id` — opponent's user UUID (set by `accept_swayger` RPC, null until accepted)
- `title` — swayger title
- `description` — optional description
- `category` — Sports, Entertainment, Gaming, Lifestyle, Politics, Other
- `stake_units` — integer (5-100, min 5 for Swayger Points)
- `stake_note` — optional free-text note about what the stake represents (e.g., "bragging rights")
- `creator_pick` — creator's prediction text
- `opponent_pick` — opponent's prediction text (set on accept)
- `expires_at` — auto-set to 7 days from creation
- `settled_outcome` — creator, opponent, draw, or no_contest
- `source_swayger_id` — links to original swayger for rematches
- `rematch_type` — run_it_back or double_or_nothing

### `swayger_invites` Table

- `swayger_id` — FK to swaygers
- `invite_code` — unique 6-char code

### Settlement Proposals Table

- `settlement_proposals` — tracks proposed outcomes with creator_confirmed/opponent_confirmed flags
- Both must confirm for settlement to finalize

### Gameplay RPCs (SECURITY DEFINER)

- `create_swayger(p_title, p_description, p_category, p_stake_units, p_creator_pick, p_invite_code, p_stake_note?)` — creates swayger + invite record; deducts SP escrow if `points_active=true`
- `join_swayger_by_code(p_invite_code)` — sets caller as opponent
- `accept_swayger(p_swayger_id, p_opponent_pick)` — accept + set opponent pick, status → active; deducts opponent SP escrow
- `decline_swayger(p_swayger_id)` — decline invite; refunds creator escrow
- `cancel_swayger(p_swayger_id)` — creator only; refunds all escrow
- `propose_settlement(p_swayger_id, p_outcome)` — propose an outcome
- `confirm_settlement(p_swayger_id, p_proposal_id)` — confirm a proposal; settles + redistributes SP if both confirmed
- `withdraw_settlement_proposal(p_swayger_id)` — withdraw your own proposal; status → active
- `claim_bankruptcy()` — one-time emergency refill: sets balance to 250 SP when at 0
- `expire_old_proposals()` — called hourly by server; withdraws proposals older than 7 days

## Swayger Points (SP) System

Virtual currency for tracking social stakes. Migration: `supabase/swayger-points-migration.sql`.

### Rules
- Every user starts with **1000 SP** (seeded from migration, or gets 1000 + net_units from settled history)
- Min stake is **5 SP** per swayger
- On create: creator's SP are **escrowed** (deducted) immediately
- On accept: opponent's SP are **escrowed**
- On settle: winner gets `2 × stake`, draw = both refunded, no_contest = both refunded
- On cancel/decline: escrowed SP is fully refunded
- **Bankruptcy**: If balance = 0, user can claim a one-time 250 SP lifeline (profile screen)
- Legacy/older swaygers have `points_active=FALSE` — no SP impact

### `user_balances` Table
- `user_id` — FK to auth.users
- `balance` — current SP bank balance (available to bet)
- `escrowed` — SP currently locked in active swaygers
- `total_earned` / `total_lost` — lifetime stats
- `bankruptcy_used` — whether the one-time lifeline has been claimed

## Theme (Brand Colors)

- Background: #0B1120 (deep navy)
- Surface: #0F1A2E
- Accent/Tint: #1DA1F2 (cyan blue)
- Accent Gold: #F5A623
- Teal: #0D7377

## Push Notifications

Uses `expo-notifications` (v0.32.x). Tokens are stored in the `push_tokens` Supabase table. Notifications are sent peer-to-peer: the actor's device calls the Expo Push API directly with the recipient's token (fetched via `get_push_token` SECURITY DEFINER RPC).

### Notification Triggers

| Event | Notified party | Message |
|---|---|---|
| Opponent joins via code | Creator | "Someone joined your Swayger! 👋" |
| Opponent accepts | Creator | "Challenge accepted! ⚡" |
| Opponent declines | Creator | "Invite declined" |
| Either proposes settlement | Other party | "Settlement proposed 🤝" |
| Either confirms (fully settled) | Other party | "Swayger settled! 🏆" |
| Creator cancels | Opponent | "Swayger canceled" |

Notifications are fire-and-forget; they never block the UI. On web, all notification code is a no-op (guarded by `Platform.OS !== "web"`).

### Key Files

- `lib/notifications.ts` — `registerPushToken()` + `sendPushNotification(toUserId, title, body, data?)`
- `app/_layout.tsx` — registers token on session start, sets notification handler

## Supabase Tables

- `profiles` — user profiles (username, display_name, avatar_url)
- `swaygers` — 1v1 wager contracts (title, category, creator_id, opponent_id, status, stake_note, points_active, etc.)
- `swayger_invites` — invite codes (swayger_id, invite_code)
- `settlement_proposals` — settlement proposals (swayger_id, proposed_by, outcome, confirmations)
- `push_tokens` — Expo push tokens per user (one row per user, upserted on login)
- `user_balances` — Swayger Points ledger (balance, escrowed, total_earned, total_lost, bankruptcy_used)

### Migration Order

Run in Supabase SQL Editor in order:
1. `001_workspaces.sql` — base tables (profiles, workspaces legacy)
2. `002_fix_rls_recursion.sql` — RLS fix
3. `005_fix_schema_to_swaygers.sql` — creates `swaygers`, `swayger_invites`, `settlement_proposals` tables, all gameplay RPCs
4. `012_push_tokens.sql` — creates `push_tokens` table + `get_push_token` RPC
5. `supabase/swayger-points-migration.sql` — creates `user_balances` table, adds `stake_note`/`points_active` columns to `swaygers`, rewrites all gameplay RPCs with SP logic, seeds all existing users

Note: Migrations 003 and 004 are superseded by 005. If starting fresh: 001 + 002 + 005 + 012 + swayger-points-migration.

## Smoke Test Checklist

After running `005_fix_schema_to_swaygers.sql`, verify the following manually:

1. **Create Swayger**: Go to Create tab → fill in title, category, stake units, your pick → submit. Should redirect to detail screen showing status "Pending".
2. **Invite Code**: On the detail screen, the invite code should be visible with copy buttons.
3. **Join via Code**: Second user taps "Join" → enters code (or scans QR) → sees swayger preview → accepts with opponent pick.
4. **Accept Swayger**: As the opponent, enter a pick and tap Accept → status should change to "Active", both picks visible.
5. **Propose Settlement**: Either participant taps a settlement outcome → proposal card appears with one confirmation.
6. **Confirm Settlement**: Other participant taps "Confirm Settlement" → status becomes "Settled", result shows.
7. **Leaderboard**: After settling, both users appear on the Leaderboard tab with win/loss records.
8. **Rematch**: Creator of a settled swayger sees "Run it Back" and "Double or Nothing" buttons → creates a new swayger.
9. **Cancel**: Creator can cancel a pending swayger → status becomes "Canceled".
10. **Decline**: Opponent can decline a pending swayger → status becomes "Declined".
11. **Schema Health**: In Profile (dev mode), Dev: Schema Health panel shows all green checks.

## Game Day Room Creation — Required Procedure

**CRITICAL: Always use the API route, never a direct DB insert.** Creating a room directly in Supabase bypasses the card/prop seeding logic — the room will exist but have no pick cards and no props (empty room). The route at `POST /api/gameday/rooms` handles room creation + pick card creation + prop population in one atomic flow.

### Required Fields

```json
{
  "room_name":        "Cavs vs Knicks — ECF Game 3",
  "team_a_name":      "Cleveland Cavaliers",
  "team_b_name":      "New York Knicks",
  "team_a_star":      "Donovan Mitchell",
  "team_b_star":      "Jalen Brunson",
  "game_date":        "May 21, 2026",
  "selected_prop_ids": null
}
```

- `team_a_star` and `team_b_star` are **required** — they populate `{{STAR_A}}`/`{{STAR_B}}` placeholders in every prop question
- `selected_prop_ids` is optional; omitting it uses `DEFAULT_PROP_IDS` (9 props across all 3 phases)
- `game_date` accepts "May 21", "May 21, 2026", or ISO "2026-05-21"

### What the Route Auto-Creates

3 pick cards (all start `status: "closed"`) + props per card:

| Phase | Card Title | Default Props |
|---|---|---|
| `pregame` | Pregame Picks | Who wins? / 1st quarter? / Star pts? / Within 7 pts w/ 2min? |
| `halftime` | Halftime Picks | Halftime leader wins? / 3rd quarter? / Star 2nd half? |
| `fourth` | 4Q Clutch Picks | 4th quarter winner? / Within 5 pts in final 2 min? |

### Auth Requirement

The route requires a **Supabase JWT Bearer token** from a host user whose email is in `GAMEDAY_HOST_EMAILS` (default: `darius@leagueswype.com`). Admin token alone is not sufficient — the room must be created from the app UI or by the agent calling the API with the host's JWT.

### If a Room Was Created Without Props (Recovery)

Use this Node snippet with the service role key to backfill cards + props for any room:

```js
// Run with: node -e "..." (env vars must be loaded)
// Customize ROOM_ID, TEAM_A, TEAM_B, STAR_A, STAR_B
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// ... see server/gameday-template.ts DEFAULT_PROP_IDS + NBA_PLAYOFF_TEMPLATE for the full prop list
// Insert pick cards (pregame/halftime/fourth, status:'closed'), then insert gameday_props per card
```

### Game Day Room Creation Checklist

When asked to create a Game Day room, always confirm or gather:
- [ ] `room_name` — e.g. "Cavs vs Knicks — ECF Game 3"
- [ ] `team_a_name` + `team_b_name` — full team names (used in prop questions)
- [ ] `team_a_star` + `team_b_star` — primary player names (first + last, used in prop questions)
- [ ] `game_date` — the actual game date
- [ ] `selected_prop_ids` — leave null to use the 9 default props
- [ ] Confirm the response includes 3 cards each with props (check `ok: true` + no empty cards)

### `gameday_pick_cards` Status Flow

`closed` → (host opens) → `open` → (host locks) → `locked` → (host settles) → `settled`

### Key Files

- `server/routes-gameday.ts` — all game day API routes
- `server/gameday-template.ts` — `NBA_PLAYOFF_TEMPLATE`, `DEFAULT_PROP_IDS`, `resolvePlaceholders()`
- `app/gameday/[roomId]/index.tsx` — participant view
- `app/gameday/[roomId]/host.tsx` — host control panel

## Workflows

- **Start Backend**: `npm run server:dev` (port 5000)
- **Start Frontend**: `npm run expo:dev` (port 8081)

## User Preferences

- **Email blasts**: Always send a test email to darius@leagueswap.com first and wait for explicit approval before sending the full blast to all users.
