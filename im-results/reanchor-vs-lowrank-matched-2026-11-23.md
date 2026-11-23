# Matched public-only reanchoring versus deterministic rank-four inversion

**Agent:** 20. **Date:** 23 November 2026. **Status:** intermediate, source-pinned two-platform executable attack comparison; no production compiler change. **Primary release:** RELEASE-BLOCKED.

## Test and fair comparison

The same 12 seeded hidden-affine 32-bit compatible triangular sources are tested under two independent public chosen-input inverters. Each source is a composite of **four interacting involutive shears** whose output toggles reside in independent bit positions 17, 21, 25 and 29; all source-private hidden linear maps and keys remain inaccessible to either attack. Source generation separately proves the canonical basis is affine-clean. Every source is attacked on the deliberately rare target that triggers **all four shears** and on an ordinary control target.

- **Reanchoring:** `invertByReanchoring` with one source-clean anchor, target equality verification, and its source-dependent triangular compatibility premise. This work includes the newer conditional 2n maximum, or 64 calls at n32.
- **Rank-r competitor:** the existing independent `invertLowRankDeterministic` with declared **nonlinear output rank at most four**. It uses the same original oracle, same target, and a different finite quotient-orbit method; its deterministic theoretical cap `33+2^(4+nullity)` is 49 when the interpolant has full rank. This is a meaningful matched opponent, rather than a deliberately weakened source-reconstruction strawman.

Calls are counted as distinct actual underlying oracle observations by each algorithm's own accounting. Both use 33 canonical interpolation queries; the comparison uses the same deterministic source and target but does not artificially share previous requests across two attackers. Both return the exact original secret, and each result is independently checked against the original oracle. The trial source family is intentionally sparse, and the population is finite.

## Source-pinned outcome

At fixed source `a741a5368d57a62206b4c9008d612081c6cfc5c5`, the [two-platform focused validation 45287664500](https://github.com/FlareZ123/obfs/actions/runs/45287664500) passed the full 24-target comparison on Ubuntu and Windows, with strict JSDoc for existing code:

| Target type | Count | Reanchored calls | Rank-four deterministic calls | Outcome |
| --- | ---: | ---: | ---: | --- |
| Forced rare, four shears active | 12 | **38** | **49** | Reanchoring lower by 11 |
| Ordinary control | 12 | 34 | 34 | Tie |
| **Total** | **24** | min 34, max 38 | min 34, max 49 | 24/24 exact |

For every source/target the rank-four interpreter's affine interpolant had nullity **0**. Its observed orbit lengths were 16 for rare and 1 for ordinary; the reanchoring attack used 4 corrections for rare and 0 for ordinary. Thus the exact per-target accounting is explained by a structurally different path, rather than a source-dependent timing artifact.

The cross-platform raw rows are printed as `REANCHOR_VS_LOWRANK` by `sims/reanchor-versus-lowrank-matched.js`. Test assertions are in `test/reanchor-versus-lowrank-matched.test.js`. The source generator and attacker are `sims/sparse-triangular-fixedpoint-inversion.js`, `sims/random-affine-anchor-compatible-inversion.js` and `sims/affine-low-rank-oracle.js`.

## Security interpretation

This is a bounded demonstration that an **already public oracle preimage** from a four-layer compatible source can be recovered in at most 38 calls by the conditional reanchoring algorithm, versus 49 by an independent exact rank-four competitor on the selected rare targets. It strengthens practical source-class attack evidence and the value of measuring actual oracle calls under matched data.

The experiment does **not** prove a lower bound on the defender's resistance, conceal the real four-shear implementation, establish efficient attack on arbitrary dense compatible sources, or compare to every possible attacker. The source-clean anchor condition is established by the private fixture generator, not by a general public-only source-class verifier. The complementary rank-four method is exact under its separate rank promise, and its 49-call budget remains useful when a compatible anchor cannot be found. No defender 2.5x runtime or environmental locking claim follows.
