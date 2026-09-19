---
name: Madden Pick Card Win Conditions
description: Backend-authoritative winner semantics for Discord Madden Weekly Pick Cards.
---

Madden Weekly Pick Cards accept only `all_correct` and `most_correct`; missing scoring mode safely defaults to `all_correct`, while unknown explicit values are rejected.

**Why:** Discord and the web receipt must not independently derive winner semantics, and legacy cards must retain Perfect Card behavior.

**How to apply:** Finalized standings must use the configured mode only after every required playable prop is settled. For `all_correct`, winners have `correct_picks === total_picks`; for `most_correct`, winners share the highest `correct_picks`. `total_picks` in final standings means the required card prop count, and pick queries must be scoped to the current room.