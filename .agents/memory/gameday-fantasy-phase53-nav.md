---
name: Gameday Fantasy Phase 5.3
description: Commissioner weekly workflow — default preselection, Use Last Week's Questions, NEXT UP hub section, getCommissionerNextAction helper, 53/53 tests
---

## Key decisions

**Template lineage is free:** `gameday_props.template_prop_id` already stores the source library ID at publish time (set via `(v_prop->>'library_id')::TEXT` in `publish_fantasy_weekly` RPC). No SQL needed for "Use Last Week's Questions."

**No SQL applied this phase.** All changes are UI/workflow/backend endpoint only.

## Backend

New endpoint: `GET /api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/last-week-templates`
- Returns `{ template_ids: string[], inactive_template_ids: string[] }`
- Week 1 returns empty immediately (no previous week)
- Reads `gameday_props.template_prop_id` from the previous week's card props
- Cross-references active library to flag inactive IDs

## API lib

`getLastWeekTemplates(leagueId, seasonId, weekNumber, auth)` → `LastWeekTemplatesResponse`

## Frontend — Setup screen (setup.tsx)

- **Default preselection:** On load, `setSelected(new Set(templates.filter(t => t.is_default).map(t => t.id)))` — same pattern as Draft Day
- **"Use Last Week's Questions" button:** Calls `getLastWeekTemplates`, replaces `selected` set with returned IDs (only those present in current template list)
- **Section headers:** "SUGGESTED QUESTIONS" for `is_default` templates, "MORE QUESTIONS" for optional
- **"WEEK N SWAYGER" week label** above heading for context
- Button only shown when `wn > 1`

## Frontend — Hub ([leagueId]/[seasonId].tsx)

- **`getCommissionerNextAction(ws)`** helper: derives `create | share | remind | lock | resolve | continue_resolve | finalize | view_results` from `WeeklySummaryResponse` — pure derived state, nothing stored
- **"NEXT UP" section:** Replaced the old `setupNextWeekBtn` row with a proper card: "NEXT UP" section label (green), "Week N Swayger" title, "Ready to set up your next weekly Swayger." subtitle, full-width green CTA "Create Week N"
- **Lock Picks visual hierarchy:** Changed from large purple solid button to ghost/bordered `lockPicksBtn` style — keeps it accessible but visually secondary below Share

## Tests

`server/test-fantasy-phase5-3.ts` — 53/53

Sections: §A-§E hub next-action states, §F-§H template defaults, §I-§L last-week-templates endpoint, §M roster change, §N dynamic week number, §O full 3-week workflow + standings, §P identity regression

## Full regression

91 + 67 + 93 + 55 + 39 + 73 + 53 = 471 tests, 0 failures across all phases 5–5.2.3+5.3
