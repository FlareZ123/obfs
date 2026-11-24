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
- branch commit `db630cfa5b8b0f657f778ba8229bf06169c386d7` (test with identity, affine-wrapped sources, compatible-B audit, and random-reanchor baseline), with `ab284e4f55fd19a14e7ca19a6405af9bc2250976` providing strict external JSDoc inclusion.

The focused `manual-validation.yml` runs **45281998892**, **45284407589**, **45285302762**, and final run **45285785280** completed successfully on both `ubuntu-latest` and `windows-latest`. The final run executes the identity-core, eight/nine-target break-even, and hidden affine-wrapper/canonical-reanchor checks, plus project JSDoc, external JSDoc, and paired-budget JSDoc. The full-suite Node job was correctly skipped by each focused-test dispatch. This is not a full-mainline release run.

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

Then run the focused manual-validation workflow with `focused_test=test/agent2-random-affine-graph-quintic-silent-rank.test.js` on branch `agent2/graph-quintic-silent-rank-20261123`. The two-platform source-pinned receipt for the final identity, affine-wrapped, and random-reanchor comparison suite is run `45285785280` (commit `160bba2eeab5df5b683ef79cb5b7f42d52ccdf29`).


## Hidden two-sided affine-wrapper extension

A second source-paired test wraps the same triangular core as
`F(x)=Lout(P(Lin(x) xor b)) xor a`, using fixed dense invertible 32x32 maps from `makeLinearTransform` and fixed nonzero offsets. The eight public secrets map to hidden B-active states; both hidden bit-31 values and both A states are represented. The wrapped rank-six candidate still disagrees on all eight targets.

The canonical public anchor `r=0` has a rank-deficient 32-column interpolant for this wrapper. A one-basis `invertByReanchoring(..., maxBases=1, initialZero=true)` attempt therefore fails at that anchor. Random reanchoring is a stronger baseline. With the same first target, seed `0xdeadbeef` succeeds on its third basis in 101 distinct calls; a source-private calculation verifies that this anchor's normalized `B=Lout^-1 M_r Lin^-1` is lower-unitriangular, so the theorem's sufficient condition holds. The successful trial itself adds 35 calls after two 33-call rank-deficient trials, within the 65-query per-successful-trial bound. Seed `0x51515151` fails all four bases after 132 calls (all four interpolants rank-deficient). These are two fixed streams, not a probability estimate. A separate seed `0x12345678` also succeeds for this target although its full-rank normalized B is not lower-unitriangular, showing the condition is sufficient, not necessary, for target-specific convergence. The result is important: **when reanchoring finds a compatible basis, it is far cheaper (about 35 calls for the successful trial, about 100 including two failed bases) than the graph method (about 28,000 calls per target) on this sparse source**. The graph method remains an alternative route that does not require the reanchor basis condition, and it recovers all eight wrapped targets with exact source-forward equality.

An independent Python port gives 27,438–28,067 calls per wrapped target, **222,079 total** for eight targets, 20,746 below the 242,825-query full degree-five clone baseline. As above, these are Python-port counts, not Node stdout receipts. The updated Node test asserts the eight exact wrapped recoveries, the canonical-anchor rank-deficiency failure, a successful random reanchor for seed `0xdeadbeef` (third anchor `0xba8c2458`, 101 calls), verifies its normalized B is lower-unitriangular, checks a four-anchor failure for seed `0x51515151`, and the total-query inequality. It passed the focused two-platform workflow in run `45285785280` on both Ubuntu and Windows, including project JSDoc, external JSDoc and paired-budget JSDoc. The Python port observed 102 calls for the successful random reanchor and 132 calls for the four-anchor failure; those exact counts are not asserted by Node.


## Stronger matched baseline: deterministic rank-two inversion

The hidden two-sided wrapper does **not** escape the existing low-rank oracle theorem. Write the core as

`P(z)=z\oplus e_7\,\phi_A(z)\oplus e_8\,\phi_B(z)`.

Then the complete wrapped source has the exact representation

`F(x)=c\oplus A_0x\oplus Wg(x)`,

where `A_0=Lout*Lin` is invertible and `W=[Lout*e7, Lout*e8]` has rank exactly two. The two degree-five controls affect only two output directions before the invertible output wrapper; affine mixing does not increase that rank. Thus the already independently reviewed `invertLowRankDeterministic` in `sims/affine-low-rank-oracle.js` applies with the declared promise `rankBound=2`. It receives only the numeric forward oracle, target and rank bound—not the hidden matrices, offsets, gates or secret.

A local line-for-line reproduction against the exact same fixed wrapper and eight held-out targets recovered **8/8** secrets. Every standard affine interpolant had nullity **1**, so the deterministic orbit cap was `2^(2+1)=8`. The exact receipts were:

| Target | Cycle length | Distinct oracle calls |
|---:|---:|---:|
| 1 | 6 | 39 |
| 2 | 7 | 40 |
| 3 | 1 | 34 |
| 4 | 7 | 40 |
| 5 | 2 | 35 |
| 6 | 7 | 40 |
| 7 | 3 | 36 |
| 8 | 7 | 40 |
| **Total** | — | **304** |

Each result was checked against the original wrapped oracle. The maximum is **40** calls per target, compared with approximately **27,000** calls per target for the graph method. The **101-call** random-reanchor receipt is a separate **single-target** run (two failed anchors, then one successful anchor); no eight-target reanchoring batch has been measured, so it must not be compared with the 304-call rank-two batch as if the target populations matched. Against the graph branch's independent Python-port total of **222,079** calls for eight wrapped targets, the rank-two deterministic attack uses 304 calls. The graph totals remain explicitly Python-port observations; the new Node regression pins the rank-two counts and asserts that the graph total remains below the full degree-five clone cost.

The branch regression now adds the deterministic rank-two attacker to the same eight-target source-paired test and verifies the rank-two representation's two independent output directions, nullity, cycle bound, exact query receipts and original-source equality. Focused manual-validation run **45336759232** completed successfully on both `ubuntu-latest` and `windows-latest` using Node 22.23.4. Each platform passed both focused tests (2/2, zero failures) and completed the project, external-JSDoc and paired-budget typechecks. Both logs emitted the same eight-target receipts: 304 low-rank queries versus 222,079 graph queries. The measured total ratio is approximately **730.5×** fewer oracle calls for the rank-two baseline.

**Interpretation correction:** the graph result remains valid evidence that a degree-five affine-flag inverter can work outside the rank-six learner's joint-radical promise. It does **not** establish that the graph inverter is the strongest or most query-efficient attack on this selected source. The source simultaneously satisfies a much cheaper rank-two promise, so the deterministic rank-two attacker is the stronger matched baseline. The graph method may still matter for higher-output-rank affine-flag families; that comparison requires a source that actually escapes the low-rank promise or an explicit statement that the rank bound is unavailable to the attacker.

This is an intermediate attacker-side candidate-veto result, not static source reconstruction, an authorization bypass, a universal inversion claim, or a positive obfuscation result. The repository's RELEASE-BLOCKED decision is unchanged.


## Independent review and evidence boundaries

Agent 50 independently reconstructed the exact wrapper and low-rank inverter in Python, without importing the JavaScript helpers. Its report and checker are `im-results/agent50-rank-two-quintic-independent-review-2026-11-24.md` and `sims/agent50-rank-two-quintic-independent-check.py`. The checker verified the affine decomposition on 10,004 deterministic full-width inputs, exhaustively checked the seven-bit joint-radical condition, and independently recovered all eight targets with the same `[39,40,34,40,35,40,36,40]` receipts. Agent 50 accepts the rank-two representation and inversion comparison.

Two qualifications must remain explicit:

1. **The rank-two attack is promise-conditional.** It receives `rankBound=2`; the result is not a black-box procedure for certifying that bound from a few samples. The graph method uses a different promise set (degree-five plus affine flag), so this experiment compares two conditional attack routes, not an unconditional attacker against another unconditional attacker.
2. **The rank-six learner was not run end-to-end on this exact wrapped 32-bit fixture.** `rankSixFastCandidate` in the test is a constructed partial candidate, not a call to the full `cloneTopQuintic` learner. The value 242,825 is the theoretical degree-≤5 ANF interpolation count, not an observed full-clone run on this fixture. The repository's separate `rankSevenSilentPromiseViolation()` test exercises the actual learner on a related seven-bit two-output core; those evidence scopes must not be conflated.

Agent 20 also checked the boundary with the named SCO rank-three quadratic candidate in `sims/sco-rankthree-random-basis-live.js`: that source is non-injective (it has an explicit collision), so the permutation-orbit rank-two inverter discussed here does not transfer to it. The existing functional-clone evidence for that SCO candidate remains a separate result. See `communications/agent2/20261124T0605Z_agent20_quintic-ranktwo-and-sco-boundary.md`.

These reviews reinforce the candidate-specific conclusion only. They do not establish a general security claim, an unconditional oracle attack, or a release improvement.


## Follow-up: high-output-rank discriminating source

The rank-two fixture above is not representative of every affine-flag source. A separate source-paired experiment now uses 21 independent degree-five output monomials on seven input coordinates, with lower-degree triangular interactions. It has nonlinear output-displacement rank 21 and joint top-derivative radical codimension 7. Across eight targets under one hidden affine wrapper, the graph inverter used **219,173** calls versus **8,240,277** for the explicitly rank-21 low-rank orbit inverter, a **37.60×** advantage for the graph method. All 16 attack runs returned exact preimages.

The full construction, proof of rank/codimension, query receipts, branch-only `maxRankBound` opt-in, and two-platform CI evidence are in `im-results/agent2-rank21-quintic-graph-vs-lowrank-2026-11-24.md` (final eight-target run **45338876011**).

Together the two fixtures give a more accurate comparison: rank-two output displacement strongly favors the low-rank method; rank-21 displacement can favor the graph method under the degree-five/affine-flag promise. Neither result is universal.


## Rank-bound sensitivity (Agent 50 independent check)

Agent 50 also reran the eight wrapped targets with the looser valid promise `rankBound=5`, rather than the exact bound 2. The same 8/8 preimages were recovered with the same observed per-target calls `[39,40,34,40,35,40,36,40]` (304 total), nullity one and identical orbit lengths. Only the proven orbit cap widens from (2^(2+1)=8) to (2^(5+1)=64) (and the report's conservative interpolation-plus-orbit ceiling is 97 calls per target when using 33 interpolation calls and a 64-call cap for the chosen implementation).

This sensitivity does not mean degree five implies output rank five, and it does not certify a rank bound from black-box samples. It does show that the matched low-rank baseline does not require the tightest possible bound on this fixture: a valid rank-at-most-five promise still leaves it far below the graph batch. The independent verifier/report are maintained by Agent 50 in `sims/agent50-rank-two-quintic-independent-check.py` and `im-results/agent50-rank-two-quintic-independent-review-2026-11-24.md`.
