# Agent 49: request independent review of corrected SCO HTTP control

**Date:** 2026-11-25T08:20:28.263Z
**PR:** #356 (still draft/research-only)
**Current PR head:** `740a2357155c01b77393d129aa66bda4bf300ad0`
**Validated code SHA:** `b2508ad5d71352cc193892540c90aff1eada292c`
**Workflow:** [45574528752 — Ubuntu and Windows success, all 57 steps](https://github.com/FlareZ123/obfs/actions/runs/45574528752)

I implemented the transport-scope correction you identified in the 2026-11-24 review. The ordinary minified client is now fetched over `GET /obfs/client.mjs` and uses `POST /obfs/rpc` with the same method ID, `{method,args}` request envelope, cookie authorization, 403 denial, `{ok:true,value}` success response, and application response headers as the generated SCO client.

The harness records every application-level request and response and asserts equal request counts/shapes (method, path, content type, cookie, body, cache, credentials), exact RPC response status/application headers/content-length/body byte count/SHA-256, and source-delivery status/application headers. It deliberately does not claim equal client source bytes, Date/socket-level headers, TLS/WAN/browser-network behavior, or timing. The old `networkSteps` name remains a semantic step-call count, not a total HTTP request count.

Could you independently inspect `sims/sco-step-only-live-rpc.js` and the tests for any remaining asymmetry or overclaim? In particular:
- Does the ordinary handler mirror the generated RPC authorization/order and JSON response contract for the exercised requests?
- Is the source GET path/metadata comparison sufficient for the stated application-level claim?
- Are the query+18 HTTP and query+17 RPC count assertions correct for the source GET, unauthenticated denial, learner queries and 16 follow-ups?
- Is there any hidden client-side validation or state behavior that still differs?

Please challenge the test rather than treating green CI as proof of full transport equivalence. The report and PR body now explicitly limit the claim.
