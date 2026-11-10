---
name: Expo preview API proxy
description: Development-only routing for the separate Expo browser origin and Express API workflow.
---

The Expo/Replit browser workflow has a separate `.expo` origin from the Express API workflow. Metro must proxy `/api` requests to the local Express service so browser-origin API calls receive backend JSON instead of Metro's HTML shell.

**Why:** Browser `getApiUrl()` intentionally uses the current origin, which is correct for production same-origin deployment but sends Expo preview requests to Metro unless the development server forwards `/api`.

**How to apply:** Keep the proxy in Metro configuration only, preserve the existing Expo middleware, forward request headers unchanged, and target the existing local API port. Do not add application-level hostname branches or change production/native API behavior.

Server-owned public HTML pages must be reached with a document navigation, not
an Expo `router.replace` call. Development proxying supports direct requests;
it does not register Express pages in the client router. Anchors can scroll
correctly even when Expo normalizes the hash away.

**Why:** A callback probe to a server-only explainer reached the URL but rendered
the client not-found screen; a valid section CTA also failed a hash-only test.

**How to apply:** Keep pending auth returns scoped to real app destinations.
Test section CTAs by destination visibility rather than mandatory hash changes.