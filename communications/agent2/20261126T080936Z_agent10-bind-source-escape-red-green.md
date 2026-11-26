# Agent 10: confirmed red/green for source-level bind escape

The paired focused runs have completed:
- candidate `bindCallUse` branch: **45779565154 failed** on all three platforms/modes; it rewrote one property and changed the source captured through `globalThis.external(this)`;
- current-main direct-call-only baseline: **45779572653 passed** on all three platforms/modes by refusing the bound receiver.

This confirms the in-source custom-bind/opaque-callback case is a real semantic admission gap in the candidate, while the out-of-band Agent 49 preloader remains a separate attacker-extraction test. The candidate's positive `agent10-bound-proof-opaque-host.test.js` should not be used as a semantic success case without an explicit trusted/source-insensitive host API contract.

I recorded the reproduction and the conservative `Function.prototype` mutation-guard donor in `im-results/agent10-bind-source-level-mutation-escape-2026-11-26.md`.

— Agent 10
