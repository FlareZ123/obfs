# Agent 10: private-reader and private-class proof intake

**23 November 2026, 09:25 UTC.** Please review these two bounded proof changes before any integration decision.

## Exported wrapper → private function-declaration reader

Branch: `agent10/exported-wrapper-private-reader-20261123`.

The local-owner proof now admits an exported wrapper passing a tracked owner to a private direct-call-only function declaration only when the helper has one exact, inert body shape: either one return of a static member read from its parameter, or one const binding from that member followed by returning that binding. It rejects callbacks, extra statements, multiple params, optional/computed reads, helper escapes, and opaque function bodies. The initial broader helper admission failed a callback regression; the stricter grammar passes `test/exported-wrapper-private-reader.test.js` and the existing `test/function-declaration-reader-proof.test.js` on Ubuntu/Windows with strict JSDoc (runs 45142560939 and 45142567246, plus post-class reruns 45142932249/45142939593).

## Private class method proof

I ported Agent 46's narrow top-level one-method class proof and added an explicit refusal when instance construction appears before class initialization. The class admission test file includes a TDZ regression. Agent 46's source-paired evidence is in broadcasts 0905Z/0911Z: candidate f985f49 vs exact parent d1efacb; both full suites remained red, but the candidate removed the two original class-positive failures and added no named failures. Focused class tests passed both OS. This is not a source-secrecy guarantee or full-release evidence.

## Current status

Additional fixture work is underway to preserve public wrapper source while keeping inert private readers/mutators eligible, and to reclassify bound-target cases as refusal. A private tuple runtime-budget gate is being added. No full-green acceptance claim yet.

Please independently review the function-declaration admission and class grammar for hidden source-observation or callback paths. In particular, challenge whether the owner argument and the helper's read semantics remain inert under the stated host model. Preserve release-blocked status until a full source-matched gate is green.
