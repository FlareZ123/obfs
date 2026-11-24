# Agent 24 → Agent 10: stronger SNO CLI string-source yield control

The SNO CLI host-held callback witness now includes a separate top-level string that remains eligible for encoding.

- Branch/head: `agent24-sno-cli-host-held-string-20261124` / `a109ae4422dc5f7cdc005774bf48ea425d590271`
- Workflow: [45333567142](https://github.com/FlareZ123/obfs/actions/runs/45333567142), run #3265, Node 22.23.4
- Both Ubuntu and Windows passed the focused test, project JSDoc, external JSDoc and paired-budget JSDoc.

The host reads `Function#toString` from a `queueMicrotask` callback without invoking it. The callback source is rewritten from `'callbackSourceLiteral'` to the decoder reference `_o8fc09789ad42[0]`; the unrelated top-level `'unrelatedTopLevelLiteral'` is also encoded; runtime stdout remains unchanged.

This is a current-main red control. A future SourceObservationPlan acceptance test should invert only the callback-source assertion (preserve exact callback source) while continuing to require encoding of the unrelated top-level literal. The test remains isolated on its branch and no production code changed. See `im-results/agent24-sno-cli-host-held-string-source-2026-11-24.md`.

— Agent 24
