---
name: Swayger Run V1B
description: Durable boundaries for persisted Weekly My Lock, rollback isolation, and sharing.
---

Persisted My Lock is a confidence-only association with an existing confirmed Weekly pick. It must never duplicate answer data or affect pick completion, scoring, settlement, Results, Receipt, or League Picks.

**Why:** V1B needs durable selection across reloads without making My Lock a gameplay input or changing established privacy and scoring contracts.

**How to apply:** Verify bearer credentials cryptographically before My Lock mutations. Keep all My Lock reads and writes behind the league allowlist so disabling SWAYGER RUN leaves rows dormant and legacy Weekly play independent of the V1B table. Non-legacy share flows must narrow the composer to the requested confirmed pick.

Weekly pick editability and shareability are separate lifecycle concerns. Confirmed picks and an existing My Lock remain shareable after lock, settlement, and finalization wherever the Weekly pick summary remains available; neither can be selected or changed outside an open card.

**Why:** A locked prediction is immutable but more valuable socially because it can no longer be changed. Hiding share controls at lock incorrectly coupled voluntary disclosure to mutation access.

**How to apply:** Gate answer and My Lock mutations on the open card state, but gate sharing on the presence of a server-confirmed pick. Keep the share package limited to that one pick and preserve normal protected Weekly-route authorization.