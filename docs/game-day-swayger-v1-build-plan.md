# Game Day Swayger V1 — Core Testable MVP Build Plan

> Updated: May 2026 — revised from initial draft to Phase 1 priority plan

---

## Product Summary

Game Day Swayger is a mobile-first private prediction room for friends watching NBA playoff games.

A host creates a Game Day Room, shares one link in a group chat, participants join as logged-in users or guests, make NBA picks during scheduled game moments, earn room-level Swayger Points for correct picks, see picks revealed after each card locks, and follow a leaderboard during the game.

**Positioning:** Keep your group chat. Use Swayger to track the picks, leaderboard, and receipts.

---

## Core MVP Hypothesis

> Will private friend groups return for structured pick moments during live NBA games?

The MVP only needs to prove:
1. People join quickly.
2. People submit picks quickly.
3. People care about reveal moments.
4. People check leaderboard movement.
5. Hosts can run rooms without too much friction.
6. People react to final standings.

---

## Phase 1 Build Priority (Core Testable Loop)

1. Admin creates a Game Day Room.
2. Host enters teams and star players.
3. Host selects props.
4. Participant joins as guest.
5. Participant submits picks.
6. Host locks card.
7. Picks reveal after lock.
8. Host settles props.
9. Leaderboard updates.

**Do not proceed to final standings polish, analytics polish, account CTA, guest claiming, or history until this core loop works.**

---

## V1 Scope

- Admin/host creates a private NBA Game Day Room
- Host enters actual team names and star player names
- Host selects 2–4 props per pick card from a preset NBA Playoff Template
- App generates one persistent room link
- Participants click the link and join the room
- Logged-in users enter directly if their session exists
- Logged-out users can either sign in/create account or continue as guest
- Guests enter a unique display name and can make picks without account creation
- Picks are grouped into three cards: Pregame, Halftime, 4Q Clutch
- Host manually opens and locks each card
- Participants can submit picks only while a card is open
- Everyone's picks are revealed only after the card locks
- Host manually settles props
- Correct picks are worth **10 Game Day SP** each
- Leaderboard updates when props are settled
- Final standings page added after the core loop works

---

## Critical Clarification: Game Day SP

For V1, Game Day SP is a **room-level score only**.

- Do NOT update the existing Swayger Points ledger, balances, escrow, or user wallet
- Correct picks earn 10 Game Day SP toward that room's leaderboard only
- Store/calculate Game Day SP separately from the main SP economy
- In the UI, label as "SP" to stay on brand — backend treats it as isolated scoring

---

## Critical Clarification: Admin/Host Access

- Only configured admins can create and host Game Day Rooms in V1
- Gating: `GAMEDAY_HOST_EMAILS` env var (comma-separated emails)
- Do NOT build a new role-management system
- Do NOT create a broad admin dashboard

---

## V1 Guardrails — Do NOT Build

- Full chat
- Real-money wagers or betting language
- Push/SMS notifications
- Sports data API integration
- Automated settlement
- AI-generated props
- WebSockets or complex real-time (polling is fine)
- Public room discovery
- Guest-account merge logic
- Advanced recap generation
- Multi-sport templates
- New role-management system
- Major changes to existing auth or SP economy

---

## State Model

**Room status:** `draft` | `active` | `final`

**Pick card status:** `closed` | `open` | `locked` | `settled`

**Prop status:** `pending` | `settled`

---

## Pick Cards

Three cards per room:
1. Pregame Picks
2. Halftime Picks
3. 4Q Clutch Picks

Host selects 2–4 active props per card from the NBA Playoff Template.
Recommended default: 9 total props (4 pregame, 3 halftime, 2 fourth).

---

## NBA Playoff Template

### Pregame Card Options
1. Who wins the game? → Team A / Team B
2. Who wins the 1st quarter? → Team A / Team B
3. Will either team lead by 10+ at any point? → Yes / No
4. Which team makes more threes? → Team A / Team B / Tie
5. Which star player scores more points? → Star A / Star B
6. Will the game be within 7 points with 2 minutes left? → Yes / No
7. Final margin? → 1–5 / 6–10 / 11–15 / 16+
8. Will there be a technical foul? → Yes / No

### Halftime Card Options
1. Does the halftime leader win the game? → Yes / No
2. Who wins the 3rd quarter? → Team A / Team B
3. Will the losing team cut the deficit to one possession? → Yes / No
4. Which team scores first in the 2nd half? → Team A / Team B
5. Which star player scores more in the 2nd half? → Star A / Star B
6. Will either team go on a 10–0 run in the 2nd half? → Yes / No

### 4Q Clutch Card Options
1. Who wins the 4th quarter? → Team A / Team B
2. Will the game be within 5 points in the final 2 minutes? → Yes / No
3. Will either team miss a clutch free throw? → Yes / No
4. Which team scores first in the 4th quarter? → Team A / Team B
5. Which star player scores more in the 4th quarter? → Star A / Star B
6. Will there be a lead change in the 4th quarter? → Yes / No
7. Who makes the biggest play? → Star A / Star B / Role player / Coach

### Recommended Default (9 props)
- Pregame: Who wins the game? / Who wins the 1st quarter? / Which star player scores more? / Will the game be within 7 points with 2 minutes left?
- Halftime: Does the halftime leader win? / Who wins the 3rd quarter? / Which star player scores more in the 2nd half?
- 4Q: Who wins the 4th quarter? / Will the game be within 5 points in the final 2 minutes?

---

## Scoring

- Correct pick = 10 Game Day SP
- Incorrect pick = 0 Game Day SP
- Tiebreaker = most correct 4Q picks
- If still tied = shared rank

Leaderboard shows: Rank / Display name / Current SP / Correct picks / Pending picks

---

## Pick Reveal Rules

- Participants should NOT see others' picks while the card is open
- After submitting: "Picks submitted. Picks reveal after this card locks."
- After host locks the card, reveal: each prop / who picked each answer / your own pick / status (pending or settled)
- **The reveal moment is the product.** Prioritize it.

---

## Data Models

### gameday_rooms
id, room_name, team_a_name, team_b_name, team_a_star, team_b_star, game_date, host_user_id, status, is_private, created_at, updated_at

### gameday_pick_cards
id, room_id, title, phase (pregame/halftime/fourth), status (closed/open/locked/settled), lock_label, display_order, created_at, updated_at

### gameday_props
id, card_id, question, answer_options (JSONB), correct_answer, status (pending/settled), display_order, created_at, updated_at

### gameday_participants
id, room_id, user_id (nullable), guest_session_id (nullable), display_name, is_guest, claimed_by_user_id (reserved for future), created_at, updated_at

### gameday_picks
id, prop_id, participant_id, selected_answer, is_correct (nullable), submitted_at

### gameday_final_standings (after core loop)
id, room_id, host_note, winner_participant_id, is_published, published_at, created_at, updated_at

### gameday_events
id, room_id, participant_id (nullable), user_id (nullable), event_type, metadata (JSONB), created_at

---

## API Routes (Express)

- `GET  /api/gameday/is-host` — check if current auth user is a host
- `GET  /api/gameday/template` — NBA playoff prop template
- `POST /api/gameday/rooms` — create room (host only)
- `GET  /api/gameday/rooms/:roomId` — room state (caller-aware, hides picks until locked)
- `POST /api/gameday/rooms/:roomId/join` — join as logged-in or guest
- `PATCH /api/gameday/cards/:cardId/open` — host opens card
- `PATCH /api/gameday/cards/:cardId/lock` — host locks card
- `POST /api/gameday/props/:propId/pick` — submit pick
- `PATCH /api/gameday/props/:propId/settle` — host settles prop
- `GET  /api/gameday/rooms/:roomId/leaderboard` — leaderboard

## Frontend Routes (Expo Router)

- `/gameday/create` — admin creates room
- `/gameday/:roomId` — participant view (includes join flow)
- `/gameday/:roomId/host` — host control room

---

## Security / Permissions

- Only host (GAMEDAY_HOST_EMAILS) can create rooms, open/lock cards, settle props
- Participants can only submit picks while a card is open
- Participants cannot change picks after card locks
- Participants cannot see others' picks until card locks
- Duplicate display names blocked within a room
- Private rooms accessible only by direct link (V1)
- Game Day SP does NOT touch the main SP economy

---

## Milestones

### M1: Architecture + data model ✓
SQL migration, NBA template, backend routes, frontend screens

### M2: Core loop validation
Run real test room with 5–8 people during an NBA playoff game

### M3: Final standings + basic analytics
Final standings view, editable host note, guest account CTA, shareable text

### M4: QA polish
Mobile responsiveness, error states, empty states, late joiner handling

---

## Final Acceptance Criteria — Core Loop

1. Log in as admin/host
2. Create a private NBA Game Day Room
3. Enter actual team and star player names
4. Select 2–4 props for at least one card
5. Share one persistent room link
6. Join that link as a guest
7. Submit picks
8. Lock the card as host
9. Reveal everyone's picks after lock
10. Settle props as host
11. See leaderboard update with 10 Game Day SP per correct pick
12. Confirm Game Day SP did NOT touch main SP ledger or user balance
13. Confirm existing Swayger functionality still works

---

## Final Reminder

Do not overbuild. The reveal moment is the product. The leaderboard reinforces it. The group chat distributes it. Everything else is supporting infrastructure.
