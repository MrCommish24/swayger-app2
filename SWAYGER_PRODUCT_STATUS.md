# Swayger — Product Status Brief
**Last Updated:** March 16, 2026

---

## What Is Swayger
A mobile-first social wager app where users make 1v1 wager contracts using **Swayger Points (SP)** — no real money, bragging rights only. March Madness features are live for the 2026 tournament.

**Published URL:** https://swayger-app.replit.app
**Stack:** Expo React Native (TypeScript) + Expo Router v6 + Express backend + Supabase (auth + DB)

---

## Core Features — Status

### Swayger Points (SP) Economy
- Floor: 1,000 SP per user on account creation
- Minimum stake: 5 SP per wager
- Bankruptcy protection: one-time "Emergency Refill" when balance hits 0
- Balance visible in Profile tab

### 1v1 Wager Contracts
- Create a swayger (title, category, stake, your pick)
- Share invite via 6-character code or shareable link
- Opponent joins via code → reviews terms → accepts or declines
- Active → settlement flow → winner confirmed → SP transferred
- Counter-swayger flow supported
- Categories: Sports, Entertainment, Gaming, Lifestyle, Politics, Other
  - March Madness removed from general create flow (lives in MM hub only)

### Join + Accept Flow
- RLS fix applied: opponents can read swayger after joining via invite code
- `get_swayger_by_id` SECURITY DEFINER RPC as fallback when RLS hasn't propagated
- App stays on invite screen after joining (no premature navigation)
- `canAccept` simplified: any non-creator in `pending_invite` status can accept

### Leaderboard
- Global W/L/D records, SP balance, win %, current streak
- **RLS bug fixed (March 16):** was computing per-viewer records due to swayger RLS filtering
- Now uses `get_all_settled_swaygers()` SECURITY DEFINER RPC → consistent view for all users
- **Pending:** run `supabase-leaderboard-rls-fix.sql` in Supabase SQL Editor to activate

### Head to Head
- Per-opponent W/L/D breakdown for any user pair

---

## March Madness Hub — Status

### Bracket Locked Takes
- Users lock in their champion + 1-3 bracket predictions before tournament starts
- Lock date: March 19, 2026 noon CDT
- Shareable pick card with MM record stats
- Pick card now shows `swayger-app.replit.app` URL pill (replaced QR code)

### Special Picks — Per Round
Three pick types per round with per-round lock dates:

| Round | Lock Date | Upset limit | Blowout limit | High Scorer limit |
|-------|-----------|-------------|---------------|-------------------|
| Round of 64 | Mar 19 noon CDT | 3 picks | 1 pick | 1 pick |
| Round of 32 | Mar 21 noon CDT | 3 picks | 1 pick | 1 pick |
| Sweet 16 | Mar 27 noon CDT | 2 picks | 1 pick | 1 pick |
| Elite 8 | Mar 28 noon CDT | 1 pick | 1 pick | 1 pick |
| Final Four | Apr 4 6PM CDT | 1 pick | 1 pick | 1 pick |

**Upset picks — Round of 64 (curated, March 16):**
| # | Matchup | Site | Key Stat | ML |
|---|---------|------|----------|----|
| 1 | McNeese (12) vs Vanderbilt (5) | Oklahoma City | McNeese #1 in turnover margin | +185 |
| 2 | VCU (11) vs North Carolina (6) | Greenville, SC | UNC missing star Caleb Wilson | +170 |
| 3 | High Point (12) vs Wisconsin (5) | Portland, OR | High Point #5 in forcing TOs | +185 |
| 4 | Santa Clara (10) vs Kentucky (7) | St. Louis, MO | Kentucky ranks 299th in forcing TOs | +150 |
| 5 | South Florida (11) vs Louisville (6) | Buffalo, NY | USF on 11-game winning streak | +170 |

- Curated upset list is locked in backend; future rounds will be supplied each round
- Key stat displayed on pick card with accent color + chart icon
- Blowout + High Scorer candidates auto-ranked via Odds API (seed-based fallback)
- Picks screen shows game date · venue on each card

### Picks Leaderboard
- MM-specific leaderboard showing upset/blowout/high-scorer points
- Separate from the main SP leaderboard

### Scoring
- Correct upset pick: 3 pts each (up to 3/2/1 picks by round)
- Correct blowout: 5 pts
- Correct high scorer: 5 pts
- Admin scoring panel at `/admin/mm`

### Automated Email Cadence
- Pre-lock reminder emails via Resend
- Post-round result emails (when admin scores the round)

---

## Profile + Social

### Invite Friends Button (new — March 16)
- In Profile tab, Account section
- Native: opens iOS/Android share sheet pre-loaded with invite message
- Web: copies message to clipboard with "Invite copied!" confirmation
- Message: *"March Madness is here. I'm testing a new app where you can lock your champion, call upsets, and make friendly wagers with friends. No real money — just bragging rights. Come make your picks: https://swayger-app.replit.app"*

### Share Card (MM Record)
- Shareable PNG of bracket record (wins/losses/draws/active count)
- Footer shows `swayger-app.replit.app` URL pill with globe icon
- QR code removed (replaced — QR not scannable when viewed on same device)

---

## Pending SQL to Run in Supabase

| File | Purpose | Status |
|------|---------|--------|
| `supabase-mm-migration.sql` | MM tables, special picks, round matchups | Run if not done |
| `supabase-fix-swayger-rls.sql` | Opponent can read swayger after joining | ✅ Done |
| `supabase-leaderboard-rls-fix.sql` | Global leaderboard via SECURITY DEFINER RPC | **Needs to be run** |

---

## Known Limitations / Not Yet Built
- Landing page at `swayger-app.replit.app` is a Replit Expo dev placeholder — not a real marketing page
- App not yet submitted to App Store or Google Play (Expo Go only for native)
- Scoring for rounds 32+ requires admin to manually run scores after each round
- Future round upset picks need to be supplied each round (currently only R64 is curated)

---

## Test Accounts
- Web: user ID prefix `67309b5d`
- Expo Go: user ID prefix `0fb8373d`
