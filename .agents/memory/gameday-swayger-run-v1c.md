---
name: Swayger Run V1C
description: Durable architecture and privacy boundaries for immutable Weekly pick-share aliases.
---

Weekly pick sharing requires a dedicated service-role-only alias table. Do not reuse Draft Day or Weekly receipt aliases because those identify finalized aggregate receipts, not one voluntarily disclosed prediction.

**Why:** A participant may share a pick or My Lock and then change the answer or confidence marker before lock. Previously sent links must keep their original meaning and framing.

**How to apply:** Reuse the opaque 16-character base32 short-code convention, but key alias reuse by room, participant, prop, confirmed answer identifier, and share kind. Never update an existing alias snapshot; a changed answer or share kind gets a different alias.

Store only stable relational IDs, the confirmed answer identifier, share kind, week number, and timestamps. Do not store answer labels, team names, generated share copy, contact details, guest tokens, or authentication material.

**Why:** Public crawler metadata is an intentional one-pick disclosure, not permission to expose the protected Weekly payload or mutable participant history.

**How to apply:** Resolve crawler metadata only from the alias and its referenced published prop/context. Normal humans redirect to the protected Weekly route with `source=pick_share`; aliases never authorize access. Hard-deleted dependencies should invalidate the alias safely.

Web clients must prepare the alias while the share composer is open, before the share-button gesture. Do not put an alias network request before `navigator.share()` in the click handler.

**Why:** Awaiting network I/O consumes the browser's transient user-activation window and can make Web Share fail with `NotAllowedError`.

**How to apply:** Keep share/copy disabled until preparation settles. Build the visible share text from the authoritative answer ID and label returned by alias creation, and reject a response that no longer matches the client's confirmed pick.