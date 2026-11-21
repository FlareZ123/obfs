# Independent small-width audit of public affine-residual inversion

**Date:** 2026-11-21. **Agent:** 8. **Classification:** intermediate cross-check for the draft deterministic public-affine-residual theorem in PR #181.

## Scope

This audit independently implements a deliberately brute-force reference of the proposed singular-surrogate rank-repair and cycle inversion procedure. It uses bit-vector enumeration rather than the production inverter's Gaussian elimination routines.

The deterministic generator constructs 656 different small permutation oracles, each evaluated before and after independently sampled invertible linear input and output changes of basis plus affine shifts:

- 240 width-5 permutations with one randomized 3-bit internal permutation and two unchanged bits;
- 160 width-6 permutations with two randomized 3-bit internal permutations;
- 160 width-5 seeded Fisher-Yates permutation tables;
- 96 width-6 seeded Fisher-Yates permutation tables.

All outputs and all preimage targets are tested, making **29,184 target inversions** in total. The seed is 0x8a11d065. A target output is provided to the inverter without charging the target's construction as an attacker oracle query; subsequent distinct oracle inputs, including affine basis queries, are counted by an explicit cache.

## Independently checked identities

For each permutation:

1. Construct the public affine interpolant M from F(0) and the basis outputs, and the exact residual span R = span{F(x) xor F(0) xor M(x)}.
2. Independently derive the span of **all zero-based second differences** and assert that it equals R.
3. Enumerate U = {x : M(x) in R} and assert |U| = |R|.
4. Build the complete inverse table and independently interpolate it; assert the inverse residual space equals the forward U.
5. Compare each original permutation's intrinsic residual rank against the same function wrapped with invertible affine input/output maps; reject any change.
6. For every possible target, perform independent rank repairs and cycle inversion, assert exact preimage recovery, and check the deterministic query bound n + 2^(r+1) using the exact residual rank r.

The source is sims/public-residual-width5-6-independent.js; its fixed-seed regression is test/public-residual-width5-6-independent.test.js. The shared manual low-rank workflow includes this independent lane on Node 22 for Ubuntu and Windows.

## Local execution

Node.js v22.16.0, exact fixed seed:

| Observation | Result |
| --- | ---: |
| Generated permutation oracles | 656 |
| Target inversions | **29,184 / 29,184** |
| Initially singular interpolants | **287** |
| Maximum rank repairs | **2** |
| Maximum closure expansions | **5** |
| Maximum distinct oracle inputs for any target | **64** |
| Query-bound failures | **0** |
| Residual/second-difference and inverse-space mismatches | **0** |
| Affine-wrapper residual-rank mismatches | **0** |

The mixed width/rank histogram is emitted by the script. The generator combines structured low-rank cases with seeded Fisher-Yates permutation tables; its seeded PRNG and modular draw technique are not a claim of uniform random permutation sampling. The check is finite empirical evidence against implementation mistakes, separate from the draft proof itself. It does not establish strong obfuscation resistance or performance compliance. Existing full-control reconstruction and 2.5x-cost vetoes remain applicable.

Cross-platform source-pinned workflow for the **final affine-invariance audit:** [run 44927729241](https://github.com/FlareZ123/obfs/actions/runs/44927729241) passed Ubuntu/Windows and strict project JSDoc at exact source 9fdb7c0cdfab775ef8aafc35847619fb90ec5f72. Prior expanded audit: [expanded manual low-rank inversion run 44927446777](https://github.com/FlareZ123/obfs/actions/runs/44927446777) completed successfully on Ubuntu and Windows at exact executable source fa1879fae6ae4907ffc92433b7bc8aed548d4ddb. The earlier [structured-only run 44927224558](https://github.com/FlareZ123/obfs/actions/runs/44927224558) also passed. Both jobs passed the new 5/6-bit test, existing rank-inversion tests, and strict project JSDoc.
