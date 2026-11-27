# Dense 96-source matched chosen-oracle portfolio: CEGAR succeeds after reanchoring fails

**Agent:** 20. **Date:** 23 November 2026. **Status:** intermediate two-platform empirical inversion evidence, source-frozen and reproducible. **Primary release:** RELEASE-BLOCKED.

## Question and matched population

The independent [16-anchor compatibility screen](reanchor-dense-compatibility-screen-2026-11-23.md) tested 96 secret 32-bit two-sided affine-wrapped compatible permutation sources across three independently seeded nonlinear permutation families. A chosen-query reanchoring-only attacker found no source-hidden compatible basis in 1,536 attempted anchors, and recovered **0/96 targets**, spending approximately 560–784 oracle queries per source.

This experiment reuses the **same original 96 source seeds, generator families, hidden affine maps/offsets, source-private secrets, and published targets**. The improved source-independent adversary is the existing `invertHybrid` portfolio: up to four reanchoring bases, then a structural CEGAR attack using eight validation trials per candidate, then (only if needed) the 128-validation variant. All methods share a deduplicated actual oracle cache, every accepted candidate must exactly match the published target, and the trial is counted successful only if it equals the source-held secret. No private source variables are given to the portfolio.

The two policies deliberately have different maximum effort and different source assumptions. They should be interpreted as **attacker-strength comparisons on matched targets**, not as a controlled same-budget treatment effect or a lower bound on attacker computational complexity.

## Immutable CI result

At exact source `094b40c1accb8bf197f74fe1df8c135dcad6f0f4`, [Ubuntu/Windows focused run 45289741512](https://github.com/FlareZ123/obfs/actions/runs/45289741512) passed all assertions in `test/reanchor-dense-hybrid-portfolio-screen.test.js`, driven by `sims/reanchor-dense-hybrid-portfolio-screen.js`. The complete `REANCHOR_DENSE_HYBRID` output records the following observations.

| Source family | Sources | Exact preimages | Winning method | Min distinct calls | Max distinct calls | Mean distinct calls |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| Dense nonlinear triangular | 32 | **32** | CEGAR with 8 validation trials | 3,935 | 4,037 | 3,987.21875 |
| Rivest degree-3 | 32 | **32** | CEGAR with 8 validation trials | 3,930 | 4,053 | 3,995.1875 |
| Rivest degree-7 | 32 | **32** | CEGAR with 8 validation trials | 3,916 | 4,070 | 3,971.65625 |
| **Total** | **96** | **96** | **CEGAR8 in all 96** | **3,916** | **4,070** | family means above |

No trial required the 128-validation escalation; none recovered through the preceding four reanchoring bases. The measured chosen-query count includes every deduplicated output request across earlier failed methods and the successful CEGAR, rather than quoting only the latter method's internal count. The program prints its query distribution and source seed constants for direct reproduction.

## Architecture consequence

The dense compatible families have a reproducible **larger measured attack request burden than sparse four-shear clean-anchor fixtures** under these particular algorithms (approximately 4,000 requests versus 38), and the 16-base interpolation policy demonstrably fails without its hidden compatibility premise. However, those same 96 dense functions are **all invertible by a stronger public-only structural learner** under an allowed eight-check validation budget. This is a concrete reason to compare candidate obfuscation designs against the strongest available attack portfolio, with exact target verification, rather than relying on reanchoring failure as evidence of strong protection.

A CEGAR selection based on only eight validation trials is **heuristic and source-dependent**; 96 successes in this finite seeded population cannot certify its correctness for arbitrary adversarial compatible permutations. The experiment does not show static source recovery, offline arbitrary-function cloning, dynamic instrumentation resistance, no-server domain locks, authenticated request denial, or compliance with the 2.5x compute requirement. These results provide decision-relevant attack costs for named source families and preserve the RELEASE-BLOCKED conclusion.
