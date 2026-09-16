---
name: Fantasy Weekly Receipt
description: Live schema state and durable authorization/privacy boundaries for shareable Weekly receipts.
---

The additive Weekly receipt alias migration is already applied to the live Swayger Supabase project. Do not re-run it or create a second Weekly alias table.

**Why:** Weekly receipt identity is season plus week, while Draft Day identity is season-only. Reusing the Draft Day alias storage would collapse weeks or change existing Draft Day link semantics.

**How to apply:** Keep Weekly receipts finalized-only, viewer-independent, readable to authorized season members after archive, and protected at the canonical route. Short aliases only redirect and must never bypass canonical authorization.

Weekly receipt share facts must come only from resolved answers on settled Weekly props, identified by stable template identifiers. Never derive the fact from Swayger standings, scores, or correct counts, and never fall back to those sources when a supported league-result prop is unavailable.

**Why:** Swayger competition points and fantasy-week outcomes describe different results; mixing them produces misleading share copy.

**How to apply:** Prefer largest-margin winner, then highest-scoring fantasy team, lowest-scoring fantasy team, and smallest-margin winner. Preserve every resolved answer for ties, omit the fact if none qualify, and label Swayger winner totals as SP.

Valid finalized Weekly aliases may expose a deliberately limited public crawler preview while normal human requests still redirect to the protected canonical receipt. The preview may contain league/week/season, winner names, winning SP, one settled fact, and a compact result image only.

**Why:** Shared short links need league-specific social metadata, but making the canonical receipt public would expose member-only details and weaken the existing authorization boundary.

**How to apply:** Gate metadata on a valid alias plus finalized room, never emit picks/tokens/IDs/contact details/unresolved props, do not count crawler requests as receipt views, and return safe 404s for invalid or unfinalized aliases.