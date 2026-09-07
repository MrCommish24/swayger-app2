---
name: NFL Weekly Slate Publishing
description: Durable boundaries and idempotency rules for materializing approved weekly slates into Discord-owned Game Day rooms.
---

Weekly slate publishing creates private, server-specific Game Day room instances only for active Discord subscriptions. It stores post-ready payloads but never posts to Discord or starts settlement, receipts, reminders, billing, or external sports-data work.

**Why:** Room materialization and Discord delivery are intentionally separate reliability boundaries; the backend must be safe to run before a bot posting implementation exists.

**How to apply:** Keep dry runs write-free, filter inactive subscriptions before processing, continue after a single guild fails, and let a separate bot consume the stored payload.

The durable idempotency key is the master slate plus Discord guild. A repeat publish returns the existing instance and must not create duplicate rooms, cards, props, or instance rows; the master slate's original publication timestamp must remain unchanged.

**Why:** Admin retries and concurrent requests must be safe without multiplying playable rooms or changing the audit timeline.

**How to apply:** Treat the instance uniqueness constraint as the final concurrency guard and clean up any losing room created during a race.

Configured reward text is preserved in storage; only the display copy strips a leading “Winner gets” prefix before rendering the labeled message section.

**Why:** Pilot-configured rewards may already include the label, and rewriting stored subscription or payload values would damage auditability and historical delivery data.

**How to apply:** Keep `reward_text` unchanged for persistence and bot delivery; derive a separate display reward string for newly generated message text only.