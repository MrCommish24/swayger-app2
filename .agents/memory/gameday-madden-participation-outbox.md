---
name: Madden Discord participation outbox
description: Durable architecture and rollout constraints for Madden completion activity delivered by an external Discord bot.
---

Discord-created Madden Weekly Pick Cards record completion activity in the same database transaction as the participant's final required pick. One event is allowed per room and durable participant identity, and concurrent completions receive sequential participant counts.

**Why:** A best-effort post-pick insert can permanently lose the social event after a transient failure. Atomic storage preserves the event, while database uniqueness prevents refreshes, edits, retries, and concurrent final-pick submissions from creating duplicates.

**How to apply:** Keep this behavior limited to active, open, pre-deadline Discord Madden weekly rooms with guild and channel metadata. Authenticated and guest identities must resolve to a participant in the selected prop's room. Never store selections or reveal data in the outbox.

Delivery is guild-scoped and at-least-once. Pending fetches do not reserve or acknowledge events; the external bot must deduplicate Discord posting by stable event ID and acknowledge only after a successful post.

**Why:** Pending records must survive backend, bot, and Discord failures. Fetch-without-ack permits retry, while stable IDs let the bot avoid duplicate posts if delivery confirmation is ambiguous.

**How to apply:** Require the shared bot credential plus matching Discord guild header for fetch and acknowledgement. Apply the additive service-role-only migration before publishing backend code that invokes the transactional submission function.