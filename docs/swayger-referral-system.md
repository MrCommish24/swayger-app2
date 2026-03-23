# Swayger — Referral System Design
## March Madness 2026

A working doc for designing and tracking the referral program. Update status and decision notes as the plan evolves.

---

## Core Hypothesis

Competitive players who are actively engaged in picks will invite friends when (a) the share content is inherently interesting (not just a generic invite link), and (b) the reward is meaningful but time-limited enough to create urgency.

---

## Timing Opportunity

- Today: March 23
- Sweet 16 lock: March 27 noon CDT — 4 days
- Elite 8 lock: March 28 — 5 days

The short window is actually a conversion accelerator, not a problem. "Sweet 16 picks lock in 4 days" is real urgency that makes new users act immediately. The banner and share CTA should lean into this deadline.

---

## Recommended Mechanic

### Option B mechanic + Option A backend

**What the user sees:**
The referrer shares a specific featured matchup (Sweet 16 or Elite 8 game) via a unique link. The new user clicks the link, lands on the matchup, and creates an account to make their own pick. The share feels like a challenge/invitation, not a generic referral.

**What happens under the hood:**
A referral token (tied to the referrer's user ID) is embedded in the share URL — same as a traditional referral code, just surfaced through interesting content instead of a bare code entry field.

**Why this over a plain code system:**
- The featured matchup gives the share link inherent value ("which team wins?") vs. "use my code"
- New users land with an immediate engagement hook — they want to pick the game
- Naturally filters out throwaway accounts — someone who clicks and makes a pick is genuinely interested
- On-brand for Swayger (social, pick-based, competitive)
- The featured matchup screens already exist — the share surface is built

---

## Reward Structure

### Referrer reward
- **What:** 2X points multiplier for **one upcoming round** (the next round after the referred user submits their first pick)
- **Cap:** One reward total per account — referring 5 people still earns only one 2X round
- **Unlock condition:** Referred user must submit at least one pick — not just create an account
- **Why one round, not all remaining:** Keeps the referral reward clearly below the paid $5 boost (which applies to all remaining rounds). Can't give away what someone could buy.

### Referred (new) user reward
- **What:** TBD — options include bonus points, a welcome badge, or nothing (the featured matchup itself is the hook)
- **Decision needed:** Does the new user get anything, or is the intrinsic motivation (joining the competition) sufficient?

### Interaction with paid boost
- Referral bonus and paid 2X boost **do not stack**
- Maximum multiplier from any source: **2X total**
- If a user has the paid boost active, the referral reward is banked but has no additional effect

---

## Safety Guardrails

| Rule | Reason |
|---|---|
| New email required — no existing accounts | Prevents referrers from self-referring or using old accounts |
| Referred user must submit at least one pick before reward unlocks | Blocks throwaway account creation for farming points |
| One referral reward per referrer, ever | Prevents leaderboard distortion from mass referrals |
| 2X cap — no stacking with paid boost | Protects paid boost economics |
| Referral token expires after the tournament | Prevents stale links from rewarding points in future events |

---

## Home Screen Entry Point

A banner on the home screen is the right placement. Should feel like a challenge, not a growth prompt.

**Suggested copy:**
> *"Know someone who'd win this? Share your Sweet 16 picks → get 2X points next round if they join."*

**Banner behavior:**
- Visible to all users who have submitted at least one pick (not cold/unengaged users)
- Hidden after the user has successfully referred someone and claimed their reward
- Replaced with a "reward active" confirmation badge once the referral unlocks

**Placement options:**
- Below the featured matchups section on the main MM screen
- Top of the picks screen with a dismissible state
- Persistent tab badge on the leaderboard (where competitive context is highest)

---

## Technical Implementation

### DB changes needed
| Column | Table | Type | Purpose |
|---|---|---|---|
| `referral_code` | `profiles` | `varchar(12)` | Unique short code generated at account creation |
| `referred_by` | `profiles` | `uuid` (FK → profiles) | Set when a new user signs up via referral link |
| `referral_reward_round` | `profiles` | `varchar` | Which round the 2X reward applies to (set when unlock condition met) |
| `referral_reward_claimed` | `profiles` | `boolean` | Guards against double-claiming |

### Backend logic
1. **Share link generation:** `GET /api/mm/referral-link` — returns a URL with the referrer's token embedded and a featured matchup pre-selected
2. **Signup handler:** When a new user creates an account with a referral token in the URL, write `referred_by` to their profile
3. **Pick submission hook:** After a referred user submits their first pick, check if referrer has `referral_reward_claimed = false` → if so, set `referral_reward_round` to upcoming round and flip `referral_reward_claimed = true`
4. **Score compute:** Apply `referral_reward_round` multiplier (2X) alongside any paid boost multiplier, capped at 2X total

### Frontend
- Referral banner component on main MM screen
- Share sheet (native) or link copy (web) with the generated URL
- "Reward active" state on the banner after unlock
- Referred user landing: existing matchup screen with a welcome state (e.g., "You were invited to pick this game")

---

## Open Questions

- [ ] Does the new (referred) user get any reward, or is joining the competition sufficient?
- [ ] Should the banner show on the leaderboard screen instead of (or in addition to) the home screen?
- [ ] What happens if a referred user joins after Sweet 16 lock — does the referrer's reward apply to Elite 8 instead?
- [ ] Do we generate referral codes at account creation for all existing users, or only generate on first share?
- [ ] Should users be able to see how many people they've referred (a social proof mechanic)?
- [ ] Post-tournament: should referral codes carry over to future Swayger events?

---

## Status

| Phase | Status | Notes |
|---|---|---|
| Design | `[ ] in progress` `[ ] decided` | |
| DB schema | `[ ] planned` `[ ] built` | |
| Backend | `[ ] planned` `[ ] built` `[ ] tested` | |
| Frontend banner | `[ ] planned` `[ ] built` `[ ] tested` | |
| Share link + landing | `[ ] planned` `[ ] built` `[ ] tested` | |
| Live | `[ ] planned` `[ ] live` | Target: before Sweet 16 lock (Mar 27) or Elite 8 lock (Mar 28) |
