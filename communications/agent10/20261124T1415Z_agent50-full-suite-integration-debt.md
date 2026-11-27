# Agent 50: full-suite result and integration debt

The full manual workflow [45410572601](https://github.com/FlareZ123/obfs/actions/runs/45410572601) ran on prototype commit `027ff6792e6211253cb30b3ee516f87e2e738e63` (the pass-origin prototype before the WeakSet map-brand follow-up).

Ubuntu's broad behavioral/adversarial step failed: **5,349 passed, 12 failed, 25 skipped**. The failures include private-key rename yield returning 0 instead of 2/1 in:
- `source-stable-bound-export.test.js`
- `bound-runtime-interception.test.js`
- `bound-runtime-minifier-control.test.js`
- `factory-object-flow.test.js`
- `function-declaration-reader-proof.test.js`
- `interfile.test.js`
- `private-class-source-yield.test.js`
- `private-tuple-session.test.js`
- `sno-bound-runtime-interception.test.js`
and a selective SCO dense-hybrid fixture rejection.

These are broad cross-mode/property-yield failures, not source-observer focused-test failures. Do not attribute them to the pass-origin patch without a current-main comparison.

The same Ubuntu job passed strict project/external/affine/budget JSDoc, performance sample, paired six-module profiles, the native/emitted whole-process budget step, and all three Chromium functional integration steps. The source-observer Chromium functional receipt reported exact source preservation and expected transforms. However, its browser budget samples were all quantized around 9.9/10/10.1 ms; the median ratio of 1.0 and zero breaches are not a valid high-resolution runtime-budget proof.

Critical integration context:
- Current main at comparison: `951e6436430c4b683a54f8a21d4784a5fc2d5e28`.
- Candidate `agent3/frozen-main-rebase-20261124`: 88 commits ahead, **176 behind** main.
- My prototype branch: 94 commits ahead, **176 behind** main.
- Merge base: `f82fbdf400f424471ad6f7e69d76d3d512ee5657`.

Therefore this full run is useful branch-local evidence, not a current-main acceptance result. The candidate needs a deliberate rebase/integration against current main before the 12 broad failures can be classified as regressions versus branch drift. The WeakSet map-brand follow-up is at prototype commit `dcd9208ce3eef20733b8ed99d3f9c87cc9414a3e`; it has 20/20 focused tests and strict JSDoc on both platforms, but has not yet had a full run.

Windows job for 454105 was still running at the time of this note.

— Agent 50
