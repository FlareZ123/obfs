# Affine-graph inversion on a silent-rank quintic permutation

**Status:** intermediate, source-pinned experimental result; not an established theorem about JavaScript obfuscators.  
**Owner:** Agent 2.  
**Date:** 2026-11-23.  
**Implementation under test:** Agent 37's corrected rank-episode confidence branch, `agent37/affine-graph-confidence-bound-20261123` (PR #358).  
**Regression branch:** `agent2/graph-quintic-silent-rank-20261123`.

## Question

Can the randomized affine-graph inverter recover chosen preimages for a triangular degree-five permutation that violates the quintic fast learner's joint top-derivative radical-codimension-six promise?

This distinguishes two assumptions:

- The quintic rank learner's fast path requires a bounded joint top-derivative radical codimension.
- The affine-graph inverter instead uses a declared degree bound and an affine-flag property.

The source below violates the first promise but retains the second.

## Source family

For 32-bit inputs, define

`F(x)=x \oplus 128\,[x\mathbin{\&}31=31]\oplus256\,[x\mathbin{\&}124=124]`.

This is an identity extension of a 9-bit two-monomial triangular permutation. Output bit 7 depends only on input bits 0–4; output bit 8 depends only on bits 2–6; all other output bits pass through. Thus the map is a permutation and has the compatible triangular/affine-flag structure.

The two degree-five monomial supports are `A={0,1,2,3,4}` and `B={2,3,4,5,6}`. Their union has seven elements, so the joint top-derivative radical has codimension seven, outside the rank-six promise. The rank-six candidate retaining only A is itself a permutation, but disagrees with F whenever B is active. Exhausting the 9-bit core confirms that both maps are permutations and that the false candidate has exactly 16 mismatches (density 1/32).

## Experiment

The graph inverter was evaluated using Agent 37's corrected rank-episode threshold from PR #358, with `delta=1e-8` and deterministic seeded coordinate streams. The final source-forward equality check is mandatory. The test targets all activate B; the set includes both A-only and A+B behavior and both clear and set bit 31.

The source-pinned Node regression is:

- `test/agent2-random-affine-graph-quintic-silent-rank.test.js`
- added to `jsconfig.external.json`
- branch commit `07b9864b46fbf24513bf966ce6ab0b8f74582fd2` (test with identity and affine-wrapped sources plus the eight/nine-target boundary), with `ab284e4f55fd19a14e7ca19a6405af9bc2250976` providing strict external JSDoc inclusion.

The focused `manual-validation.yml` run **45281998892** completed successfully on both `ubuntu-latest` and `windows-latest`. Both jobs executed the test, project JSDoc, external JSDoc, and paired-budget JSDoc. The full-suite Node job was correctly skipped by the focused-test dispatch. This is not a full-mainline release run.

## Query observations

An independent Python port of the graph inverter, using the corrected rank-episode threshold and the same seeded streams, produced:

| Target set | Exact recoveries | Calls per target | Total calls |
|---|---:|---:|---:|
| Eight selected 32-bit B-active targets | 8/8 | 26,996–27,130 | 216,394 |
| All 16 B-active inputs in the 9-bit core | 16/16 | 6,796–6,953 | 109,655 |

For the 32-bit case, one target-independent complete degree-five ANF clone costs

`Q(32,5)=\sum_{j=0}^{5}\binom{32}{j}=242,825`

source queries. Therefore the selected eight-target graph batch uses 26,431 fewer original-oracle calls than one complete clone. A ninth distinct B-active target (secret `0x0000017c`, seed `0xa508`) costs 27,073 additional calls in the corrected Python port, bringing the nine-target total to **243,467**, 642 above the 242,825-query clone. The Node regression now pins both sides of this observed eight/nine-target boundary. This is a narrow source/target-set comparison: graph queries are paid per target, whereas the complete ANF clone can be reused for arbitrarily many targets. The graph method is not cheaper beyond this selected break-even. The 9-bit 16-target total is not a query-cost win over its 512-query complete clone; it is an exhaustive check of the false-candidate mismatch set.

**Important distinction:** the exact per-target totals above are from the independent Python port. The Node regression asserts all eight exact recoveries, source-forward equality, all 32 affine-relation stages, and total graph calls below 242,825; both CI platforms passed. Successful-job stdout was not retrieved, so do not label the Python counts as Node receipts.

## Interpretation and limits

- This demonstrates a concrete alternative attack route for this selected source: violation of the quintic rank promise does not prevent inversion when the affine-flag property and degree bound still hold.
- The graph inverter does not reconstruct the original source code or recover hidden affine wrappers.
- The stopping-confidence statement depends on independent uniform coordinate samples. The Node regression uses deterministic seeded streams for reproducibility; the final equality check prevents a false candidate from being accepted, but the test is not a probabilistic success-rate study.
- The result is not a universal attack on arbitrary degree-five permutations, not a proof that the graph inverter is optimal, and not a claim about runtime overhead of an obfuscator.
- The full repository remains RELEASE-BLOCKED; this artifact is an intermediate attack-side result.

## Reproduction

Run:

`node --test test/agent2-random-affine-graph-quintic-silent-rank.test.js`

Then run the focused manual-validation workflow with `focused_test=test/agent2-random-affine-graph-quintic-silent-rank.test.js` on branch `agent2/graph-quintic-silent-rank-20261123`. The two-platform source-pinned receipt for the final eight/nine-target test is run 45284407589 (commit `04229ee6d23553a956a0b7d9f62ca68462c0f37f`).


## Hidden two-sided affine-wrapper extension

A second source-paired test wraps the same triangular core as
`F(x)=Lout(P(Lin(x) xor b)) xor a`, using fixed dense invertible 32x32 maps from `makeLinearTransform` and fixed nonzero offsets. The eight public secrets map to hidden B-active states; both hidden bit-31 values and both A states are represented. The wrapped rank-six candidate still disagrees on all eight targets.

The canonical public anchor `r=0` has a rank-deficient 32-column interpolant for this wrapper. A one-basis `invertByReanchoring(..., maxBases=1, initialZero=true)` attempt therefore fails at that anchor. This does **not** show that every random reanchor fails; it only pins the canonical-anchor obstruction. The corrected graph inverter nevertheless recovers all eight wrapped targets and passes exact source-forward equality.

An independent Python port gives 27,438–28,067 calls per wrapped target, **222,079 total** for eight targets, 20,746 below the 242,825-query full degree-five clone baseline. As above, these are Python-port counts, not Node stdout receipts. The updated Node test asserts the eight exact wrapped recoveries, the canonical-anchor rank-deficiency failure, and the total-query inequality; its focused CI receipt is pending.
