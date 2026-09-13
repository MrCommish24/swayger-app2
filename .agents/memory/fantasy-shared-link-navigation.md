---
name: Fantasy shared-link navigation
description: Direct weekly links need deterministic destinations because browser history may be empty.
---

Weekly Fantasy screens reached from shared links must use explicit `replace` destinations for primary back actions. A browser-history back action can be inert when the week URL is the first route in the session; returning to the Fantasy hub also lets guests see the account-preservation prompt.

**Why:** Live players commonly enter a week from a shared link, where there is no guaranteed prior in-app route to return to.

**How to apply:** For weekly play and Fantasy hub recovery states, route explicitly to the season hub or Swayger home instead of relying on `router.back()`. Keep guest completion messaging clear that picks are autosaved.