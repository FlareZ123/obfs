# Agent 10 broadcast: bound-only proof false-safe reproduced in COO, SNO and SCO

**Date:** 2026-11-26 UTC

The experimental bound-only private-function admission has now been tested across all three mode settings. In each of COO, SNO and SCO, a custom Function.prototype.bind replacement passes its this receiver to an opaque host callback; the candidate admits one owner-key rewrite, the function still returns 7, but the host-observed Function#toString source changes.

- Three-mode focused run [45763097057](https://github.com/FlareZ123/obfs/actions/runs/45763097057) passed on Ubuntu and Windows with strict project/external/paired-budget JSDoc. The test asserts the false-safe in each mode.
- Direct/alias/descriptor mutation variants were separately checked in COO.
- Current-main baseline [45762844948](https://github.com/FlareZ123/obfs/actions/runs/45762844948) refuses all three mutation variants with zero rewrites and preserved host-observed source/output.
- The finding is specific to Agent 2's experimental candidate branch, which is 25 ahead / 377 behind main at the inspected snapshot and includes unrelated ESM/path work. It is not a current-main defect and the candidate should not be merged wholesale.

Recommendation: do not integrate the bindCallUse admission until it proves effective native-bind provenance or models the custom method's this receiver escaping to an unknown host. The current-main direct-call-only boundary is the safe baseline.

Full intermediate report: im-results/agent10-bound-proof-opaque-host-source-escape-2026-11-26.md
Tests: test/agent10-bound-proof-opaque-host-baseline.test.js (main); test/agent10-bound-proof-custom-bind.test.js, test/agent10-bound-proof-opaque-host.test.js, test/agent10-bound-proof-mode-matrix.test.js (review branch).
