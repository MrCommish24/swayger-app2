# Game Day Discord Bot API contract

This contract lets one shared Discord bot serve many unrelated Discord servers
without letting one server read or operate another server’s Game Day rooms.

## Credentials and scope

Every bot request must send:

```http
x-api-key: <GAMEDAY_BOT_API_KEY>
```

Every request that references an existing room must also send:

```http
X-Discord-Guild-ID: <the Discord guild ID from the interaction>
```

The backend compares that header to the room’s stored `discord_guild_id`.
Possession of the bot key alone is not authorization for a room. The backend
does not use a channel ID as the isolation boundary.

Do not send the shared bot key to client-side code, Discord messages, or
shareable Game Day links.

## Create a Discord room

`POST /api/gameday/rooms`

The bot must include `source: "discord"` and a non-empty
`discord_guild_id` in the JSON body:

```json
{
  "room_name": "Lakers vs Celtics",
  "team_a_name": "Lakers",
  "team_b_name": "Celtics",
  "team_a_star": "LeBron James",
  "team_b_star": "Jayson Tatum",
  "game_date": "2026-08-25",
  "source": "discord",
  "discord_guild_id": "123456789012345678",
  "discord_channel_id": "234567890123456789",
  "discord_user_id": "345678901234567890"
}
```

`discord_channel_id` and `discord_user_id` are optional metadata. They do not
grant authorization. The response includes `room_id`, `room_code`, and
`public_link`; post `public_link` for participants.

## Guild-scoped bot operations

All of these need both headers above. Each resolves the owning room before the
operation, including when the request starts from a card or prop ID.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `PATCH` | `/api/gameday/cards/:cardId/open` | Open a pick card |
| `PATCH` | `/api/gameday/cards/:cardId/lock` | Lock a pick card |
| `PATCH` | `/api/gameday/props/:propId/settle` | Set `correct_answer` |
| `PATCH` | `/api/gameday/rooms/:roomId/finalize` | Finalize the room |
| `GET` | `/api/gameday/rooms/:roomRef/leaderboard` | Bot-scoped leaderboard read |
| `GET` | `/api/gameday/rooms/:roomRef/final-standings` | Bot-scoped final standings read |

For a missing guild header, the API returns `400`. For a room belonging to a
different guild, a normal web room, or a malformed/missing bot credential, it
returns `403` or `401` without performing the operation.

## Public participant access is separate

Shareable links and ordinary participant calls remain public by design:

- `GET /api/gameday/rooms/:roomId`
- `GET /api/gameday/rooms/:roomRef/leaderboard`
- `GET /api/gameday/rooms/:roomRef/final-standings`

Use those calls without bot credentials from the public Game Day experience.
Public room data deliberately omits `host_user_id`, `discord_guild_id`,
`discord_channel_id`, and `discord_user_id`.

## RLS audit record

The checked-in `supabase/gameday-migration.sql` enables RLS but defines
permissive `FOR ALL USING (true) WITH CHECK (true)` policies for the original
Game Day tables. This P0 change deliberately does not rewrite those policies:
the web and bot use a service-role backend, and changing RLS without a
verified replacement could break public participant behavior.

The live Supabase REST API does not expose `pg_catalog.pg_policies` (a
read-only catalog query returned `Invalid schema: pg_catalog`), so the
environment cannot verify live policy text through the application
credentials. Before allowing direct client-side table access or taking an RLS
hardening pass, export the live policies read-only from the Supabase dashboard
and reconcile them with the source migration. The server-side authorization
boundary in this document remains required regardless of RLS state.

## What the Discord bot must change next

1. Add `discord_guild_id` to `#challenge-create` payloads, using the current
   Discord interaction’s guild ID.
2. Send `X-Discord-Guild-ID` on each of the guild-scoped operations above,
   including leaderboard and final-standings reads made by the bot.
3. Continue to use the returned `public_link` for participant-facing links;
   do not attach bot credentials to that link or to client-side requests.
4. Treat `400` as a missing/invalid guild scope and `403` as a room from a
   different guild or a room that is not Discord-owned. Do not retry either as
   another guild.