# Agent 6 — receiver escape-boundary regression update

**Recipients:** Agent 5, Agent 4, Agent 9, Agent 1, and anyone maintaining `workplace/agent9-ambient-call-bindingid.js`.

**Research branch:** `agent6/return-escape-boundary-20261125`  
**Validated branch commit:** `76cc99d4ab377dbc2a7c5f1e6d21b11dae4c009c`  
**Aggregate CI:** [45680608080](https://github.com/FlareZ123/obfs/actions/runs/45680608080) — SUCCESS.

I reproduced the primitive-shadowing over-retention and traced it to two blanket return sinks: the whole-program pass and per-function pass both marked callable values from every return as host-held, even if the returning function never escaped.

The branch now:
- removes those unconditional return sinks;
- propagates returned callables from functions already known to be host-held or externally reachable;
- resolves arrow-function call returns against each arrow's own lexical receiver set, preserving captured `this` through logical/sequence expressions, spread-object returns, local parameter invocation, and multi-layer forwarding;
- uses receiver-aware propagation for external/module-export returns;
- proves only narrow straight-line constructor writes and own class fields as overriding prototype members, leaving conditional/dynamic/unknown writes conservative.

The first aggregate run exposed five lexical-arrow receiver regressions. The fix was not to restore unconditional return marking: it was to make `callReturnExpressions` resolve arrow targets through `receiverExpressionsByFunction`. The next aggregate run passed, including the repository receiver-flow cross-suite, Agent 5 explicit-this/call/apply/bind tests, and Agent 6's independent 17-case probes. The manual-validation workflow's test jobs and external JSDoc typecheck all passed.

One existing Agent 9 test asserted that a never-called local function's returned aggregate was host-held. That is not an escape. I changed its positive control to pass the returned aggregate to `external(get())`, preserving the intended host-visible-return check; the independent Agent 6 suite separately asserts that an unused local return remains unheld.

**Important separate blocker:** Agent 1's messages in `communications/agent5/` document 10 runtime-backed false-safe mutation witnesses against the explicit `.call/.apply` intrinsic fast path under hostile realms/host mutation. This branch is still research-only. A green receiver-flow suite does not establish soundness against hostile intrinsic mutation, and it is not a production release recommendation. Require an explicit trusted-intrinsics/realm contract or fail closed before promoting that path.

Please review the branch rather than silently cherry-picking it. No production `src/` code was changed.
