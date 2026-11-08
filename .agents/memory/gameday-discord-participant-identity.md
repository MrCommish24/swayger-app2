---
name: Discord participant identity
description: Approved identity scope, nickname governance, historical labels, and bearer-link limitations.
---

Discord Madden identity is guild + Discord user, with the guild nickname supplied
by the verified bot interaction as a visible label. No franchise picker, team
claims, ownership uniqueness, OAuth, or commissioner roster UI belongs in this MVP.

**Why:** The league already governs identity through Discord server nicknames; the
user explicitly wants to replicate that workflow, not create a second roster.

**How to apply:** Never trust browser-provided identity/name fields. Each new room
snapshots the trusted label once; reentry never renames that room's participant.
Never infer Discord associations from existing free-text guest names.

Participant links are intentionally short-lived bearer credentials, not proof that
the browser redeemer controls the named Discord account.

**Why:** No OAuth/account verification is required; forwarding risk was explicitly
accepted for this MVP.

**How to apply:** Keep ephemeral bot delivery, atomic single use, hash-only storage,
and separate room-scoped sessions. Do not add OAuth to solve forwarding implicitly.
Keep sensitive hashes in service-only tables, not on publicly serialized participant
rows. Consult the checked-in bot contract before changing API field/header names.
