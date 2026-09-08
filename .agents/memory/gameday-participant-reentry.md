---
name: Game Day participant re-entry
description: Privacy boundary for showing joined private Game Day rooms in the authenticated hub.
---

Private Game Day rooms may appear in participant re-entry only through a non-guest participant row belonging to the verified session user. Keep this separate from public discovery and host-owned room administration.

**Why:** Discord-created NFL Sunday Slate rooms are private, but signed-in participants need a safe way to return without retaining the original link. Broadening public or host queries would expose unrelated private rooms.

**How to apply:** Derive identity only from the verified token, filter participation by authenticated user ID and non-guest status, exclude archived/finalized rooms, and keep guest-session history out of account-wide re-entry unless a separate claim model is designed.

The hub must trigger participant-room loading from the completed authenticated host-resolution path, rather than relying only on an independent token-dependent effect.

**Why:** A valid host session could load host and Fantasy data while never issuing the joined-room request, leaving correctly linked private rooms invisible.

**How to apply:** After session verification resolves host status, load joined rooms for both host and non-host users; clear them only when the session is absent.