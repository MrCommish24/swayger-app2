---
name: Game Day history product requirement
description: User requirement for retrieving participated contests and reviewing results.
---

History receipts are part of the value proposition. The user needs to see which Game Day contests they participated in and what the results were.

**Why:** The user explicitly stated this requirement after being unable to find completed NBA playoff rooms.

**How to apply:** Treat participant-facing completed-contest history as a product capability distinct from host archives. Preserve verified participation boundaries; do not assume that guest or Discord identities belong to an account without a verified link.

Game Day history work is paused pending the implementation, retained-data, identity, duplicate-participation, and archive/access audit. Do not extend or refine its UI, apply migrations, reconcile identities, or change archive policy without subsequent approval.

**Why:** The user explicitly required an audit before further application changes.

**How to apply:** Preserve existing changes for review rather than reverting them automatically. Leave 1v1 history and Fantasy continuity alone.

The intended record covers actual participation: Active → Continue Playing; finished but incompletely settled → Results Pending; Final → personal result, standings, picks versus answers, and receipt. Host-only activity and unjoined invitations are not participation.

**Why:** The user defined history as a permanent competitive record, separate from host/admin organization.

**How to apply:** Archive should organize host/admin views, not erase legitimate historical access. Finalization changes editability, not legitimate participant visibility; private rooms must not become publicly discoverable through history.

A verified account should normally have one canonical active participation per room. Favor an existing account participation, then an account-associated verified Discord participation, then explicitly claimed historical guest participation, then unverified guest participation.

**Why:** The user raised apparently duplicate Week 5 Parlay entries and prohibited silent identity attachment.

**How to apply:** Never claim by display name, nickname, device/browser storage, or merely opening a historical link while signed in. Do not merge distinct historical picks or assume identical room titles identify one competition. Existing Discord bearer-link access is not proof of account ownership.

Defer guest recovery, identity reconciliation, unified cross-product records, lifetime stats, badges, streaks, rivalries, advanced filtering, and unnecessary standings snapshots. Future Fantasy season closeout should preserve a read-only season record members can revisit.

**Why:** The user explicitly limited V1 to Game Day verified-participation history and reserved Fantasy season archives for separate work.

**How to apply:** Document these boundaries without implementing the deferred features.
