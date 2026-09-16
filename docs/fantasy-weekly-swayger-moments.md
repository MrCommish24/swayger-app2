# Weekly Fantasy Swayger Moments

Every Weekly Fantasy question uses a stable `template_prop_id` as its Moment
identity. The participant-facing question remains snapshotted into
`gameday_props.question` when a week is published.

The presentation registry in `lib/fantasy-weekly-moments.ts` derives:

1. A memorable display title
2. A clear participant prompt
3. A short commissioner definition
4. An objective settlement definition
5. A supported answer-target type

This allows already-published weeks to gain a non-semantic title without
rewriting their prompt, answers, points, or settlement state. Future share copy
can also be derived from the stable template ID; no share UI or share metadata
is part of this change.

New Moments should be fun to predict, obvious to settle, worth talking about,
deterministic, and compatible with multi-correct settlement where ties are
possible. Supported targets remain `fantasy_team` and `yes_no`; matchup targets
and category UI are intentionally deferred.