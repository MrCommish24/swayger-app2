---
name: Madden Weekly Pick Card
description: Approved V1 boundaries and migration dependency for the Madden weekly Game Day format.
---

Madden Weekly Pick Card is a private, host-created Game Day room using one aggregate pregame card. Matchups are two-choice string props, optional bonus questions are manually settled, reward text is display-only, and Madden must not fall through to generic room creation.

**Why:** The pilot intentionally avoids sportsbook language, external Madden data, automatic Discord delivery, numeric tiebreakers, and subscription changes while reusing the existing pick, settlement, leaderboard, and finalization flows.

Companion App export ingestion, EA APIs, NeonSportz, and Madden data normalization are explicitly deferred. Future import fields may prefill this format later, but Phase 1 is only the manual weekly pick-card workflow.

**How to apply:** Keep the format behind `sport=madden` and `template_type=weekly_pick_card`; apply the additive Supabase migration before creating rooms because legacy representative matchup columns must accept NULL and the format metadata/line-text columns must exist.

For Madden Weekly cards, the stored pick deadline is a server-enforced submission/edit cutoff, not an automatic card lock. Commissioner lock remains the manual receipt-reveal moment.

**Why:** The live pilot confirmed participants need an exact write cutoff while commissioners retain control over when everyone’s picks are revealed.

**How to apply:** Reject all pick writes at or after the shared scheduled deadline, preserve saved-pick reads, and exclude only Madden Weekly cards from scheduled auto-lock. Do not disable scheduled auto-open or other formats’ existing schedules.