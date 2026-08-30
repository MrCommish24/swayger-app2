---
name: Fantasy multi-league claim resolution
description: Authenticated Fantasy users can hold active claims in multiple leagues.
---

Resolve an authenticated user's Fantasy claim by filtering their active claims against the requested league; never assume `user_id` identifies only one active claim.

**Why:** A user can belong to multiple leagues. Treating the user claim query as singular makes the viewer resolve to null, hiding commissioner controls and blocking League Manage navigation.

**How to apply:** Query all active claims for the user, then select the claim whose league member belongs to the requested league. Guest-token claims remain singular by their unique token.