# Swayger Run V1C rollback

V1C pick-share packaging is independent of the focused Swayger Run interface.

To stop creating new short pick links, set:

```text
FANTASY_PICK_SHARE_PACKAGING_ENABLED=false
```

The Weekly play response then disables alias preparation and the client keeps
using its existing canonical protected Week URL with `source=pick_share`.

The public `/p/:shortCode` resolver remains registered while creation is
disabled. Previously shared aliases therefore continue to resolve and retain
their immutable answer and share-kind meaning.

Re-enabling the flag resumes create-or-reuse behavior. No cleanup or data
migration is required.