# Discord Madden participant-link contract

## Scope

Swayger owns identity storage. Stable identity is `(discord_guild_id, discord_user_id)`;
the trusted guild display name is a label, never an identity key. No OAuth, account,
franchise picker, ownership claim, or bot database dependency is involved.

## Bot implementation contract

After a verified **guild** interaction, obtain the member's Discord user ID and
guild-specific display name. Do not take these from a browser, form, URL parameter,
or another user's input. The bot must validate the Discord interaction itself.

Call the existing Swayger API origin:

```http
POST /api/gameday/rooms/{roomId}/discord-participant-link
Authorization: Bearer <server-only GAMEDAY_BOT_API_KEY>
X-Discord-Guild-ID: <guild-id>
Content-Type: application/json
```

```json
{
  "discord_user_id": "123456789012345678",
  "discord_display_name": "Raiders"
}
```

IDs must be JSON strings of 1–32 digits (never numbers). Names are trimmed,
required, at most 100 characters, and cannot contain control characters.
The guild must own the Discord-created Madden `weekly_pick_card` room.
Its first card must be open, pre-deadline, and its room active and unarchived.

Success: HTTP **201**

```json
{
  "participant_url": "https://www.swayger.app/gameday/<roomId>?discord_token=<opaque-token>",
  "expires_at": "<ISO timestamp>",
  "expires_in_seconds": 600
}
```

Use the returned URL verbatim; its origin comes from the backend's configured app
URL. Deliver it **only ephemerally/privately** to the interacting member. Never log,
publicly post, or cache the personalized URL. The bot does not redeem the link.
Do not expose API credentials in embeds, custom IDs, browser requests, or URLs.
Each request replaces earlier pending links for the same identity and room.
Already-issued participant sessions are not revoked when a new link is requested.

Errors have `{ "error": "<human-readable text>", "code": "<stable code>" }`:

| HTTP | Code | Bot behavior |
|---|---|---|
| 400 | `invalid_request` | Fix missing/invalid room, guild, user, or display name. |
| 401 | `unauthorized` | Check backend bot credential configuration. |
| 403 | `guild_mismatch`, `ineligible_room` | Do not offer access; check room/guild association. |
| 404 | `room_not_found` | Inform member the card is unavailable. |
| 409 | `room_closed` | Inform member the card is closed/inactive. |
| 429 | `rate_limited` | Retry after 60 seconds (`Retry-After` header). |
| 503 | `identity_unavailable` | Temporary backend/schema issue; retry later. |

Rate limiting currently permits 10 requests per guild/user per minute per server
process. It is bounded in-memory throttling, not a distributed global quota.

## Browser redemption (Swayger responsibility)

```http
POST /api/gameday/discord-participant-link/redeem
Content-Type: application/json
```

```json
{ "token": "<opaque-token>", "room_id": "<expected-room-UUID>" }
```

`room_id` is optional in the API but the Swayger frontend supplies it. Success:

```json
{
  "participant": {
    "id": "<room-participant-UUID>",
    "room_id": "<room-UUID>",
    "display_name": "Raiders",
    "is_guest": true,
    "identity_provider": "discord"
  },
  "participant_session": "<different-opaque-credential>",
  "session_expires_at": "<ISO timestamp>"
}
```

The frontend scrubs `discord_token` from browser history, redeems once, stores the
returned credential under `gd_discord_session_<roomId>`, bypasses name entry, and
shows “You're picking as Raiders.” Browser storage uses localStorage; native
storage uses AsyncStorage. Session storage is subject to the same XSS concerns as
existing browser guest storage. No bot or Supabase service credential is involved.

Subsequent room reads/pick writes use:

```http
X-Gameday-Participant-Session: <participant_session>
```

This explicitly selected credential takes precedence over Supabase account/legacy
guest credentials. A bad/expired/cross-room credential fails closed; it does not
silently fall back to another participant. Sessions last 30 days. Multiple valid
sessions may exist for the same room participant, supporting return on another
device without logging out the first device.

Malformed/unknown tokens return 400 (`invalid_token`), wrong-room tokens return 400
(`wrong_room`), used tokens return 409 (`token_used`), and expired/replaced tokens
return 410 (`token_expired` / `token_revoked`). Closed rooms return 409
(`room_closed`). Invalid sessions return 401. Return the member to Discord for
a new link when needed; a lost redemption response requires a new link as well.

## Identity and history invariants

- Issuance updates the stable identity's latest observed name.
- First redemption in a room creates a participant with the link's name snapshot.
- Later redemptions in that room find the same participant and never rename it.
- A new weekly room creates its own participant with the newly observed name.
- Two Discord users can share exactly the same name.
- No matching/merging/renaming of historical guests occurs.
- Existing legacy room/name and account uniqueness remain in place for legacy rows.
- Discord membership departures do not automatically invalidate existing sessions.
- Links are intentionally bearer credentials: someone receiving a forwarded link
  can redeem it first. Short expiry and ephemeral delivery reduce, not remove, risk.
- Discord nickname governance remains the commissioner's responsibility.

## Database and rollout

Apply `supabase/gameday-discord-identity.sql` explicitly before publishing the
backend/frontend. It creates service-only identity, one-time-link, and session
tables; adds the participant identity FK and room/identity uniqueness; and replaces
the all-participant room/name constraint with the equivalent legacy-only index.
No existing participants or picks are rewritten. Private tables use RLS and no
browser-role grants; lifecycle RPCs are executable only by `service_role`.

The migration was applied to the connected Swayger Supabase project during this
implementation. Do not re-run its CREATE TABLE statements against that same schema.
No Discord bot changes or public participation-event rollout flag changes are part
of this feature. Publish the application before connecting the external bot to the
new endpoints.

Regression command: `npm run test:gameday:discord-identity`.
