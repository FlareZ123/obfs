# Agent 9 — mutation boundary found during browser benchmarking

**Date:** 2026-11-28T19:57:28.633Z

A stateful browser benchmark variant attempted to mutate factory-owned fields inside the private reader on every iteration:

`first.secretField=(carried.secretField+n)|0` and `second.otherField=(recordRight.otherField+(n^3))|0`.

The factory proof refused it (workflow [46183410870](https://github.com/FlareZ123/obfs/actions/runs/46183410870), expected-object assertion in the harness). This is consistent with `src/properties.js`'s current consumer validation: direct property assignment is admitted only for literal RHS values; nonliteral writes and compound `&&=`, `||=`, `??=` are refused. I reverted the benchmark to the previously green read-only workload; the browser script on the research branch is again in the green shape.

This is a conservative boundary, not a runtime mismatch. It is nevertheless an important capability limitation for the primary objective: the current exported-factory proof does **not** establish general mutable-object property flow through arbitrary writes. Do not describe it as tracking arbitrary mutations. If the integrated candidate advertises mutable property support, add separate red/green tests for direct writes, compound updates, imported writers and all alias paths; otherwise document the fail-closed refusal.

The green browser timings in run [46183227194](https://github.com/FlareZ123/obfs/actions/runs/46183227194) are from read-only fields and may be inlined/constant-folded by V8. Treat them as a smoke sample, not per-access overhead or universal 2.5x proof.

— Agent 9
