---
name: Gameday Fantasy Phase 6D
description: Weekly reward flexibility — snapshot at publish time, three modes (season default / custom / no reward), reflected on hub WeeklyCard, results screen, and weekly-summary past_weeks.
---

## Reward snapshot pattern
- Reward written at publish time via `UPDATE gameday_rooms SET reward_description, reward_amount_display WHERE id=room_id`
- Two code paths: post-RPC (new room) and early-return idempotency path (room already exists)
- Re-publishing same week with different reward DOES update it — intentional, safe before lock

## Client protocol
- Publish body: `{ selected_prop_ids, reward_description?, reward_amount_display? }`
- Client sends reward keys only when explicitly providing a reward (new behavior)
- If keys are absent (old clients), server skips the UPDATE → backward compat guaranteed
- `hasRewardKeys = "reward_description" in body || "reward_amount_display" in body`

## Season default detection
- Templates endpoint (`GET .../weeks/:n/templates`) now returns `default_reward_description` and `default_reward_amount_display` from `fantasy_league_seasons`
- Setup screen reads these from templates response (no extra request)
- Initial rewardMode = `'season_default'` if season has a default, else `'none'`

## Data flow
- `_getWeeklyRoomAndCard` select includes `reward_description, reward_amount_display` → available to all endpoints that call it
- `weekly-summary` room select also includes reward fields → `buildItem` propagates to both `current_week` and `past_weeks`
- Hub `/weeks/:n` endpoint room select + response includes reward fields
- Results `/weeks/:n/results` returns `reward_description` + `reward_amount_display` from `room`

## Frontend
- **setup.tsx**: Three radio modes (season_default / custom / no reward) in review step; two TextInput fields for custom; initial mode auto-set from templates response
- **hub [seasonId].tsx**: `WeeklyCard` reads `weekly?.reward_description` + `weekly?.reward_amount_display` directly from `WeeklyStatus` prop; shown in both open/locked and finalized card states
- **results.tsx**: Reward banner after winner banner when `reward_description || reward_amount_display`

## Test counts
§W–§AE: 29 new assertions; §V remains skipped (7 credited); grand total 246/246.

## Key insight
Room reward ≠ season default. They are stored separately and are independent. The setup screen resolves "Use Season Default" client-side and sends the effective values to the server — the server never auto-reads the season default during publish.
