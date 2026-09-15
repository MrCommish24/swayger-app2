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

The shared room archive route may soft-archive Discord rooms only through the
valid bot credential plus matching stored guild boundary; app-owned rooms and
rooms without guild metadata remain outside that path. Human archives still
require the owning authenticated host.

The browser does not directly query Game Day tables; it uses Express routes.
However, the public Supabase anon client can currently read Game Day tables and
authorization columns directly, so API response minimization does not provide
database-level confidentiality.

**Why:** A shared bot credential alone cannot distinguish unrelated Discord
servers; a null web host owner must never become permission for every host or
bot caller. Requiring two matching guild signals catches malformed or
cross-guild bot requests before room creation, while immediate opening avoids a
second human setup operation. Service-role API authorization also cannot protect
a direct PostgREST caller if live table grants and RLS permit it.

**How to apply:** Keep public participant reads and share links unauthenticated
where the product needs them, but require the guild-scoped bot contract for
bot reads and mutations. Human hosts must use verified Supabase Auth and must
own a web-hosted room. Do not grant the bot management access to ordinary web
rooms. Before changing RLS, obtain the live policy/grant state and preserve the
Express-mediated participant flow.