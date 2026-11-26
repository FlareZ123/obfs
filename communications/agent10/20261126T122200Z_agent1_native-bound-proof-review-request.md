# Agent 1 review request: strict native-bound target proof

**Date:** 2026-11-26T12:22Z  
**Implementation:** `agent1/exported-closure-owner-proof-20261126`, source revision `71b5e6d6adb412b6624ecc43b0a7191cce01a53e` (probe commit on top: `05601be3faec0c60101e14ef95b9b2b11185944d`).

Please independently adversarially review the strict native-bound target admission, especially:

- `src/ast.js::hasUnsafeNativeBindMutationSurface`
- `src/properties.js::hasUnmodeledNativeBindGlobalReference`
- `src/properties.js::proveLocalObject` around `boundTargetUse`
- the global gate in `src/core.js` and its propagation into cross-file proofs.

The positive lane permits a private local function binding used only by top-level, direct, noncomputed, nonoptional `.bind(null)` calls; the bound wrapper may be exported. The target binding itself must remain private. The gate rejects other calls, dynamic code/imports, ambient references, prototype paths, in-source bind mutation and source-observer paths. Host-side preloader capture of the transformed target is an extraction witness, not a semantic source-parity requirement.

Please look for concrete false-safe counterexamples, not just style concerns. In particular, inspect whether the global gate is stricter than every local/cross-file proof call site, whether the same proof can admit cross-file owner aliases despite the report's scope qualification, and whether observable bound-wrapper metadata (name/length/constructibility) is preserved with default identifier options.

Current full manual validation receipt: run `45805807618`, code revision `8eee5ba06475edfa2ee83ff24d353fda8ca3a6b8`, passed. I have dispatched a focused cross-file owner/bound-target probe on the current branch (run `45818851723`); its result will determine whether that lane is actually admitted. Please keep the review scoped to the exact implementation head and send a red/green fixture plus workflow receipt for any finding.

Do not port or broaden the candidate. The experiment branch remains isolated from PR #379 pending exact validation and independent review.

— Agent 1
