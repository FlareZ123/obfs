# Maximal nullity equal to residual rank: independent chosen-target inversion stress

**Date:** 2026-11-21. **Agent:** 8. **Classification:** intermediate, reproducible adversarial stress for draft public affine-residual theorem PR #181.

## Constructed corner case

At width `n=2r`, split an intermediate word into an `r`-bit high component and an `r`-bit low component. Choose `2r` distinct nonzero high values `a_i` and `2r` distinct nonzero low values `b_i` such that the paired vectors `(a_i,b_i)` form an invertible `n` by `n` input-basis matrix, with the `a_i` spanning the high `r`-space. Construct a permutation `h` of the `r`-bit words with `h(0)=0` and `h(b_i)=a_i`, completing the remaining input/output mapping bijectively. Conjugate the resulting high/low permutation with an independently sampled invertible output matrix and add a random affine output offset.

For input-basis vectors, the observable affine interpolant's columns have the form `B(a_i,a_i)` after output mixing. Their rank is exactly `r`; hence the public interpolant has kernel/nullity exactly `n-r=r`. Every nonlinear residual lies in the output-mixed low `r`-dimensional subspace. Since the constructed function is a permutation, its images span all `n` dimensions, forcing the residual span to have rank `r` as well. Thus this family reaches the extremal `nullity = residual rank` case that requires **r full rank repairs** from the starting public affine surrogate.

The construction uses bijective whole-word input/output linear wrappers to conceal the simple high/low form from the public source. The independent brute-force inversion oracle sees only `F(x)` values and the chosen target.

## Exact fixed-seed experiment

Reproducer: `sims/public-residual-maximal-nullity8-10.js`, seed `0xa811d065`. It imports only the earlier independently authored bit-vector reference utilities (`sims/public-residual-width5-6-independent.js`), including brute-force span/kernel/preimage, and does not use the production inversion algorithm's Gaussian routines. Regression: `test/public-residual-maximal-nullity8-10.test.js`.

| Parameter | Width eight | Width ten |
| --- | ---: | ---: |
| Residual rank r | 4 | 5 |
| Public interpolant nullity | 4 | 5 |
| Distinct constructed permutation instances | 24 | 8 |
| Exhaustive chosen targets | 6,144 | 8,192 |
| Proven bound on distinct oracle inputs per target | 40 | 74 |

Combined local Node.js 22.16.0 fixed-seed observations:

- **14,336 / 14,336 exact target recoveries**;
- every target in the chosen instances tested;
- all instances independently passed exact residual-vs-zero-based-second-difference span, inverse residual-space equality, and source/interpolant nullity checks;
- five rank repairs encountered (each width-ten target requires five);
- up to five closure expansions and **51** distinct oracle inputs;
- 119 attempts at drawing full-rank input-basis candidates, across 32 successful instances;
- zero observed breaches of the deterministic `n + 2^(r+1)` bound.

The finite experiment focuses on deliberately constructed maximal-nullity permutations and all their targets. It strengthens regression coverage for the high-deficiency branch of a proposed inversion method, without proving the universal theorem or addressing arbitrary JavaScript program reconstruction. Candidate confidentiality, unauthorized environment admission, and the universal 2.5x runtime requirement remain separately unproved.

Cross-platform source-pinned workflow: [manual low-rank inversion run 44929832113](https://github.com/FlareZ123/obfs/actions/runs/44929832113) completed successfully at executable SHA `548248f0a4c200ded9695c9b2b4fdc07574dbba7`. Both Ubuntu and Windows passed the new 14,336-target regression, earlier rank-inversion tests and strict JSDoc type checking.
