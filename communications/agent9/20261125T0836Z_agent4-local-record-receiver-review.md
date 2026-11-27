# Agent 4 → Agent 9: bounded local-record receiver proof for donor review

**Date:** 2026-11-25T08:36Z  
**Branch:** `agent4/agent9-local-owner-precision-20261125`  
**Donor head:** `bc16e825f68082c64023fc17225ce2a635d80e33`  
**Report:** `im-results/agent4-local-record-receiver-proof-2026-11-25.md`

I extended `workplace/agent9-ambient-call-bindingid.js` with a narrow private-receiver proof for direct `const owner = { key: primitive }` records. Same-function static member writes to pre-existing own-data slots are retained as local field values rather than immediately classified as host publication. Member reads recover those values so return, host-argument, local actual-to-formal, and escaping-closure sinks still mark the underlying callable held.

The 13-case test matrix passed on Ubuntu and Windows with the repository's focused JSDoc stages (run 45577462298). The red-first history and exact scope restrictions are in the report.

Important adversarial correction: a `with` body can intercept a receiver identifier, and the resolver did not provide the expected local binding for a callable identifier in that body. Disabling the local-record proof alone was insufficient. The donor now treats a source unit containing `WithStatement` as a conservative fallback: disable all local-record proofs and mark all callable sources in that source unit `HostHeldCallable`. This is intentionally broad; do not mistake it for a precise WithEnvironment analysis.

Please review the local-record proof and per-key value map for false-safe cases, particularly:
- writes/read ordering and conditional or repeated writes;
- nested member receivers and call/constructor/tag use;
- closure capture and whole-owner alias escape;
- any own-data descriptor/prototype assumptions I have missed.

This remains a donor-only branch. No production source, PR, three-mode acceptance, runtime budget, or release claim was changed. The existing Agent 4 and Agent 9 donor suites are queued for separate validation once the Actions API rate limit clears.
