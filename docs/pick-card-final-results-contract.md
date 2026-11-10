# Pick Card final results contract (additive)

Applies to `GET /api/gameday/rooms/:roomRef/final-standings` for finalized
Madden Weekly Pick Cards (`sport: madden`, `template_type: weekly_pick_card`).
Authentication, guild scoping, archived/unfinalized responses, and **every
existing field** are unchanged. Scoring, winner semantics, settlement and push
handling are unchanged. Labels are backend-authored; consumers must not derive
the opposite spread or infer ATS from `line_text`.

## Added top-level fields (Pick Cards only)

| Field | Meaning |
| --- | --- |
| `pick_type` | `straight_up` or `spread`. Cards with a missing value read as `straight_up`. |
| `pick_type_label` | `Straight Up` or `Against the Spread` |
| `win_condition_label` | `Perfect Card` or `Most Correct` (`scoring_mode` is unchanged) |
| `main_summary` | `{ total_main_props, settled_main_props, top_correct_picks }` — main matchups only |
| `main_results[]` | Ordered (by `display_order`) resolved main matchups, below |
| `bonus.game.result` | Resolved Bonus Game with `prop_role: "bonus_game"`, team/display fields below, or `null`. Categorical legacy bonuses have null team/matchup fields. |

`main_results[]` item:

```json
{
  "prop_id": "<uuid>",
  "display_order": 0,
  "prop_role": "main_matchup",
  "pick_type": "spread",
  "team_a": "Giants",
  "team_b": "Cowboys",
  "line_text": "-6.5",
  "status": "settled",
  "correct_answer": "Giants",
  "correct_answer_label": "Giants +6.5",
  "opponent_answer": "Cowboys",
  "opponent_label": "Cowboys -6.5",
  "matchup_label": "Giants +6.5 vs Cowboys -6.5",
  "result_label": "Giants +6.5 over Cowboys -6.5",
  "display_options": [
    { "value": "Giants", "label": "Giants +6.5" },
    { "value": "Cowboys", "label": "Cowboys -6.5" }
  ]
}
```

`line_text` is Team B's spread on ATS cards (`-6.5` => Team A +6.5, Team B -6.5).
`result_label`/`correct_answer_label` are `null` until the prop is settled, when
an ATS line is invalid, or when more than one correct value is stored (a manual
push); never guess a side. Straight Up results use bare names
(`"Giants over Cowboys"`). Pick'em: `"Giants PK over Cowboys PK"`.

## Main score, Bonus Game and Total stay separate

- Leaderboard `correct_picks` and `main_summary` count main matchups only.
  Render `correct_picks/main_summary.total_main_props` (e.g. `3/6`).
- `bonus.game.result` is the resolved Bonus Game; per-participant outcome is in
  `bonus.results[].bonus_game_selected_option` / `bonus_game_correct`.
- `bonus.total` has the numeric `actual_total`; participants'
  `bonus.results[].predicted_total` / `exact_total_hit`. Exact-number only, no
  over/under. None of these affect the main score.

## Example: Straight Up (excerpt)

```json
{
  "pick_type": "straight_up",
  "pick_type_label": "Straight Up",
  "win_condition_label": "Perfect Card",
  "main_summary": { "total_main_props": 6, "settled_main_props": 6, "top_correct_picks": 3 },
  "main_results": [
    { "prop_id": "<uuid>", "display_order": 0, "team_a": "Giants", "team_b": "Cowboys",
      "line_text": null, "correct_answer": "Giants", "correct_answer_label": "Giants",
      "matchup_label": "Giants vs Cowboys", "result_label": "Giants over Cowboys" }
  ],
  "winner": null
}
```

## Example: Against the Spread (excerpt)

```json
{
  "pick_type": "spread",
  "pick_type_label": "Against the Spread",
  "win_condition_label": "Most Correct",
  "main_results": [
    { "display_order": 0, "team_a": "Giants", "team_b": "Cowboys", "line_text": "-6.5",
      "correct_answer": "Giants", "result_label": "Giants +6.5 over Cowboys -6.5" },
    { "display_order": 1, "team_a": "Bears", "team_b": "Packers", "line_text": "PK",
      "correct_answer": "Bears", "result_label": "Bears PK over Packers PK" }
  ],
  "bonus": { "game": { "result": { "result_label": "Patriots +10 over Commanders -10" } },
             "total": { "actual_total": 47 } }
}
```

## Fields for the Discord bot's richer Final Results

`pick_type_label`, `win_condition_label`, `main_summary.total_main_props`,
`main_summary.top_correct_picks`, `main_results[].result_label` (render
`✅ <result_label>`), `leaderboard[]` (existing), `winners` / `winner_determined`
(existing), `bonus.game.result.result_label`, `bonus.total.actual_total`, and
`bonus.results[]`. Keep tolerating responses without the new fields (older
rooms, non-Pick-Card rooms).
