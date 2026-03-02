# Swayger

A mobile-first app built with Expo (React Native) and an Express backend.

## Architecture

- **Frontend**: Expo (v54) with Expo Router v6 for file-based navigation
- **Backend**: Express v5 on port 5000
- **State Management**: TanStack React Query v5
- **Styling**: React Native StyleSheet with a dark theme
- **ORM**: Drizzle ORM (not yet connected)

## Folder Structure

```
app/
  _layout.tsx          # Root layout with providers
  (tabs)/
    _layout.tsx        # Tab navigator (Home, Create, Leaderboard, Profile)
    index.tsx          # Home screen
    create.tsx         # Create screen
    leaderboard.tsx    # Leaderboard screen
    profile.tsx        # Profile screen
  invite/
    [code].tsx         # Dynamic invite route
components/            # Reusable components (ErrorBoundary, etc.)
constants/
  colors.ts            # Dark theme color palette
lib/
  query-client.ts      # React Query client configuration
types/
  index.ts             # Shared TypeScript types
server/
  index.ts             # Express entry point
  routes.ts            # API routes (placeholder)
  storage.ts           # Storage interface
shared/
  schema.ts            # Drizzle schema + Zod validation
```

## Theme

Dark theme with:
- Background: #0A0A0F
- Surface: #14141F
- Accent/Tint: #6C63FF (purple)

## Workflows

- **Start Backend**: `npm run server:dev` (port 5000)
- **Start Frontend**: `npm run expo:dev` (port 8081)
