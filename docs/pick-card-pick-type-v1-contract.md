# Swayger Pick Card V1 — Winner and ATS contract

## Ownership and rollout

This document belongs to the Swayger app/backend repository. The Discord bot is
a separate repository. No bot code is changed by this feature.

The additive `supabase/gameday-pick-type-v1.sql` migration has been applied to the
connected Swayger Supabase database. The application must be published before the
external bot sends `pick_type: "spread"`; an older backend does not understand it.
The existing public-pick-event rollout flag is unchanged.

## Creation

`POST /api/gameday/rooms`

Bot headers:

```http
Authorization: Bearer <server-only GAMEDAY_BOT_API_KEY>
X-Discord-Guild-ID: <verified-guild-id>
Content-Type: application/json
```

Example request (IDs are placeholders, not real guild/channel IDs):

```json
{
  "room_name": "Franchise Week 4",
  "source": "discord",
  "sport": "madden",
  "template_type": "weekly_pick_card",
  "pick_type": "spread",
  "discord_guild_id": "<guild-id>",
  "discord_channel_id": "<channel-id>",
  "discord_user_id": "<commissioner-id>",
  "pick_deadline": "2026-12-01T01:00:00Z",
  "matchups": [
    {"team_a": "Giants", "team_b": "Cowboys", "line_text": "-6.5"},
    {"team_a": "Bears", "team_b": "Packers", "line_text": "PK"}
  ],
  "format_config": {
    "week_label": "Week 4",
    "reward_text": "League reward",
    "minimum_matchups": 1,
    "scoring_mode": "most_correct",
    "bonus": {
      "enabled": true,
      "game": {
        "team_a": "Patriots",
        "team_b": "Commanders",
        "line_text": "-10"
      },
      "total_prediction": {"enabled": true, "rule": "exact"}
    }
  }
}
```

All existing creation fields and deadline/manual-lock rules remain unchanged.
Success remains HTTP 200 with the existing response fields, plus top-level
`pick_type`. Public/host card data includes `cards[].pick_type`.

`pick_type` accepts only `straight_up` or `spread`. Omission defaults to
`straight_up` **and persists it**. Explicit null, empty strings, aliases such as
`ats`, numbers, or unsupported values return HTTP 400.

New commissioner-facing creation flows must explicitly choose Winner or Against
the Spread; the omission default is only backward compatibility. Paste/import
spread detection must never choose the mode.

This is separate from `format_config.scoring_mode`, whose existing API values stay
`all_correct` (Perfect Card) and `most_correct`. Do not send `perfect_card` as a
new scoring-mode value.

## Line rules

For `spread`, `line_text` is **Team B's spread**. Accepted strings are signed
integers, signed half-point values, or `PK` (case-insensitive). Whitespace around
the whole token is trimmed. An optional `.0` is accepted and canonicalized.

- `-6.5`: Team A +6.5, Team B -6.5.
- `+3.5`: Team A -3.5, Team B +3.5.
- `-10`: Team A +10, Team B -10.
- `PK`, `+0`, `-0`, `-0.0`: both display as PK; canonical stored line is `PK`.

Unsigned numeric strings, quarter points, embedded team names, arbitrary text,
exponents, NaN/infinity, internal whitespace/control characters, and values outside
the safe half-point numeric range are rejected. No number is extracted from text.
Every main matchup and enabled team-based Bonus Game requires a valid ATS line.
The legacy categorical bonus shape is not accepted on ATS cards.

For `straight_up`, optional contextual line text remains allowed, including
nonnumeric text, but never affects correctness or selection labels.

## Selections, identity and settlement

Options and persisted `selected_answer` remain bare team identities, e.g. `Giants`.
An ATS label such as `Giants +6.5` is presentation only. Never submit that label as
the answer. The existing pick endpoint, reload, Discord participant-link/session,
nickname snapshots, and legacy guest paths are unchanged.

Manual settlement remains `PATCH /api/gameday/props/:propId/settle` with
`{"correct_answer":"Giants"}` (or the existing correct-answer-list contract).
Winner selects the game winner; ATS selects the team the commissioner determines
covered. No automatic ATS results or push state is added. Integer spreads are
allowed; half-points are recommended. Pushes remain a commissioner/league-rule
decision, never an automatic both-correct or no-action result.

The existing exact-total Bonus Game prediction is unchanged and is not an
over/under market. Main-matchup scoring/winners remain separate from bonus outcomes.

## Versioned participation events

Fetch/ack endpoints and authentication are unchanged:

- `GET /api/gameday/bot/madden-participation-events`
- `POST /api/gameday/bot/madden-participation-events/:eventId/ack`

The response remains `{"ok":true,"events":[...]}`. Every existing event field is
preserved. New events add event-level `pick_type`; each two-team choice pick adds
`display_options`, an ordered array of `{value,label}` objects.

Complete example of a new public submitted event:

```json
{
  "id": "<event-uuid>",
  "event_type": "pick_card_picks_submitted",
  "pick_type": "spread",
  "room_id": "<room-uuid>",
  "card_id": "<card-uuid>",
  "participant_id": "<participant-uuid>",
  "room_code": "GDS-EXAMPLE",
  "room_name": "Franchise Week 4",
  "week_label": "Week 4",
  "discord_guild_id": "<guild-id>",
  "discord_channel_id": "<channel-id>",
  "participant_display_name": "Raiders",
  "completed_participant_count": 4,
  "submission_version": 1,
  "delivery_sequence": 123,
  "picks": [
    {
      "prop_id": "<prop-uuid>",
      "matchup_label": "Giants vs Cowboys",
      "prop_role": "main_matchup",
      "answer_type": "choice",
      "selected_option": "Giants",
      "numeric_prediction": null,
      "line_text": "-6.5",
      "display_order": 0,
      "display_options": [
        {"value": "Giants", "label": "Giants +6.5"},
        {"value": "Cowboys", "label": "Cowboys -6.5"}
      ]
    }
  ],
  "created_at": "<ISO timestamp>",
  "delivered_at": null
}
```

The same shape applies to `pick_card_picks_updated`. The existing `matchup_label`
and `selected_option` retain their original bare-team meaning. Select the entry
whose `value === selected_option` for the chosen display label; the other entry
is its opponent. This renders `picked Giants +6.5 over Cowboys -6.5` without text
parsing. Winner cards supply bare-team labels.

Numeric bonus-total items retain existing numeric fields and do not add
`display_options`. Historical events are not reconstructed or relabeled:
`pick_type` may be null/missing and `display_options` may be absent. Historical
`madden_picks_completed` events can still have `picks: null`. Old consumers can
ignore the additive fields. New consumers must tolerate those old shapes and must
not infer ATS from legacy `line_text`.

Labels and mode are captured by a BEFORE INSERT trigger inside the existing
atomic pick/outbox transaction. Fetch, identical retries and acknowledgement
never recompute them. Material pre-lock edits create a new version as before.
No identity credentials, one-time tokens, session hashes or session values are
added to events.

## Legacy/schema behavior

`gameday_pick_cards.pick_type` is nullable TEXT with a CHECK, not an enum.
Existing Madden Weekly cards are backfilled to `straight_up` regardless of line
text; unrelated formats stay NULL. A null/missing legacy Madden card reads as
Winner. Historical picks, resolved results, and line text are not rewritten.

## Required bot follow-up

1. Explicit Winner/ATS commissioner choice, independent of Win Condition.
2. Send top-level `pick_type` and canonical Team B lines on ATS matchups/Bonus Game.
3. Render versioned receipts using the new display-options snapshot when present.
4. Continue supporting historical completion-only and old public-pick events.
5. Keep all current guild isolation, private participant-link delivery, deduplication,
   successful-post acknowledgement, and secret-handling rules unchanged.
