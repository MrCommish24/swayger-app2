---
name: Madden incremental settlement
description: Durable lifecycle and authorization rules for matchup-by-matchup settlement of Discord Madden weekly Pick Cards.
---

Discord Madden weekly Pick Cards use the existing prop settlement path rather than a parallel subsystem. Settlement is allowed only after lock; each playable prop moves independently from pending to settled, while room finalization remains explicit and requires every playable prop to be settled.

**Why:** Lock, settlement, and finalization are distinct product states. Commissioners need to record each game result once as it becomes available without permitting pick edits or prematurely declaring final standings.

**How to apply:** Keep the stricter lifecycle scoped to Discord Madden weekly cards. Preserve generic Game Day behavior for other formats unless a later product decision expands the rule.

The commissioner settlement queue and write path must preserve Discord guild isolation. Same-answer retries are successful no-ops; answer changes are authorized corrections that rescore all picks for that prop and write an audit event containing prior/new answers and operator source.

**Why:** Bot retries must be safe, while commissioner mistakes need correction without database surgery or duplicate audit noise.

**How to apply:** Unsettled picks remain null, settled correct picks become true, and settled incorrect picks become false. Never expose participant data in the queue contract, and never emit new Discord social result events from settlement unless separately approved.