# Swayger

A mobile-first app built with Expo (React Native) and an Express backend, using Supabase for auth and data.

## Architecture

- **Frontend**: Expo (v54) with Expo Router v6 for file-based navigation
- **Backend**: Express v5 on port 5000 (placeholder, not yet used for app logic)
- **Auth**: Supabase email OTP (magic link) via `@supabase/supabase-js`
- **State Management**: TanStack React Query v5, React Context for auth
- **Styling**: React Native StyleSheet with a dark theme
- **Session Storage**: expo-secure-store (native), localStorage (web)

## Environment Variables

- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL (https://xxx.supabase.co)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key

## Folder Structure

```
app/
  _layout.tsx          # Root layout with providers + auth routing guard
  auth.tsx             # Email OTP sign-in screen
  username-setup.tsx   # First-login username selection
  (tabs)/
    _layout.tsx        # Tab navigator (Home, Create, Leaderboard, Profile)
    index.tsx          # Home screen — shows user's swaygers from Supabase
    create.tsx         # Create screen (placeholder)
    leaderboard.tsx    # Leaderboard screen (placeholder)
    profile.tsx        # Profile screen with sign-out
  invite/
    [code].tsx         # Dynamic invite route
components/            # Reusable components (ErrorBoundary, etc.)
constants/
  colors.ts            # Dark theme color palette (brand colors)
lib/
  supabase.ts          # Supabase client initialization
  auth-context.tsx     # Auth context provider (session, profile, routing)
  helpers.ts           # Error handling, date formatting, username validation
  query-client.ts      # React Query client configuration
types/
  index.ts             # TypeScript types: Profile, Swayger, Category
server/
  index.ts             # Express entry point
  routes.ts            # API routes (placeholder)
  storage.ts           # Storage interface
shared/
  schema.ts            # Drizzle schema + Zod validation
```

## Auth Flow

1. Unauthenticated → `/auth` (email OTP sign-in)
2. Authenticated, no profile → `/username-setup` (choose username)
3. Authenticated + profile → `/(tabs)` (main app)

Routing guard in `app/_layout.tsx` uses `useSegments` + `useRouter` + `useRootNavigationState` to redirect.

## Theme (Brand Colors)

- Background: #0B1120 (deep navy)
- Surface: #0F1A2E
- Accent/Tint: #1DA1F2 (cyan blue)
- Accent Gold: #F5A623
- Teal: #0D7377

## Workflows

- **Start Backend**: `npm run server:dev` (port 5000)
- **Start Frontend**: `npm run expo:dev` (port 8081)
