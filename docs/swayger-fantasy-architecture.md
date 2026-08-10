# Swayger Fantasy — Pre-Build Product & Architecture Assessment

> **Status:** Pre-build assessment. No code written, no migrations applied, no files modified.
> Ready for review before implementation is authorized.
>
> **Guiding principle:** Design the season. Build Draft Day first.

---

## Table of Contents

1. [Executive Recommendation](#1-executive-recommendation)
2. [Current Architecture Findings](#2-current-architecture-findings)
3. [Recommended Domain Model](#3-recommended-domain-model)
4. [Table / Schema Recommendations](#4-table--schema-recommendations)
5. [Role and Responsibility Matrix](#5-role-and-responsibility-matrix)
6. [Commissioner Journey](#6-commissioner-journey)
7. [League Member Journey](#7-league-member-journey)
8. [Draft Day Journey](#8-draft-day-journey)
9. [Week 1 Future Journey](#9-week-1-future-journey-design-now-do-not-implement)
10. [Scoring Model Recommendation](#10-scoring-model-recommendation)
11. [Season-Long Draft Day Prop Handling](#11-season-long-draft-day-prop-handling)
12. [Reward Model Recommendation](#12-reward-model-recommendation)
13. [Manual Setup vs. Future API Import](#13-manual-setup-vs-future-api-import)
14. [Sports-Agnostic Architecture Assessment](#14-sports-agnostic-architecture-assessment)
15. [Existing Infrastructure Reused Unchanged](#15-existing-infrastructure-reused-unchanged)
16. [Existing Infrastructure Requiring Extension](#16-existing-infrastructure-requiring-extension)
17. [New Foundational Functionality](#17-new-foundational-functionality)
18. [Build Now vs. Fast-Follow vs. Defer](#18-build-now-vs-fast-follow-vs-defer)
19. [Regression and Migration Risk Assessment](#19-regression-and-migration-risk-assessment)
20. [Revised Draft Day MVP](#20-revised-draft-day-mvp)
21. [Recommended Implementation Sequence](#21-recommended-implementation-sequence)
22. [Answers to the Six Final Architectural Challenge Questions](#22-answers-to-the-six-final-architectural-challenge-questions)

---

## 1. Executive Recommendation

**Design the season. Build Draft Day first — but inside the season's data model.**

The correct architecture is: create the persistent Fantasy League layer now, reuse `gameday_rooms` as the competition/event object with a league FK, and add three targeted discriminators (`sport`, `experience_type`, `competition_type`) that make the prop library, templates, and room creation logic sport- and mode-agnostic.

The key finding from codebase inspection is that the existing Game Day infrastructure — cards, props, picks, locking, settlement, leaderboard, finalization — is almost entirely reusable without duplication. The only structural gaps are:

1. No persistent league/member/team identity layer **(must be built now)**
2. No competition-to-league relationship **(must be built now)**
3. No scoring scope per prop (needed for season-long Draft Day picks)
4. Sport/experience/competition-type taxonomy needs to replace the current sport-only discriminator
5. The UI finalization gate blocks on all props settled — must be relaxed for season-long props
6. Variable prop point values (simple column addition)

Everything else — the pick system, locking, manual settlement, leaderboard computation, finalization, sharing — transfers unchanged.

> **If Draft Day is built without the persistent league tables, every single league member must re-onboard for Week 1, commissioners must re-enter their roster, and scoring history cannot carry forward. That is the one rework you cannot afford.**

---

## 2. Current Architecture Findings

### Tables and classifications

| Table | Classification |
|---|---|
| `gameday_rooms` | Reusable with extension — add `league_id`, `experience_type`, `competition_type`; make matchup columns nullable |
| `gameday_pick_cards` | Reusable unchanged — phase constraint needs widening |
| `gameday_props` | Reusable with extension — add `scoring_scope` and `point_value` |
| `gameday_participants` | Reusable with extension — add `league_member_id` FK for identity claiming |
| `gameday_picks` | Reusable unchanged |
| `gameday_prop_library` | Reusable with extension — add `experience_type`, `competition_type`, `point_value`, `scoring_scope`, `answer_target_type` |
| `user_balances` | Not directly relevant — 1v1 SP escrow system, completely separate from Game Day scoring |
| `swaygers` / `swayger_invites` | Not relevant to Fantasy |

### Existing routes and files

| Route / File | Classification |
|---|---|
| `POST /api/gameday/rooms` (`server/routes-gameday.ts:883`) | Reusable with extension |
| `GET /api/gameday/template` (`server/routes-gameday.ts:842`) | Reusable with extension (new query params) |
| `GET /api/gameday/rooms/by-code/:code` | Reusable unchanged |
| `POST /api/gameday/rooms/:id/join` (`server/routes-gameday.ts:1243`) | Reusable with extension (identity claim) |
| `GET /api/gameday/rooms/:id` (`server/routes-gameday.ts:1119`) | Reusable unchanged |
| `POST /api/gameday/rooms/:id/picks` | Reusable unchanged |
| `PATCH /api/gameday/props/:id/settle` | Reusable unchanged |
| `settlePropCore` (`server/gameday-settle-helper.ts`) | Reusable unchanged |
| `PATCH /api/gameday/rooms/:id/finalize` (`server/routes-gameday.ts:1635`) | Reusable unchanged (server only) |
| `GET /api/gameday/rooms/:id/leaderboard` (`server/routes-gameday.ts:1982`) | Reusable with minor extension |
| `GET /api/gameday/rooms/:id/final-standings` (`server/routes-gameday.ts:2064`) | Reusable with minor extension |
| `GET/POST/PATCH /api/admin/gameday/prop-library` | Reusable with extension |
| `server/gameday-normalize.ts` + global settlement | Reusable with extension |
| `app/gameday/create.tsx` | Reusable with extension |
| `app/gameday/[roomId]/index.tsx` | Reusable with extension |
| `app/gameday/[roomId]/host.tsx` | Reusable with extension |
| `app/gameday/[roomId]/captain.tsx` | Reusable unchanged |

### Key behavioral findings

**Finalization:** The server (`PATCH /api/gameday/rooms/:roomId/finalize`) sets `status='finalized'` with no check on prop settlement state. The UI gate in `host.tsx` does require all active props to be settled and no open cards (`isReadyToFinalize = cardsReady && propsReady`), but this is purely client-side. The server already supports finalizing a room with unsettled props — only the UI prevents it. The UI gate must be adjusted to exclude season-long props.

**Leaderboard and final standings:** Both routes count every `gameday_picks.is_correct = true` pick with no filter on prop settlement status. An unsettled prop leaves `is_correct = null`, which is naturally excluded. Season-long props that remain pending contribute 0 points to the Draft Day leaderboard — correct behavior, no logic change required.

**SP systems are completely separate:** Game Day SP (`correct_picks × 10`) is computed on the fly, never written to `user_balances`. The `user_balances.swayger_points` system is exclusively for 1v1 Swayger escrow. Fantasy season standings are a new, separate concept.

**Prop library is sport-gated:** `gameday_prop_library.sport` is constrained to `nba|soccer` only. No columns for experience type or competition type. Adding Fantasy Draft and Weekly templates requires schema widening.

**Guest and identity claiming:** The join flow accepts any display name as free-text. There is no "Who are you? Select from a list" experience today. This must be built for league member identity claiming.

**Settlement function is generic:** `settlePropCore` has no sport or mode dependencies. It handles any Fantasy prop without changes.

---

## 3. Recommended Domain Model

### Core entities

**`fantasy_leagues`** — The persistent fantasy community. Exists independently of any competition. Survives across Draft Day, all 17 weeks, playoffs, and championship. Owned by a commissioner. Scoped to a sport and season year. Holds league-level defaults (reward description, member roster). This is the identity spine of the entire Fantasy product.

**`fantasy_league_members`** — A person's membership in a specific league for a specific season. Distinct from any individual competition participation. Carries the member's display name, fantasy team name, and optional external provider IDs for future Sleeper/Yahoo import. A member who misses Week 7 remains in `fantasy_league_members` — they simply have no `gameday_participants` row for that competition.

**`fantasy_teams`** — The fantasy roster entity controlled by a member. For MVP, this is a name stored on `fantasy_league_members.team_name`. It becomes a full separate row when team-specific answer matching is needed (week-by-week team score props).

**`gameday_rooms` (extended as competition/event)** — Each individual competition (Draft Day, Week 1, Week 2) is a `gameday_room` with a `league_id` FK. The room continues to own cards, props, picks, and settlement exactly as today.

**`fantasy_season_scores`** — Accumulated season-long points per member per league. Updated when any competition finalizes or when a season-long prop eventually settles. This is the Season Swayger Champion source of truth.

**`gameday_participants` (extended)** — Adds `league_member_id` FK. When a member claims their identity on joining a Fantasy competition, this FK is populated. For Week 1 and beyond, participants can be auto-generated from the league roster — eliminating re-onboarding.

### Relationship diagram

```
fantasy_leagues
  ├── commissioner_user_id → profiles
  ├── sport, season_year
  ├── reward defaults
  └── fantasy_league_members
        ├── display_name         ("Darius")
        ├── team_name            ("The Monstars")
        ├── user_id              (nullable → claimed Supabase account)
        ├── guest_session_id     (nullable → guest device claim)
        └── external_* metadata  (Sleeper/Yahoo IDs — future)

gameday_rooms  (competition / event)
  ├── league_id → fantasy_leagues  (nullable for non-fantasy rooms)
  ├── experience_type:   'game_day' | 'fantasy'
  ├── competition_type:  null | 'draft_day' | 'weekly' | 'playoffs' | 'championship'
  ├── sport:             'football' | 'basketball' | 'baseball' | 'nba' | 'soccer'
  ├── gameday_pick_cards  (phases)
  │     └── gameday_props  (scoring_scope, point_value)
  │           └── gameday_picks  (participant_id, is_correct)
  └── gameday_participants
        └── league_member_id → fantasy_league_members  (nullable for non-fantasy)

fantasy_season_scores
  ├── league_id → fantasy_leagues
  ├── league_member_id → fantasy_league_members
  ├── total_points
  ├── competition_points   (from competition-scoped props)
  └── season_prop_points   (from season-long props settled later)
```

---

## 4. Table / Schema Recommendations

> **Do not write or apply these migrations yet. This is the approved target schema.**

### Migration A — Fantasy core tables (new, additive)

```sql
-- Fantasy league (persistent community)
CREATE TABLE fantasy_leagues (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_name                 TEXT        NOT NULL,
  sport                       TEXT        NOT NULL,     -- 'football','basketball','baseball'
  season_year                 INT         NOT NULL,     -- e.g. 2026
  commissioner_user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Reward defaults (display only — no payment custody)
  default_reward_description  TEXT,
  default_reward_amount_display TEXT,
  -- Future: external provider metadata
  external_provider           TEXT,       -- 'sleeper','yahoo','espn','manual'
  external_league_id          TEXT,       -- provider's league ID
  status                      TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','archived')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- League members (season-persistent roster)
CREATE TABLE fantasy_league_members (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id           UUID        NOT NULL REFERENCES fantasy_leagues(id) ON DELETE CASCADE,
  display_name        TEXT        NOT NULL,     -- person's name, e.g. "Darius"
  team_name           TEXT,                     -- e.g. "The Monstars"
  -- Identity claim — populated when member joins their first competition
  user_id             UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_session_id    TEXT        UNIQUE,       -- device/guest claim
  -- Future API import
  external_member_id  TEXT,
  external_team_id    TEXT,
  -- Management
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  role                TEXT        NOT NULL DEFAULT 'member'
                        CHECK (role IN ('commissioner','co_commissioner','member')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, display_name)
);

-- Season-accumulated standings
CREATE TABLE fantasy_season_scores (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id           UUID        NOT NULL REFERENCES fantasy_leagues(id) ON DELETE CASCADE,
  league_member_id    UUID        NOT NULL REFERENCES fantasy_league_members(id) ON DELETE CASCADE,
  total_points        INT         NOT NULL DEFAULT 0,
  competition_points  INT         NOT NULL DEFAULT 0,  -- from competition-scoped props
  season_prop_points  INT         NOT NULL DEFAULT 0,  -- from season-long props
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, league_member_id)
);
```

### Migration B — `gameday_rooms` extension (additive)

```sql
-- Competition-to-league relationship and taxonomy
ALTER TABLE gameday_rooms
  ADD COLUMN league_id              UUID REFERENCES fantasy_leagues(id) ON DELETE SET NULL,
  ADD COLUMN experience_type        TEXT NOT NULL DEFAULT 'game_day'
               CHECK (experience_type IN ('game_day','fantasy')),
  ADD COLUMN competition_type       TEXT
               CHECK (competition_type IN
                 (NULL,'draft_day','weekly','playoffs','championship')),
  ADD COLUMN reward_description     TEXT,
  ADD COLUMN reward_amount_display  TEXT;

-- Widen sport constraint
ALTER TABLE gameday_rooms
  DROP CONSTRAINT IF EXISTS gameday_rooms_sport_check,
  ADD CONSTRAINT gameday_rooms_sport_check
    CHECK (sport IN ('nba','soccer','football','basketball','baseball'));

-- Make sports-matchup columns nullable (not meaningful for fantasy)
ALTER TABLE gameday_rooms
  ALTER COLUMN team_a_name DROP NOT NULL,
  ALTER COLUMN team_b_name DROP NOT NULL,
  ALTER COLUMN team_a_star DROP NOT NULL,
  ALTER COLUMN team_b_star DROP NOT NULL;
```

### Migration C — `gameday_props` and `gameday_pick_cards` extension (additive)

```sql
-- Scoring scope and variable point values on props
ALTER TABLE gameday_props
  ADD COLUMN scoring_scope  TEXT NOT NULL DEFAULT 'competition'
               CHECK (scoring_scope IN ('competition','season')),
  ADD COLUMN point_value    INT  NOT NULL DEFAULT 10;

-- Phase constraint widening for pick cards
ALTER TABLE gameday_pick_cards
  DROP CONSTRAINT IF EXISTS gameday_pick_cards_phase_check,
  ADD CONSTRAINT gameday_pick_cards_phase_check
    CHECK (phase IN (
      'pregame','halftime','fourth','final_push','penalties',  -- existing game day
      'pre_draft','in_draft','post_draft',                     -- draft day
      'weekly'                                                 -- weekly fantasy
    ));
```

### Migration D — `gameday_participants` extension (additive)

```sql
ALTER TABLE gameday_participants
  ADD COLUMN league_member_id UUID REFERENCES fantasy_league_members(id) ON DELETE SET NULL;
```

### Migration E — `gameday_prop_library` extension (additive)

```sql
ALTER TABLE gameday_prop_library
  ADD COLUMN experience_type    TEXT NOT NULL DEFAULT 'game_day'
               CHECK (experience_type IN ('game_day','fantasy')),
  ADD COLUMN competition_type   TEXT
               CHECK (competition_type IN
                 (NULL,'draft_day','weekly','playoffs','championship')),
  ADD COLUMN scoring_scope      TEXT NOT NULL DEFAULT 'competition'
               CHECK (scoring_scope IN ('competition','season')),
  ADD COLUMN point_value        INT  NOT NULL DEFAULT 10,
  ADD COLUMN answer_target_type TEXT
               CHECK (answer_target_type IN
                 (NULL,'league_member','fantasy_team','player','text','yes_no'));

-- Widen sport constraint
ALTER TABLE gameday_prop_library
  DROP CONSTRAINT IF EXISTS gameday_prop_library_sport_check,
  ADD CONSTRAINT gameday_prop_library_sport_check
    CHECK (sport IN ('nba','soccer','football','basketball','baseball'));
```

### What is NOT needed

- No separate Fantasy prop, pick, card, or settlement tables
- No `fantasy_picks` table — `gameday_picks` handles all of it
- No parallel scoring engine — `settlePropCore` is used unchanged
- No separate Fantasy leaderboard system

---

## 5. Role and Responsibility Matrix

| Responsibility | Swayger Platform | Swayger Admin | Commissioner | Co-Commissioner | League Member | External Platform (future) |
|---|---|---|---|---|---|---|
| League creation | Infrastructure | Oversight/support | **Initiates** | — | — | Provides import data |
| League import | Import engine | — | **Triggers** | — | — | **Provides** |
| Member creation | Persistence | — | **Enters** | Assists | Self-service (future) | **Provides** |
| Team name entry | Storage | — | **Enters** | Assists | Self-service (future) | **Provides** |
| Identity claiming | Claim flow UI | Resolve conflicts | Resolve conflicts | — | **Self-service** | — |
| Competition creation | Template engine | — | **Configures** | Assists | — | — |
| Prop template authoring | **Owns catalog** | **Manages** | Cannot | — | — | — |
| Prop selection | UI | — | **Selects** | — | — | — |
| Publishing competition | **Route** | — | **Triggers** | — | — | — |
| Opening / locking cards | **Enforces** | — | **Decides timing** | — | — | — |
| Manual settlement | **Route** | Oversight | **Executes** | — | — | — |
| Subjective settlement | **Route** | — | **Executes** | — | — | — |
| Scoring | **Computes** | — | — | — | — | — |
| Competition standings | **Computes** | — | — | — | — | — |
| Season standings | **Computes** | — | — | — | — | — |
| Reward definition | Storage only | — | **Defines** | — | — | — |
| Reward fulfillment | None (out of scope) | — | **Fulfills manually** | — | — | — |
| Settlement corrections | **Route** | **Executes** | Reports error | — | Reports error | — |
| Troubleshooting | **Logs / audit** | **Resolves** | Reports | — | Reports | — |

---

## 6. Commissioner Journey

```
1.  Open Swayger Fantasy
2.  Create Fantasy League
      → Enter: league name, sport, season year
      → Enter: member roster (display name + team name per member)
      → System creates: fantasy_leagues row + fantasy_league_members rows
3.  Generate invitation link for the league
      → Members use this link to claim identity (not yet to pick)
4.  Configure Draft Day competition
      → System creates a gameday_rooms row
          (experience_type='fantasy', competition_type='draft_day', league_id=...)
      → Commissioner selects props from Fantasy Draft Day library
      → Commissioner sees member names pre-populated in member-name prop answer options
      → Commissioner sets phase structure (pre_draft, in_draft, post_draft)
      → Commissioner reviews season-long props (scoring_scope='season')
5.  Publish Draft Day → shares room link
6.  During Draft Day:
      → Opens pre_draft card → members pick → locks before draft starts
      → Opens in_draft card as draft begins → settles each prop as moments occur
      → Opens post_draft card after draft → settles opinion props
      → Season-long props remain locked and unresolved
7.  Finalizes Draft Day standings (without waiting for season-long props)
      → Draft Day Swayger Champion declared
8.  Weeks 1–17:
      → Opens existing Fantasy League → creates new weekly competition
      → Member roster already exists — no re-entry
      → Selects weekly props (member names auto-populated from league roster)
      → Publishes → members participate
      → Settles results each week
9.  Throughout season: settles any season-long Draft Day props as they resolve
      → Season standings update automatically
10. End of season: Season Swayger Champion declared from fantasy_season_scores
```

---

## 7. League Member Journey

### Draft Day

```
1. Receives invite link from commissioner (text, Discord, etc.)
2. Opens link → "Who are you?" screen
      → Sees roster of league members entered by commissioner
      → Selects their identity (e.g., "Darius — The Monstars")
      → Optionally signs in or continues as guest
      → System: populates gameday_participants.league_member_id,
                claims fantasy_league_members row
3. Makes picks across all open cards (pre_draft, in_draft, post_draft, season-long)
4. Watches live leaderboard as props settle
5. Sees Draft Day winner and their own pick results
6. Season-long picks remain visible as "pending" receipts
```

### Week 1 and beyond

```
1. Commissioner creates Week 1
      → System generates gameday_participants from league roster
2. Member opens Week 1 link
      → Identity is already known (league_member_id was set at Draft Day)
      → No "Who are you?" prompt needed
      → Directly enters the pick room
3. Makes picks → participates identically to Draft Day
4. Sees weekly leaderboard and results
5. Sees season standings accumulating across all competitions
```

### Identity edge cases

| Scenario | Handling |
|---|---|
| Duplicate free-text names (Mike vs Mike T) | Eliminated — members select from pre-loaded roster, not free text |
| Guest session (no account) | `fantasy_league_members.guest_session_id` set on claim; persists on device |
| Authenticated user | `fantasy_league_members.user_id` set on claim |
| Guest converts to authenticated later | Commissioner or admin links the two — `user_id` updated on the same `fantasy_league_members` row |
| Member replacement / team ownership transfer | Commissioner updates `fantasy_league_members` row (display_name, team_name) |
| Duplicate claim (two devices try to claim same member) | Server validates: reject if `league_member_id` already claimed by a different session |
| Inactive league member | `fantasy_league_members.is_active = false`; excluded from future competitions |
| Co-managers | `role = 'co_commissioner'` on the `fantasy_league_members` row; same pick/join behavior as members |

---

## 8. Draft Day Journey (detailed)

### Phase structure

**Pre-Draft card** (`phase = 'pre_draft'`)
Props locked before the draft clock starts.
- Who gets first draft position? → `scoring_scope = 'competition'`
- Who gets last draft position? → `scoring_scope = 'competition'`
- Which player goes #1 overall? → `scoring_scope = 'competition'`
- Who wins the league? → `scoring_scope = 'season'`
- Who finishes with the most regular-season points? → `scoring_scope = 'season'`

**In-Draft card** (`phase = 'in_draft'`)
Opened when the draft starts. Commissioner settles each prop in real time.
- Who drafts the first QB? → `scoring_scope = 'competition'`
- Who drafts the first RB? → `scoring_scope = 'competition'`
- Who drafts the first WR? → `scoring_scope = 'competition'`
- Who drafts the first DEF/DST? → `scoring_scope = 'competition'`
- Who drafts the first rookie? → `scoring_scope = 'competition'`

**Post-Draft card** (`phase = 'post_draft'`)
Opened after final pick. Locked 1 hour after draft ends.
- Who had the best draft? → `scoring_scope = 'competition'`
- Who made the biggest reach? → `scoring_scope = 'competition'`

### Finalization with mixed prop scopes

```
Commissioner taps Finalize
  → UI gate checks: no open cards, all competition-scope props settled
                    (season-scope pending props are excluded from this check)
  → Server finalizes room status
  → Draft Day Champion declared from competition-scope is_correct=true picks only
  → Season-long picks remain visible in member history as "to be resolved"
  → fantasy_season_scores updated with Draft Day competition points
```

---

## 9. Week 1 Future Journey (design now, do not implement)

### Data continuity from Draft Day to Week 1

| Data | Where it lives | Status at Week 1 |
|---|---|---|
| League identity | `fantasy_leagues` | Already exists — no action |
| Member roster | `fantasy_league_members` | Already exists — commissioner opens existing league |
| Member identity claims | `fantasy_league_members.user_id / guest_session_id` | Already claimed at Draft Day |
| Team names | `fantasy_league_members.team_name` | Available for answer-option population |
| Draft Day scoring | `gameday_picks` + `fantasy_season_scores` | Season scores already written |

### Week 1 creation flow (server-side)

Commissioner opens their Fantasy League → taps "Create Week 1 Swayger" → system creates:
- New `gameday_rooms` row (`experience_type='fantasy'`, `competition_type='weekly'`, `league_id=...`)
- `gameday_participants` rows pre-generated from `fantasy_league_members` (eliminating re-onboarding)
- Props pre-populated with member display names and team names from the league roster

Members receive a notification or link, open Week 1 directly into the pick room — no join/identity step.

---

## 10. Scoring Model Recommendation

### Three separate scoring concepts

| Concept | Where stored | When updated | Purpose |
|---|---|---|---|
| **Competition score** | Computed on the fly from `gameday_picks.is_correct` | At read time | Weekly / event winner |
| **Season Swayger score** | `fantasy_season_scores.total_points` | On finalization; on season-prop settlement | Season Swayger Champion |
| **1v1 Swayger Points** | `user_balances.swayger_points` | On 1v1 settlement | 1v1 escrow — leave alone |

Competition score formula:
```
SUM(gameday_props.point_value)
WHERE gameday_picks.is_correct = true
  AND gameday_props.scoring_scope = 'competition'
```

Default `point_value = 10` preserves existing `correct × 10` behavior for all current Game Day rooms.

### Variable point values

Example values:
- Standard Draft Day prop: 10 points
- Featured prop: 20 points
- Season-end prediction (created on Draft Day): 30–50 points

Commissioner sets point values when selecting props. No wagering or confidence system.

---

## 11. Season-Long Draft Day Prop Handling

### The model

`gameday_props.scoring_scope` distinguishes two prop types:

- `'competition'` — Settles and scores within Draft Day. Contributes to Draft Day leaderboard and winner.
- `'season'` — Created and locked on Draft Day. Remains `status='pending'` for weeks or months. When eventually settled, contributes to `fantasy_season_scores` only.

### Finalization behavior

| Layer | Change needed |
|---|---|
| Server finalization route | **None** — already supports finalization with unsettled props |
| Leaderboard / final standings routes | Minor: filter by `scoring_scope='competition'` for winner; null `is_correct` already excluded naturally |
| UI finalization gate (`host.tsx`) | **Must update:** exclude `scoring_scope='season'` props from the "all props must be settled" check |
| Participant view | **Must update:** show "Season Prediction — resolves end of season" badge on season-scope props |

### Season-prop settlement later in the season

When the commissioner eventually settles "Who wins the league?" in Week 17:
1. `settlePropCore` marks `is_correct` on those picks (unchanged behavior)
2. A post-settlement hook writes to `fantasy_season_scores` (new function)
3. Season standings update immediately

---

## 12. Reward Model Recommendation

### What to model now (display only, no payment custody)

```sql
-- On fantasy_leagues:
default_reward_description    TEXT    -- "Weekly winner receives $25"
default_reward_amount_display TEXT    -- "$25"

-- On gameday_rooms (competition-level override):
reward_description            TEXT
reward_amount_display         TEXT
```

These fields are displayed prominently in the competition view so members know what they're playing for. The commissioner manually fulfills rewards outside Swayger. The platform bears no financial responsibility.

### What waits

Fulfillment status, winner payment confirmation, payment processing integration.

---

## 13. Manual Setup vs. Future API Import

### The internal canonical model

`fantasy_leagues` and `fantasy_league_members` are Swayger's canonical identity — the single source of truth regardless of whether data arrived via manual entry or API import.

```sql
-- On fantasy_leagues:
external_provider    TEXT    -- 'sleeper', 'yahoo', 'espn', 'manual'
external_league_id   TEXT    -- provider's opaque league ID

-- On fantasy_league_members:
external_member_id   TEXT    -- provider's member ID
external_team_id     TEXT    -- provider's team ID
```

When a commissioner manually creates a league, these external fields are `NULL`. When a Sleeper import runs in the future, it populates the same tables — not a parallel data model.

All downstream code (competition creation, prop population, scoring, season standings) is written against `fantasy_leagues` and `fantasy_league_members` exclusively. No code ever queries which provider created the data. Import is a pre-population step, not an ongoing dependency.

---

## 14. Sports-Agnostic Architecture Assessment

### Why `sport = 'fantasy_draft'` is wrong

The previous Draft Day assessment proposed using `sport = 'fantasy_draft'` as the discriminator. This is architecturally incorrect:
1. Draft Day is not a sport — it is a type of competition within a sport
2. Fantasy basketball and fantasy baseball would require `sport = 'fantasy_basketball_draft'` — conflating two independent dimensions

### Recommended three-dimension taxonomy

| Column | Values | Meaning |
|---|---|---|
| `sport` | `football`, `basketball`, `baseball`, `nba`, `soccer` | The actual sport being predicted |
| `experience_type` | `game_day`, `fantasy` | The product mode |
| `competition_type` | `null`, `draft_day`, `weekly`, `playoffs`, `championship` | Specific event type within Fantasy (null for game_day) |

### How this plays out in practice

| Competition | sport | experience_type | competition_type |
|---|---|---|---|
| NBA playoff game | nba | game_day | null |
| Soccer match | soccer | game_day | null |
| Fantasy football draft | football | fantasy | draft_day |
| Fantasy football Week 3 | football | fantasy | weekly |
| Fantasy basketball draft | basketball | fantasy | draft_day |
| Fantasy basketball Week 7 | basketball | fantasy | weekly |
| Fantasy playoffs | football | fantasy | playoffs |

All existing Game Day Rooms default to `experience_type = 'game_day'` and `competition_type = NULL`. No existing rows are affected.

---

## 15. Existing Infrastructure Reused Unchanged

- `POST /api/gameday/rooms/:id/join` — join route, guest and authenticated paths
- `POST /api/gameday/rooms/:id/picks` — pick submission, validation, upsert
- `PATCH /api/gameday/props/:id/settle` — per-prop manual settlement route
- `settlePropCore` in `server/gameday-settle-helper.ts` — the actual settlement function
- Card open/lock state machine (`closed → open → locked → settled`)
- `GET /api/gameday/rooms/:id/leaderboard` — leaderboard query
- `PATCH /api/gameday/rooms/:id/finalize` — server route (no change needed)
- `GET /api/gameday/rooms/:id/final-standings` — final standings
- Short-link resolution (`GET /api/gameday/rooms/by-code/:code`)
- `GET/POST/PATCH /api/admin/gameday/prop-library` — admin template management
- Global settlement system (`settle-group`) — grouping key naturally differs for Fantasy rooms
- Guest session management (`x-guest-session` header flow)
- `gameday_picks` table — no changes
- Room code + public link sharing
- `app/gameday/[roomId]/captain.tsx` — room captain view

---

## 16. Existing Infrastructure Requiring Extension

| Component | What changes |
|---|---|
| `gameday_rooms` table | Add `league_id`, `experience_type`, `competition_type`, `reward_*`. Widen `sport`. Make matchup columns nullable. |
| `gameday_props` table | Add `scoring_scope`, `point_value` |
| `gameday_pick_cards` table | Widen `phase` constraint |
| `gameday_participants` table | Add `league_member_id` FK |
| `gameday_prop_library` table | Add `experience_type`, `competition_type`, `scoring_scope`, `point_value`, `answer_target_type`. Widen `sport`. |
| `GET /api/gameday/template` | Accept `experience_type` and `competition_type` query params |
| `POST /api/gameday/rooms` | Accept `league_id`, `experience_type`, `competition_type`, nullable matchup fields, `reward_description` |
| Leaderboard + final-standings routes | Filter by `scoring_scope='competition'` for winner determination |
| UI finalization gate (`host.tsx`) | Exclude `scoring_scope='season'` props from the "must be settled" check |
| `app/gameday/[roomId]/index.tsx` | Conditional fantasy header; season-prop pending badge |
| `app/gameday/[roomId]/host.tsx` | Conditional fantasy header; finalization gate fix |
| `app/gameday/create.tsx` | Fantasy path: league selector, hide matchup inputs, show competition_type picker |
| `server/gameday-template.ts` | Add `FANTASY_DRAFT_TEMPLATE` and `FANTASY_WEEKLY_TEMPLATE` fallback arrays |

---

## 17. New Foundational Functionality

| Functionality | Why it cannot be adapted from existing code |
|---|---|
| Fantasy League creation flow | New entity (`fantasy_leagues`), new screen, new server route — nothing analogous exists |
| Member identity claiming ("Who are you?") | Today join is free-text; claiming from a pre-loaded roster with duplicate-claim validation is new behavior |
| `fantasy_season_scores` write function | New table; triggered on finalization and season-prop settlement; no equivalent today |
| Competition creation within a league | New flow that reads league roster, auto-generates participants, links room to league |
| Fantasy League management screen | Commissioner's persistent view: roster, all competitions, season standings |
| Season standings view | Aggregated view from `fantasy_season_scores` across all competitions |

---

## 18. Build Now vs. Fast-Follow vs. Defer

### A — Build now because Draft Day directly requires it

- `fantasy_leagues` and `fantasy_league_members` tables
- `fantasy_season_scores` table (structure must exist; populated at Draft Day finalization)
- `gameday_rooms.league_id`, `experience_type`, `competition_type` columns
- `gameday_participants.league_member_id` FK
- `gameday_props.scoring_scope` and `point_value` columns
- Widen sport constraint on rooms and prop library
- Make matchup columns nullable
- Identity claiming flow ("Who are you?" join screen)
- Fantasy League creation form (commissioner)
- Fantasy Draft Day room creation within a league
- Fantasy Draft Day prop templates in `gameday_prop_library`
- `experience_type` and `competition_type` columns on prop library
- Conditional experience rendering in participant and host screens
- Finalization UI gate fix (exclude season-scope props)
- Season-prop pending badge in participant view

### B — Build now because season-long architecture requires the foundation

- `fantasy_season_scores` write function (triggered on finalization and season-prop settlement)
- `fantasy_league_members.external_*` columns (null for MVP — prevents backfill when imports arrive)
- `gameday_prop_library.answer_target_type` column (null for MVP — needed before templates proliferate)

### C — Design now, implement immediately after Draft Day

- Competition creation from existing league (Week 1 flow)
- Auto-generation of `gameday_participants` from league roster (eliminates Week 1 re-onboarding)
- Weekly prop template library (`competition_type='weekly'`)
- Season standings screen
- Reward display in competition view
- Commissioner league management screen (view all competitions, member roster)
- Push notifications tied to Fantasy competition events

### D — Explicitly defer

- Sleeper, Yahoo, ESPN, NFL Fantasy API integrations
- Automated roster synchronization
- Automatic result settlement via fantasy APIs
- Payment processing, prize distribution, Leagueswype
- Complex confidence wagering or point multipliers
- League voting or trade-opinion props
- Co-commissioner UI (data model supports the role; UI waits)
- Fantasy basketball and baseball prop libraries (architecture supports them; templates wait)

---

## 19. Regression and Migration Risk Assessment

All proposed changes are additive. No existing row is modified.

| Change | Why necessary | Existing rows affected | Backward compat risk |
|---|---|---|---|
| Add `experience_type` (DEFAULT `'game_day'`) to `gameday_rooms` | Taxonomy discriminator | No — default covers all existing rows | None |
| Add `competition_type` (nullable) to `gameday_rooms` | Competition classification | No — null for all existing rows | None |
| Add `league_id` (nullable) to `gameday_rooms` | League relationship | No — null for all existing rows | None |
| Widen `sport` constraint | Support football/basketball/baseball | No — existing nba/soccer values remain valid | None |
| Make `team_a_name` etc. nullable | Fantasy rooms have no matchup | No — existing rows keep their values | Low — server validation conditioned on `experience_type` |
| Add `scoring_scope` (DEFAULT `'competition'`) to `gameday_props` | Season-long prop handling | No — default preserves existing behavior | None |
| Add `point_value` (DEFAULT `10`) to `gameday_props` | Variable scoring | No — default preserves `correct × 10` | None |
| Add `league_member_id` (nullable) to `gameday_participants` | Identity claiming | No — null for all existing participants | None |
| Extend `gameday_prop_library` columns (all with defaults) | Template taxonomy | No — additive with defaults | None |
| Finalization UI gate change | Allow season-scope pending props | Game Day rooms have no season-scope props — gate behaves identically | None |
| Leaderboard scope filter | Score only competition props | Game Day rooms: all props are competition-scope — result identical | None |
| New `fantasy_leagues`, `fantasy_league_members`, `fantasy_season_scores` tables | New entities | Does not touch any existing table | None |

> **The global settlement system is unaffected.** It groups props by `sport|team_pair|date|phase`, which produces completely distinct keys from Fantasy rooms. No Fantasy room will ever be accidentally included in a Game Day global settlement batch.

> **1v1 Swayger is unaffected.** `user_balances.swayger_points` is never touched by Fantasy scoring.

---

## 20. Revised Draft Day MVP

The minimum viable Draft Day that builds inside the season model.

### Commissioner flow

```
Create Fantasy League
  → League name, sport (football), season year
  → Enter member roster: display name + team name for each member

Configure Draft Day
  → Select props from Fantasy Draft Day library
  → Member names auto-populate member-name prop answer options
  → Select season-long props (who wins the league, etc.)
  → Set draft date

Publish → Share invite link
```

### Member flow

```
Tap invite link
  → "Who are you?" → select identity from roster
  → Optionally sign in or continue as guest
  → Make picks across all open cards
  → Watch live leaderboard
  → See Draft Day winner
  → Season-long picks remain visible as pending
```

### Minimum schema changes

Five migration files (A through E above) — all additive, no existing row touched.

### Minimum new screens

- Fantasy League creation form (commissioner)
- "Who are you?" identity claiming view (replaces free-text join for fantasy rooms)
- Fantasy competition creation within an existing league

### Minimum modified screens

- Room creation (`app/gameday/create.tsx`) — detect fantasy path, show league context
- Participant room view (`app/gameday/[roomId]/index.tsx`) — fantasy header, season-prop badge
- Host panel (`app/gameday/[roomId]/host.tsx`) — conditional fantasy header, finalization gate fix

### What remains manual for the first live Draft Day

- Commissioner settles all props by hand during the live draft
- Commissioner manually fulfills any rewards outside Swayger
- No automated draft data feeds

### What explicitly waits until after the first live test

- Auto-generation of Week 1 participants from league roster (table structure exists; flow waits)
- Season standings screen
- Weekly prop templates
- Co-commissioner UI

---

## 21. Recommended Implementation Sequence

### Phase 1 — Schema foundation

**Objective:** Create all persistent tables and extend existing ones. Zero behavior change.

- Schema: Migrations A through E (all five, applied together)
- Server: None
- UI: None
- Tests: Verify all existing Game Day room creation, join, pick, settle, and finalize flows are unaffected. Verify migrations apply cleanly.
- Acceptance: All 5 migrations apply. Existing rooms continue working. No new functionality visible.

---

### Phase 2 — Fantasy League creation

**Objective:** Commissioner can create a Fantasy League with a member roster.

- Schema: None (Phase 1 already applied)
- Server: `POST /api/fantasy/leagues`, `POST /api/fantasy/leagues/:id/members`, `GET /api/fantasy/leagues/:id`
- UI: `app/fantasy/create.tsx` (league creation form), `app/fantasy/[leagueId]/members.tsx` (roster management)
- Tests: Create a league, add 12 members with team names, retrieve roster
- Acceptance: `fantasy_leagues` row created; 12 `fantasy_league_members` rows created; roster retrieves correctly.

---

### Phase 3 — Fantasy Draft Day room creation

**Objective:** Commissioner creates a Draft Day competition within an existing Fantasy League.

- Schema: None
- Server: Extend `POST /api/gameday/rooms` to accept `league_id`, `experience_type='fantasy'`, `competition_type='draft_day'`; write new columns; populate `answer_options` for member-name props from league roster
- UI: `app/fantasy/[leagueId]/create-competition.tsx` — Draft Day room creation form within a league; prop selection from Fantasy Draft Day templates; auto-populated member names
- Tests: Create a Draft Day room; verify `league_id` written, `experience_type='fantasy'`, member-name props correct
- Regression: Create a standard NBA Game Day room — verify it still works identically
- Acceptance: Fantasy Draft Day room created with correct league link and props.

---

### Phase 4 — Identity claiming and member join

**Objective:** League members join via "Who are you?" instead of free-text name.

- Schema: None
- Server: `POST /api/fantasy/leagues/:id/members/:memberId/claim` (validates and sets claim); extend `POST /api/gameday/rooms/:id/join` to accept `league_member_id` and populate `gameday_participants.league_member_id`
- UI: Replace free-text join form in `app/gameday/[roomId]/index.tsx` with a roster picker when `experience_type='fantasy'`
- Tests: 3 members claim identities (1 authenticated, 2 guests); verify no duplicate claims; verify pick submission works after claiming
- Acceptance: `gameday_participants.league_member_id` populated; picks work.

---

### Phase 5 — Fantasy prop templates

**Objective:** Draft Day prop library populated with correct taxonomy.

- Schema: Seed `gameday_prop_library` with Fantasy Draft Day templates (`experience_type='fantasy'`, `competition_type='draft_day'`), including season-long props (`scoring_scope='season'`)
- Server: Extend `GET /api/gameday/template` to accept `experience_type` and `competition_type` params; add `FANTASY_DRAFT_TEMPLATE` to `server/gameday-template.ts`
- Tests: `GET /api/gameday/template?experience_type=fantasy&competition_type=draft_day` returns Draft Day templates; NBA templates not in the result
- Acceptance: Commissioner sees correct prop catalog; member-name and season-long props visible.

---

### Phase 6 — Scoring scope and finalization

**Objective:** Draft Day can be finalized while season-long props remain pending; scores are computed correctly.

- Schema: None (columns added in Phase 1)
- Server: Update leaderboard and final-standings queries to filter by `scoring_scope='competition'` for winner determination; write `updateSeasonScores(leagueId, competitionId)` called on finalization
- UI: Fix finalization gate in `host.tsx` to exclude season-scope pending props; add season-prop pending badge in participant view
- Tests: Create room with 3 competition-scope props (2 settled) and 2 season-scope props (unsettled); verify finalization succeeds; verify leaderboard uses only settled competition-scope points
- Acceptance: Draft Day Champion declared correctly; season-scope props remain pending and visible.

---

### Phase 7 — Season standings write path

**Objective:** `fantasy_season_scores` is updated when season-long props eventually settle.

- Schema: None
- Server: Hook `settlePropCore` (or a thin wrapper) to detect `scoring_scope='season'` props and call `updateSeasonScores` after scoring picks
- UI: Season standings section in the Fantasy League view (basic list)
- Tests: Settle a season-scope prop after Draft Day; verify `fantasy_season_scores` updated; correct picks gain points
- Acceptance: Season standings reflect season-prop settlement correctly.

---

### Phase 8 — Fantasy conditional UI polish

**Objective:** All Fantasy rooms show Fantasy context; all Game Day rooms unchanged.

- Schema: None
- Server: None
- UI: `app/gameday/[roomId]/index.tsx` and `host.tsx` — detect `experience_type='fantasy'`; show league name and competition type instead of matchup header; remove team/star display for fantasy rooms
- Tests: Open a fantasy room — verify fantasy header; open an NBA Game Day room — verify matchup header unchanged
- Acceptance: No visual or functional regression on existing Game Day rooms.

---

## 22. Answers to the Six Final Architectural Challenge Questions

### Q1: If we finish Draft Day and immediately build Week 1, what would need to be undone or restructured?

**With this architecture: nothing meaningful.**

League members are already in `fantasy_league_members` from Draft Day. Their identity claims (`user_id` or `guest_session_id`) are already on those rows. Week 1 creates a new `gameday_rooms` row linked to the same `league_id` with `competition_type='weekly'`. Participants can be auto-generated from the existing roster. Draft Day scoring is already in `fantasy_season_scores`.

The one risk: if `fantasy_season_scores` write function is omitted from Draft Day, adding it later requires a retroactive backfill. This is addressed by including the function in Phase 7 before Draft Day ships.

---

### Q2: Can a member who joins on Draft Day participate in Week 1 without re-entering their identity?

**Yes, by design.**

The identity claim at Draft Day populates `fantasy_league_members.user_id` or `fantasy_league_members.guest_session_id`. When Week 1 creates `gameday_participants` from the league roster, that FK carries forward. Members open Week 1 and are recognized automatically. The "Who are you?" screen does not reappear.

Guest members retain their session via `guest_session_id` stored on the device. Authenticated members are recognized via their Supabase session. The claim is durable.

---

### Q3: Can a season-long prop created on Draft Day remain unresolved while Draft Day is finalized and a Draft Day winner is declared?

**Yes, structurally and by behavior.**

- The server finalization route has no check on prop settlement state (confirmed by code inspection).
- The leaderboard counts `is_correct = true` picks — a `null` `is_correct` on a pending season-scope prop contributes 0 points.
- The UI finalization gate is adjusted to exclude season-scope pending props.
- The Draft Day winner is computed from competition-scope picks only.

No architectural change is required beyond the UI gate adjustment and the leaderboard scope filter.

---

### Q4: Can the same architecture support fantasy basketball or fantasy baseball?

**Yes.**

The three-dimension taxonomy (`sport`, `experience_type`, `competition_type`) cleanly separates the actual sport from the Fantasy experience mode. A fantasy basketball league has `sport='basketball'`, `experience_type='fantasy'`. Nothing in `fantasy_leagues`, `fantasy_league_members`, `fantasy_season_scores`, or `gameday_participants` is football-specific. The full stack — Draft Day creation, member onboarding, identity claiming, pick submission, settlement, scoring, and season standings — works identically for any sport. Sport-specific prop templates are the only sport-specific artifact, and they are filtered by the taxonomy.

---

### Q5: Can manual league setup later be replaced or supplemented by Sleeper/Yahoo/API import?

**Yes.**

The internal canonical entities are `fantasy_leagues` and `fantasy_league_members`. Manual creation and API import both populate exactly these tables. The external fields (`external_provider`, `external_league_id`, `external_member_id`, `external_team_id`) bridge the import source to the canonical model. No downstream code queries which provider created the data. Import is a pre-population step, not an ongoing dependency. A league that started with manual entry can later be linked to a Sleeper league by populating the external fields — no structural change required.

---

### Q6: Can a weekly reward be added without introducing payment custody or rebuilding the competition model?

**Yes.**

`fantasy_leagues.default_reward_description` and `gameday_rooms.reward_description` are display-only text fields. Adding a reward is a commissioner UI interaction that writes a string. The competition model has no awareness of whether a reward is fulfilled. No payment flow, no custody, no payout ledger. The commissioner fulfills rewards manually outside Swayger. The platform bears no financial responsibility.

---

*Document generated: 2026-08-10*
*Based on codebase inspection of the Swayger repository at time of writing.*
*No code was written, no migrations applied, no files modified in producing this document.*
