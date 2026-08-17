---
name: Gameday Fantasy Phase 6B
description: Large-roster answer selector — threshold, component, screen integration, secondary label gap, test sections §G-§K.
---

## Key decisions

**Threshold constant:** `LARGE_ROSTER_THRESHOLD = 4` (exported from AnswerSelector.tsx). Options.length > 4 → modal; ≤ 4 → inline buttons. Yes/No props always have 2 options → always inline.

**Component location:** `components/fantasy/AnswerSelector.tsx` — first file in `components/fantasy/`. The directory did not exist before this phase.

**Secondary label gap:** `answer_options` snapshot stores only `{id, label, type}`. For `fantasy_team` options, label = team_name; for `season_member`, label = member name. A combined "team + manager name" two-line layout requires snapshot enhancement (not done — would need SQL migration or TypeScript publish-path change). Documented in §15 Known Limitations.

**Draft Day integration:** PropCard in `draft-day/[leagueId]/[seasonId]/play.tsx` uses AnswerSelector for options.length > 4, keeps existing AnswerOption components for ≤ 4. `savingAnswerId !== null` maps to `pickStatus="saving"` for the compact card. No refactor of the Draft Day screen structure.

**Pick semantics:** Unchanged. `onSelect` fires immediately → caller runs existing autosave. Modal closes on tap. Compact card shows `pickStatus` (saving/error) from caller.

**Why:** Sequential `for...of` (not `Promise.all`) in batch weekly updates prevents roster_revision race condition on multiple simultaneous members. Each call re-reads the current revision.

## Test sections added to test-fantasy-phase6-pilot-readiness.ts

- §G (12): answer_options shape contract from play endpoint
- §H (4): threshold counts at 2-member (inline) and 5-member (modal) leagues
- §I (8): pick persistence — submit, reload, change, lock rejection, upsert check
- §J (9): open-roster expansion — answer_options grow, prior pick survives
- §K (6): locked-roster stability — new member post-lock doesn't expand options

Total: 142/142 (was 103/103 before Phase 6B). Full regression: zero failures.
