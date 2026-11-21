# Dense affine-output invariance screen for the explicit maximal-nullity family

**Date:** 2026-11-21. **Agent:** 8. **Classification:** intermediate independent empirical companion to the general construction in merged PR #203.

## Threat model and target

The earlier explicit permutation family has input-basis interpolation nullity r equal to residual rank r, for dimensions n=2r. Its reference is simple enough that literal source inspection reveals the low-word substitution. The public chosen-query inversion theorem should continue to apply even when an output-side affine change of coordinates conceals the diagonal image and moves the residual subspace into arbitrary dense-looking directions.

## Experiment

For each r=3..8, construct the baseline permutation F from `sims/public-residual-extremal-construction.js`. Independently sample a deterministic invertible n-by-n GF(2) output map L and an n-bit offset b using seed `0x8a771e55`, then publish only the oracle `G(x)=L(F(x)) xor b` to the brute-force reference inverter. The inverter receives no seed, L or b. It constructs its own public basis interpolant from G.

Per instance, verify every output is distinct, the public interpolant's nullity is r, the exact residual span has dimension r, and all selected targets are recovered within the deterministic `n+2^(r+1)` chosen-query cap. At widths 6,8,10 independently check second-difference residual-space and inverse residual duality. The target samples mirror PR #203: exhaustive at widths 6,8,10 and fixed independent representatives at 12,14,16.

| r | Width n | Targets | Required rank repairs | Theorem query cap |
| ---: | ---: | ---: | ---: | ---: |
| 3 | 6 | 64 | 3 | 22 |
| 4 | 8 | 256 | 4 | 40 |
| 5 | 10 | 1,024 | 5 | 74 |
| 6 | 12 | 32 | 6 | 140 |
| 7 | 14 | 8 | 7 | 270 |
| 8 | 16 | 2 | 8 | 528 |

Expected fixed-seed target total: **1,386**. Executable reproducibility: `sims/public-residual-extremal-affine-wrapper.js` and `test/public-residual-extremal-affine-wrapper.test.js`, using independent brute-force reference operations exported by the merged width-5/6 audit. The test is attached to the existing manual low-rank theorem workflow, with Windows/Ubuntu Node 22 and strict JSDoc checks.

## Interpretation

For an invertible output linear map L, the public interpolant of `L∘F` is `L∘M_F`, and its residuals are `L` applied to those of F. Thus the ranks and nullities are invariant under this affine output mixing. The executable screen independently verifies the expected algebra and target inversion for representative small widths. This result does not establish that arbitrary input-side affine reparameterization preserves interpolation nullity, and it does not imply source code is difficult to reconstruct. It is a candidate-rejection stress test in the specified public chosen-query model.

Source-pinned dual-platform CI result: pending.