---
name: Game Day Discord isolation
description: Authorization boundary for a shared Game Day Discord bot serving multiple guilds.
---

Discord operator authorization requires both the shared bot credential and the
Discord guild ID that owns the referenced room. A Discord channel ID is
metadata, not an authorization boundary. Nested card and prop actions inherit
their room’s guild boundary.

**Why:** A shared bot credential alone cannot distinguish unrelated Discord
servers; a null web host owner must never become permission for every host or
bot caller.

**How to apply:** Keep public participant reads and share links unauthenticated
where the product needs them, but require the guild-scoped bot contract for
bot reads and mutations. Human hosts must use verified Supabase Auth and must
own a web-hosted room. Do not grant the bot management access to ordinary web
rooms.