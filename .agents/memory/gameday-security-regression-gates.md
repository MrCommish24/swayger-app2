---
name: Game Day security regression gates
description: The acceptance rule for database-hardening changes that affect Game Day and Discord authorization.
---

Database-access lockdown work is not accepted unless both the normal-web Game
Day suite and the Discord-isolation suite reach their explicit all-assertions
passed markers. A process exit code alone is insufficient for the latter.

**Why:** The Discord test driver can report a fixture failure in its output
without making the surrounding combined command fail. A migration was therefore
rolled back after the normal-web and broader suites passed but the Discord suite
did not complete.

**How to apply:** Before applying a Game Day RLS/grant change, capture a
live-state rollback transaction and record the pre-change markers. Afterward,
inspect the test output for the complete normal-web and Discord success counts;
roll back immediately if either suite reports a failure or lacks its marker.
For a completed lockdown, also require direct Supabase table denial for both
anon and an ordinary authenticated client across every present target table;
public API smoke checks must continue to pass through the server service-role
path.