---
name: Madden Discord participation outbox
description: Durable architecture and rollout constraints for Madden completion activity delivered by an external Discord bot.
---

Discord-created Madden Weekly Pick Cards record completion activity in the same database transaction as the participant's final required pick. Public-event-enabled callers create a versioned full public-display snapshot on initial completion and every material pre-lock edit; retries and identical writes create no event.

**Why:** A best-effort post-pick insert can permanently lose the social event after a transient failure. Atomic storage preserves the event, while participant/card versions make every public edit accountable without making retries noisy.

**How to apply:** Keep this behavior limited to active, open, pre-deadline Discord Madden weekly rooms with guild and channel metadata. Store only the complete ordered public-display pick set; never include correctness, settlement, score, winner, or unrelated private fields.

Delivery is guild-scoped and at-least-once. Pending fetches do not reserve or acknowledge events; the external bot must deduplicate Discord posting by stable event ID and acknowledge only after a successful post.

**Why:** Pending records must survive backend, bot, and Discord failures. Fetch-without-ack permits retry, while stable IDs let the bot avoid duplicate posts if delivery confirmation is ambiguous.

**How to apply:** Require the shared bot credential plus matching Discord guild header for fetch and acknowledgement. Preserve causal delivery order with an outbox sequence, not transaction timestamps alone.

Public pick events are an explicit rollout opt-in. Three-argument callers remain compatible and emit the historical completion-only event until the backend passes the opt-in argument. Once a participant has a public event, even an older caller's material edit must continue the versioned public stream.

**Why:** Database and backend deployments can happen before the external Discord bot understands the new event types. Fail-open activation or mixed callers can otherwise expose incomplete payloads, double-count participants, or silently change already-public picks.

**How to apply:** Apply the additive migration first, update the bot to accept submitted/updated events, publish the backend, then explicitly enable the public event flag. Keep historical completion rows readable with null public-pick fields.