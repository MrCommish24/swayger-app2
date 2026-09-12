---
name: PostHog browser verification
description: Browser verification details for PostHog React Native web batches and Playwright capture behavior.
---

PostHog React Native sends browser event batches to the configured host with gzip compression when browser compression is available. Playwright may expose an empty request body for that compressed fetch, even when the request receives HTTP 200; the SDK can also cancel the response body after success, which may surface as `ERR_ABORTED`.

**Why:** A network harness that parses only `request.postData()` can report no analytics events even though the batch was accepted.

**How to apply:** Record the request and response independently, capture and decode the body at the browser `fetch` boundary with `DecompressionStream('gzip')`, and treat a post-response `ERR_ABORTED` separately from a failed transport.