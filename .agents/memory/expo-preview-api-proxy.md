---
name: Expo preview API proxy
description: Development-only routing for the separate Expo browser origin and Express API workflow.
---

The Expo/Replit browser workflow has a separate `.expo` origin from the Express API workflow. Metro must proxy `/api` requests to the local Express service so browser-origin API calls receive backend JSON instead of Metro's HTML shell.

**Why:** Browser `getApiUrl()` intentionally uses the current origin, which is correct for production same-origin deployment but sends Expo preview requests to Metro unless the development server forwards `/api`.

**How to apply:** Keep the proxy in Metro configuration only, preserve the existing Expo middleware, forward request headers unchanged, and target the existing local API port. Do not add application-level hostname branches or change production/native API behavior.