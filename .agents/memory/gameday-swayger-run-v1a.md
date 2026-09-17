---
name: Swayger Run V1A
description: Durable rollout and state-source rules for the presentation-only Weekly focus experience.
---

Swayger Run V1A is a presentation-only Weekly play variant controlled by an exact league-ID server allowlist. The default is globally off, and disabling it must restore the legacy all-cards UX without data repair.

**Why:** The pilot must be reversible through configuration alone and must never reinterpret optimistic selections as completed gameplay state.

**How to apply:** Keep picks, identity, scoring, settlement, results, receipts, League Picks, and Call Your Shot on their existing architecture. Drive resume, progress, acknowledgment, auto-advance, haptics, and completion only from server-confirmed picks. Keep My Lock outside V1A.