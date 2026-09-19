---
name: Madden Weekly Pick Card
description: Approved Madden weekly contract, V2 bonus semantics, settlement guarantees, and deferred integration boundaries.
---

Madden Weekly Pick Card is a private Game Day room using one aggregate pregame card. Main matchups and the optional Bonus Game are two-choice props; the Bonus Game may also have an optional exact integer total from 0–200. Reward text is display-only, and Madden must not fall through to generic room creation.

**Why:** Manual creation and future imported slates must converge on one backend contract without coupling the card to Discord UI, parsers, or external sports-data systems.

**How to apply:** Store explicit prop role and answer type. Typed numeric predictions/results are authoritative; canonical numeric text exists only for legacy compatibility. Count every enabled prop for completion/finalization, but compute standings, Game Day SP, winners, and ties from main matchups only. Return bonus outcomes separately.

Choice and numeric settlement must be atomic across result persistence, full pick rescoring, and parent-card cascade. Same-result retries must re-assert score state without duplicating audit events.

**Why:** Multi-statement settlement can leave a prop marked settled with stale participant scores if a later write fails.

**How to apply:** Keep settlement in a service-role-only database transaction and retain retry-repair regression coverage. Apply the V2 schema migration before the atomic-settlement migration.

Discord UI, pasted-slate parsing, NeonSportz integration, external Discord bot changes, and automatic settlement remain explicitly deferred.

**How to apply:** Keep the format behind `sport=madden` and `template_type=weekly_pick_card`; future creation surfaces should submit the normalized contract rather than inventing separate storage or scoring behavior.

For Madden Weekly cards, the stored pick deadline is a server-enforced submission/edit cutoff, not an automatic card lock. Commissioner lock remains the manual receipt-reveal moment.

**Why:** The live pilot confirmed participants need an exact write cutoff while commissioners retain control over when everyone’s picks are revealed.

**How to apply:** Reject all pick writes at or after the shared scheduled deadline, preserve saved-pick reads, and exclude only Madden Weekly cards from scheduled auto-lock. Do not disable scheduled auto-open or other formats’ existing schedules.

Discord bot-created Madden Weekly cards may genuinely omit the deadline timestamp and provide bounded free-form display text instead. This exception never applies to app/web creation or other Game Day formats.

**Why:** Discord commissioners may publish human-readable lock wording without a machine timestamp while retaining authoritative manual lock control.

**How to apply:** Distinguish an absent deadline property from any supplied malformed value. Never parse display text or derive a schedule from it; null schedules remain editable until an authorized manual lock. Disabled bonus cards complete on matchup props only.

Madden Weekly Pick Cards support 1–7 supplied matchups. `minimum_matchups` is a validation floor bounded by the actual matchup count; it is not the card's matchup count and does not control participant completion.

**Why:** The Discord contract was relaxed to allow one-matchup cards, while the backend normalizer still enforced the earlier three-matchup minimum.

**How to apply:** Discord should send `minimum_matchups: 1` for the general 1–7 contract. Completion and participation events must continue to count every playable prop actually stored on the card.