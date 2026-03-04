# Swayger

A mobile-first app built with Expo (React Native) and an Express backend, using Supabase for auth and data. A "Swayger" is a simple 1v1 social wager contract between two users, settled by mutual agreement.

## Architecture

- **Frontend**: Expo (v54) with Expo Router v6 for file-based navigation
- **Backend**: Express v5 on port 5000 (placeholder, not yet used for app logic)
- **Auth**: Supabase OTP code + magic link + password sign-in via `@supabase/supabase-js`
- **Data**: Supabase (workspaces, workspace_members, profiles, settlement_proposals tables — labeled as "Swaygers" and "Participants" in UI)
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
    [code].tsx         # Dynamic invite route
components/            # Reusable components (ErrorBoundary, etc.)
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
  index.ts             # TypeScript types: Profile, SwaygerData, SettlementProposal, SwaygerParticipant
supabase-migrations/
  001_workspaces.sql       # SQL for workspaces, workspace_members, profiles + RLS
  002_fix_rls_recursion.sql # Fix RLS recursion with SECURITY DEFINER helper
  003_swayger_gameplay.sql  # (LEGACY v0 — legs/responses model, superseded by 004)
  003_verify_and_fix.sql    # (LEGACY v0 — verification for legs model)
  004_v1_refactor.sql       # V1 refactor: drops legs/responses, adds 1v1 wager contract model + settlement engine
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

## Swayger v1 System (1v1 Wager Contracts)

### Core Loop

Create → Invite → Accept (opponent_pick) → Active → Propose Settlement → Mutual Confirm → Settled → Leaderboard → Rematch

### How It Works

- Users create a Swayger with: title, description (optional), category (Sports/Entertainment/Gaming/Lifestyle/Politics/Other), stake units (1-100), and their pick/prediction
- Each Swayger gets a unique invite code (6 chars, A-Z, 2-9)
- Creator shares the code with an opponent who joins and enters their own pick
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

### Key DB Columns on `workspaces`

- `category` — Sports, Entertainment, Gaming, Lifestyle, Politics, Other
- `stake_units` — integer (1-100)
- `creator_pick` — creator's prediction text
- `opponent_pick` — opponent's prediction text (set on accept)
- `opponent_id` — opponent's user UUID (set on accept)
- `expires_at` — auto-set to 7 days from creation
- `settled_outcome` — creator, opponent, draw, or no_contest
- `source_swayger_id` — links to original swayger for rematches
- `rematch_type` — run_it_back or double_or_nothing

### Settlement Proposals Table

- `settlement_proposals` — tracks proposed outcomes with creator_confirmed/opponent_confirmed flags
- Both must confirm for settlement to finalize

### Gameplay RPCs (SECURITY DEFINER)

- `accept_swayger(p_swayger_id, p_opponent_pick)` — accept + set opponent pick, status → active
- `decline_swayger(p_swayger_id)` — decline invite
- `cancel_swayger(p_swayger_id)` — creator only, cancel
- `propose_settlement(p_swayger_id, p_outcome)` — propose an outcome
- `confirm_settlement(p_swayger_id, p_proposal_id)` — confirm a proposal; settles if both confirmed

## DB → UI Mapping

- `workspaces` table → "Swaygers" in UI
- `workspaces.name` → Swayger title
- `workspaces.owner_id` → Creator
- `workspace_members` → Participants
- DB role `owner` → UI label "Creator"
- DB role `viewer`/`editor` → UI label "Opponent"
- RPC functions `create_workspace` / `join_workspace_by_code` still used (DB names unchanged)

## Theme (Brand Colors)

- Background: #0B1120 (deep navy)
- Surface: #0F1A2E
- Accent/Tint: #1DA1F2 (cyan blue)
- Accent Gold: #F5A623
- Teal: #0D7377

## Supabase Tables

- `profiles` — user profiles (username, display_name, avatar_url)
- `workspaces` — swaygers (name, category, invite_code, owner_id, status, stake_units, creator_pick, opponent_pick, etc.)
- `workspace_members` — participants (workspace_id, user_id, role)
- `settlement_proposals` — settlement proposals (swayger_id, proposed_by, outcome, confirmations)

RLS uses `is_workspace_member()` SECURITY DEFINER function to avoid recursion.

### Migration Order

Run in Supabase SQL Editor in order:
1. `001_workspaces.sql` — base tables
2. `002_fix_rls_recursion.sql` — RLS fix
3. `004_v1_refactor.sql` — v1 wager contract model (safe/additive, does NOT drop old tables)

Old tables (`swayger_legs`, `swayger_responses`) are left intact but unused by v1 code.

## Smoke Test Checklist

After running `004_v1_refactor.sql`, verify the following manually:

1. **Create Swayger**: Go to Create tab → fill in title, category, stake units, your pick → submit. Should redirect to detail screen showing status "Pending".
2. **Invite Code**: On the detail screen, the invite code should be visible with copy buttons.
3. **Join via Code**: Second user enters the invite code from dashboard "Join" button → should land on the swayger detail.
4. **Accept Swayger**: As the opponent, enter a pick and tap Accept → status should change to "Active", both picks visible.
5. **Propose Settlement**: Either participant taps a settlement outcome → proposal card appears with one confirmation.
6. **Confirm Settlement**: Other participant taps "Confirm Settlement" → status becomes "Settled", result shows.
7. **Leaderboard**: After settling, both users appear on the Leaderboard tab with win/loss records.
8. **Rematch**: Creator of a settled swayger sees "Run it Back" and "Double or Nothing" buttons → creates a new swayger.
9. **Cancel**: Creator can cancel a pending swayger → status becomes "Canceled".
10. **Decline**: Opponent can decline a pending swayger → status becomes "Declined".
11. **Schema Health**: In Profile (dev mode), Dev: Schema Health panel shows all green checks.

## Workflows

- **Start Backend**: `npm run server:dev` (port 5000)
- **Start Frontend**: `npm run expo:dev` (port 8081)
