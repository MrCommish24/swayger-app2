# Swayger — Product Status Brief
*Prepared March 14, 2026 | For internal use: Customer Acquisition Planning*

---

## What Swayger Is

Swayger is a social wager contract app for friend groups. It lets two people lock in a "for-fun" 1v1 prediction bet, track who wins, and keep a running record of their rivalry. There is no real money involved — the currency is "units," a social score that tracks credibility and bragging rights. The core emotional hook is the rivalry: knowing you're 4–1 against a specific friend, and wanting to run it back.

---

## Current Distribution

- **Live URL:** Published as a web app on Replit (`.replit.app` domain)
- **Access method:** Open in any mobile browser; users can add to home screen as a PWA (behaves like an installed app, no app store needed)
- **Platform availability:** iOS Safari, Android Chrome, desktop web
- **App Store / Google Play:** Not yet submitted. Requires an EAS native build (separate process from Replit publishing)

---

## Fully Built & Working

### Authentication
- Email magic link (tap link in email → you're in, no password required)
- Email + password login option
- First-time users are directed to a username setup screen
- Session persistence across app opens
- Sign out

### Create a Swayger
- Title (the bet description)
- Optional notes/context field
- Category selection: Sports, Entertainment, Gaming, Lifestyle, Politics, Other
- Stake amount in units (1 unit minimum, no cap)
- Creator's pick/prediction
- Opponent's pick is set by the opponent when they accept (not required upfront)

### Invite System
- Auto-generated 6-character invite code (human-readable, no ambiguous characters)
- QR code display for in-person sharing
- Copy invite link to clipboard
- Native OS share sheet (iMessage, WhatsApp, etc.)
- Deep link URL: `[domain]/invite/[code]` — opens directly to the accept screen

### Join Flow
- Join by manually entering a code at `/join`
- Or tap any invite link — routes directly to the accept screen
- Opponent sets their pick and confirms when accepting

### Swayger Lifecycle (Full V1 Loop)
All six states are implemented end-to-end:

| State | Trigger | Who can act |
|---|---|---|
| **Pending** | Creator creates swayger | Creator can cancel; share invite |
| **Active** | Opponent accepts | Both can propose settlement |
| **Settling** | Either party proposes outcome | Other party confirms or counter-proposes |
| **Settled** | Both confirm same outcome | View receipt; trigger rematch |
| **Declined** | Opponent declines invite | Creator sees declined status |
| **Canceled** | Creator cancels before acceptance | Archived |

### Settlement Flow
- Propose outcome: Creator Wins / Opponent Wins / Draw / No Contest
- Counter-propose if you disagree (resets to "Settling" with new proposal)
- Withdraw your own proposal if you change your mind
- Both parties confirm the same outcome → instantly settles
- Settlement receipt card with shareable image export

### Rematch System
- **Run it Back** — same stakes, same category, roles swap
- **Double or Nothing** — double the units, same category, roles swap
- Rematch creates a new linked swayger with the same participants pre-filled

### Real-Time Updates
- Both players see status changes live without manually refreshing
- Powered by Supabase Realtime channels
- Active on both the swayger list screen and the swayger detail screen

### My Swaygers Screen
- Full list of all your swaygers (as creator or opponent)
- Stats strip: Total swaygers, Active count, Win %
- Filter chips: All / Active / Pending / Settled / Other (with live counts per filter)
- Smart sort: Active → Pending → Settled → Other, newest-first within each group
- Empty state for new users guides them to create their first swayger

### Leaderboard
- Global standings across all users computed from settled swaygers
- Ranked by: net units won → current win streak → total wins → win percentage
- Category filter (Sports / Entertainment / Gaming / Lifestyle / Politics / Other / All)
- Recent activity section showing the 5 most recent settled swaygers
- Win streak badge (🔥) on the leaderboard row for streaks of 2+
- You are highlighted in the leaderboard list

### Head-to-Head Stats (Rivalry View)
- Displayed on every swayger detail screen when an opponent is present
- Shows your personal W-L record against that specific opponent across all time
- Leading side highlighted in accent color
- "First matchup — establish dominance ⚡" shown for brand new rivalries
- Updates automatically when a swayger settles

### Animations & Celebrations
- **Fight card animation** — full-screen fight card with avatar slide-in, flash, and title slam fires when a swayger goes active (creator sees it on real-time transition; opponent sees it on accepting)
- **Rematch fight card** — fires when you open a rematch swayger for the first time
- Fight card types: purple for standard/run-it-back, gold for double-or-nothing
- **Streak celebration modal** — fires after you close the settlement receipt, shows your current streak if 2+
- **Receipt card** — shareable image with match result, picks, and units outcome

### Profile Screen
- Displays username, display name, stats
- Password set/change for magic link users
- Sign out

### Infrastructure
- Push notification token registration (stored in DB, ready to send)
- In-app toast notification system
- Error boundary with app restart button
- Schema verification tool (hidden in dev panel for debugging)

---

## Works in Web App — Limitations vs Native Build

| Feature | Web App (current) | Native Build (future) |
|---|---|---|
| Core swayger loop | ✅ Full | ✅ Full |
| Real-time updates | ✅ Yes (in-app) | ✅ Yes |
| Invite deep links | ✅ Opens in browser | ✅ Opens native app |
| Push notifications | ❌ Not supported | ✅ Full background push |
| Add to home screen | ✅ PWA (browser-based) | ✅ Native icon |
| App Store listing | ❌ No | ✅ Yes |
| Fight card animation | ✅ Yes | ✅ Yes |

---

## Pending / Requires Post-Publish Testing

### 1. Push Notifications *(infrastructure built, untested in production)*
The full notification pipeline exists: push token registration, a `push_tokens` database table, and a `sendPushNotification` function. Notification triggers are coded for:
- Opponent accepts your swayger → creator is notified
- Someone proposes a settlement → other party is notified
- Settlement is confirmed → both parties notified

**Blocker:** Requires a native EAS build (iOS or Android). Will not fire in the web app or Expo Go. This is the highest-priority missing feature for a social engagement loop — without it, users must actively open the app to see that someone acted on their swayger.

### 2. Win Streak Tracking *(requires one database migration)*
Migration `014_win_streaks.sql` adds `current_win_streak` and `best_win_streak` columns to user profiles and updates the settlement confirmation logic to track streaks. Until this migration is run in the Supabase dashboard, the streak celebration modal will not fire and leaderboard streak data may not persist correctly.
**Action required:** Run `014_win_streaks.sql` in the Supabase SQL editor.

### 3. Automatic Swayger Expiry *(UI exists, no background enforcement)*
Swaygers have an `expires_at` field and the UI shows expiry dates. The statuses `expired` and `expired_active` exist in the data model. However, there is no scheduled job that automatically transitions swaygers to expired status when the deadline passes. Users can still interact with technically-expired swaygers.
**Impact:** Low for MVP; only matters once users are setting expiry dates and expecting enforcement.

### 4. Invite Link Deep Linking to Native App *(future — after App Store submission)*
Today, invite links open in the browser. Once a native app is in the App Store, Universal Links / App Links will need to be configured so tapping an invite link on a device with the app installed opens the native app directly instead of the browser.

### 5. Profile Photo Upload *(not built)*
Currently, avatars are initials-based. No photo upload capability exists. Fine for MVP, but contributes to identity/social feel in the longer term.

### 6. Password Recovery / Forgot Password *(not built)*
Users who set a password have no self-service "forgot password" flow from the login screen. Magic link login bypasses this for most users, but password recovery would be needed for a polished auth experience.

### 7. Dispute Handling *(current behavior: stalemate)*
If two users propose conflicting settlement outcomes and neither agrees, the swayger stays in "Settling" indefinitely. There is no timeout, escalation, or admin override. For an MVP friend-group context this is acceptable — peer pressure handles it socially. Worth monitoring with real users.

### 8. Invite Code Expiry *(invite codes do not expire)*
Invite codes are permanent until used. There is no time limit on accepting. For most use cases this is fine, but a 7-day auto-expiry would prevent orphaned pending swaygers.

---

## What Has Not Been Built (Out of Scope for V1)

- **Group bets** (3+ participants) — V1 is strictly 1v1
- **Real money / payment integration** — explicitly out of scope; units only
- **Notifications for leaderboard changes** — no "you moved up the leaderboard" alerts
- **Social discovery** — no way to find other users outside of direct invite
- **Chat / in-swayger messaging** — no communication layer between participants
- **Discord integration** — discussed, not yet scoped
- **iOS / Android App Store listings** — requires EAS build + submission process

---

## Key Numbers for Acquisition Planning Context

- **Minimum user journey to core value:** 2 people, 1 swayger, 1 settlement = ~5 minutes
- **Social mechanic:** Every swayger requires inviting a second person, making every user a potential acquisition vector
- **Viral coefficient potential:** The invite link/code is the growth mechanism — sender creates swayger, link goes to someone who may not have the app
- **Retention hook:** H2H record and leaderboard position create ongoing reasons to return
- **Friction point:** No push notifications on web = users must remember to check the app (mitigated by native build)

---

*Document ends.*
