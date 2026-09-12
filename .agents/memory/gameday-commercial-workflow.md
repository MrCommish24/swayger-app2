---
name: Game Day commercial workflow
description: Durable boundaries for persisted affiliate offers shown in Game Day and Fantasy Weekly placements.
---

Commercial offers are provider-neutral saved records with explicit target assignments; “available to partner” is only review metadata, not approval. Keep the core participant flow independent of commercial reads, and expose only normalized safe fields to participants.

**Why:** Affiliate provider outages, malformed provider data, or an accidental publish must not block picks or leak raw provider credentials/payloads.

**How to apply:** Keep admin authorization on every offer/assignment mutation, enforce one published assignment per target in the database and publish route, and require an explicit manual publish action.