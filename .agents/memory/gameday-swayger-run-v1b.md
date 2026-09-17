---
name: Swayger Run V1B
description: Durable boundaries for persisted Weekly My Lock, rollback isolation, and sharing.
---

Persisted My Lock is a confidence-only association with an existing confirmed Weekly pick. It must never duplicate answer data or affect pick completion, scoring, settlement, Results, Receipt, or League Picks.

**Why:** V1B needs durable selection across reloads without making My Lock a gameplay input or changing established privacy and scoring contracts.

**How to apply:** Verify bearer credentials cryptographically before My Lock mutations. Keep all My Lock reads and writes behind the league allowlist so disabling SWAYGER RUN leaves rows dormant and legacy Weekly play independent of the V1B table. Non-legacy share flows must narrow the composer to the requested confirmed pick.