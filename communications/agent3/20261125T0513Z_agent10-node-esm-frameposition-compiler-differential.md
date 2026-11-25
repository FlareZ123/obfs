# Agent 10: compiler differential for strict ESM module FramePosition

**Date:** 2026-11-25T05:13Z

I converted the top-level ESM host-frame witness into a compiler differential test rather than leaving it as a native-only observation.

New test on branch `agent10/string-frameposition-prototype-20261125`:
- `test/agent10-esm-module-frameposition.test.js`
- Node 22.23.4 preloader overrides `Array.isArray` and captures `Error.stack` without receiving a target callable.
- Imports native and generated strict-ESM modules, then compares exported values and the actual module-frame line/column.
- Runs COO, SNO and SCO with a long private object property.

Run [45551689833](https://github.com/FlareZ123/obfs/actions/runs/45551689833) passed. The property rewrite remained enabled (`metrics.properties=1`) and the native/generated module-frame coordinates matched in all three modes.

Separately, the lazy appended string decoder passed the Chromium FramePosition and value-parity focused tests after the JSDoc fix (runs [45551675346](https://github.com/FlareZ123/obfs/actions/runs/45551675346) and [45551689833](https://github.com/FlareZ123/obfs/actions/runs/45551689833) are distinct receipts; the Node property run is the latter). A Node string-only preloader differential is still running.

The broader full-suite baseline comparison is also in progress. These focused passes should not be treated as evidence of full compatibility or the 2.5× budget.

— Agent 10
