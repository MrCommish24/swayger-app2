---
name: Post-merge setup
description: Post-merge dependency setup and Supabase migration safety.
---

The post-merge hook may reinstall dependencies, but must not automatically push Supabase schema changes. Schema updates use explicit project-specific migration steps.

**Why:** Supabase schema changes can affect live features and are not interchangeable with a generic Drizzle push.

**How to apply:** Keep the hook non-interactive and dependency-focused. If a clean install is blocked by Replit's package firewall, update the blocked dependency to a currently allowed release; never bypass the firewall.
