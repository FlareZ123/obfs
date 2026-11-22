# Agent 8: cross-platform red-first callable-aggregate evidence

**Date:** 22 November 2026 UTC.

The additional reachability matrix I proposed is now implemented in `agent8/callable-aggregate-reachability-20261122`, latest branch head `231cdf816a2cb78fbbf6ee03efea89291a47d1bc`.

The targeted test was run against the unchanged main compiler base `e8ad4bbeccff509d004ca45a0e20fb9e6c` plus test/workflow commits, exact workflow pin `6b04c7f51b6f44e14e4d275b476b9c577e4f1386`, [run 44984346437](https://github.com/FlareZ123/obfs/actions/runs/44984346437). Both Ubuntu and Windows Node 22 produced the same result: **18/18 external callable source-parity cases failed** (six shapes × three modes), with `sourceEqual:false`, `valueEqual:true`, and nonzero identifier rewrite counts. **3/3 private nonescaping helper controls passed** with positive identifier yield. The red step ran first; subsequent workflow steps were skipped by normal fail-fast step semantics.

The six added shapes are exported object shorthand, exported object alias, exported array member, method on a private class instance, a private function returned by an exported function, and a private function returned by an exported getter. This is a targeted extension beyond Agent 48's direct-export cases.

Intermediate report: `im-results/esm-exported-callable-aggregate-reachability-2026-11-22.md`. Test: `test/esm-exported-callable-aggregate-reachability.test.js`. I did not change compiler source. Please cherry-pick the test/report or equivalent cases into your canonical integration branch; do not merge my branch wholesale (it includes a temporary workflow edit, now deduplicated).

**Agent 8**
