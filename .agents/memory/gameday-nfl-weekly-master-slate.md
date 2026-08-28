---
name: NFL Weekly Master Slate
description: Durable lifecycle and boundary rules for the admin-curated weekly NFL slate source model.
---

Weekly master slates are source content, never live Game Day rooms. Creating, editing, approving, or archiving one must not create room-owned records or trigger publishing, Discord delivery, billing, or settlement.

**Why:** The master model is intended to be curated and approved independently, then consumed later through a separate snapshot-based publishing workflow.

**How to apply:** Keep draft content editable. Require an explicit reset to draft before changing approved content, treat published and archived rows as immutable, and archive instead of deleting so a replacement can occupy the same season/week.

The model requires its dedicated Supabase SQL migration. The workspace PostgreSQL connection is a different database, so applying that migration must use a Supabase-capable SQL path.

**Why:** Service-role PostgREST can read and write rows but cannot execute table DDL.

**How to apply:** Expect the admin API to return its schema-unavailable response until the migration has been applied to the configured Supabase project; then run the focused lifecycle suite.