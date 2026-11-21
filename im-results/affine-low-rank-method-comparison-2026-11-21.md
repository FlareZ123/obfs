# Matched forward-oracle query comparison: randomized completion versus public-residual target growth

**Date:** 21 November 2026. **Agent:** 50. **Status:** intermediate reproducible performance/candidate-attack study, not an obfuscator release or academic novelty claim.

## Purpose and precedence

Agent 39's new random quotient-completion/coset-cycle inverter was independently verified in [our peer proof](affine-low-rank-agent50-independent-peer-2026-11-21.md). However, Agent 3 had already described a broader target-guided public residual method in [the 19 November report](public-affine-residual-rank-target-inversion-2026-11-19.md) and its executable 32-bit solver [`sims/public-affine-residual-target-inverter32.js`](../sims/public-affine-residual-target-inverter32.js).

To distinguish independent mathematical correctness from new practical value, the [matched comparator](../sims/affine-low-rank-method-comparison.js) invokes the separate [quotient-completion implementation](../sims/affine-low-rank-peer-check.js) and Agent 3's **actual existing production research solver** on the same 32-bit permutation oracle and target. Both use fresh independent seeded PRNG state; the test records *distinct queried input addresses* in independent wrappers and checks their returned preimage exactly. It does not equate raw instruction counts or optimize runtime.

All generators are explicit, deterministic, locally reproducible, and independent of both inverters. General arms use a 32-bit random invertible input matrix, a separately random invertible output matrix, and an upper-fiber-dependent odd modular multiplier/translation in the lower `r` bits. Forced singular arms use identity input, random invertible output and a lower-fiber permutation whose chosen basis images have deficient rank. Every arm is truly bijective. All target inputs are held out from the respective inverter's basis construction by the caller, although some might collide incidentally.

## Exact source-pinned two-platform result

[Manual Ubuntu/Windows run 44935175190](https://github.com/FlareZ123/obfs/actions/runs/44935175190), at SHA `9c15d8b4505528c22a10fd829a9a80d71476e10b`, completed successfully on both operating systems, including matched comparison, separate exhaustive peer checker, strict JSDoc and previous low-rank regression suites. Each table row below is 12 independent oracle instances × 8 chosen targets = **96** correct inversions by **each** algorithm, with zero mismatch.

| Oracle arm | rank bound | observed interpolant nullity | randomized completion mean distinct queries | prior target-growth mean distinct queries | randomized relative difference |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hidden affine mixed | 1 | 0–1 | 35.115 | 34.812 | +0.868% |
| Hidden affine mixed | 2 | 0–2 | 37.302 | 36.896 | +1.101% |
| Hidden affine mixed | 3 | 0–3 | 38.615 | 38.542 | +0.189% |
| Hidden affine mixed | 5 | 0–1 | 49.052 | 50.396 | -2.666% |
| Hidden affine mixed | 8 | 0–2 | 167.802 | 182.292 | -7.949% |
| Forced singular | 3 | exactly 1 | 38.562 | 37.271 | +3.466% |
| Forced singular | 5 | exactly 2 | 50.406 | 50.344 | +0.124% |
| Forced singular | 8 | exactly 4 | 150.688 | 157.771 | -4.490% |

<small>Negative percentages mean fewer distinct chosen-input queries for the randomized completion algorithm on that finite matched corpus. Source raw records include per-arm totals, maxima, and win/loss/tie counts; rounded means here use the raw integer sums divided by 96.</small>

Across all **768 × 2 = 1,536** successful algorithm/target inversions per OS, the randomized approach used 54,484 distinct queries in total across its 768 runs; the prior public-residual solver used 56,479, a **3.532%** total-query reduction. This aggregate weights arms by absolute query intensity and is not a general expected-complexity superiority claim. Median and distributional tests were not performed. New seeded samples may vary the result.

The earlier seven-arm comparison [run 44935085550](https://github.com/FlareZ123/obfs/actions/runs/44935085550) was green before adding rank-eight singular stress; it omitted that final arm. The first comparator pin [run 44934997786](https://github.com/FlareZ123/obfs/actions/runs/44934997786) executed the comparator successfully but failed its newly expanded strict JSDoc gate because an older experimental solver had a malformed `@param` and an untyped `/*` block. These comments and the numeric-differences local annotation were corrected without changing executable operations in `sims/public-affine-residual-target-inverter32.js`, commit `5457a4c50050037f4ee961e6a90c460c73ea478c`. Subsequent runs pass the strict checker.

## Interpretation and limits

The new algorithm's source-level advantage is narrower than a first inversion theorem: the earlier public-rank attack already covers every promised hidden `A+Wg` case with public residual rank no larger than `rank W`. The randomized quotient-completion method obtains a potentially smaller **expected query bound** in some parameter regimes, at the price of relying on uniform independent samples; the earlier deterministic repair does not require that assumption. On these finite arms the sampled query advantage is mixed and modest overall. At `r=1` and some singular cases it is slightly worse; at the `r=8` arms it saves several percent.

The test explicitly does not measure CPU 2.5× compliance, browser constraints, SCO authentication/network cost, source reconstruction, integrity bypass, runtime extraction, or statistical uncertainty across random seeds. Those limitations prevent using this diagnostic alone to promote an obfuscator technique or claim a meaningful new protection barrier. The primary release remains **RELEASE-BLOCKED**.
