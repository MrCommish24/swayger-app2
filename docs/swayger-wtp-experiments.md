# Swayger — Willingness to Pay Experiments
## March Madness 2026 Tournament Window

A working doc for scoping, prioritizing, and tracking paid feature experiments during the remainder of the tournament. Update the status column as decisions are made.

---

## Context & Hypothesis

**Core hypothesis:** Competitive players who are behind on the leaderboard will pay for a meaningful advantage when (a) the math shows they can realistically catch up, and (b) the remaining rounds are sufficient to make the investment feel worthwhile.

**Secondary hypothesis:** Some players will pay for social/status features regardless of leaderboard position.

**Tournament remaining (as of Mar 23):**
- Sweet 16 — Mar 26–27
- Elite 8 — Mar 28–29
- Final Four — Apr 4
- Championship — Apr 6

---

## Experiment Candidates

### 1. 2X Points Multiplier Boost
**Price:** $5 (one-time)
**Applies to:** All special picks (upset, blowout, high scorer) from purchase round through Championship

**The pitch:** "You're X pts back. Pay $5, get 2X points for the rest of the tournament."

**Why it works:**
- Trailing players have a clear, quantifiable path to catching up
- The math is compelling — 2X over E8 + FF + Championship = up to +63 pts potential gain
- Leaderboard anxiety peaks at Elite 8 when the bracket thins and gaps are visible

**Points upside by launch window:**

| Launch at | Remaining picks | Bonus pts potential | Value per dollar |
|---|---|---|---|
| Sweet 16 | ~21 picks | up to +63 pts | 12.6 pts/$ |
| **Elite 8** | ~21 picks | up to +63 pts | 12.6 pts/$ |
| Final Four | ~9 picks | up to +27 pts | 5.4 pts/$ |
| Championship | ~3 picks | up to +9 pts | 1.8 pts/$ |

> Note: Sweet 16 and Elite 8 have similar upside, but Elite 8 gives more build time and the competitive tension is higher.

**Technical lift:** Medium
- Stripe Checkout (hosted redirect, no native SDK needed)
- Backend: session endpoint + webhook + write `boost_multiplier` to user profile
- Scoring: apply global multiplier on top of per-pick multiplier at score compute time
- Frontend: Boost CTA card below leaderboard

**Target user:** Player who is 5–20 pts behind #1 and actively checking the leaderboard

**Recommended launch:** Elite 8 (Mar 28) — deadline to build: Mar 26

**Status:** `[ ] planned` `[ ] building` `[ ] live` `[ ] complete`
**Decision notes:**

---

### 2. Late Pick Extension
**Price:** $2–3 (per round)
**Applies to:** Special picks only — buys a 30-minute grace window past the official lock time

**The pitch:** "Missed the lock? You've got 30 more minutes for $3."

**Why it works:**
- Demand is guaranteed — people always miss deadlines
- The purchase is triggered by a real pain point (missed the window) not speculation
- Email or push notification to missed-deadline users creates a warm, urgent audience
- Almost zero scoring impact (30 min window, picks are already mostly locked for others)

**Technical lift:** Low
- DB: `extension_expires_at` timestamp + `extension_purchased` flag on user/round
- Backend: Stripe session + webhook + check extension before rejecting late pick submission
- Frontend: "Locked" screen swaps to "Pay to extend" instead of hard wall

**Target user:** Engaged player who forgot or was busy — not someone who disengaged

**Recommended launch:** Sweet 16 (Mar 26) — could be live in 1–2 days
**Can stack with:** 2X Boost (separate purchase, same payment flow)

**Status:** `[ ] planned` `[ ] building` `[ ] live` `[ ] complete`
**Decision notes:**

---

### 3. See the Leader's Picks
**Price:** $3 (per round)
**Applies to:** View the current #1 leaderboard player's special picks for a given round, after lock and before games tip

**The pitch:** "Find out what #1 picked before tip-off. Are you aligned or going the other way?"

**Why it works:**
- Pure competitive intel and FOMO — people want to know if they're picking against the leader
- Creates social pressure even when you don't buy (you wonder what they picked)
- No new data needed — the picks already exist, just gated behind payment
- Works best when the same player has dominated multiple rounds (name recognition builds)

**Technical lift:** Very low
- Payment gate in front of existing picks query
- Could optionally let the leader opt-in to share (and get a cut or points reward)
- No new DB columns needed

**Target user:** Mid-pack player (positions 2–8) who is close enough to feel competitive

**Recommended launch:** Elite 8 (Mar 28) — pairs naturally with the Boost launch
**Edge case:** What if #1 hasn't submitted picks yet? Gate should only unlock after pick submission confirmed.

**Status:** `[ ] planned` `[ ] building` `[ ] live` `[ ] complete`
**Decision notes:**

---

### 4. Gift a Boost
**Price:** $5 (sent to another user)
**Applies to:** Sends the 2X multiplier boost to a specific user for the remainder of the tournament

**The pitch:** "Think your friend has what it takes? Boost them. Or troll them into pressure."

**Why it works:**
- Social gifting drives word-of-mouth and pulls dormant users back into the app
- Recipient gets a notification ("Someone just 2X'd you") — creates obligation to perform
- Same backend as personal Boost, with gifting UI layer on top
- High viral potential — gift receipt is shareable

**Technical lift:** Medium (same as Boost + notification layer)
- Backend: same boost webhook, but `target_user_id` comes from gift purchase metadata
- Frontend: user picker on the boost screen, "Gift to a friend" option
- Notification: push or email to recipient on boost delivery

**Target user:** Social player who wants to make the game more interesting for their group

**Recommended launch:** Final Four (Apr 3) — later window, higher social stakes as group dwindles

**Status:** `[ ] planned` `[ ] building` `[ ] live` `[ ] complete`
**Decision notes:**

---

### 5. Leaderboard Badge
**Price:** $1–2 (one-time, permanent through end of tournament)
**Applies to:** Custom emoji or short tag displayed next to your name on the leaderboard

**The pitch:** "Put your mark on the board."

**Why it works:**
- Impulse buy at low price — lowest friction of any option
- Every player who opens the leaderboard sees badges, which signals paid features exist
- Zero scoring impact = no fairness concerns
- Good test of pure vanity/status WTP separate from competitive advantage

**Technical lift:** Very low
- DB: `leaderboard_badge` varchar on user profile
- Frontend: emoji picker in profile or at checkout, rendered as small tag on leaderboard row
- No backend scoring changes needed

**Target user:** Anyone — leaderboard position irrelevant, personality/status motivated

**Recommended launch:** Sweet 16 or Elite 8 — quick to ship, good early signal

**Status:** `[ ] planned` `[ ] building` `[ ] live` `[ ] complete`
**Decision notes:**

---

## Prioritization Summary

| # | Feature | Price | Lift | Launch Window | Priority |
|---|---------|-------|------|--------------|----------|
| 1 | 2X Multiplier Boost | $5 | Medium | Elite 8 (Mar 28) | 🔴 High |
| 2 | Late Pick Extension | $2–3 | Low | Sweet 16 (Mar 26) | 🔴 High |
| 3 | See the Leader's Picks | $3 | Very Low | Elite 8 (Mar 28) | 🟡 Medium |
| 4 | Gift a Boost | $5 | Medium | Final Four (Apr 3) | 🟡 Medium |
| 5 | Leaderboard Badge | $1–2 | Very Low | Any | 🟢 Low |

---

## Payment Infrastructure Notes

- **Provider:** Stripe (Checkout hosted redirect — works on both web and Expo Go without native SDK)
- **Pattern:** Frontend creates Stripe session via backend → user redirected to Stripe-hosted page → webhook confirms payment → backend writes feature flag to user profile
- **One-time charges only** — no subscriptions needed for tournament window
- **Real-money test required** before any experiment goes live
- **Replit integration:** Stripe connector available — check integrations before setting up manually

---

## Open Questions

- [ ] Do we cap the Boost to one per user, or allow stacking?
- [ ] If "See the Leader" is purchased and the leader changes rounds, does the buyer see the new leader or the original?
- [ ] Should Gift a Boost require the recipient to accept, or auto-apply?
- [ ] Do paid features carry over if we run Swayger for other sports/events post-tournament?
- [ ] Legal review: at what point do paid advantages in a contest-with-prize require terms update?
