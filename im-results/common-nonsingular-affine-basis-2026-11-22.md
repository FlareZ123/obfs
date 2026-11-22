# Every finite-field permutation admits a nonsingular affine-interpolation basis

**22 November 2026 | Agent 24 | Intermediate mathematical observation and independent finite-table check.** This is an existential lemma that may aid the singular-interpolant branch of [the low-rank residual cycle investigation](low-output-residual-cycle-independent-review-2026-11-22.md). It is not a new strong-obfuscation result, optimized attack, or release candidate. Do not promote to `results/` without mathematical peer review and a demonstrably new consequence.

## Statement and proof

Let `V=GF(q)^n` for any prime-power `q>=2`, and let `F:V->V` be any **permutation**. There exists an ordered basis `(b_1,...,b_n)` of `V` such that `(F(b_i)-F(0))_{i=1}^n` is also a basis. Consequently, a suitable choice of input calibration basis always makes the affine interpolation of **any** permutation invertible. The original, fixed standard-basis interpolant may still be singular.

Define the zero-fixing bijection `G(x)=F(x)-F(0)`. Suppose `k<n` input vectors have been selected whose inputs and `G`-images are respectively independent. Write `U` for the input span and `W` for the output-image span, both of dimension `k`. A new input must avoid `U` and `G^(-1)(W)`. Both forbidden sets have `q^k` elements, and they intersect at least in zero because `G(0)=0`. Thus their union has at most `2q^k-1` elements. Since `q>=2` and `k<=n-1`,

```text
2q^k - 1 < q^(k+1) <= q^n.
```

At least one vector lies outside the union, extending both independent families. Begin with the empty basis and repeat `n` times. This proves the statement without regularity, differentiability, algebraic-degree, residual-rank or affine-structure assumptions on `F`. The proof is an elementary counting argument, not an obfuscation theorem.

## Relation to the rank-r cycle inversion result

For `F(x)=c+A(x)+h(x)` over GF(2), with arbitrary `A` and output residual image in a subspace of dimension at most `r`, changing to input coordinates on this common basis does not increase the output residual dimension. The calibrated linear interpolant `M_B` is now invertible by construction, and the existing conditional orbit-inversion proof can be applied to that **calibration**.

This is **existence rather than efficient online discoverability**: the proof may leave just one admissible final input out of exponentially many candidates for a particular current partial basis. A simple oracle-greedy search using this existence lemma has an exponential worst-case query upper bound (at most the full finite input domain), even though a chosen suitable basis would allow the earlier `n+2^r` inversion bound **after** its `n+1` calibration queries. No uniform polynomial query guarantee or practically useful 32-bit basis-search algorithm is established here. This observation does not expand the exact conditional theorem into an unconditional `n+2^r` theorem.

## Self-contained reproducibility

[Standalone Node22 peer reproducer](../sims/low-output-residual-common-basis-peercheck.js), using only `node:assert/strict` and direct finite-table permutations, implements an independently written exhaustive width-3 count. It compares every **ordered** input basis and its transformed output vectors and also checks that the count of available choices at every greedy extension meets the analytic lower bound. It separately samples 1,500 width-4 permutations using a fixed xorshift32 stream seed `20261122`. The seeded sample is not a probability estimate or complete width-4 enumeration.

| Finite-table source | Independent Node22 observation |
| --- | --- |
| Every zero-fixed width-3 permutation (all `7!=5,040` bijections) | Exactly `168` ordered input bases exist for each domain. Common-basis count histogram: **126 for 1,344 mappings; 132 for 2,352; 144 for 1,176; 168 for 168**. Every mapping admits a common basis; minimum proportion `126/168=75%`. |
| Deterministic width-4 sample (1,500 pseudorandom permutations) | `20,160` ordered input bases; sampled common-basis counts ranged from **11,880** to **13,920**. Not a universal lower or upper fraction. |
| Greedy count certificate | All tested partial bases had at least `2^n-2^(k+1)+1` admissible next inputs. |

As a consistency cross-check with the earlier independent width-3 inversion research: averaging the histogram over the `168` possible input bases gives full-rank interpolation probability exactly `0.8` for an arbitrary fixed basis under uniformly enumerated permutations. Across all `8!=40,320` permutations with arbitrary `F(0)`, this yields `32,256` full-rank and `8,064` singular standard-basis interpolants, matching the existing pinned exhaustive counts. This is a check of the finite combinatorics, not an independent confirmation of the entire rank-r inversion algorithm.

The source fixture uses integer XOR on bit vectors (q=2). Its exhaustive check validates widths 3 only; the all-width and all-field conclusion follows from the displayed proof. A strict JSDoc config and optional cross-platform workflow are provided as `jsconfig.common-basis.json` and `.github/workflows/manual-common-basis-lemma.yml`.

## Research significance and limits

This lemma rules out an existential obstruction to choosing a full-rank calibration basis for a black-box **permutation**, while leaving the **cost of finding that basis** unanswered. The attacker still needs a provably efficient way to discover it with legitimate oracle queries to challenge a 32-bit obfuscator. It does not address nonbijective programs, arbitrary stateful JavaScript, source recovery, runtime extraction, environment locking or the strict 2.5x compute budget.

The most valuable follow-up is either an adaptive basis-finding oracle algorithm with a source-independent query bound significantly below `2^n`, or an adversarial permutation showing why a proposed randomized retry scheme can be exponentially expensive. Until then, retain the original conditional inversion bound and the repository's **RELEASE-BLOCKED** decision.
