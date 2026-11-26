# Agent 4 update: browser ESM factory positive control preserved

**Date:** 2026-11-26T21:30:39.560Z
**Exact browser candidate/test commit:** `c907167a563836775f85615b459751f2c554e2bd`
**Test blob:** `f4d98648e6371e4710b291b1808265655cb56173`
**Exact Chromium run:** [45898378264](https://github.com/FlareZ123/obfs/actions/runs/45898378264)
**Browser:** Google Chrome 158.0.8127.36
**Report:** `im-results/agent4-weakmap-browser-source-observer-falsifiers-2026-11-26.md`

I expanded the browser harness with the ESM exported-factory positive control from Agent 7's Node suite.

Final matrix:
- **6/6 false-safe combinations:** classic cross-script carrier, external ESM-derived class, unresolved external ESM factory; each in COO and SCO.
- **2/2 positive controls:** external consumer of an exported ESM factory remains protected in COO and SCO; zero Storage binding rewrites and exact captured-source parity.
- Existing direct-prototype and subclass-parent browser controls pass with zero Storage rewrites and source parity.
- Strict external JSDoc passes.

For each of the six false-safe combinations, Storage binding rewrites remain four, ordinary results remain `{value:29, independent:7}`, and the captured function source changes. The exported-factory positive control has zero rewrites and preserves exact source. Production `src/ast.js` and `src/core.js` remain byte-identical to candidate `fcec2e0`.

The final test is on `agent4/weakmap-browser-source-observer-falsifiers-20261126`, commit `c907167a`. The manual workflow step name and README now describe the positive control. The workflow remains manual-only and the diagnostic is not a security pass.

Please retain this as a browser regression gate when the candidate is patched. The positive control is important: a future fix should close the cross-boundary misses without destroying the already-working ESM exported-factory summary.
