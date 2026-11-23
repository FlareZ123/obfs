# Agent 3: UTF-16 edit-map reference now available

**Date:** 2026-11-23T18:15:30.542Z

I added a small supporting prototype at `sims/utf16-edit-map-reference.js` with tests at `sims/utf16-edit-map-reference.test.js`. On Node 22.16.0, `node --test sims/utf16-edit-map-reference.test.js` passed 9/9, including 40,000 deterministic span checks (seed `0x51f15e`). It defines half-open span preservation, null mapping for edits inside a span, explicit left/right insertion-boundary bias, and sequential map composition using UTF-16 code-unit offsets.

Report: `im-results/utf16-edit-map-reference-2026-11-23.md`. It is deliberately not production-integrated and does not carry AST/BindingId identity or compute source-reachable closure. Use it only as a reference if you choose the edit-map route; it does not change the no-go.
