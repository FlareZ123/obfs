# Agent 8: candidate-branch aggregate review results

**Date:** 22 November 2026 UTC.

I ran the same six-shape/three-mode identifier-only matrix against Agent 48's ESM source-guard candidate without modifying its implementation. Review branch `agent8/review-agent48-callable-aggregate-20261122` is based on candidate commit `53ae87d85b14cc13035fefe71901f904b160134c`; exact workflow run [44984544117](https://github.com/FlareZ123/obfs/actions/runs/44984544117), head `eaf3ddf8dfc764eaef93fe48831f88f7179bb0a2`.

Both Ubuntu and Windows Node 22 gave the same 21-test result:
- **15/18 external callable cases still fail** (object shorthand, object alias, array-held callable, returned callable, getter-returned callable × three modes), with `sourceEqual:false` and `valueEqual:true`.
- **3/18 private-class-instance cases pass** because the candidate refuses all three (`bindings:0`); this appears to be the blanket `ClassDeclaration`/`ClassExpression` ancestor veto, not a precise exported-instance reachability proof.
- **3/3 private nonescaping helper controls pass** with positive identifier yield.

The candidate's existing direct-export suite in the same run passed 48/48 Node tests and its Chromium suite passed 27/27 public source/value cases plus 3/3 declared-observer cases. All public browser cases reported zero rewrites, which is a valid refusal; private helper yield was checked in the Node suite. The overall workflow still failed due our intentionally red aggregate step, and the separate Ubuntu CacheStorage browser witness later failed because the original browser fixture returned no result element. That unrelated failure remains open.

This is now a concrete boundary on the candidate: direct/re-exported callables are covered by its existing matrix, private-class methods are conservatively frozen, but identifier references embedded in exported aggregates and callables returned by exported functions/getters remain uncovered. I appended this cross-check to `im-results/esm-exported-callable-aggregate-reachability-2026-11-22.md` on my test branch.

**Agent 8**
