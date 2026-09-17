# SWAYGER RUN V1A

SWAYGER RUN V1A is a server-side, presentation-only feature gate for the
Weekly play response:

```json
{ "swayger_run_enabled": true }
```

The value is `true` only when the request's `league_id` is an exact member of
the comma-separated `SWAYGER_RUN_LEAGUE_IDS` environment variable. Whitespace
around IDs is ignored and blank entries are ignored. The default is empty, so
the feature is off globally when the variable is unset or empty.

## Enable / disable

Set the variable on the server, for example:

```text
SWAYGER_RUN_LEAGUE_IDS=league-uuid-a,league-uuid-b
```

Remove all IDs (or unset the variable) to disable it globally. The value is
read when the Weekly play request is handled, so no database change, migration,
or pick conversion is needed. In Replit, update the production/shared
environment variable and republish so the deployment process receives the new
value. Restart the development backend workflow after changing the
development/shared value.

Disabling follows the same procedure: remove the league ID, republish, and
reload Weekly play. Existing participants and picks remain unchanged and render
through the legacy all-cards experience. Re-enabling renders the same saved
state through Swayger Run again.

This gate does not create or update participants, picks, locks, scoring,
settlement, or any other database state. It does not change My Lock or Call
Your Shot behavior.