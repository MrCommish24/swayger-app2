---
name: Swayger Run V1A
description: Durable rollout and state-source rules for the presentation-only Weekly focus experience.
---

Swayger Run V1A is a presentation-only Weekly play variant controlled by an exact league-ID server allowlist. The default is globally off, and disabling it must restore the legacy all-cards UX without data repair.

**Why:** The pilot must be reversible through configuration alone and must never reinterpret optimistic selections as completed gameplay state.

**How to apply:** Keep picks, identity, scoring, settlement, results, receipts, League Picks, and Call Your Shot on their existing architecture. Drive resume, progress, acknowledgment, auto-advance, haptics, and completion only from server-confirmed picks. Keep My Lock outside V1A.

On Expo web, never call React Native `findNodeHandle` for accessibility focus; the web runtime throws instead of returning a DOM handle. Use the element ref's `focus()` method on web and retain `findNodeHandle` only for native.

**Why:** Returning participants with confirmed picks crashed as soon as the focused screen tried to move accessibility focus.

**How to apply:** Any cross-platform focus restoration in Fantasy components must branch on `Platform.OS === "web"` before calling `findNodeHandle`.