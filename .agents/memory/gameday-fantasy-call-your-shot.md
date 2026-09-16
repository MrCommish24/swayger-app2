---
name: Fantasy Call Your Shot
description: Durable privacy, attribution, and saved-answer rules for pre-lock Weekly pick sharing.
---

Call Your Shot is a deliberate client-side disclosure of exactly one current
Weekly pick. It must not create public pick records, public pick APIs, share
history, or a link that carries the answer, sharer, team, template, or token.

**Why:** Pre-lock picks are private. The participant may share one selected
answer voluntarily, but recipients must still pass the normal Weekly
join/member authorization flow and must never gain access to the sharer's
remaining picks.

**How to apply:** Build share copy from the stable Moment registry, the
league-safe display name, and the latest server-confirmed answer. Serialize
edits per question so an older save cannot overwrite a newer one. Use the
canonical Weekly play URL with only coarse `source=pick_share` attribution,
preserve that marker through join/auth, and keep finalized receipt sharing
independent.