# Swayger Fantasy — Final Architecture Validation

> **Status:** Final pre-build review. No code written, no migrations applied.
> Supersedes and revises `docs/swayger-fantasy-architecture.md` where noted.
>
> **Outcome: AUTHORIZE BUILD** — subject to three targeted revisions to the prior proposal.

---

## Table of Contents

1. [Executive Conclusion](#1-executive-conclusion)
2. [Season Standings Source-of-Truth Recommendation](#2-season-standings-source-of-truth-recommendation)
3. [Fantasy Team Modeling Recommendation](#3-fantasy-team-modeling-recommendation)
4. [Answer-Option Identity Recommendation](#4-answer-option-identity-recommendation)
5. [Identity-Claim Architecture](#5-identity-claim-architecture)
6. [Historical Member / Team Ownership Handling](#6-historical-member--team-ownership-handling)
7. [Immutable versus Correctable Data](#7-immutable-versus-correctable-data)
8. [Draft Day → Week 1 Simulation](#8-draft-day--week-1-simulation)
9. [Season-Long Draft Day Prop Lifecycle](#9-season-long-draft-day-prop-lifecycle)
10. [Point-Value Architecture](#10-point-value-architecture)
11. [Commissioner Scoring-Control Recommendation](#11-commissioner-scoring-control-recommendation)
12. [Reward Separation Confirmation](#12-reward-separation-confirmation)
13. [Future Provider Mapping](#13-future-provider-mapping)
14. [Sports-Agnostic Validation](#14-sports-agnostic-validation)
15. [Updated Domain / Data-Flow Diagram](#15-updated-domain--data-flow-diagram)
16. [Updated Build-Now / Fast-Follow / Defer Matrix](#16-updated-build-now--fast-follow--defer-matrix)
17. [Migration and Regression Changes from Prior Proposal](#17-migration-and-regression-changes-from-prior-proposal)
18. [Answers to the 12 Final Go/No-Go Questions](#18-answers-to-the-12-final-gono-go-questions)
19. [Final Recommendation](#19-final-recommendation)

---

## 1. Executive Conclusion

The overall architecture from the prior assessment is sound and authorized. However, this review uncovered **three meaningful issues** that must be resolved before implementation begins — all arising from precise codebase inspection rather than theoretical concern.

### Issue 1 — `fantasy_season_scores` as a write target is wrong

The prior proposal created a persistent accumulated-score table updated on every settlement. For an 8–14 member league, computed/derived season standings are trivially fast and categorically more correct. The table should be removed as a write target and replaced with a derived query. Corrections, re-settlements, and incomplete seasons are all handled automatically with zero risk of drift.

### Issue 2 — The settle route explicitly blocks finalized rooms

Confirmed from codebase: `PATCH /api/gameday/props/:id/settle` returns `400` when `room.status === 'finalized'`. Season-long Draft Day props live in a finalized room. Without a targeted change to this route (allow settlement when `scoring_scope = 'season'`), commissioners cannot settle "Who wins the league?" without reopening Draft Day — which we explicitly do not want. This requires a one-line condition change.

### Issue 3 — The leaderboard does not filter by scoring scope

Confirmed from codebase: the leaderboard and final-standings routes query only `gameday_picks.is_correct` with no join to `gameday_props`. When a season-long prop eventually settles months after Draft Day, `is_correct` updates on those picks — and anyone viewing the Draft Day leaderboard will see different scores and a potentially different "Draft Day Champion." The Draft Day winner computation must filter by `scoring_scope = 'competition'`.

### Structural revisions from prior proposal

| Change | Prior proposal | Revised |
|---|---|---|
| Season standings | Persisted `fantasy_season_scores` write target | Derived query from underlying picks; no persistent write target |
| Fantasy teams | `team_name TEXT` on `fantasy_league_members` | First-class `fantasy_teams` table — build now |
| Identity claiming | `guest_session_id UNIQUE` on `fantasy_league_members` | `fantasy_member_claims` table |
| `gameday_participants` | No snapshot of team name | Add `team_name TEXT` snapshot column |
| Answer options | Plain strings for all props | Structured JSONB objects for Fantasy props; strings unchanged for Game Day |
| Settle route | Described as working for season props | Requires code change: permit settlement in finalized rooms when `scoring_scope='season'` |
| Leaderboard | Described as correct | Requires scope filter join: Draft Day winner uses `scoring_scope='competition'` picks only |

No additional tables, no new complex systems. All seven revisions are additive or targeted single-point changes.

---

## 2. Season Standings Source-of-Truth Recommendation

### Recommendation: Option B — Derived standings

**The `fantasy_season_scores` table from the prior proposal should be eliminated as a write target.**

### Source of truth

The authoritative records are:

```
gameday_picks.is_correct          — did this pick score?
gameday_props.point_value         — how many points was it worth?
gameday_props.scoring_scope       — competition or season?
gameday_props.status              — only settled props produce scores
gameday_participants.league_member_id  — which league member made this pick?
gameday_rooms.league_id           — which league does this competition belong to?
gameday_rooms.status              — optional: restrict to finalized competitions
```

Season standings query (conceptual):

```sql
SELECT
  flm.id            AS league_member_id,
  flm.display_name,
  SUM(gpr.point_value)
    FILTER (WHERE gpk.is_correct = true AND gpr.status = 'settled')
                    AS season_points
FROM fantasy_league_members flm
JOIN gameday_participants  gap  ON gap.league_member_id = flm.id
JOIN gameday_rooms         gr   ON gr.id = gap.room_id
                               AND gr.league_id = flm.league_id
                               AND gr.experience_type = 'fantasy'
JOIN gameday_picks         gpk  ON gpk.participant_id = gap.id
JOIN gameday_props         gpr  ON gpr.id = gpk.prop_id
WHERE flm.league_id = $league_id
GROUP BY flm.id, flm.display_name
ORDER BY season_points DESC;
```

### How each concern is handled

| Concern | Outcome |
|---|---|
| Prop re-settled (correct answer changed) | `is_correct` updates on picks automatically; next season-standings query reflects the new result. No delta tracking needed. |
| Settlement corrected after finalization | Same — correction writes new `is_correct` values; derived standings pick it up immediately. |
| Double-counting | Impossible — picks are rows, not balances. The same pick row cannot be counted twice in an aggregate. |
| Competition reopened | No season-standings migration needed; the query simply reads whatever the current pick state is. |
| Season-long Draft Day prop settles | `gameday_props.status` becomes `'settled'`, `is_correct` updates; next season-standings query includes those points automatically. |
| Historical standings reconstructed | Yes — always. The query runs against append-only source records. There is no derived cache to go stale. |
| Finalization required before points count | Flexible. You can require `gr.status = 'finalized'` in the query to count only finalized competition points, or omit the filter to count all settled props. For MVP, require finalization. Season-long props are exempt since they live in finalized rooms. |

### Performance impact

For a normal 8–14 member fantasy league over a 17-week season:

- ~15 competitions × 12 members × 12 props average = ~2,160 picks total
- Season standings query touches roughly 2,160 rows across 5 tables with indexed joins
- This is orders of magnitude smaller than a typical social-media query
- Response time: single-digit milliseconds
- No materialized view, no caching, no `fantasy_season_scores` table required at any point this season

If a league ever reached the size where this mattered (hundreds of members, hundreds of competitions), a Postgres materialized view could be added without changing any application code or schema. That decision can wait years.

---

## 3. Fantasy Team Modeling Recommendation

### Recommendation: Option B — Create `fantasy_teams` as a first-class table now

Keeping `team_name TEXT` on `fantasy_league_members` creates immediate rework when Week 1 arrives. Weekly props targeting the fantasy team — "Which team scores the most?", "Which team wins by the largest margin?" — require a stable `fantasy_team_id` as the answer target. Without a first-class table, the answer option is a fragile display string with no stable reference.

### Why it cannot wait

The answer-option architecture (Section 4) establishes that Fantasy props will store structured answer objects with `id` fields. For team-target props, that `id` must reference a `fantasy_teams` row. If `fantasy_teams` is not created until Week 1, the answer options for Draft Day team props have no stable reference — meaning either:
- Draft Day launches with fragile strings for team props (wrong), or
- Draft Day avoids team-target props entirely (limits the product), or
- A migration backfills `fantasy_teams` from `fantasy_league_members.team_name` and re-links all answer options created at Draft Day (avoidable rework)

### Recommended schema

```sql
CREATE TABLE fantasy_teams (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id            UUID        NOT NULL REFERENCES fantasy_leagues(id) ON DELETE CASCADE,
  team_name            TEXT        NOT NULL,
  current_manager_id   UUID        REFERENCES fantasy_league_members(id) ON DELETE SET NULL,
  -- Co-manager (MVP: one; full co-manager table can wait)
  co_manager_id        UUID        REFERENCES fantasy_league_members(id) ON DELETE SET NULL,
  -- Future provider import
  external_team_id     TEXT,
  is_active            BOOLEAN     NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, team_name)
);
```

`fantasy_league_members` retains a `current_team_id` FK pointing to their team:

```sql
ALTER TABLE fantasy_league_members
  ADD COLUMN current_team_id UUID REFERENCES fantasy_teams(id) ON DELETE SET NULL;
-- Remove team_name TEXT from fantasy_league_members (it moves to fantasy_teams)
```

### Addressing each concern

**Team identity vs manager identity:** Separate. A prop asks "Who makes the biggest reach?" → targets `fantasy_league_member_id` ("Darius"). A prop asks "Which team scores the most?" → targets `fantasy_team_id` ("The Monstars"). The `answer_target_type` field on the prop distinguishes which to use.

**Team name changes:** Update `fantasy_teams.team_name`. Historical pick receipts are unaffected because `gameday_participants.team_name` is snapshotted at join time (see Section 6).

**Team ownership changes:** Update `fantasy_teams.current_manager_id`. Historical picks remain attributed to the original `gameday_participants` row with the original snapshot. The team entity persists.

**Co-managers:** `co_manager_id` on `fantasy_teams` handles the common case (two managers per team). Full co-manager junction tables wait until needed.

**Future platform imports:** Sleeper, Yahoo, and ESPN all expose distinct team and manager IDs. `fantasy_teams.external_team_id` and `fantasy_league_members.external_member_id` hold these separately, mapping correctly to the canonical model.

**Weekly team-target props:** `fantasy_team_id` is available from Day 1. Week 1 answer options for team-target props reference real `fantasy_teams` rows.

**Historical results:** Preserved via snapshotted `team_name` on `gameday_participants` (Section 6).

---

## 4. Answer-Option Identity Recommendation

### Recommendation: Option B — Structured answer objects for Fantasy props; plain strings unchanged for Game Day

### The problem with plain strings for Fantasy

Settlement uses `correct_answer TEXT` validated against `answer_options`. If a commissioner renames "Darius" to "D-Ro" after picks are locked, re-settlement of a prop whose `answer_options` contained "Darius" would fail — `"D-Ro"` is no longer in the options. More importantly, there is no machine-readable way to say "this pick targeted league member `abc123`" without an ID underneath the label.

### The format

For **Game Day props** (`experience_type = 'game_day'`): `answer_options` remains a plain JSON string array — `["string1", "string2"]`. Zero change. Zero backward-compatibility risk.

For **Fantasy props** (`experience_type = 'fantasy'`): `answer_options` stores structured objects:

```json
[
  { "id": "member-uuid-darius", "label": "Darius",        "type": "league_member" },
  { "id": "member-uuid-chris",  "label": "Chris",         "type": "league_member" },
  { "id": "team-uuid-monstars", "label": "The Monstars",  "type": "fantasy_team"  },
  { "id": "player-qb-1",        "label": "Patrick Mahomes","type": "player"        },
  { "id": "yes",                 "label": "Yes",           "type": "yes_no"        },
  { "id": "no",                  "label": "No",            "type": "yes_no"        }
]
```

`correct_answer` stores the **`id`** field, not the label.  
`gameday_picks.selected_answer` stores the **`id`** field, not the label.

### How each concern is handled

| Concern | Outcome |
|---|---|
| Commissioner renames "Darius" to "D-Ro" | `fantasy_league_members.display_name` updates. Answer option `label` updates on future rooms. Historical answer options (already in `gameday_props.answer_options`) retain the old label but the `id` still points to the correct member. The settlement still matches by `id`. Historical receipts show the name at the time of the pick (snapshotted on participant). |
| Commissioner renames a fantasy team | Same pattern — `fantasy_teams.team_name` updates; historical answer-option objects retain the label at creation time but the `id` remains correct. |
| Commissioner fixes a typo in an answer option | Admin can update `gameday_props.answer_options` label for a specific prop before picks are locked. The `id` does not change. |
| Historical receipts | A pick stores `selected_answer = 'member-uuid-darius'`. Display resolves the label from the answer-option object stored on the prop at pick time. The prop itself retains its full `answer_options` JSONB including labels — the label on the pick receipt never changes. |
| Settlement | `correct_answer = 'member-uuid-darius'`. `settlePropCore` validates membership in `answer_options` by checking `option.id` values. No label comparison. |
| Existing Game Day compatibility | Not affected. Game Day props remain plain strings. The system detects format by `experience_type` or by whether `answer_options[0]` is a string or object. |
| Global settlement compatibility | The normalization/grouping system in `server/gameday-normalize.ts` already uses `group_key` and canonical answer normalization. For Fantasy, the canonical answer is the structured `id`. No conflict. |
| Future provider imports | When a Sleeper import provides a league member, the `id` in answer options is the Swayger `fantasy_league_member_id` — not the Sleeper ID. The import step resolves Sleeper IDs to Swayger IDs during population. |
| Manually entered players | `{ "id": "player-text-mahomes", "label": "Patrick Mahomes", "type": "player" }`. The `id` can be a stable slug or UUID generated at prop creation. No external player database required for MVP. |
| Yes/no and static text | `{ "id": "yes", "label": "Yes", "type": "yes_no" }`. The `id` is simply the canonical value. No entity reference needed. |

### Format detection

The server detects which format to use during settlement validation:

```
if answer_options[0] is an object → Fantasy format: validate correct_answer against option.id values
if answer_options[0] is a string  → Game Day format: validate correct_answer against string values (existing behavior)
```

This is a single conditional in the pick-submission and settlement validation paths.

---

## 5. Identity-Claim Architecture

### Recommendation: Add `fantasy_member_claims` as a separate table

The prior proposal stored `guest_session_id UNIQUE` directly on `fantasy_league_members`. This breaks on all multi-league and multi-device scenarios.

### The problem

- A person in two different Swayger Fantasy leagues would need two `fantasy_league_members` rows (one per league). The same `guest_session_id` can only appear once across the whole table due to the UNIQUE constraint — meaning the same device cannot claim membership in two leagues simultaneously.
- Device replacement means the `guest_session_id` stored on the member row is permanently orphaned with no recovery path.
- An authenticated user joining from phone and laptop has two different sessions and no way to merge them.

### The revised model

```sql
CREATE TABLE fantasy_member_claims (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_member_id  UUID        NOT NULL REFERENCES fantasy_league_members(id) ON DELETE CASCADE,
  -- Exactly one of the following is populated:
  user_id           UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_token       TEXT,       -- durable device token (AsyncStorage, not a session UUID)
  --
  claimed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  CONSTRAINT one_claim_type CHECK (
    (user_id IS NOT NULL AND guest_token IS NULL) OR
    (user_id IS NULL AND guest_token IS NOT NULL)
  ),
  UNIQUE (league_member_id, user_id),       -- one auth claim per member per league
  UNIQUE (league_member_id, guest_token)    -- one guest-device claim per member per league
);
```

`fantasy_league_members` loses `guest_session_id`. The member row is just the roster record.

### The guest token

The `guest_token` is **not** the existing `x-guest-session` session UUID used by `gameday_participants`. It is a new durable token generated once per device install and stored in `AsyncStorage`. It survives app restarts and is longer-lived than a session. For MVP, it can be a UUID generated on first app launch.

### How each scenario resolves

| Scenario | Outcome |
|---|---|
| Same person in two leagues | Two `fantasy_league_members` rows (one per league). Two `fantasy_member_claims` rows pointing to the same `user_id`. No conflict — the UNIQUE constraint is per `(league_member_id, user_id)`, not global. |
| Same guest device in two leagues | Two `fantasy_member_claims` rows with the same `guest_token` but different `league_member_id`. No conflict — UNIQUE is per `(league_member_id, guest_token)`. |
| Joins Draft Day on phone, Week 1 on laptop (authenticated) | Same `user_id` on both devices → same claim → same `league_member_id`. Auto-recognized on Week 1. |
| Joins Draft Day on phone, Week 1 on laptop (guest) | Different devices = different `guest_token`. Week 1 shows "Who are you?" again for guest users on new devices. Acceptable — authenticated accounts solve this cleanly. Commissioners can note this tradeoff in the league invitation. |
| Guest converts to authenticated | Commissioner or admin: mark the old `fantasy_member_claims` row `is_active = false`; insert a new claim with `user_id` populated. The `league_member_id` is unchanged — all pick history intact. |
| Member replaces phone (guest) | New device = new `guest_token`. Commissioner or admin: deactivate old claim, create new claim with the new token. |
| Commissioner resets a bad claim | `UPDATE fantasy_member_claims SET is_active = false WHERE league_member_id = $id` — next open member can be re-claimed. |
| Duplicate claim prevention | INSERT into `fantasy_member_claims` validates the `league_member_id` is not already claimed by a different session. A unique per-member check (not a table-level constraint) returns a conflict response if already claimed by a different user. |
| Week 1 auto-recognition | On opening Week 1, the client sends its `user_id` (via JWT) or `guest_token` (via AsyncStorage). Server queries `fantasy_member_claims` for a matching active claim in this league → finds `league_member_id` → finds the pre-generated `gameday_participants` row → user is auto-recognized. |

### Relationship between identity concepts

```
auth.users (Supabase auth)
  ↓ (optional — if authenticated)
fantasy_member_claims
  ↓
fantasy_league_members    ← the persistent roster record
  ↓
gameday_participants       ← per-competition participation (league_member_id FK)
  ↓
gameday_picks             ← individual predictions
```

The three layers are deliberately separate:
- **`auth.users`**: Swayger account identity — optional
- **`fantasy_league_members`**: League roster identity — required for Fantasy
- **`gameday_participants`**: Event participation — one per competition per member

---

## 6. Historical Member / Team Ownership Handling

### Snapshot-on-join prevents retroactive mutation

`gameday_participants` already stores `display_name` at join time. This is the correct pattern. The historical record is the participant row, not the current member row. Extend this:

```sql
ALTER TABLE gameday_participants
  ADD COLUMN team_name TEXT;   -- snapshotted from fantasy_teams.team_name at join time
```

When a `gameday_participants` row is created (either by a member joining, or auto-generated for Week 1), the server copies `fantasy_teams.team_name` at that moment into `gameday_participants.team_name`. This column never changes.

### What can safely be edited (live data, no history risk)

| Field | Who can edit | Risk |
|---|---|---|
| `fantasy_leagues.league_name` | Commissioner | None — not stored on historical records |
| `fantasy_leagues.default_reward_description` | Commissioner | None — display only |
| `fantasy_league_members.display_name` | Commissioner (with care) | Safe — historical participant rows have their own `display_name` snapshot |
| `fantasy_teams.team_name` | Commissioner | Safe — historical participant rows have `team_name` snapshot |
| `fantasy_teams.current_manager_id` | Commissioner | Safe — ownership changes without touching historical picks |
| `gameday_props.correct_answer` (re-settlement) | Admin; commissioner pre-lock | Season standings auto-recalculate from underlying picks |

### What should NOT be edited after picks are locked

| Field | Reason |
|---|---|
| `gameday_props.answer_options` | Changing options after picks are submitted would invalidate existing picks |
| `gameday_props.point_value` | Changing point value after picks would alter the scoring contract members accepted |
| `gameday_props.scoring_scope` | Changing scope after finalization would alter season standings retroactively |

These fields are locked at pick-submission time in practice. The server should reject edits to these fields on props that have any picks submitted — this is an existing-pattern enforcement, not a new concept.

### Team ownership changes mid-season

When Chris takes over "The Monstars" from Mike in Week 7:
1. `fantasy_teams.current_manager_id` is updated to Chris's `fantasy_league_members.id`
2. Chris's `fantasy_league_members.current_team_id` is updated to point to The Monstars
3. Mike's `fantasy_league_members.current_team_id` is set to null (or a new team if he picks up another)
4. Week 1–6 `gameday_participants` rows for Mike retain his `display_name` and the snapshotted `team_name = 'The Monstars'` — historical receipts are accurate
5. Week 7+ `gameday_participants` rows for Chris will snapshot `team_name = 'The Monstars'` — future receipts are accurate
6. No migration, no history mutation, no complex versioning needed

---

## 7. Immutable versus Correctable Data

### Competition lifecycle states

No new states beyond what exists today. The existing `gameday_rooms.status` values (`active`, `finalized`, `archived`) are sufficient. "Published/open/locked/partially settled" are card and prop states, not room states.

```
active     → Props being settled, cards open/locked, picks flowing
finalized  → Draft Day/weekly winner declared; competition-scope scoring frozen
archived   → Soft-deleted; hidden from active views
```

### Immutability rules

| Record | After finalization | Who can correct |
|---|---|---|
| `gameday_picks.selected_answer` | Immutable | No one — the pick is the member's record |
| `gameday_picks.is_correct` | Correctable (via prop re-settlement) | Admin; commissioner via re-settle |
| `gameday_props.correct_answer` | Correctable | Admin; commissioner via re-settle |
| `gameday_props.point_value` | Immutable after any picks submitted | No one |
| `gameday_props.scoring_scope` | Immutable after finalization | Admin only, with care |
| `gameday_props.answer_options` | Immutable after any picks submitted | No one |
| `gameday_participants.display_name` | Immutable | No one — it's a snapshot |
| `gameday_participants.team_name` | Immutable | No one — it's a snapshot |
| `fantasy_league_members.display_name` | Correctable | Commissioner |
| `fantasy_teams.team_name` | Correctable | Commissioner |
| `fantasy_teams.current_manager_id` | Correctable | Commissioner |
| `gameday_rooms.status` (reopen) | Not recommended | Admin only, if truly necessary |
| Competition reward fields | Correctable | Commissioner — display-only |

### Corrections after finalization

**For prop re-settlement (the common case):**
1. Admin or commissioner re-settles the prop via the settle route
2. `settlePropCore` updates `gameday_props.correct_answer` and re-scores all picks (`is_correct`)
3. Season standings are derived — they automatically reflect the correction on next query
4. The existing `logEvent` call records the re-settlement in the audit log with the new correct answer
5. **No reopening of the room is required. No migration. No double-counting.**

**Does a finalized competition need to be reopened?** No. The settle route check for finalized rooms is the blocker, not a conceptual requirement. The fix (Section 9) allows settlement of `scoring_scope='season'` props and allows admin re-settlement of any prop regardless of room status. Competition-scope props can be re-settled by admins even in finalized rooms when corrections are needed.

**Audit:** The existing `logEvent` pattern is sufficient. Each settlement (and re-settlement) writes an event. No new audit infrastructure needed.

---

## 8. Draft Day → Week 1 Simulation

### Commissioner creates "Sunday Smoke" on Draft Day

**Records created:**

```
fantasy_leagues
  id:           league-1
  league_name:  "Sunday Smoke"
  sport:        "football"
  season_year:  2026
  commissioner_user_id: user-commissioner

fantasy_league_members (12 rows)
  { id: member-1, league_id: league-1, display_name: "Darius",  current_team_id: team-1 }
  { id: member-2, league_id: league-1, display_name: "Mike",    current_team_id: team-2 }
  { id: member-3, league_id: league-1, display_name: "Chris",   current_team_id: team-3 }
  ... (9 more)

fantasy_teams (12 rows)
  { id: team-1, league_id: league-1, team_name: "The Monstars",   current_manager_id: member-1 }
  { id: team-2, league_id: league-1, team_name: "Team Mike",      current_manager_id: member-2 }
  { id: team-3, league_id: league-1, team_name: "Sunday Scaries", current_manager_id: member-3 }
  ... (9 more)

gameday_rooms (Draft Day competition)
  id:               room-dd
  league_id:        league-1
  experience_type:  "fantasy"
  competition_type: "draft_day"
  sport:            "football"
  room_name:        "Sunday Smoke — Draft Day 2026"
  status:           "active"
```

**Members claim identities:**

```
fantasy_member_claims
  { league_member_id: member-1, user_id: user-darius, is_active: true }   ← authenticated
  { league_member_id: member-2, guest_token: "device-abc", is_active: true } ← guest

gameday_participants (12 rows, created at join time)
  { room_id: room-dd, league_member_id: member-1,
    display_name: "Darius", team_name: "The Monstars" }   ← both snapshotted
  { room_id: room-dd, league_member_id: member-2,
    display_name: "Mike",   team_name: "Team Mike" }
  ...
```

**Draft Day completes:**

```
gameday_props (Draft Day props — mix of scopes):
  { question: "Who drafts the first QB?",  scoring_scope: "competition", status: "settled",
    correct_answer: "member-1",  point_value: 10 }
  { question: "Who wins the league?",      scoring_scope: "season",      status: "pending",
    correct_answer: null,        point_value: 30 }

gameday_rooms (after finalization):
  status: "finalized"
```

Draft Day champion is declared from `scoring_scope='competition'` settled picks only. Season-long picks show as "pending — resolves end of season."

---

### Commissioner creates Week 1 — the next day

**What the commissioner does:** Opens "Sunday Smoke" → taps "Create Week 1 Swayger."

**What the server reads:**

```sql
-- League still exists — no action needed
SELECT * FROM fantasy_leagues WHERE id = 'league-1';

-- Full roster — no re-entry needed
SELECT flm.*, ft.team_name
FROM fantasy_league_members flm
LEFT JOIN fantasy_teams ft ON ft.id = flm.current_team_id
WHERE flm.league_id = 'league-1' AND flm.is_active = true;
-- Returns all 12 members with team names
```

**What the server creates:**

```
gameday_rooms (Week 1 competition)
  id:               room-w1
  league_id:        league-1
  experience_type:  "fantasy"
  competition_type: "weekly"
  sport:            "football"
  room_name:        "Sunday Smoke — Week 1"
  status:           "active"

gameday_participants (12 rows, auto-generated from roster)
  { room_id: room-w1, league_member_id: member-1,
    display_name: "Darius", team_name: "The Monstars" }  ← from current league roster
  { room_id: room-w1, league_member_id: member-2,
    display_name: "Mike",   team_name: "Team Mike" }
  ...

gameday_props (Week 1 props, answer options auto-populated):
  { question: "Which team scores the most?",
    answer_options: [
      { "id": "team-1", "label": "The Monstars",   "type": "fantasy_team" },
      { "id": "team-2", "label": "Team Mike",       "type": "fantasy_team" },
      { "id": "team-3", "label": "Sunday Scaries",  "type": "fantasy_team" },
      ...
    ],
    scoring_scope: "competition", point_value: 10 }
```

**When members open Week 1:**

```
Client sends: Authorization: Bearer <jwt>  (Darius, authenticated)
Server queries: SELECT * FROM fantasy_member_claims
                WHERE user_id = 'user-darius' AND is_active = true
                  AND league_member_id IN (
                    SELECT id FROM fantasy_league_members WHERE league_id = 'league-1'
                  )
→ Finds: league_member_id = member-1
→ Finds: gameday_participants row for room-w1 with league_member_id = member-1
→ Auto-recognized. No "Who are you?" prompt.
```

**What requires zero action from the commissioner or members:**
- League identity ✓
- Member roster ✓
- Team names ✓
- Identity claims ✓
- Answer option population for member/team props ✓
- Season standings accumulation ✓

**What Draft Day code, schema, or records would need to be undone for Week 1: none.**

---

## 9. Season-Long Draft Day Prop Lifecycle

**Example: "Who will win the fantasy championship?" — created at Draft Day, settled at Week 17.**

### Complete lifecycle

| Stage | What happens | DB state |
|---|---|---|
| Commissioner creates Draft Day | Prop created with `scoring_scope='season'`, `point_value=30`, `status='pending'` | `gameday_props` row created; card locked |
| Members make picks | `gameday_picks` rows created; `is_correct = null` | Picks stored; `is_correct` null |
| Draft Day finalized | `gameday_rooms.status = 'finalized'` | Season-long prop still `status='pending'` — no action needed |
| Draft Day Champion declared | Leaderboard filters `scoring_scope='competition'` picks only; season prop contributes 0 | Winner correct |
| Weeks 1–16 | Prop visible in participant's pick history as "Season Prediction — pending" | No change to the prop row |
| Week 17 Championship | Commissioner opens host panel for the Draft Day room (or admin uses admin panel) → settles "Who wins the league?" | `correct_answer` set; `is_correct` scored on all picks |
| Season standings update | Next query of the derived season-standings function returns updated totals | No write needed |
| Historical Draft Day receipt | The prop now shows "Chris — Sunday Scaries — 30 pts ✓" (or wrong) in participant's Draft Day history | `is_correct` updated in place |

### The critical blocker — confirmed and resolved

**Confirmed from code:** `PATCH /api/gameday/props/:id/settle` at `server/routes-gameday.ts:1610–1613` returns `400` when `room.status === 'finalized'`. Without a change, a season-long prop in a finalized Draft Day room cannot be settled through the host panel.

**Required code change (one condition):**

```typescript
// Current (blocks all settlement in finalized rooms):
if (gdRoom?.status === "finalized") {
  return res.status(400).json({ error: "Room is finalized" });
}

// Revised (permits settlement of season-scope props in finalized rooms):
const isSeason = gdProp?.scoring_scope === "season";
if (gdRoom?.status === "finalized" && !isSeason) {
  return res.status(400).json({ error: "Room is finalized" });
}
```

This is the only code change required. `settlePropCore` itself has no room-status checks and handles the settlement correctly.

**Does settling a season-long prop require reopening Draft Day?** No. The room status stays `'finalized'`. Only the prop row and associated picks are updated.

### The leaderboard scope issue — confirmed and resolved

**Confirmed from code:** The leaderboard and final-standings routes query only `gameday_picks` with no join to `gameday_props`. When a season-long prop eventually settles, `is_correct` updates on those picks — and anyone viewing the Draft Day room's leaderboard will see different scores and potentially a different "Draft Day Champion."

**Required query change:** Both routes must join `gameday_props` and filter by `scoring_scope = 'competition'` when computing competition-level scores. The full-season `is_correct` data remains in the picks table and feeds the derived season-standings query.

Competition leaderboard logic (revised):

```sql
-- Only competition-scope settled props count toward the competition winner
SELECT
  p.participant_id,
  SUM(pr.point_value) FILTER (WHERE pk.is_correct = true) AS competition_points,
  COUNT(*) FILTER (WHERE pk.is_correct IS NULL)            AS pending_picks,
  COUNT(*)                                                  AS total_picks
FROM gameday_picks pk
JOIN gameday_props pr ON pr.id = pk.prop_id
WHERE pk.participant_id = ANY($participantIds)
  AND pr.scoring_scope = 'competition'
GROUP BY pk.participant_id;
```

Season-long picks (pending or eventually settled) appear separately in the participant's receipt as "Season Predictions."

---

## 10. Point-Value Architecture

**Confirmed: `point_value` on `gameday_props` is snapshotted at room creation.**

The template's current `point_value` is copied into the competition prop row when the room is created. Later admin edits to `gameday_prop_library.point_value` have no effect on any prop already created.

| Rule | Outcome |
|---|---|
| Template value copied at room creation | ✓ Scoring honors the original contract |
| Template edited after room creation | No effect on existing props |
| Commissioner changes `point_value` after picks submitted | Prohibited — server rejects if any picks exist on the prop |
| Scoring reads from | `gameday_props.point_value` always — never the template |
| Draft Day champion uses | `SUM(point_value) WHERE is_correct = true AND scoring_scope = 'competition'` |
| Season standings uses | `SUM(point_value) WHERE is_correct = true` across all competitions |

---

## 11. Commissioner Scoring-Control Recommendation

### Recommendation: Option B — Swayger defines point values; commissioners cannot change them

### Rationale

If commissioners can freely set point values, three problems emerge immediately:

1. **Fairness within the league:** A commissioner who sets "Who wins the league?" to 200 points makes that single prop worth more than all other props combined. Members who pick correctly gain a huge windfall; those who don't are permanently disadvantaged.

2. **Season standings consistency:** When season standings accumulate across multiple competitions, non-standard point values from one competition distort the entire season arc. A Week 1 with 100-point props and a Week 10 with 10-point props makes Week 10 effectively irrelevant.

3. **Automated weekly props:** Future automated prop generation needs a predictable point-value system to produce coherent weekly competitions without commissioner intervention.

### Implementation

Swayger admins define `point_value` on `gameday_prop_library` templates. Standard values by category:

| Category | Default `point_value` |
|---|---|
| Standard competition prop | 10 |
| Featured prop | 20 |
| Season-long prediction | 30 |

Commissioners select props from the template library. The point value is shown on each template so they understand the weight. It copies into the competition prop at room creation and cannot be edited. Commissioners choose which props to include — that is their form of "weighting" the competition.

---

## 12. Reward Separation Confirmation

**Reward metadata is display-only. It has zero connection to scoring, standings, or winner determination.**

```
fantasy_leagues.default_reward_description    TEXT  -- "Weekly winner receives $25"
fantasy_leagues.default_reward_amount_display TEXT  -- "$25"
gameday_rooms.reward_description              TEXT  -- competition-level override
gameday_rooms.reward_amount_display           TEXT  -- "$50" for championship
```

A commissioner changing `"$25"` to `"$50"` is a string update to a display field. It does not trigger any recalculation, does not affect `gameday_picks`, does not affect `gameday_props.point_value`, does not affect `fantasy_season_scores` (which does not exist as a write target), and does not affect who the winner is.

The competition winner is determined entirely from `SUM(point_value) WHERE is_correct = true` in the derived standings query. Reward metadata is never read by the scoring system.

---

## 13. Future Provider Mapping

### Canonical model

Swayger's internal tables are the single source of truth. Provider data populates these exact tables:

```
Provider League   →  fantasy_leagues          (external_provider, external_league_id)
Provider Team     →  fantasy_teams             (external_team_id)
Provider Manager  →  fantasy_league_members   (external_member_id)
Provider User     →  fantasy_member_claims    (user_id, if OAuth-linked)
```

### Provider-specific mapping

| Provider | League ID | Team ID | Manager ID | Notes |
|---|---|---|---|---|
| Sleeper | `league.league_id` | `roster.roster_id` | `roster.owner_id` | Owner and team are separate objects |
| Yahoo | `game.game_key + league.league_id` | `team.team_key` | `team.managers[0].guid` | Manager GUID may differ from Yahoo user ID |
| ESPN | `leagueId` | `teamId` | `members[].id` | Members array on the league object |
| Manual | (null) | (null) | (null) | All external fields null; commissioner enters directly |

No downstream Fantasy competition code references provider-specific fields. All queries use `fantasy_league_members.id`, `fantasy_teams.id`, etc. — never `external_member_id` for scoring or display.

### Linking a manually created league to a provider later

1. Commissioner initiates "Connect to Sleeper" for their existing league
2. Import adapter fetches the Sleeper league and roster
3. Server matches Sleeper teams/managers to existing `fantasy_league_members` rows by name/confirmation
4. Updates `external_provider`, `external_league_id`, `external_member_id`, `external_team_id` on matched rows
5. Unmatched Sleeper entries create new rows; commissioner resolves conflicts
6. All historical picks and season standings are unaffected — canonical IDs never change

### Missing team names / edge cases

If a provider does not supply a team name, `fantasy_teams.team_name` defaults to the manager's display name. Commissioner can edit it after import.

---

## 14. Sports-Agnostic Validation

All proposed core tables are verified to contain zero football-specific fields.

| Table | Football-specific fields | Verdict |
|---|---|---|
| `fantasy_leagues` | None — `sport TEXT`, `season_year INT` are generic | ✓ Agnostic |
| `fantasy_league_members` | None — `display_name`, `role`, `external_*` are generic | ✓ Agnostic |
| `fantasy_teams` | None — `team_name`, `current_manager_id` are generic | ✓ Agnostic |
| `fantasy_member_claims` | None — `user_id`, `guest_token` are generic | ✓ Agnostic |
| `gameday_rooms` | None — `sport`, `experience_type`, `competition_type` are generic | ✓ Agnostic |
| `gameday_pick_cards` | Phase constraint widened to include draft and weekly — generic values | ✓ Agnostic |
| `gameday_props` | `scoring_scope`, `point_value` are generic | ✓ Agnostic |
| `gameday_prop_library` | `experience_type`, `competition_type`, `answer_target_type` are generic | ✓ Agnostic |

**Where sport-specific content lives:**
- Prop template questions and answer options in `gameday_prop_library` rows
- Sport-specific phases in the `phase` column values (widened constraint)
- Future provider adapters (Sleeper football vs Yahoo basketball — adapter-level, not schema-level)

**No football assumptions exist in any core relationship.** A fantasy basketball league uses the same `fantasy_leagues`, `fantasy_league_members`, `fantasy_teams`, and all `gameday_*` tables — only the `sport = 'basketball'` value and the basketball-specific prop templates differ.

---

## 15. Updated Domain / Data-Flow Diagram

```
── SOURCE OF TRUTH ────────────────────────────────────────────────────────────

fantasy_leagues
  id, league_name, sport, season_year, commissioner_user_id
  default_reward_description, default_reward_amount_display
  external_provider, external_league_id
  │
  ├── fantasy_league_members          ← league roster (persistent across all competitions)
  │     id, league_id, display_name, current_team_id
  │     role (commissioner|co_commissioner|member)
  │     external_member_id, is_active
  │     │
  │     └── fantasy_member_claims     ← device/account → member mapping
  │           id, league_member_id
  │           user_id  (auth claim)   OR
  │           guest_token (durable device claim)
  │           is_active
  │
  ├── fantasy_teams                   ← team entities (persist through ownership changes)
  │     id, league_id, team_name
  │     current_manager_id → fantasy_league_members
  │     co_manager_id → fantasy_league_members
  │     external_team_id, is_active
  │
  └── gameday_rooms  ← competition / event
        id, league_id, experience_type='fantasy', competition_type
        sport, room_name, status (active|finalized|archived)
        reward_description, reward_amount_display  ← display metadata only
        │
        ├── gameday_participants      ← competition membership (snapshotted)
        │     id, room_id, league_member_id
        │     display_name  ← SNAPSHOTTED at join time
        │     team_name     ← SNAPSHOTTED at join time
        │     user_id / guest_session_id (existing Game Day fields)
        │
        ├── gameday_pick_cards        ← phase groupings
        │     id, room_id, phase, status, title
        │     │
        │     └── gameday_props       ← prediction questions
        │           id, card_id
        │           question, answer_options (structured JSONB for Fantasy)
        │           correct_answer (stores option.id for Fantasy props)
        │           status (pending|settled)
        │           scoring_scope (competition|season)   ← NEW
        │           point_value                          ← NEW, snapshotted from template
        │           template_prop_id → gameday_prop_library
        │           │
        │           └── gameday_picks ← member predictions
        │                 id, participant_id, prop_id, card_id
        │                 selected_answer  (stores option.id for Fantasy props)
        │                 is_correct (null→false/true on settlement)
        │
        └── [settlement audit via logEvent — existing]

gameday_prop_library ← Swayger-managed template catalog
  id, sport, experience_type, competition_type, phase
  question, answer_options, answer_target_type
  scoring_scope, point_value
  is_active, is_default, display_order

── DERIVED / COMPUTED (not stored) ───────────────────────────────────────────

Competition leaderboard
  = SUM(gameday_props.point_value)
    WHERE gameday_picks.is_correct = true
      AND gameday_props.scoring_scope = 'competition'
    GROUP BY gameday_participants.id
  → Competition winner declared at finalization

Season standings
  = SUM(gameday_props.point_value)
    WHERE gameday_picks.is_correct = true
      AND gameday_rooms.league_id = $league_id
      AND gameday_rooms.experience_type = 'fantasy'
    GROUP BY fantasy_league_members.id
  → Season Swayger Champion

── DISPLAY METADATA (no scoring connection) ──────────────────────────────────

fantasy_leagues.default_reward_description / default_reward_amount_display
gameday_rooms.reward_description / reward_amount_display
```

---

## 16. Updated Build-Now / Fast-Follow / Defer Matrix

### A — Build now: Draft Day directly requires it

| Item | Notes |
|---|---|
| `fantasy_leagues` table | League identity backbone |
| `fantasy_league_members` table | Persistent roster |
| `fantasy_teams` table | Required for team-target answer options at Draft Day |
| `fantasy_member_claims` table | Replaces `guest_session_id` on member row; required for multi-league guests |
| `gameday_rooms.league_id`, `experience_type`, `competition_type` | Competition-to-league relationship |
| `gameday_participants.league_member_id` FK | Identity claim link |
| `gameday_participants.team_name TEXT` | Snapshot column |
| `gameday_props.scoring_scope`, `point_value` | Season prop and variable scoring |
| Widen sport constraint (rooms + prop library) | Required for `sport='football'` |
| Widen phase constraint (pick cards) | Required for `pre_draft`, `in_draft`, `post_draft` |
| Make matchup columns nullable | Fantasy rooms have no sports matchup |
| Settle route: allow season-scope props in finalized rooms | **Required for season-long prop lifecycle** |
| Leaderboard/final-standings: filter by `scoring_scope='competition'` | **Required for correct Draft Day winner** |
| Structured answer options (JSONB objects for Fantasy props) | Required for stable answer identity |
| Fantasy League creation form (commissioner) | New screen |
| "Who are you?" identity claiming view | Replaces free-text join for fantasy rooms |
| Fantasy Draft Day room creation within a league | New flow |
| Fantasy Draft Day prop templates in `gameday_prop_library` | Seed data + new template columns |
| Conditional fantasy header in participant and host views | UX correctness |
| Finalization UI gate: exclude season-scope pending props | Prevents incorrect blocking |

### B — Build now: Week 1 would otherwise force immediate rework

| Item | Notes |
|---|---|
| `fantasy_teams` table | (Already in A — Week 1 team-target props require it) |
| `fantasy_member_claims` table | (Already in A — multi-league guest support) |
| `external_*` columns on all three Fantasy tables | Null for MVP; backfill later is expensive if skipped |
| `gameday_prop_library.answer_target_type` | Null for MVP; required before template proliferation |
| Derived season standings query (server function) | Must exist before Draft Day finalizes, or backfill needed |

### C — Design now, implement immediately after Draft Day

| Item | Notes |
|---|---|
| Week 1 competition creation from existing league | Reads league roster; auto-generates participants |
| Auto-generation of `gameday_participants` from roster | Eliminates Week 1 re-onboarding |
| Weekly prop template library | `competition_type='weekly'` templates |
| Season standings screen | Aggregated view per league |
| Commissioner league management screen | View all competitions, roster, season standings |
| Reward display in competition view | Shows reward_description prominently |
| Push notifications for Fantasy competitions | Week starts, props lock, winner declared |

### D — Defer

| Item |
|---|
| Sleeper / Yahoo / ESPN / NFL Fantasy API integrations |
| Automated roster synchronization |
| Automatic result settlement via fantasy APIs |
| Payment processing, prize distribution, Leagueswype |
| Confidence wagering or point multipliers |
| League voting or trade-opinion props |
| Co-commissioner UI (data model has `role`; UI waits) |
| Fantasy basketball / baseball prop template libraries |
| Full co-manager junction table (co_manager_id column sufficient for MVP) |

---

## 17. Migration and Regression Changes from Prior Proposal

Three substantive changes from the prior architecture document (`docs/swayger-fantasy-architecture.md`):

### Change 1 — Eliminate `fantasy_season_scores` as a write target

**Prior:** A `fantasy_season_scores` table updated via a `updateSeasonScores()` function on finalization and season-prop settlement.

**Revised:** No `fantasy_season_scores` table. Season standings are computed via a derived query from `gameday_picks` + `gameday_props` + `gameday_participants` + `gameday_rooms`. All correctness, re-settlement, and historical reconstruction concerns are resolved automatically.

**Regression risk:** None — the table was newly proposed; nothing exists to migrate.

### Change 2 — Add `fantasy_teams` as first-class table

**Prior:** `team_name TEXT` on `fantasy_league_members`.

**Revised:** `fantasy_teams` table with `current_manager_id` FK; `fantasy_league_members` gets `current_team_id` FK.

**Regression risk:** None — these are new tables. `fantasy_league_members.team_name` column is removed from the proposal (it was never written to a real table yet).

### Change 3 — Replace `guest_session_id` on member with `fantasy_member_claims` table

**Prior:** `fantasy_league_members.guest_session_id TEXT UNIQUE`.

**Revised:** `fantasy_member_claims` table with per-member claims. `fantasy_league_members` has no `guest_session_id` column.

**Regression risk:** None — these are new tables.

### Additional targeted code changes identified during validation

| File | Change | Why |
|---|---|---|
| `server/routes-gameday.ts:1610` | Allow settlement of `scoring_scope='season'` props in finalized rooms | Season props must be settleable after Draft Day ends |
| `server/routes-gameday.ts:2021` (leaderboard) | Join `gameday_props`; filter by `scoring_scope='competition'` | Prevent season-prop settlements from retroactively changing Draft Day winner |
| `server/routes-gameday.ts:2064` (final-standings) | Same scope filter | Consistent winner declaration |
| `app/gameday/[roomId]/host.tsx` | Exclude `scoring_scope='season'` pending props from finalization gate | Prevent incorrect blocking of finalization |

All are single-point, targeted changes to existing files. No existing Game Day flows are affected (all Game Day props have `scoring_scope='competition'` by default).

---

## 18. Answers to the 12 Final Go/No-Go Questions

### 1. Can Draft Day ship using this model and Week 1 be added immediately afterward without a foundational migration?

**YES.** All persistent tables (`fantasy_leagues`, `fantasy_league_members`, `fantasy_teams`, `fantasy_member_claims`) exist from Day 1. Week 1 creates a new `gameday_rooms` row linked to the existing league and auto-generates participants from the existing roster. No schema changes needed between Draft Day and Week 1.

---

### 2. Can a league member participate all season without repeatedly claiming their identity?

**YES.** `fantasy_member_claims` persists the claim durably. Authenticated users are recognized by JWT on every device. Guest users are recognized by their durable `guest_token` from AsyncStorage on the same device. Week 1 and all subsequent competitions pre-generate `gameday_participants` from the roster — members enter directly without a claim step.

---

### 3. Can one league member use multiple devices without corrupting identity?

**YES, for authenticated users.** The same `user_id` across devices → same claim → same `league_member_id`. **For guest users on different devices:** a new device has a different `guest_token` and will see the identity-claim prompt again. This is the expected tradeoff for unauthenticated users. The invitation materials can note that authenticated accounts eliminate this limitation.

---

### 4. Can a member participate in multiple Swayger Fantasy leagues?

**YES.** Each league has its own `fantasy_league_members` row for that person. Each has its own `fantasy_member_claims` entry. The UNIQUE constraint is per `(league_member_id, user_id)` — not global — so the same `user_id` can claim membership in two different leagues without conflict.

---

### 5. Can fantasy teams remain historically accurate if managers change?

**YES.** `gameday_participants.team_name` is snapshotted at join time and never changes. Weeks 1–6 participant rows for the original manager retain the correct team name. `fantasy_teams.current_manager_id` is updated for the new manager. Week 7+ participant rows snapshot the team under its new manager. Historical receipts are accurate throughout.

---

### 6. Can answer labels change without changing the historical meaning of picks?

**YES**, with the structured answer-option format. `gameday_picks.selected_answer` stores the `id` field (e.g., `"member-uuid-darius"`), not the label. If the label changes from "Darius" to "D-Ro", the pick still correctly refers to the same `fantasy_league_members` row. The label displayed on historical receipts comes from the `answer_options` JSONB stored on the prop at pick time — it retains the label at the moment of creation.

---

### 7. Can a finalized Draft Day competition retain unresolved season-long props that settle months later?

**YES**, after the targeted code change to the settle route. The one-line condition addition (`&& !isSeason`) allows settlement of `scoring_scope='season'` props regardless of room finalization status. `settlePropCore` itself has no room-status checks. The finalized room's status is untouched; only the prop and its picks are updated.

---

### 8. Can an incorrect settlement be corrected without double-counting season standings?

**YES.** Season standings are derived — computed from underlying `gameday_picks.is_correct` values at query time. Re-settling a prop updates `is_correct` on the affected picks. The next season-standings query automatically reflects the corrected result. There is no accumulated counter to drift, no double-write to unwind, and no historical state to reconcile.

---

### 9. Can all season standings be reconstructed from authoritative underlying records?

**YES, always.** `gameday_picks`, `gameday_props`, `gameday_participants`, and `gameday_rooms` are the sole source of truth. The season standings query is a pure read of these tables. No cached or aggregated state exists that could diverge from the underlying records. If every row in the system is preserved, season standings can be reconstructed at any point in time for any historical state by adjusting the query's filter.

---

### 10. Can a weekly reward be changed without changing scoring?

**YES.** `reward_description` and `reward_amount_display` are TEXT columns. They are never read by the scoring system. Changing "$25" to "$50" is a string update. It has no effect on `gameday_picks`, `gameday_props.point_value`, `is_correct`, or any derived standings.

---

### 11. Can Sleeper/Yahoo/another provider later populate this model without creating parallel Fantasy tables?

**YES.** The import adapter populates `fantasy_leagues`, `fantasy_league_members`, and `fantasy_teams` using the exact same tables as manual creation. External provider metadata is stored in `external_*` columns on those tables. No downstream Fantasy competition code reads provider-specific fields. An existing manually created league can be linked to a provider by updating the `external_*` columns without changing any canonical IDs or historical records.

---

### 12. Can the architecture support fantasy basketball/baseball without changing the core league/member/competition schema?

**YES.** No football-specific fields exist in any core table. The `sport` column value changes (`'basketball'`, `'baseball'`). Sport-specific prop templates are separate rows in `gameday_prop_library` with the corresponding `sport` value. Competition structure, identity, scoring, and season standings work identically for any sport.

---

## 19. Final Recommendation

**AUTHORIZE BUILD**

All 12 go/no-go questions answer YES. The architecture is sound, sports-agnostic, and designed to carry a league from Draft Day through a full season without rework.

### Three revisions from the prior assessment are required before implementation begins

These are not architectural blockers — they are precise targeted changes that must be included in the implementation plan:

**Revision 1 — Eliminate `fantasy_season_scores` as a write target**
Replace with a derived query function. Remove it from Phase 7 of the implementation sequence. The function becomes a read-only server-side computation, not a write path.

**Revision 2 — Add `fantasy_teams` as a first-class table**
Move from "later" to Phase 2 of the implementation sequence, alongside `fantasy_leagues` and `fantasy_league_members`. Add `fantasy_member_claims` to the same phase. Remove `team_name TEXT` from `fantasy_league_members`; replace with `current_team_id FK fantasy_teams`.

**Revision 3 — Two targeted code changes to existing routes**
- `server/routes-gameday.ts` settle route: allow settlement of `scoring_scope='season'` props in finalized rooms
- `server/routes-gameday.ts` leaderboard + final-standings routes: join `gameday_props`; filter competition winner by `scoring_scope='competition'`

These two code changes should be included in Phase 6 of the implementation sequence (Scoring scope and finalization).

### Revised Phase 1 schema (Migration A — the only change from prior proposal)

```sql
-- NEW: fantasy_leagues (unchanged from prior)
-- NEW: fantasy_league_members (remove guest_session_id; add current_team_id)
-- NEW: fantasy_teams (moved from "later" to now)
-- NEW: fantasy_member_claims (replaces guest_session_id on member row)
-- REMOVED: fantasy_season_scores (eliminated)
-- All other migrations (B through E) unchanged from prior proposal
```

---

*Document generated: 2026-08-10*
*Revises: `docs/swayger-fantasy-architecture.md`*
*No code written, no migrations applied, no files modified.*
