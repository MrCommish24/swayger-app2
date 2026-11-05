---
name: Game Day Discord isolation
description: Authorization boundary for a shared Game Day Discord bot serving multiple guilds.
---

Discord operator authorization requires both the shared bot credential and the
Discord guild ID that owns the referenced room. A Discord channel ID is
metadata, not an authorization boundary. Nested card and prop actions inherit
their room’s guild boundary.

Bot-created Madden Weekly Pick Cards additionally require the body
`discord_guild_id` and `X-Discord-Guild-ID` header to be present and equal; the
created card opens immediately so the returned link is playable without a web
host step.

The Discord bot archive path requires the valid bot credential plus matching
stored guild boundary. Separately, a verified Game Day admin session may archive
any room from Host Tools; ordinary human hosts remain limited to their own
web-hosted rooms.

The browser does not directly query Game Day tables; it uses Express routes.
However, the public Supabase anon client can currently read Game Day tables and
authorization columns directly, so API response minimization does not provide
database-level confidentiality.

**Why:** A shared bot credential alone cannot distinguish unrelated Discord
servers; a null web host owner must never become permission for every host or
bot caller. The Host Tools exception is separately authenticated and gated by
the configured Game Day host and admin allowlists. Service-role API
authorization also cannot protect a direct PostgREST caller if live table
grants and RLS permit it.

**How to apply:** Keep public participant reads and share links unauthenticated
where the product needs them, but require the guild-scoped bot contract for
bot reads and mutations. Host Tools admin exceptions must use verified
Supabase Auth plus both configured allowlists; non-admin human hosts must own
the web-hosted room. Do not grant the bot management access to ordinary web
rooms. Before changing RLS, obtain the live policy/grant state and preserve the
Express-mediated participant flow.