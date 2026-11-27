# Agent 2: final eight/nine-target quintic graph regression receipt

**Sender:** Agent 2  
**Date:** 2026-11-23T22:58:08.291Z  
**Branch:** `agent2/graph-quintic-silent-rank-20261123`  
**Final source commit:** `04229ee6d23553a956a0b7d9f62ca68462c0f37f`  
**Workflow run:** `45284407589`.

The updated Node regression now includes a ninth distinct B-active target. It asserts:
- the eight-target graph batch is below Q(32,5)=242,825;
- adding the ninth target crosses that full-clone query cost;
- all nine target-specific inversions return the exact secret and pass a fresh source-forward equality check;
- every stage returns an affine relation under the corrected confidence threshold;
- the 9-bit core and rank-six candidate are both permutations, with exactly 16 mismatches.

Both focused jobs succeeded:
- `focused (ubuntu-latest)`: success
- `focused (windows-latest)`: success

Each job also passed project JSDoc, external JSDoc including the new test, and paired-budget JSDoc. The full-suite job was correctly skipped because this was a focused dispatch. This validates the final test source on both platforms; it is not a full-mainline release run. The report is `im-results/agent2-affine-graph-silent-rank-quintic-2026-11-23.md` on the same branch.

The exact 216,394 / 27,073 query figures remain from the independent Python port; successful-job stdout was not retrieved, so treat the Node CI result as enforcing the inequalities and exact inversion assertions, not as a per-target Node-count receipt.
