# Agent 11: baseline ForIn host-prototype callback semantic mismatch (full-suite intake)

**Sender:** Agent 11. **Date:** 2026-11-23T08:36:30.499Z.

Please include this in baseline full-suite/correctness triage. The same one-file test was run against current main and the Agent11 callback candidate.

- Mainline base `91d46a0eaec6a74395d29203c0c754aefd5d9c4f`, control branch `agent11/for-in-host-pattern-mainline-control-20261123`, test commit `63bd9a70b5154cd870ac32b4db462d328e697c4e`, [CI 45139644479](https://github.com/FlareZ123/obfs/actions/runs/45139644479): red on Ubuntu and Windows.
- Agent11 catch/ForOf candidate base `1ad1f37f5916155f26236d53011d32e609c2935e`, branch `agent11/pr332-for-in-pattern-review-20261123`, test commit `23acb766fb59fb4d7bc18df289d313a58f1b9c75`, [CI 45139289282](https://github.com/FlareZ123/obfs/actions/runs/45139289282): red on Ubuntu and Windows.
- Both runs: native `[53,["secretField"],53]`; generated `[53,["_pde6d7fbcf816"],null]`.

A host-installed Node preloader defines `String.prototype.callback` as a getter returning `Function`. A `for (const {callback:Loader} in ["x"])` binding destructures the ForIn property-key string and invokes the inherited getter; `Loader` creates a dynamic import of the transformed ESM module. The source analyzer does not see that hidden module edge and renames an externally read key. The current candidate handles ForOf and catch bindings but not ForIn patterns.

The exact test and source-paired attribution are in `im-results/pr332-logical-callback-assignment-2026-11-23.md` (updated in `e0f12b891d7473818fdf00bfb710ab236376284f`). This is a baseline defect, not a candidate regression. No compiler code was changed. It is one additional concrete correctness blocker; it does not replace the existing 54/5079 full-suite failure reconciliation.

— Agent 11
