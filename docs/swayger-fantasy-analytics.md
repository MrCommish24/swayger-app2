# Swayger Fantasy Pilot Analytics

This runbook defines the PostHog dashboard cards used to evaluate the Swayger
Fantasy pilot. Dashboard configuration is not stored in this repository, so
these cards must be created in the live PostHog project.

## Dashboard

- **Dashboard name:** `Swayger Fantasy Pilot`
- **Default date range:** Last 30 days
- **Recommended global filter:** `experience_type = weekly`
- Do not add answer labels, team names, participant names, share text, contact
  information, tokens, or URLs as analytics properties.
- Use `template_prop_id` for Moment breakdowns. Resolve display names from the
  application registry when interpreting results.
- Weekly pick events include the safe UI properties `experience_version` and
  `run_variant` (`legacy` or `swayger_run_v1`). These describe presentation
  only; never add answer labels, participant identifiers, or share content.

### Swayger Run V1A comparison

Create a PostHog funnel named `Weekly Completion — Swayger Run vs Legacy`:

1. `fantasy_week_viewed`
2. `fantasy_week_pick_started`
3. `fantasy_week_pick_completed`

Use a 7-day conversion window, filter `experience_type = weekly`, and break
down by `experience_version`. Create a second trends insight for
`fantasy_week_pick_submitted`, broken down by `experience_version` and
`moment_index`, to identify the last server-confirmed Moment before departure.
Use `completed_count` and `question_count` only as numeric breakdowns. Compare
Call Your Shot conversion by adding `experience_version` as a breakdown to the
existing completion → share-opened → shared/copied funnel. Do not infer durable
guest return behavior across devices; anonymous guest identity remains
device/session scoped.

PostHog identifies signed-in users with their Supabase user ID. Guest activity
uses PostHog's anonymous identity and `is_guest = true`; it is device/session
scoped and should not be interpreted as a durable participant identity.

## Supporting action: Call Your Shot conversion

Create a PostHog Action before configuring the KPI cards:

- **Action name:** `Call Your Shot shared or copied`
- Match either:
  - event equals `fantasy_pick_shared`
  - event equals `fantasy_pick_link_copied`

This action provides the requested logical OR without emitting an additional
application event.

## Card 1: Pick Share Funnel

- **Insight type:** Funnel
- **Name:** `Call Your Shot — Pick Share Funnel`
- **Counting method:** Unique users
- **Conversion window:** 7 days
- **Order:** Strict
- **Steps:**
  1. `fantasy_week_pick_completed`
  2. `fantasy_pick_share_opened`
  3. Action: `Call Your Shot shared or copied`
- **Filters:**
  - `experience_type = weekly`
- **Display:**
  - Show step totals.
  - Show conversion from completed to opened.
  - Show conversion from opened to shared/copied.
  - Show overall completed-to-shared/copied conversion.

Duplicate this insight with **Counting method: Total events** and name it
`Call Your Shot — Pick Share Funnel (Total Events)` to distinguish repeated
shares from unique-user conversion.

PostHog person uniqueness is valid for signed-in users. Anonymous guest
uniqueness is valid only within the identity/session behavior already provided
by PostHog. Do not add participant IDs to improve this measurement.

## Card 2: Share Surface Breakdown

Create two trends in one insight:

- **Insight type:** Trends
- **Name:** `Call Your Shot — Share Surface Breakdown`
- **Series:**
  - `fantasy_pick_share_opened`
  - `fantasy_pick_shared`
- **Math:** Total events
- **Breakdown:** Event property `surface`
- **Expected values:**
  - `question_card`
  - `completion_state`
- **Filters:**
  - `experience_type = weekly`
- **Visualization:** Stacked bar

Optionally duplicate with **Math: Unique users** for reach by surface.

## Card 3: Most Shared Swayger Moments

- **Insight type:** Trends
- **Name:** `Call Your Shot — Most Shared Swayger Moments`
- **Event:** `fantasy_pick_shared`
- **Math:** Total events
- **Breakdown:** Event property `template_prop_id`
- **Filters:**
  - `experience_type = weekly`
- **Visualization:** Horizontal bar
- **Display limit:** Top 12 values

Do not add Moment title as an event property. Use the stable
`template_prop_id` values and the application Moment registry to label results
during analysis.

If copied predictions should be included, make a second card using the
`Call Your Shot shared or copied` action and the same breakdown. Keep the
`fantasy_pick_shared` card as the canonical platform-share measurement.

## Card 4: Shared-Pick Traffic

- **Insight type:** Trends
- **Name:** `Call Your Shot — Shared-Pick Week Traffic`
- **Series A:** `fantasy_week_opened_from_pick_share`
- **Series B:** `fantasy_week_viewed`
- **Math:** Unique users
- **Filters:**
  - `experience_type = weekly`
- **Formula:** `A / B * 100`
- **Formula label:** `% Week viewers from shared picks`
- **Visualization:** Line chart

Also display the raw A and B series so the dashboard shows both the percentage
and the underlying visit counts.

For total visit volume, duplicate the card with **Math: Total events** and name
it `Call Your Shot — Shared-Pick Week Traffic (Visits)`.

## Card 5: Share-to-Participation

- **Insight type:** Funnel
- **Name:** `Call Your Shot — Shared Visit to Completed Picks`
- **Counting method:** Unique users
- **Conversion window:** 7 days
- **Order:** Strict
- **Steps:**
  1. `fantasy_week_opened_from_pick_share`
  2. `fantasy_week_pick_started`
  3. `fantasy_week_pick_completed`
- **Filters:**
  - `experience_type = weekly`
- **Optional breakdown:** `is_guest`

This measures progression only when PostHog's existing person/session identity
can associate the events. It will undercount users who open on one device and
participate on another, and guests who lose or change anonymous identity. Do
not introduce cross-user matching, fingerprinting, participant IDs, or link
identifiers to close that gap.

## Card 6: Primary Call Your Shot KPI

**KPI:** Percentage of participants who complete Weekly picks and then share
or copy at least one prediction.

Configure:

- **Insight type:** Funnel
- **Name:** `Call Your Shot KPI — Completed Participants Who Share`
- **Counting method:** Unique users
- **Conversion window:** 7 days
- **Order:** Strict
- **Steps:**
  1. `fantasy_week_pick_completed`
  2. Action: `Call Your Shot shared or copied`
- **Filters:**
  - `experience_type = weekly`
- **Displayed value:** Overall funnel conversion percentage

Use unique PostHog persons as the measurable approximation of participants.
Report signed-in and guest results separately when guest traffic is material.

## Card 7: Secondary Call Your Shot KPI

**KPI:** Number and percentage of Week visits originating from a shared pick.

Configure:

- Reuse `Call Your Shot — Shared-Pick Week Traffic`.
- Report:
  - unique users for `fantasy_week_opened_from_pick_share`
  - total events for `fantasy_week_opened_from_pick_share`
  - unique-user percentage: shared-pick viewers / all Week viewers
  - visit percentage: shared-pick opens / all Week views

## Dashboard validation

After creating the cards:

1. Complete a Weekly card in a development or internal pilot account.
2. Open Call Your Shot from a question card and close it without sharing.
   Confirm only `fantasy_pick_share_opened` is added.
3. Share from a question card. Confirm `surface = question_card` and
   `share_method` reflects the successful platform method.
4. Copy from the completion-state composer. Confirm
   `surface = completion_state` and the copied event appears in the supporting
   action.
5. Open the generated Week URL. Confirm
   `fantasy_week_opened_from_pick_share` and a `fantasy_week_viewed` event with
   `source = pick_share`.
6. Verify no captured event contains an answer, team, participant name, share
   text, recipient, token, email, phone number, or private URL.
7. Save the live PostHog dashboard URL in the team's approved operational
    documentation. Do not commit API keys or personal credentials.

## My Lock measurement

Add Trends series for `fantasy_my_lock_selected` and
`fantasy_my_lock_changed`. Filter `experience_type = weekly`, break down by
`template_prop_id`, and use `experience_version` to compare focused and legacy
presentation cohorts. Use only `league_id`, `season_id`, `week_number`,
`viewer_role`, `is_guest`, `source`, `template_prop_id`, `experience_version`,
and `question_count`. Never add answer labels, team names, participant names,
share text, IDs, tokens, or contact information.
