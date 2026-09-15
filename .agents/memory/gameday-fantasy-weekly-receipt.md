---
name: Fantasy Weekly Receipt
description: Live schema state and durable authorization/privacy boundaries for shareable Weekly receipts.
---

The additive Weekly receipt alias migration is already applied to the live Swayger Supabase project. Do not re-run it or create a second Weekly alias table.

**Why:** Weekly receipt identity is season plus week, while Draft Day identity is season-only. Reusing the Draft Day alias storage would collapse weeks or change existing Draft Day link semantics.

**How to apply:** Keep Weekly receipts finalized-only, viewer-independent, readable to authorized season members after archive, and protected at the canonical route. Short aliases only redirect and must never bypass canonical authorization.