---
name: Fantasy pilot analytics
description: Durable reliability and identity boundaries for Fantasy pilot instrumentation.
---

Fantasy commissioner/member milestones must fire only after confirmed success and must suppress backend-declared replay, idempotent settlement, correction, finalized replay, and dismissed share outcomes.

**Why:** Retry-safe product operations otherwise inflate conversion funnels; completion milestones must represent state transitions rather than page mounts or edits.

**How to apply:** Preserve league and season context on all Fantasy events and explicit week number on recurring weekly events. Keep page views lightweight, but gate creation, claim, publish, lock, settlement, finalization, completion, and share milestones.

Guest Fantasy retention remains PostHog anonymous/device-scoped. Do not send guest tokens or add a separate analytics identity solely to bridge guests across devices or account upgrades.

**Why:** The pilot explicitly prioritizes guest behavior but forbids changing the Fantasy claim identity architecture solely for analytics.

**How to apply:** Report cross-device guest retention as a known limitation; measure authenticated retention reliably and same-device guest trends directionally.