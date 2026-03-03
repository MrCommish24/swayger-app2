# Swayger

A mobile-first app built with Expo (React Native) and an Express backend, using Supabase for auth and data.

## Architecture

- **Frontend**: Expo (v54) with Expo Router v6 for file-based navigation
- **Backend**: Express v5 on port 5000 (placeholder, not yet used for app logic)
- **Auth**: Supabase magic link via `@supabase/supabase-js`
- **Data**: Supabase (workspaces, workspace_members, profiles tables)
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
  auth.tsx             # Magic link sign-in screen
  auth-callback.tsx    # Deep link callback for magic link auth
  username-setup.tsx   # First-login username selection
  (tabs)/
    _layout.tsx        # Tab navigator (Home, Create, Leaderboard, Profile)
    index.tsx          # Dashboard — shows user's workspaces with Create/Join
    create.tsx         # Create Workspace form
    leaderboard.tsx    # Leaderboard screen (placeholder)
    profile.tsx        # Profile screen with sign-out
  workspace/
    [id].tsx           # Workspace detail (invite code, members, actions)
  invite/
    [code].tsx         # Dynamic invite route
components/            # Reusable components (ErrorBoundary, etc.)
constants/
  colors.ts            # Dark theme color palette (brand colors)
lib/
  supabase.ts          # Supabase client initialization (AsyncStorage adapter)
  auth-context.tsx     # Auth context provider (session, profile, routing)
  workspace.ts         # Workspace CRUD functions (create, join, fetch)
  helpers.ts           # Error handling, date formatting, username validation
  query-client.ts      # React Query client configuration
types/
  index.ts             # TypeScript types: Profile, Workspace, WorkspaceMember, etc.
supabase-migrations/
  001_workspaces.sql   # SQL for workspaces, workspace_members, profiles + RLS
server/
  index.ts             # Express entry point
  routes.ts            # API routes (placeholder)
```

## Auth Flow

1. Unauthenticated → `/auth` (magic link sign-in)
2. Magic link tapped → `/auth-callback` (exchanges tokens, creates session)
3. Authenticated, no profile → `/username-setup` (choose username)
4. Authenticated + profile → `/(tabs)` (dashboard)

Deep linking configured with scheme `swayger://` for magic link callbacks.

## Workspace System

- Users create workspaces with a name and scoring type
- Each workspace gets a unique 6-char invite code (A-Z, 2-9, no confusing chars)
- Creator becomes "owner" automatically
- Other users join via invite code and become "viewer"
- Roles: owner, editor, viewer (editor not yet used)
- Workspace detail shows invite code, member list with roles, action buttons

## Theme (Brand Colors)

- Background: #0B1120 (deep navy)
- Surface: #0F1A2E
- Accent/Tint: #1DA1F2 (cyan blue)
- Accent Gold: #F5A623
- Teal: #0D7377

## Supabase Tables

- `profiles` — user profiles (username, display_name, avatar_url)
- `workspaces` — leagues (name, scoring_type, invite_code, owner_id)
- `workspace_members` — memberships (workspace_id, user_id, role)

All tables have RLS policies. Run `supabase-migrations/001_workspaces.sql` in Supabase SQL Editor.

## Workflows

- **Start Backend**: `npm run server:dev` (port 5000)
- **Start Frontend**: `npm run expo:dev` (port 8081)
