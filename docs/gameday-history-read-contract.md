# Game Day participant-history read contract

This is backend readiness for a future History UI, not a new public room browser.

## Routes

- `GET /api/gameday/my-history` returns `{ "records": [...] }`, newest created room first.
- `GET /api/gameday/my-history/:roomRef` returns `{ "record": ... }`; `roomRef` is a room UUID or `GDS-...` code.
- Both require a valid Supabase account bearer token. Missing/invalid authentication returns `401`. An unowned, unknown, non-Game-Day, or nonhistorical room returns the same `404` on the detail route.
- The list is built **only** from `gameday_participants.user_id = verifiedUser.id` and `is_guest = false`. It does not enumerate public or private rooms from the room table. Being a host, sharing a display name, possessing a guest token, or possessing a Discord participant link is not account participation.

Each record has `room` (ID/code/title, matchup, game date and created-at fallback, source/community context, sport/template, status, private/archive flags), `state`, `participant_count`, `participant`, `scoring`, `final_standings`, and ordered `cards`. Each card contains its phase/status and ordered props. Each prop contains its own submitted pick, one of `correct`/`incorrect`/`pending` outcomes when a pick exists, and confirmed answers **only when that prop is settled**. There are no host controls, guest credentials, Discord guild IDs, other participants' raw picks, or identity/session secrets.

`scoring.format` is `standard_game_day` or `madden_weekly_pick_card`. Standard Game Day gives 10 SP per correct submitted pick; equal scores share competition rank (1, 1, 3) and, when final, all tied first-place players are co-winners. Madden weekly uses its own main-matchup-only Perfect Card (`all_correct`) or Most Correct rule; bonus outcomes are separate and do not determine a main-card winner. Fantasy rooms are excluded and must use their existing league-authorized results. An unfamiliar custom scoring config returns `unsupported_custom`: picks and confirmed answers remain readable, but SP, winner, and final standings are withheld rather than guessed.

The existing public final-standings response also reports every co-winner in `winners`/`winner_participant_ids` and `tie: true`; its singular `winner` is `null` when multiple players tie rather than picking one arbitrarily.

## History and archive states

- A finalized room with **all required playable props settled** is `final`, with final standings where the format has a supported scoring rule.
- For finalized soccer, an unplayed penalties card with no submitted picks is an unused conditional phase, not a missing result. A penalties card with picks still needs settlement.
- A finalized room with unsettled required props is `results_pending`, with no final standings or declared winner. An active room with at least one settled playable prop is also `results_pending`; an active room with no settled prop is still a live room, not history.
- Archived rooms follow the same state rules. A verified account participant may read an eligible archived record through these routes, without restoring it. Existing public leaderboard/final-standings archive `410` behavior, host archive permissions, and live room views are unchanged. Archived active rooms with no settled results do not become historical results merely because they were archived.
- The routes never call join, guest claim, Discord-link issuance/redemption, room-code backfill, result-viewed telemetry, or host-data endpoints. A read does not write participants, picks, rooms, events, identity records, or sessions.

Room IDs/codes, matchup and date distinguish competitions with identical titles. No title-based deduplication or Discord/account/guest merge occurs. Discord-only participation remains outside account history until a separate, verified account association is explicitly designed and implemented.
