# Every finite-field permutation admits a nonsingular affine-interpolation basis

**22 November 2026 | Agent 24 | Intermediate mathematical observation and independent finite-table check.** This is a common-basis lemma with a source-independent randomized basis-repair algorithm that may aid the singular-interpolant branch of [the low-rank residual cycle investigation](full-rank-low-output-residual-cycle-inversion-2026-11-22.md). It is not a new strong-obfuscation result, optimized attack, or release candidate. Do not promote to `results/` without mathematical peer review and a demonstrably new consequence.

## Statement and proof

Let `V=GF(q)^n` for any prime-power `q>=2`, and let `F:V->V` be any **permutation**. There exists an ordered basis `(b_1,...,b_n)` of `V` such that `(F(b_i)-F(0))_{i=1}^n` is also a basis. Consequently, a suitable choice of input calibration basis always makes the affine interpolation of **any** permutation invertible. The original, fixed standard-basis interpolant may still be singular.

Define the zero-fixing bijection `G(x)=F(x)-F(0)`. Suppose `k<n` input vectors have been selected whose inputs and `G`-images are respectively independent. Write `U` for the input span and `W` for the output-image span, both of dimension `k`. A new input must avoid `U` and `G^(-1)(W)`. Both forbidden sets have `q^k` elements, and they intersect at least in zero because `G(0)=0`. Thus their union has at most `2q^k-1` elements. Since `q>=2` and `k<=n-1`,

```text
2q^k - 1 < q^(k+1) <= q^n.
```

At least one vector lies outside the union, extending both independent families. Begin with the empty basis and repeat `n` times. This proves the statement without regularity, differentiability, algebraic-degree, residual-rank or affine-structure assumptions on `F`. The proof is an elementary counting argument, not an obfuscation theorem.

## Relation to the rank-r cycle inversion result

For `F(x)=c+A(x)+h(x)` over GF(2), with arbitrary `A` and output residual image in a subspace of dimension at most `r`, changing to input coordinates on this common basis does not increase the output residual dimension. The calibrated linear interpolant `M_B` is now invertible by construction, and the existing conditional orbit-inversion proof can be applied to that **calibration**.

**Correction to the original draft:** The append-only greedy proof can leave a single admissible final extension among exponentially many possible inputs, but it was wrong to infer that discovering **some** common basis must be expensive. An efficient Las Vegas **basis-replacement** algorithm is proved below. The original conditional `n+2^r` orbit bound still does not become unconditional with only `n+1` setup queries: basis discovery may require extra queries, and existing singular-interpolant inversion algorithms are usually stronger.

## Randomized common-basis repair with constant expected oracle queries per rank

Consider any fixed permutation `F:GF(q)^n -> GF(q)^n`. Start with **any** known input basis `B=(b_i)`, whose `n` forward oracle images and `F(0)` are cached. Let `G(x)=F(x)-F(0)` and let `W=span(G(b_1),...,G(b_n))` have current rank `s<n`. Select a minimal linear-dependence *circuit* `C` among the output columns. Every circuit has `|C|>=2`. For `q=2`, `|C|>=3`: every `G(b_i)` is nonzero and distinct because `F` is injective, so two vectors cannot be scalar multiples over GF(2).

Express `x=sum_i a_i b_i` in the current input coordinates. Sample `x` **uniformly conditioned** on at least one `a_j != 0` with `j in C`. The conditioning can be performed locally from independent uniform field coordinates, before making an oracle call. This admissible set has exactly `q^n(1-q^(-|C|))` elements. Because `G` is a bijection, at most `q^s` admissible inputs map into the current output span `W`. Therefore one valid independent random trial produces an image outside `W` with probability at least

```text
p >= 1 - q^(s-n)/(1-q^(-|C|)).
```

Since `s<=n-1`, the right side is at least `3/7` when `q=2, |C|>=3`, and at least `5/8` when `q>=3, |C|>=2`. The universal lower bound is **3/7**. When the sampled image lies outside `W`, choose an index `j in C` with `a_j != 0` and replace `b_j` with `x`. The input vectors remain a basis because the new coordinate `a_j` is nonzero. The surviving output vectors still span exactly `W` because `G(b_j)` was redundant in circuit `C`. Adding `G(x)` outside `W` increases the output rank by exactly one. The new basis again satisfies the hypotheses.

Repeat until the output rank reaches `n`, requiring exactly `d=n-s_0` successful replacements. Independent uniform conditioned samples imply at most **7/3 expected valid oracle evaluations per replacement**. The resulting expected total is

```text
E[Q_common_basis] <= n + 1 + (7/3) d <= n + 1 + (7/3)(n-1).
```

Caching repeated candidate inputs can only reduce the number of distinct calls. For `q=2`, the probability that one fixed repair stage needs more than `t` valid trials is at most `(4/7)^t`; a union bound for `d` stages gives at most `d(4/7)^t` for **any** stage exceeding `t`. This is a Las Vegas guarantee: independent truly uniform samples eventually succeed with probability one; a finite budget must return explicit exhaustion rather than assert a false inverse or common basis. The argument requires a **fixed bijection** across queries. Stateful or unauthorized oracles are outside the premise.

A concrete GF(2), `2<=n<=32` CommonJS/JSDoc implementation is [low-output-common-basis-repair.js](../sims/low-output-common-basis-repair.js). It starts with the standard input basis, obtains dependency masks and candidate coordinates through binary Gaussian elimination, filters candidate inputs for free, and calls the provided oracle only for admissible samples. Its default `node:crypto.randomInt` chooses independent uniform n-bit samples, while the seeded deterministic test callback is solely for reproducibility. The implementation carries an optional finite `maxDraws` cap and throws on exhaustion.

**Implication for the conditional rank-r cycle solver:** If the `GF(2)` permutation genuinely has nonlinear output residual confined to a rank-`r` subspace, the calibrated coordinate permutation after basis repair still displaces each input inside an r-dimensional subspace, because an invertible input-coordinate change does not enlarge the residual output image. Hence one obtains an exact Las Vegas inversion with **expected** `n+1+(7/3)d+2^r` oracle calls, assuming an unbounded repair sampler and an actual rank-`r` promise. This is **weaker** than the repo's existing Agent39 quotient-completion attack in expected query count and is provided only as a geometric alternative. It does not establish the older `n+2^r` count unconditionally.

## Self-contained reproducibility

[Standalone Node22 peer reproducer](../sims/low-output-residual-common-basis-peercheck.js), using only `node:assert/strict` and direct finite-table permutations, implements an independently written exhaustive width-3 count. It compares every **ordered** input basis and its transformed output vectors and also checks that the count of available choices at every greedy extension meets the analytic lower bound. It separately samples 1,500 width-4 permutations using a fixed xorshift32 stream seed `20261122`. The seeded sample is not a probability estimate or complete width-4 enumeration.

| Finite-table source | Independent Node22 observation |
| --- | --- |
| Every zero-fixed width-3 permutation (all `7!=5,040` bijections) | Exactly `168` ordered input bases exist for each domain. Common-basis count histogram: **126 for 1,344 mappings; 132 for 2,352; 144 for 1,176; 168 for 168**. Every mapping admits a common basis; minimum proportion `126/168=75%`. |
| Deterministic width-4 sample (1,500 pseudorandom permutations) | `20,160` ordered input bases; sampled common-basis counts ranged from **11,880** to **13,920**. Not a universal lower or upper fraction. |
| Greedy count certificate | All tested partial bases had at least `2^n-2^(k+1)+1` admissible next inputs. |

As a consistency cross-check with the earlier independent width-3 inversion research: averaging the histogram over the `168` possible input bases gives full-rank interpolation probability exactly `0.8` for an arbitrary fixed basis under uniformly enumerated permutations. Across all `8!=40,320` permutations with arbitrary `F(0)`, this yields `32,256` full-rank and `8,064` singular standard-basis interpolants, matching the existing pinned exhaustive counts. This is a check of the finite combinatorics, not an independent confirmation of the entire rank-r inversion algorithm.

The source fixture uses integer XOR on bit vectors (q=2). Its exhaustive check validates widths 3 only; the all-width and all-field conclusion follows from the displayed proof. The standalone checker is also exposed through `test/common-basis-existence.test.js`, which can be run on both operating systems through the repository's existing focused manual-validation workflow; `jsconfig.external.json` includes both files for strict JSDoc checking.

## Additional constructive finite-table checks

The independent randomized repair simulator locally enumerated all **5,040** zero-fixed binary width-3 permutations with seeded replay. Exactly **1,008** had singular standard-basis output columns, and all **1,008** were repaired; maximum sampled *valid* oracle trials in this finite run was **8** and maximum distinct oracle calls including calibration was **5**. For a deliberately adversarial **32-bit bijective involution** constructed from 26 disjoint transpositions of independent basis elements with distinct six-bit non-basis values, the initial output interpolant had rank **6**. The algorithm raised it to rank **32** with exactly 26 accepted replacements, **29** valid candidate evaluations, **30** random draws and **62** distinct oracle queries including the initial 33. This verifies behavior well outside the tiny exhaustive domain without claiming that the 32-bit population is random or representative. A separate independently authored Python oracle checker also repaired 3,000 seeded width-4 random permutations without a failure (1,129 singular, 1,871 full rank; maximum **11** candidate oracle evaluations in its sampled population). The independent randomized repair implementation, finite tables and high-deficiency 32-bit stress passed the existing focused [Ubuntu + Windows GitHub CI 45055595876](https://github.com/FlareZ123/obfs/actions/runs/45055595876) at exact source `724b87777210f5fdf496481405c97b5bb982e229`, including strict project JSDoc and external JSDoc on both operating systems. The local Python test was a separate independently written check and is not included in that CI run.

## Pinned cross-platform validation and existing stronger solver

The focused [Ubuntu and Windows CI 45054376204](https://github.com/FlareZ123/obfs/actions/runs/45054376204) at exact source `7a1e8406b613dfd69589f3b26fed7093cd2730c9` passed the independent exhaustive and seeded check plus both strict project and external JSDoc stages. Both jobs executed through the preexisting `manual-validation.yml` focused-test lane; no new active CI workflow was introduced.

**Do not confuse this existence lemma with a new best inversion attack.** [Agent 39's already independently peer-reviewed singular-interpolant randomized quotient completion](affine-low-rank-oracle-inversion-2026-11-21.md) obtains a stronger source-independent expected number of extra queries: at most `k+1.607` expected completion samples followed by a `2^r` orbit, where `k<=r` is observed nullity. [Agent 7's deterministic output-column completion](affine-low-rank-deterministic-completion-2026-11-21.md) has a separate `n+1+2^(r+k)` exact bound. These prior methods **already avoid requiring a nonsingular initial calibration basis**. This note is a structural basis-existence observation and alternative geometric perspective, and it does not supersede those algorithms or imply a stronger attacker-query estimate.

## Research significance and limits

The common-basis lemma and random repair theorem rule out an existential obstruction and provide an **O(n) expected chosen-query** calibration method for every black-box fixed permutation, without an output-residual-rank promise. A separate strict worst-case query bound below the domain size remains open for arbitrary permutations. These are attacker-side linear-algebra results, with no source recovery, unauthorized execution, runtime extraction, integrity, domain locking, or 2.5x protected runtime claim.

There is substantial preexisting general [matroid intersection literature](https://arxiv.org/abs/2407.03229), so this note does **not** assert academic novelty or priority for common-basis exchange. Existing Agent39 and Agent7 singular-completion attacks are already better for the protected low-rank target-inversion application. Peer-review the counting proof, the exact sampled-oracle model, and whether the new basis construction has a distinct operational use before considering `results/`. Keep the repository's **RELEASE-BLOCKED** decision.
