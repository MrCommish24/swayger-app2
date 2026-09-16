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

## Madden participation activity outbox

Discord-created Madden `weekly_pick_card` rooms emit one durable
`madden_picks_completed` event per participant when all playable props have
valid saved picks. Events never contain selected teams, bonus answers, or
receipts.

Fetch pending events oldest-first:

```http
GET /api/gameday/bot/madden-participation-events?limit=50
x-api-key: <GAMEDAY_BOT_API_KEY>
X-Discord-Guild-ID: <guild ID>
```

The response is `{ "ok": true, "events": [...] }`. `limit` defaults to 50 and
is bounded from 1 through 100. Fetching does not acknowledge or reserve an
event. This is intentionally at-least-once: multiple fetchers or retries can
receive the same pending event until it is acknowledged. The bot must dedupe
posts by the stable event `id`.

Each event has this shape (and never has participant selections):

```json
{
  "id": "event UUID",
  "event_type": "madden_picks_completed",
  "room_id": "room UUID",
  "card_id": "card UUID",
  "participant_id": "participant UUID",
  "room_code": "GDS-ABC123",
  "room_name": "Week 4 Madden",
  "week_label": "Franchise Week 4",
  "discord_guild_id": "guild ID",
  "discord_channel_id": "channel ID",
  "participant_display_name": "Darius",
  "completed_participant_count": 4,
  "created_at": "2026-09-15T12:00:00.000Z",
  "delivered_at": null
}
```

Successful fetch returns HTTP `200`. Invalid credentials return `401`, missing
guild scope returns `400`, invalid limits return `400`, and a database schema
that has not been migrated returns `503` with code
`MADDEN_PARTICIPATION_SCHEMA_UNAVAILABLE`.

After the bot successfully posts the activity message, acknowledge one event:

```http
POST /api/gameday/bot/madden-participation-events/<eventId>/ack
x-api-key: <GAMEDAY_BOT_API_KEY>
X-Discord-Guild-ID: <guild ID>
```

Acknowledged events receive `delivered_at` and no longer appear in pending
fetches. A first successful acknowledgement returns HTTP `200` with:

```json
{
  "ok": true,
  "event": {
    "id": "event UUID",
    "delivered_at": "2026-09-15T12:01:00.000Z"
  }
}
```

Acknowledging the same event again is idempotent and returns HTTP `200` with:

```json
{
  "ok": true,
  "already": true,
  "delivered_at": "2026-09-15T12:01:00.000Z"
}
```

A cross-guild acknowledgement returns `403`; missing scope returns `400`;
invalid bot credentials return `401`; an unknown event returns `404`.

The event includes `room_id`, `card_id`, `room_code`, `room_name`,
`week_label`, `discord_guild_id`, `discord_channel_id`,
`participant_display_name`, `completed_participant_count`, and timestamps.
The bot can render a message such as “Darius is in. 4 players have made their
picks.” without access to any participant selections.

### Deployment order

Apply `supabase/gameday-madden-participation-events.sql` first and verify both
the table and `submit_madden_pick_with_activity` RPC exist. Only then deploy
the backend route build. The eligible Discord Madden pick route intentionally
uses the RPC transaction so a missing or failed RPC fails and rolls back the
pick; this is the safer exception to the normal best-effort outbox rule because
it prevents a permanently saved completion without its activity event.

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