# Swayger Email Catalog

All emails currently built and live in the system. Provider: **Resend**. Sender: `Swayger <onboarding@resend.dev>` (or override via `RESEND_FROM_EMAIL`).

---

## Section 1 — Wager Transactional Emails

Sent automatically when something happens to a Swayger between two users. Recipients are both parties to the wager (creator + opponent), each getting a personalized copy.

| # | Trigger | Subject Line | Who Gets It | How It Fires |
|---|---------|-------------|-------------|-------------|
| 1 | User creates a challenge | "🎯 [Name] challenged you to a Swayger" | The opponent | Immediately on invite creation |
| 2 | Opponent accepts a challenge | "✅ [Name] accepted your Swayger" | The creator | Immediately on acceptance |
| 3 | Either party proposes a settlement | "⚖️ [Name] proposed a settlement" | The other party | Immediately on settlement proposal |
| 4 | Both parties agree — wager settled | "🏆 '[Title]' has been settled" | Both parties | Immediately on mutual agreement |
| 5 | Invite expires (14 days, no response) | "⏰ Your Swayger invite expired" | Both parties | Background job, runs hourly |
| 6 | Wager expires (settlement window closed) | "⏱️ '[Title]' expired — stakes returned" | Both parties | Background job, runs hourly |
| 7 | Settlement deadline expires (14 days) | "⏱️ '[Title]' settlement window closed" | Both parties | Background job, runs hourly |
| 8 | 2 days left before settlement deadline | "⏳ 2 days left to settle '[Title]'" | Both parties | Background job checks hourly; sent once per wager via `settlement_reminder_sent` flag |

**Notes:**
- Emails 5–8 are driven by the background expiry job in `server/index.ts` (runs every hour).
- Each reminder (email 8) is protected by a one-time flag so it only fires once per wager.
- Points are returned automatically in emails 5–7.

---

## Section 2 — March Madness Pre-Lock Reminder Emails

Sent before the R64 lock deadline (11am CDT, March 19). All automated via the scheduler (`server/mm-scheduler.ts`). Each fires once — the scheduler stores a boolean flag per blast in `mm-email-state.json` so they never double-send even if the server restarts.

| # | Date & Time (CDT) | Subject Line | Who Gets It | Status |
|---|------------------|-------------|-------------|--------|
| 9 | Mar 17 — 9:00am | "🏀 Your March Madness Picks Aren't Locked Yet" | Users with **no locked takes** submitted | **Sent** ✓ |
| 10 | Mar 18 — 9:00am | "🏀 Your March Madness Picks Aren't Locked Yet" | Users with **no locked takes** submitted | **Sent** ✓ |
| 11 | Mar 19 — 8:00am | "🏀 Your March Madness Picks Aren't Locked Yet" | Users with **no locked takes** submitted | **Sent** ✓ |
| 12 | Mar 19 — 9:00am | "First place on the leaderboard walks away with something good. Picks close at 11am." | **All users** | **Sent** ✓ |
| 13 | Mar 19 — 10:00am | "The winner walks away with something good" | **All users** | **Sent** ✓ |

**Key distinction:**
- Emails 9–11 are **targeted** — only users who haven't submitted locked takes receive them (queried from `mm_locked_takes` at send time).
- Emails 12–13 are **broadcast** — every user with a notification email gets them regardless of pick status.

---

## Section 3 — March Madness Morning Score Update Emails

Sent once every morning after a game day, at **8:00am CDT (1:00pm UTC)**. Each user receives a personalized email showing their current total points, breakdown by category, and their rank on the leaderboard.

**Subject:** `"🏀 March Madness score update — [X] pts"`

**Who gets it:** Every user who appears in `mm_pick_scores` (i.e., has made at least one pick of any kind).

**Content:** Total points + breakdown (Sweet 16, Elite 8, Final Four, Champion, Upset Picks, Blowout Picks, High Scorer Picks + accuracy) + current rank out of total players.

> ⚠️ **Currently PAUSED** — `SCORE_EMAILS_PAUSED = true` in `server/routes-mm-admin.ts`. The scheduler will skip these blasts until this flag is flipped to `false`. The send slots are still tracked so they won't double-fire once re-enabled.

| # | Scheduled Date | Label | Status |
|---|---------------|-------|--------|
| 14 | Mar 20 — 8am CDT | After R64 Day 1 games | **Paused / Skipped** |
| 15 | Mar 21 — 8am CDT | After R64 Day 2 games | **Paused / Skipped** |
| 16 | Mar 22 — 8am CDT | After R32 Day 1 games | Pending |
| 17 | Mar 23 — 8am CDT | After R32 Day 2 games | Pending |
| 18 | Mar 28 — 8am CDT | After Sweet 16 Day 1 games | Pending |
| 19 | Mar 29 — 8am CDT | After Sweet 16 Day 2 games | Pending |
| 20 | Mar 30 — 8am CDT | After Elite 8 Day 1 games | Pending |
| 21 | Mar 31 — 8am CDT | After Elite 8 Day 2 games | Pending |
| 22 | Apr 5 — 8am CDT | After Final Four Day 1 games | Pending |
| 23 | Apr 6 — 8am CDT | After Final Four Day 2 games | Pending |
| 24 | Apr 8 — 8am CDT | After Championship game | Pending |

**To enable:** Change `SCORE_EMAILS_PAUSED = true` → `false` in `server/routes-mm-admin.ts` and restart the backend. The next scheduler tick (every 15 min) will pick up any pending blast windows.

---

## Section 4 — Manual Admin-Triggered Emails

These are available via the admin panel at `/admin/mm` and can be fired on-demand at any time.

| # | Admin Action | Subject Line | Who Gets It |
|---|-------------|-------------|-------------|
| 25 | "Send Leaderboard Blast" button | "🏀 Race Up the Leaderboard — Win a $100 Amazon Gift Card" | **All users** with a notification email |
| 26 | "Send Reminder" button | "🏀 Your March Madness Picks Aren't Locked Yet" | Users with **no locked takes** |

---

## Section 5 — Second Shot Email

Sent once to users who never submitted their locked bracket takes (Sweet 16 / Elite 8 / Final Four / Champion). Tells them the Quick Picks program is still open and they can still climb the leaderboard as a second-chance participant.

| # | Scheduled Date | Subject Line | Who Gets It | Status |
|---|---------------|-------------|-------------|--------|
| 27 | Mar 21 — 9:00am CDT | "You can still get in — second shot at the leaderboard" | Users with **no submitted locked takes** | Pending (fires tomorrow before tip-off) |

---

## Section 6 — Per-Round Quick Pick Reminder Emails

Sent to all users before each remaining round's Quick Picks lock. Two emails per round: one when picks open, one morning-of as a last chance.

| # | Scheduled Date | Round | Subject Line | Is Last Chance | Status |
|---|---------------|-------|-------------|----------------|--------|
| 28 | Mar 25 — 9:00am CDT | Sweet 16 | "🏀 Sweet 16 Quick Picks are open" | No | Pending |
| 29 | Mar 27 — 8:00am CDT | Sweet 16 | "⏰ Last chance — Sweet 16 Quick Picks close noon CDT today" | Yes | Pending |
| 30 | Mar 27 — 2:00pm CDT | Elite 8 | "🏀 Elite 8 Quick Picks are open" | No | Pending |
| 31 | Mar 28 — 9:00am CDT | Elite 8 | "⏰ Last chance — Elite 8 Quick Picks close noon CDT today" | Yes | Pending |
| 32 | Apr 3 — 9:00am CDT | Final Four | "🏀 Final Four Quick Picks are open" | No | Pending |
| 33 | Apr 4 — 2:00pm CDT | Final Four | "⏰ Last chance — Final Four Quick Picks close 6pm CDT today" | Yes | Pending |
| 34 | Apr 5 — 9:00am CDT | Championship | "🏀 Championship Quick Picks are open" | No | Pending |
| 35 | Apr 6 — 4:00pm CDT | Championship | "⏰ Last chance — Championship Quick Picks close 8pm CDT tonight" | Yes | Pending |

All quick pick reminder emails go to **all users** with a notification email.

---

## How "Who Gets It" is resolved

All MM blasts use a Supabase RPC called `get_all_notification_profiles` (a security-definer function that bypasses row-level security to read every user's `notification_email`). The scheduler then filters that list in-memory based on pick data before sending.

Wager emails use a direct `.select()` on the `profiles` table scoped to the two users in that wager.
