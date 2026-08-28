---
name: NFL Sunday Slate format
description: Additive NFL multi-game format rules and its Supabase schema dependency.
---

NFL Sunday Slate is an additive Game Day format, identified by
`template_type = nfl_sunday_slate`; missing or null format data is always
interpreted as NFL Single Game.

**Why:** Existing NFL rooms, direct links, and bot callers must retain their
original three-card Single Game behavior while Slate rooms need candidate-driven
answers across a full Sunday schedule.

**How to apply:** Keep the three existing phases, but use Slate card titles and
resolve all candidate tokens into stored prop options at room creation. Use
`Other` and `Tie / Multiple tied` for leader outcomes rather than modifying the
one-correct-answer settlement engine. Apply the dedicated additive Supabase
migration before enabling Slate room creation; retain legacy read/duplicate
fallbacks until the database has it.

For Discord subscription lifecycle, use the existing `status` column as the
source of truth for disabling. Preserve the guild row; optional enable flags or
disable-audit columns may be written only when an already-deployed schema has
them, and must not be required for the disable route.

**Why:** The original subscription migration intentionally stores configuration
only, so requiring new disable-specific columns would create an unnecessary
schema rollout and break compatibility with the bot.

**How to apply:** Treat `status = 'disabled'` as the durable disabled state in
bot writes and status reads. Keep optional-column handling best-effort and
schema-compatible.