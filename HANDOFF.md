# Swayger — Full Project Handoff Document

> Generated May 8, 2026. Covers everything built from project inception to present.

---

## 1. App Concept & Purpose

**Swayger** is a social wager app for friend groups. The core idea is a "Swayger" — a 1v1 contract between two users where they make competing predictions on any topic (sports, pop culture, life stuff), with a virtual currency stake attached. Settlement is mutual: both parties must agree on who won.

The app has expanded beyond the core contract system into **seasonal sports challenges** that bring users back daily:
- **NBA Picks Challenge** — pick over/under on player props each night during the NBA Playoffs, compete on a leaderboard for real cash prizes ($100 total pool across 4 rounds)
- **NBA Playoff Bracket** — pick series winners and game counts for each round, with a points race leaderboard
- **March Madness** (now inactive) — similar bracket + locked takes format that ran during March/April 2026

The app is live and deployed at **swayger.app**.

---

## 2. Tech Stack & Why

| Layer | Choice | Reason |
|---|---|---|
| Mobile/Web frontend | **Expo v54 (React Native)** with Expo Router v6 | Single codebase for iOS, Android, and web. File-based routing (Next.js-style) |
| Backend | **Express v5** (TypeScript) on port 5000 | Lightweight REST API; handles admin operations, third-party API calls, email, and scheduled jobs that can't run client-side |
| Auth | **Supabase Auth** — OTP code, magic link, password | No-code auth flows; Supabase handles sessions and JWTs |
| Database | **Supabase (Postgres)** with Row Level Security | Real-time, easy client-side queries, SECURITY DEFINER RPCs for transactional gameplay |
| State management | **TanStack React Query v5** + React Context | Server state caching + auth context |
| Push notifications | **Expo Push API** (`expo-notifications`) | Cross-platform; fire-and-forget; tokens stored in Supabase |
| Email | **Resend** (`resend` npm package) | Transactional + blast emails; simple API; `List-Unsubscribe` header support |
| Odds data | **The Odds API** (h2h/spread/totals) + **SportsGameOdds API** (player props / event resolution) | Two separate APIs — Odds API for team matchup odds, SGO for individual player prop stat resolution |
| Payments | **Stripe** (via Replit connector integration) | Used for March Madness $5 Elite 8 2x boost purchase |
| Styling | React Native `StyleSheet` + `constants/colors.ts` | Dark navy theme; no CSS-in-JS libraries |
| Session storage | `AsyncStorage` (native), `localStorage` (web) | Standard Expo pattern |

---

## 3. Repository & Folder Structure

```
app/
  _layout.tsx              # Root layout — providers, auth guard, font loading, push token registration
  auth.tsx                 # Sign-in (OTP / magic link / password)
  auth-callback.tsx        # Deep link handler for magic link
  username-setup.tsx       # First-login username picker
  join.tsx                 # Enter invite code or scan QR; auto-redirects to /invite/[code]
  +native-intent.tsx       # Native deep link intent router (pass-through for /invite/ and /swayger/)
  +not-found.tsx           # 404 fallback ("This screen doesn't exist.")
  (tabs)/
    _layout.tsx            # Tab bar: My Swaygers, Create, Leaderboard, Profile
    index.tsx              # Dashboard — active/pending swaygers list
    create.tsx             # Create Swayger form
    leaderboard.tsx        # Swayger leaderboard (wins/losses/SP)
    profile.tsx            # Profile, set password, SP balance, dev schema panel
  swayger/[id].tsx         # Swayger detail — contract view, settlement, rematch
  invite/[code].tsx        # Invite join flow — handles both regular and Picks Challenge invites
  h2h/
    index.tsx              # All opponents + aggregate H2H records
    [opponentId].tsx       # Detailed H2H receipt (scoreboard, category breakdown, game log, share card)
  picks/
    index.tsx              # NBA Picks Challenge — nightly props, leaderboard, create/join challenge swayger
  playoffs/
    _layout.tsx            # NBA Playoffs stack layout
    index.tsx              # Playoffs hub (hero, live games w/ odds, leaderboard snippet, prizes)
    bracket.tsx            # Bracket picks UI — pick series winner + games per round
    leaderboard.tsx        # Bracket points race leaderboard with per-round breakdown
  march-madness/           # INACTIVE (MARCH_MADNESS_ACTIVE flag controls visibility)
    index.tsx              # March Madness hub
    picks.tsx              # Bracket pick submission
    picks-leaderboard.tsx  # MM leaderboard
    locked-take.tsx        # Locked take entry flow
  mm-pick/[matchupId].tsx  # MM special picks per matchup
components/
  ErrorBoundary.tsx        # Class-based error boundary + dev error details modal
  ReceiptCard.tsx          # Shareable receipt card (react-native-view-shot image export)
  H2HReceiptCard.tsx       # Shareable H2H record card (scoreboard + category breakdown)
constants/
  colors.ts                # Brand color palette (dark navy theme)
lib/
  supabase.ts              # Supabase client (AsyncStorage adapter)
  auth-context.tsx         # Auth context — session, profile, routing guard
  swayger.ts              # All Swayger CRUD + gameplay functions
  nba-playoffs.ts          # NBA Playoff types, helpers, Supabase CRUD, lock dates, scoring config
  mm-picks.ts             # March Madness picks logic
  march-madness.ts        # MM bracket data (FULL_BRACKET constant)
  notifications.ts        # Push token registration + sendPushNotification()
  pending-invite.ts       # AsyncStorage store for pending invite codes (deep link recovery)
  helpers.ts              # Error handling, date formatting, username validation
  query-client.ts         # React Query client + getApiUrl() (defaults to https://www.swayger.app)
  verify-schema.ts        # Dev-only schema health checker
types/index.ts            # TypeScript interfaces: Profile, SwaygerData, SwaygerInvite, etc.
server/
  index.ts                # Express app setup, static file serving, SPA fallback, scheduled jobs
  routes.ts               # Core routes: /api/invite/:code/preview, /api/notify, landing page routes
  routes-props.ts         # NBA Picks Challenge: prop nights, picks, leaderboard, admin, email blasts
  routes-nba.ts           # NBA Playoff bracket: series CRUD, leaderboard, odds seeder, email blasts
  routes-mm-admin.ts      # March Madness admin: scoring, email blasts, results, outreach
  routes-mm-special.ts    # MM special picks: upset/blowout picks, Stripe 2x boost, round matchups
  routes-unsubscribe.ts   # Email unsubscribe handler
  email.ts                # All email templates + send functions (Resend)
  mm-auto-score.ts        # MM auto-scoring logic
  mm-scheduler.ts         # MM scheduled scoring jobs
  storage.ts              # Server-side storage helpers
  stripeClient.ts         # Stripe client factory (via Replit connector)
supabase-migrations/      # 26 numbered SQL migration files (run in Supabase SQL Editor)
supabase/                 # Supplemental migrations (MM picks, MM special picks, SP system)
```

---

## 4. Auth Flow

1. Unauthenticated → `/auth` (email + OTP code, magic link, or password)
2. OTP verified in-app via `verifyOtp`; magic link → `/auth-callback`
3. Authenticated, no profile → `/username-setup` (choose username)
4. Authenticated + profile → `/(tabs)` (dashboard)

Deep linking uses the `swayger://` custom scheme (configured in `app.json`). No universal links / associated domains are set up — see Known Issues.

---

## 5. Feature Deep-Dives

### 5a. Core Swayger (1v1 Wager Contracts)

**Status: Fully built and live.**

The heart of the product. A Swayger is a structured 1v1 prediction contract.

**Full lifecycle:**
```
Create → Invite → Accept (opponent picks) → Active → Propose Settlement → Mutual Confirm → Settled → Leaderboard → Rematch
```

**Key mechanics:**
- Creator sets: title, description, category (Sports/Entertainment/Gaming/Lifestyle/Politics/Other), stake units (5–100), their own pick/prediction
- A unique 6-char invite code (A-Z, 2-9) is generated and stored in `swayger_invites`
- Sharing: Copy Code, OS share sheet, or QR code (encodes `SWAYGER:XXXXXX`)
- Join via code entry on `/join` or QR scanner (expo-camera)
- Opponent accepts with their own pick → both picks locked, status → `active`
- Settlement: either party proposes an outcome (Creator Wins / Opponent Wins / Draw / No Contest); other party must confirm the same proposal
- Rematch from settled swayger: "Run it Back" (same stake) or "Double or Nothing" (2× stake)
- Creator can cancel (pending only); opponent can decline

**Statuses:** `pending_invite`, `active`, `settlement_proposed`, `settled`, `declined`, `canceled`, `expired`, `expired_active`

**Key DB table:** `swaygers`  
**Key columns:** creator_id, opponent_id, title, description, category, stake_units, stake_note, creator_pick, opponent_pick, expires_at, settled_outcome, source_swayger_id, rematch_type, accepted_at, settled_at, cancelled_by, points_active

**All gameplay via SECURITY DEFINER RPCs:**
- `create_swayger` — creates swayger + invite; deducts SP escrow if points_active
- `join_swayger_by_code` — validates code, returns swayger_id
- `accept_swayger` — sets opponent, locks picks, activates; deducts opponent SP
- `decline_swayger` / `cancel_swayger` — refunds escrow
- `propose_settlement` / `confirm_settlement` / `withdraw_settlement_proposal`
- `claim_bankruptcy` — one-time 250 SP lifeline when balance = 0
- `expire_old_proposals` — run hourly by server scheduler

**Wins/losses** feed the leaderboard tab and H2H records.

---

### 5b. Swayger Points (SP) Virtual Currency

**Status: Fully built and live. Migration: `supabase/swayger-points-migration.sql`**

Every user starts with 1,000 SP. SP is a virtual social currency — it doesn't represent real money.

**Rules:**
- Minimum stake: 5 SP
- On create: creator SP escrowed (deducted from available balance)
- On accept: opponent SP escrowed
- On settle: winner gets 2× stake; draw or no_contest = both refunded
- On cancel/decline: full refund
- Bankruptcy: if balance = 0, one-time "claim bankruptcy" gives 250 SP lifeline

**DB table:** `user_balances` — balance, escrowed, total_earned, total_lost, bankruptcy_used

Legacy swaygers (pre-SP migration) have `points_active = FALSE` and don't affect balances.

---

### 5c. H2H Records

**Status: Fully built and live.**

Two screens under `app/h2h/`:
- **Opponents list** (`index.tsx`) — every opponent you've played, aggregate W/L/D record
- **H2H detail** (`[opponentId].tsx`) — full receipt: scoreboard, breakdown by category, game-by-game log, shareable image card (`H2HReceiptCard`)

---

### 5d. Push Notifications

**Status: Fully built and live.**

Uses `expo-notifications` v0.32.x. Tokens stored in `push_tokens` Supabase table (one row per user, upserted on login). Peer-to-peer: the acting user's device calls the Expo Push API directly with the recipient's token (fetched via `get_push_token` SECURITY DEFINER RPC).

Fires on: opponent joins, opponent accepts, opponent declines, settlement proposed, settlement confirmed (settled), creator cancels.

On web: all notification code is a no-op (guarded by `Platform.OS !== "web"`).

---

### 5e. NBA Picks Challenge

**Status: Fully built and live. Active for the 2026 NBA Playoffs.**

A daily nightly prop picks game running alongside the NBA Playoffs.

**How it works:**
1. Admin creates a "night" via `POST /api/admin/props/night` with a list of player props (player name, stat, line, SportsGameOdds event ID)
2. Users see tonight's props on the Picks tab and submit Over/Under picks before lock time
3. Admin resolves the night via `POST /api/admin/props/resolve/:nightId` — server fetches actual stats from the SportsGameOdds API and scores each pick
4. Users earn points per correct pick; a leaderboard tracks cumulative scores

**Points system (per pick):** 10 pts base + confidence tier bonus (Gut Feel: 0, Pretty Sure: +25, Lock It In: +50)

**Round structure** (`PICK_ROUNDS` in `routes-props.ts`):
| Round | Dates | Prize |
|---|---|---|
| R1 | Apr 19 – May 3 | $15 |
| R2 | May 4 – May 19 | $15 |
| R3 | May 20 – Jun 1 | $20 |
| R4 | Jun 2 – Jun 25 | $50 champion |

**Picks Challenge Swaygers:** Users can also create a 1v1 Picks Challenge — a special Swayger that links to a specific night. Both users pick props for the same night; whoever gets more correct wins. These are auto-settled by the server when the admin resolves that night.

The invite link for Picks Challenge swaygers on native was previously broken (generated `swayger://invite/CODE` deep link). **Fixed:** now always generates `https://www.swayger.app/join?code=CODE`.

**HQ Mode:** When users arrive at `/picks?hq=1` (via email CTA), a special "Beat HQ's Picks" banner appears. HQ is a fictional staff account that also submits picks each night.

**Admin endpoints** (require `x-admin-token` header):
- `POST /api/admin/props/night` — create a night with props
- `POST /api/admin/props/lock/:nightId` — lock a night (no more picks)
- `POST /api/admin/props/resolve/:nightId` — auto-score via SportsGameOdds
- `POST /api/admin/props/manual-resolve/:nightId` — manually override a result
- `POST /api/admin/props/void/:nightId/:propId` — void a single prop (excluded from scoring)
- `GET /api/admin/props/round/:roundNum/leaderboard` — round leaderboard
- `POST /api/admin/props/send-round-winner-email` — send winner email for a round
- `POST /api/admin/props/blast-round-launch` — blast email announcing new round
- `POST /api/admin/props/blast-challenge-email` — blast email inviting users to challenge a friend
- `POST /api/admin/props/blast-weekend-picks` — weekend engagement blast
- `GET /api/admin/props/hq-challenge-link` — get HQ's shareable challenge link

**SportsGameOdds integration:** The SGO API doesn't support individual event lookup by ID. Workaround: paginate through the events list endpoint using `startsAfter` cursor, with a date-windowed search (starts 1 day before the night's date). Max 15 pages (150 events) per resolve call.

**Key DB tables:**
- `prop_nights` — night metadata (date, lock_time, status, label)
- `prop_user_picks` — per-user picks for a night (picks JSON, score, correct_count)

---

### 5f. NBA Playoff Bracket

**Status: Fully built and live. 2026 NBA Playoffs in progress (Round 2 as of May 8, 2026).**

A traditional bracket picks challenge — pick the series winner and number of games for each round.

**Scoring:**
| Round | Correct pick | Correct games bonus |
|---|---|---|
| Round 1 | 100 pts | +50 pts |
| Round 2 | 300 pts | +75 pts |
| Conf Finals | 1,000 pts | +150 pts |
| Finals | 3,000 pts | +250 pts |

**Prize structure:**
- R1 best score: $15
- R2 best score: $15
- Conf Finals best: $20
- Overall leaderboard champion: $50

**Lock dates** (`ROUND_LOCK_DATES` in `lib/nba-playoffs.ts`):
- R1: Apr 18 2026, 11:45am CDT (locked)
- R2: May 10 2026, 1:30pm CDT (reopened mid-round — was May 5, pushed to allow more picks)
- Conf Finals: ~May 26 2026
- Finals: ~June 9 2026

**How series data works:**
- `nba_playoff_series` table in Supabase stores each series (id, round, conference, team1, team2, seed1, seed2, winner, games, starts_at, sort_order, season="2026")
- R1: seeded via `POST /api/nba/admin/seed-known-r1` or `POST /api/nba/admin/seed-from-odds` (The Odds API, hardcoded to round1)
- R2+: seeded manually via `POST /api/nba/admin/series` (upsert by id)
- R2 series IDs: `2026-r2-w1`, `2026-r2-e1`, `2026-r2-w2`, `2026-r2-e2`
- TBD rows are created as placeholders; `isTBD = series.team1.startsWith("TBD")` locks those cards in the UI
- Series resolved via `PATCH /api/nba/admin/series/:id/resolve` (sets winner + games, triggers score recompute)
- Score recompute: `GET /api/nba/admin/scores/recompute`

**Current R2 matchups (as of May 8, 2026):**
- West: (3) Minnesota Timberwolves vs (6) San Antonio Spurs
- East: (2) Philadelphia 76ers vs (3) New York Knicks
- West: (4) Los Angeles Lakers vs (5) Oklahoma City Thunder
- East: (1) Cleveland Cavaliers vs (8) Detroit Pistons

**Key DB tables:**
- `nba_playoff_series` — series data
- `nba_playoff_bracket_picks` — per-user picks (series_id, picked_team, games_guess)
- `nba_playoff_scores` — computed leaderboard scores (total_pts, round1_pts, round2_pts, etc.)

**Bracket picks** are fetched directly client-side from Supabase (`fetchAllSeries`, `fetchMyBracketPicks`). Scores are fetched via Express (`/api/nba/leaderboard`).

---

### 5g. March Madness (INACTIVE)

**Status: Built and ran during March/April 2026. Now inactive.**

`MARCH_MADNESS_ACTIVE = false` (not a runtime env var — hardcoded in the MM hub screen). All MM screens still exist in `app/march-madness/` and `app/mm-pick/`.

**What it was:**
- Users submitted "Locked Takes" — bracket picks for each region (South/East/Midwest/West) plus First Four
- "Second Chance" picks for users who missed the original deadline (at 50% point value)
- "Special Picks" per matchup: upset pick, blowout pick, high scorer pick
- Scoring was server-side computed by `mm-auto-score.ts`
- A $5 Stripe purchase unlocked a 2× points multiplier for Elite 8 picks

**DB tables:** `mm_locked_takes`, `mm_upset_picks`, `mm_game_results`, `mm_pick_scores`, `mm_special_picks`, `mm_round_matchups`

**Admin panel** at `/admin/mm` (HTML page served by Express, no auth UI — token-gated API).

---

## 6. Email System

**Provider:** Resend (`resend` npm package, `RESEND_API_KEY` secret)  
**From address:** `Swayger <onboarding@resend.dev>` (or `RESEND_FROM_EMAIL` env var)  
**Reply-to:** `hq@swayger.app`  
**Unsubscribe:** HMAC-signed link (`/unsubscribe?uid=&sig=`) stored in `outreach_feedback` or profile `email_unsubscribed` flag

**All email templates** live in `server/email.ts`. Key ones:

| Template | Trigger |
|---|---|
| Swayger invite | Opponent joins your swayger |
| Swayger accepted | Opponent accepts your invite |
| Swayger declined | Opponent declines |
| Swayger expired | Swayger hits expiry without acceptance |
| Invite reminder | 2 days before expiry (invite_reminder_sent flag) |
| Settlement proposed | Other party proposed an outcome |
| Swayger settled | Both confirmed |
| Round winner | Admin-triggered after each picks round ends |
| Round launch blast | Admin-triggered to announce a new picks round |
| Challenge blast | Blast inviting users to challenge a friend on props |
| Weekend picks blast | Weekend engagement blast |
| MM leaderboard blast | March Madness (now inactive) |
| MM last chance | MM (inactive) |
| MM second shot | MM (inactive) |
| MM round blasts (S16, R32) | MM (inactive) |
| MM thank you | Post-MM season (inactive) |
| Outreach A/B | Growth outreach emails (inactive) |

**Safety mechanism:** `BLAST_EMAILS_PAUSED` constant in `routes-mm-admin.ts` (currently `true`). Any blast endpoint checks this flag and returns 403 if true. To send a blast: flip to `false`, restart the backend, call the endpoint, flip back to `true`.

**History of blasts sent:**
- Round 1 winner email sent to dgrand2 (darius@leagueswype.com, 320 pts, 12 correct, 5 nights)
- Round 2 launch blast sent to all 43 eligible users

---

## 7. Scheduled Jobs

Running inside the Express server on a cron-like interval (set in `server/index.ts`):

- **`expire_old_proposals` RPC** — called hourly; withdraws settlement proposals older than 7 days, moves swayger back to `active`
- **Swayger expiry job** — expires `pending_invite` swaygers past their `expires_at`; sends expiry emails; sends 2-day invite reminder emails (marks `invite_reminder_sent = true`)
- **MM scoring scheduler** — `mm-scheduler.ts` (runs during March Madness season; now effectively inactive)

---

## 8. Admin Token

All admin endpoints require the header: `x-admin-token: $MM_ADMIN_TOKEN`

This is a Replit secret (`MM_ADMIN_TOKEN`). The `requireAdmin` helper in each routes file validates it.

---

## 9. Architectural Decisions & Reasoning

### SECURITY DEFINER RPCs for gameplay
All state-changing gameplay (create, accept, settle, etc.) goes through Postgres RPCs with `SECURITY DEFINER`. This prevents RLS from being bypassed and ensures atomic operations (e.g., SP escrow + swayger creation in one transaction).

### Client-side Supabase reads, server-side writes
For read-heavy data (series list, leaderboard, user picks), the frontend queries Supabase directly. For anything involving third-party APIs, email, or complex joins, it goes through Express.

### `getApiUrl()` defaults to `https://www.swayger.app`
If `EXPO_PUBLIC_DOMAIN` is not set, the client falls back to the production URL. This means production builds always hit the right server without any config change.

### SPA fallback in Express
`server/index.ts` serves `dist/index.html` for all non-API paths (if the built Expo web output exists in `dist/`). This enables direct URL access to any Expo route from the browser.

### `BLAST_EMAILS_PAUSED` flag
A code-level constant (not an env var) that gates all blast email endpoints. Safer than an env var because it requires a code change + server restart to enable, preventing accidental blasts.

### Round system without DB migration
The `PICK_ROUNDS` config in `routes-props.ts` defines which prop_night dates belong to which round — filtering is done at query time. No DB columns needed for round tracking.

---

## 10. Database Tables (Complete List)

### Core Swayger tables
- `profiles` — username, display_name, avatar_url, current_win_streak, last_seen_at, notification_email, email_unsubscribed
- `swaygers` — all swayger contract data
- `swayger_invites` — invite codes (swayger_id → invite_code)
- `settlement_proposals` — proposed outcomes with creator/opponent confirmed flags
- `push_tokens` — Expo push token per user (one row, upserted on login)
- `user_balances` — SP balance, escrowed, total_earned, total_lost, bankruptcy_used

### NBA Picks tables
- `prop_nights` — nightly prop game metadata
- `prop_user_picks` — per-user picks submission + score

### NBA Playoff Bracket tables
- `nba_playoff_series` — series matchups, winners, game counts
- `nba_playoff_bracket_picks` — user bracket picks per series
- `nba_playoff_scores` — computed leaderboard scores

### March Madness tables (inactive)
- `mm_locked_takes` — bracket pick submissions
- `mm_upset_picks` — special upset picks
- `mm_game_results` — game results for scoring
- `mm_pick_scores` — computed MM scores
- `mm_special_picks` — upset/blowout/high-scorer special picks
- `mm_round_matchups` — MM round matchup data

### Other
- `outreach_feedback` — user responses to growth outreach emails

### Migration order (fresh setup)
1. `001_workspaces.sql`
2. `002_fix_rls_recursion.sql`
3. `005_fix_schema_to_swaygers.sql`
4. `012_push_tokens.sql`
5. `013_withdraw_settlement_proposal.sql` through `026_locked_takes_second_chance.sql` (in order)
6. `supabase/swayger-points-migration.sql`
7. `supabase/mm-picks-migration.sql`
8. `supabase/mm-special-picks-migration.sql`
9. `supabase/migrations/022_email_to_profiles.sql`
10. `supabase/migrations/001_mm_special_picks_system.sql` through `003_feedback_quick_response.sql`

---

## 11. Environment Variables / Secrets

| Variable | Where used |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase client (frontend + backend) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase client |
| `MM_ADMIN_TOKEN` | Admin API authentication |
| `ODDS_API_KEY` | The Odds API (team matchup odds, bracket seed-from-odds) |
| `SPORTS_GAME_ODDS_API_KEY` | SportsGameOdds API (player props + stat resolution) |
| `RESEND_API_KEY` | Resend email sending |
| `STRIPE_SECRET_KEY_LIVE` | Stripe live key (MM $5 boost, via Replit connector) |

---

## 12. Known Issues & Workarounds

### Share link deep link bug (FIXED)
- **Problem:** On native (iOS/Android), `Linking.createURL('/invite/CODE')` generated `swayger://invite/CODE`. Recipients without the app got "This screen doesn't exist."
- **Fix applied:** `buildNightInviteLink()` in `app/picks/index.tsx` now always generates `https://www.swayger.app/join?code=CODE` on native, matching the web behavior.
- **Remaining gap:** `+native-intent.tsx` only passes through `/invite/` and `/swayger/` paths — `/join?code=` is not in that list. If someone opens a `swayger://join?code=` link natively, it redirects to `/`. This hasn't been a practical issue since the picks challenge share link is now always a web URL.
- **No universal links configured.** `app.json` only has `"scheme": "swayger"`. There are no associated domains for iOS universal links or Android App Links. This means web links won't automatically open the app on a user's device.

### SportsGameOdds individual event lookup (WORKAROUND IN PLACE)
- SGO's `/v2/events/:id` endpoint returns 404 for individual events.
- Workaround: paginate through the list endpoint with `startsAfter` cursor, date-windowed to start 1 day before the night's date, with a max 15-page safety ceiling.

### Bracket R2 re-lock date
- R2 lock was originally May 5 (before games started). Moved to May 10 1:30pm CDT to give users a window to make R2 bracket picks after R1 results were clear.
- **Action required:** After the R2 lock date passes, the bracket UI will auto-lock. No code change needed.

### `seed-from-odds` hardcoded to Round 1
- The `POST /api/nba/admin/seed-from-odds` endpoint generates series IDs as `r1-conf-team1-vs-team2` and hardcodes `round: "round1"`. It cannot be used for R2+.
- **Workaround:** Manually call `POST /api/nba/admin/series` with the correct round, id, and team names for each R2/CF/Finals series.

### `BLAST_EMAILS_PAUSED` is a code constant, not env var
- To send any blast email, you must edit `server/routes-mm-admin.ts`, change `BLAST_EMAILS_PAUSED` from `true` to `false`, restart the backend, fire the endpoint, then change it back.

### March Madness `MARCH_MADNESS_ACTIVE` flag
- This is hardcoded in the march-madness hub screen (`app/march-madness/index.tsx`), not a server-side flag. Changing it requires a code change + app rebuild.

---

## 13. What's Completed

- [x] Full Swayger 1v1 wager contract system (create, invite, accept, settle, rematch)
- [x] Swayger Points (SP) virtual currency with escrow, bankruptcy, leaderboard
- [x] H2H records with shareable receipt card
- [x] Push notifications (peer-to-peer via Expo Push API)
- [x] Email notifications (transactional via Resend)
- [x] March Madness picks challenge (complete, now inactive)
- [x] March Madness special picks + Stripe 2x boost
- [x] NBA Picks Challenge (nightly player props)
- [x] Picks Challenge 1v1 swayger (auto-settled on resolution)
- [x] Picks leaderboard with R1/R2/All-Time tabs
- [x] Admin: create/resolve/void prop nights, blast emails, round winner email
- [x] NBA Playoff Bracket (4 rounds, scoring + leaderboard)
- [x] Bracket round lock dates with admin override capability
- [x] R2 bracket series seeded (MIN vs SAS, PHI vs NYK, LAL vs OKC, CLE vs DET)
- [x] Email unsubscribe system (signed URLs)
- [x] SPA fallback for web deep link routing
- [x] Scheduled server jobs (proposal expiry, swayger expiry, email reminders)
- [x] Share link bug fix (native now generates web URLs)
- [x] Round 1 picks winner email sent, Round 2 launch blast sent (43 users)

---

## 14. Planned / Discussed Next Steps

The following were discussed or are the logical next steps as of May 2026:

### Immediate (in-season)
- **Resolve R2 bracket series** as they complete via `PATCH /api/nba/admin/series/:id/resolve`
- **Seed Conference Finals series** when matchups are known (manually via `POST /api/nba/admin/series`, ids: `2026-cf-w1`, `2026-cf-e1`)
- **Send R3 (Conf Finals) round launch blast** when that round starts (~May 20)
- **Send R2 picks round winner email** at the end of Round 2 (~May 19)
- **Reopen/adjust lock dates** if series or schedule changes require it (edit `ROUND_LOCK_DATES` in `lib/nba-playoffs.ts`)

### Product / Growth
- **Universal links / associated domains** — so web share links automatically open the native app if installed (requires Apple App Site Association file + Expo config update)
- **Regular swayger share links** also use the same deep link bug — `invite/[code].tsx` uses `Linking.createURL` for native sharing on the standard swayger invite flow; this should be fixed the same way as the picks challenge fix
- **Push notification for picks resolution** — notify users when their picks night is scored
- **Picks streak / badges** — gamification layer on top of the picks leaderboard
- **Draft / save props nights in advance** — currently admin must create the night on the day; a scheduled/draft system would reduce daily admin burden
- **Automated prop resolution** — rather than admin manually calling resolve, a scheduled job could auto-resolve nights after games end

---

## 15. How to Run Locally

```bash
# Backend (Express, port 5000)
npm run server:dev

# Frontend (Expo, port 8081)
npm run expo:dev
```

Both are configured as Replit Workflows ("Start Backend", "Start Frontend").

Supabase credentials and all other secrets are in Replit's secret manager. The app will not connect to Supabase without `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

---

*End of handoff document. Last updated: May 8, 2026.*
