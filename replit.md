# Swayger

A mobile-first app built with Expo (React Native) and an Express backend, using Supabase for auth and data. A "Swayger" is a wager/bet that users create and invite others to participate in.

## Architecture

- **Frontend**: Expo (v54) with Expo Router v6 for file-based navigation
- **Backend**: Express v5 on port 5000 (placeholder, not yet used for app logic)
- **Auth**: Supabase OTP code + magic link + password sign-in via `@supabase/supabase-js`
- **Data**: Supabase (workspaces, workspace_members, profiles, swayger_legs, swayger_responses tables — labeled as "Swaygers" and "Participants" in UI)
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
    create.tsx         # Create Swayger form (title, sport, stake, legs)
    leaderboard.tsx    # Leaderboard screen (placeholder)
    profile.tsx        # Profile screen with set password + sign-out
  swayger/
    [id].tsx           # Swayger detail (status, stake, legs, accept/decline, invite, participants)
  invite/
    [code].tsx         # Dynamic invite route
components/            # Reusable components (ErrorBoundary, etc.)
constants/
  colors.ts            # Dark theme color palette (brand colors)
lib/
  supabase.ts          # Supabase client initialization (AsyncStorage adapter)
  auth-context.tsx     # Auth context provider (session, profile, routing)
  swayger.ts           # Swayger CRUD + gameplay functions (create, join, fetch, accept, decline, cancel) — all ops log errors to console
  verify-schema.ts     # Schema verification utility — probes tables/RPCs on login (dev only), logs [schema-verify] results
  helpers.ts           # Error handling, date formatting, username validation
  query-client.ts      # React Query client configuration
types/
  index.ts             # TypeScript types: Profile, SwaygerData, SwaygerLeg, SwaygerResponse, LegInput, etc.
supabase-migrations/
  001_workspaces.sql       # SQL for workspaces, workspace_members, profiles + RLS
  002_fix_rls_recursion.sql # Fix RLS recursion with SECURITY DEFINER helper
  003_swayger_gameplay.sql  # Adds status/stake to workspaces, creates swayger_legs + swayger_responses + RPCs
  003_verify_and_fix.sql    # Self-contained idempotent script: creates all tables/columns/policies/RPCs + runs verification
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

## Swayger System

- **Concept**: A "Swayger" is a wager/bet. Users create Swaygers and invite participants.
- Users create a Swayger with title, sport (NFL/NBA/MLB/Soccer/NHL/Other), optional stake text, and 1+ pick legs
- Each leg has: market type (Player Prop, Spread, Moneyline, Over/Under, Team Total, Custom), selection text, optional line and odds
- Each Swayger gets a unique invite code (6-8 chars, A-Z, 2-9)
- Creator becomes "owner" in DB (displayed as "Creator" in UI)
- Other users join via invite code and become "viewer" in DB (displayed as "Participant" in UI)
- Non-creators can Accept or Decline a Swayger while it's open
- Accepting sets status to "accepted" and locks legs from editing; the acceptor is labeled "Challenger"
- Declining records the decision but keeps the Swayger open for others ("Declined by you" banner)
- Creator can cancel an open Swayger (sets status to "canceled")
- Status chips: Open (green), Accepted (blue), Declined (red), Canceled (gray)

## Gameplay v1 Tables

- `swayger_legs` — pick legs (swayger_id, market_type, selection, odds, line, notes)
- `swayger_responses` — accept/decline decisions per user (swayger_id, user_id, response)
- `workspaces.status` — open | accepted | canceled (default 'open')
- `workspaces.stake_text` — optional free-text stake description

## Gameplay RPCs (SECURITY DEFINER)

- `accept_swayger(p_swayger_id)` — records acceptance, sets status to 'accepted'
- `decline_swayger(p_swayger_id)` — records decline, keeps swayger open
- `cancel_swayger(p_swayger_id)` — creator only, sets status to 'canceled'

## DB → UI Mapping (Option A)

- `workspaces` table → "Swaygers" in UI
- `workspaces.name` → Swayger title
- `workspaces.scoring_type` → Sport (default "NFL")
- `workspaces.owner_id` → Creator
- `workspace_members` → Participants
- DB role `owner` → UI label "Creator"
- DB role `viewer`/`editor` → UI label "Participant" (or "Challenger" if accepted)
- RPC functions `create_workspace` / `join_workspace_by_code` still used (DB names unchanged)

## Theme (Brand Colors)

- Background: #0B1120 (deep navy)
- Surface: #0F1A2E
- Accent/Tint: #1DA1F2 (cyan blue)
- Accent Gold: #F5A623
- Teal: #0D7377

## Supabase Tables

- `profiles` — user profiles (username, display_name, avatar_url)
- `workspaces` — swaygers (name, scoring_type, invite_code, owner_id, status, stake_text)
- `workspace_members` — participants (workspace_id, user_id, role)
- `swayger_legs` — pick legs (swayger_id, market_type, selection, odds, line)
- `swayger_responses` — accept/decline tracking (swayger_id, user_id, response)

RLS uses `is_workspace_member()` SECURITY DEFINER function to avoid recursion.
Run all 3 migration files in Supabase SQL Editor in order: `001_workspaces.sql`, `002_fix_rls_recursion.sql`, `003_swayger_gameplay.sql`.

## Workflows

- **Start Backend**: `npm run server:dev` (port 5000)
- **Start Frontend**: `npm run expo:dev` (port 8081)
