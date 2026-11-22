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

**Finite binary-32 sampling budget with an explicit failure bound.** The current simulator samples a uniform *raw* 32-bit input before the free membership filter. With every fixed output-span rank `s<32`, the circuit has at least three indices, so the admissible set has at least `(7/8)2^32` points; at most `2^s<=2^31` of those have output inside the span. Every independent raw trial therefore improves the basis with probability at least **`3/8`** (and fails to improve with probability at most `5/8`), counting rejected trials as failures. If an algorithm needs `d` rank improvements, the probability any stage requires more than `t` raw trials is at most `d(5/8)^t` by a union bound. Consequently, a global `d*t` raw-draw cap succeeds except with probability at most that bound. The improvement-probability bound holds conditionally on every previous successful history, so the union bound applies to the adaptive evolving basis.

For binary `n=32`, the exact initial-rank lower bound below gives `d<=26`. Choose **`t=102`**, **`maxDraws=26*102=2,652`**, which gives the theorem-level refusal probability

```text
Pr[sampling cap exhausted] <= 26*(5/8)^102
                           < 2^-64.
```

Because the algorithm caches each evaluated input, a successful run with this cap makes at most **`33+2,652=2,685` distinct forward-oracle calls** (33 calibration calls plus at most one additional call for each raw draw). The result is a bounded-failure Monte Carlo admission policy returning a **verified exact basis whenever it succeeds**. It never returns an incorrect basis after a failed cap. The original default unbounded sampler remains a probability-one Las Vegas process with linear expected queries. A deterministic pseudorandom seed used in CI **does not** justify the `2^-64` bound: that bound assumes the default cryptographically uniform independent `node:crypto.randomInt` draws and a fixed oracle independent of those draws.

**Exact extremal initial-rank bound.** Because the `n` values `G(b_i)` are distinct and nonzero, an initial output span of rank `s_0` must contain at least `n` nonzero points, implying `q^(s_0)-1>=n`. Thus **`s_0>=ceil(log_q(n+1))`** and `d<=n-ceil(log_q(n+1))`. This rank bound is tight among all permutations: choose `n` distinct nonzero points spanning an `s=ceil(log_q(n+1))`-dimensional output subspace, assign these as the images of the `n` input basis vectors, map zero to zero and extend the partial injection arbitrarily to a permutation of the finite domain. Consequently a sharper universal expectation bound is

```text
E[Q_common_basis] <= n+1+(7/3)(n-ceil(log_q(n+1))).
```

At `n=32,q=2`, the initial rank can be **6**, requiring at most **26** rank improvements. The worst-case expectation bound of this algorithm is then **281/3 ≈ 93.667** total oracle calls, including the origin and 32 standard basis calls. The independent 32-bit disjoint-transposition witness below realizes the maximum possible rank deficiency 26; its observed query count is **62**, a sample rather than a universal cap.

Caching repeated candidate inputs can only reduce the number of distinct calls. For `q=2`, the probability that one fixed repair stage needs more than `t` valid trials is at most `(4/7)^t`; a union bound for `d` stages gives at most `d(4/7)^t` for **any** stage exceeding `t`. This is a Las Vegas guarantee: independent truly uniform samples eventually succeed with probability one; a finite budget must return explicit exhaustion rather than assert a false inverse or common basis. The argument requires a **fixed bijection** across queries. Stateful or unauthorized oracles are outside the premise.

A concrete GF(2), `2<=n<=32` CommonJS/JSDoc implementation is [low-output-common-basis-repair.js](../sims/low-output-common-basis-repair.js). It starts with the standard input basis, obtains dependency masks and candidate coordinates through binary Gaussian elimination, filters candidate inputs for free, and calls the provided oracle only for admissible samples. Its default `node:crypto.randomInt` chooses independent uniform n-bit samples, while the seeded deterministic test callback is solely for reproducibility. The implementation carries an optional finite `maxDraws` cap and throws on exhaustion.

**Implication for the conditional rank-r cycle solver:** If the `GF(2)` permutation genuinely has nonlinear output residual confined to a rank-`r` subspace, the calibrated coordinate permutation after basis repair still displaces each input inside an r-dimensional subspace, because an invertible input-coordinate change does not enlarge the residual output image. Hence one obtains an exact Las Vegas inversion with **expected** `n+1+(7/3)d+2^r` oracle calls, assuming an unbounded repair sampler and an actual rank-`r` promise. This is **weaker** than the repo's existing Agent39 quotient-completion attack in expected query count and is provided only as a geometric alternative. It does not establish the older `n+2^r` count unconditionally.

## Deterministic chosen-query lower bound (arbitrary permutations)

The randomized repair bound can coexist with an **exponential deterministic worst-case** query requirement. Fix `q`, `n`, and a hyperplane `H` containing exactly `q^(n-1)` output points. Consider any deterministic adaptive algorithm that must output an input basis `B=(b_i)` whose `F(b_i)-F(0)` images are independent for **every** permutation `F`. An adversary reserves the output zero for `F(0)=0` and answers each queried **nonzero** input with a distinct unused **nonzero** point of `H`; this maintains an injective partial mapping as long as fewer than `|H|` points have been queried.

Suppose the algorithm stops after `t` distinct forward queries and proposes `B`. The combined domain points in its query transcript, the proposed `n` basis members, and zero number at most `t+n+1`. If

```text
t + n + 1 <= q^(n-1),
```

the adversary can assign all not-yet-queried basis inputs to distinct unused outputs in `H`, respecting every earlier transcript response, and then extend that finite partial injection to a bijection of the whole `q^n`-point space. The resulting **fixed** permutation is consistent with all observations. Every proposed calibrated output difference lies in `H`, making its output interpolant singular. The same algorithm's chosen output basis fails on this legal permutation.

Hence any deterministic algorithm guaranteed correct on every permutation has **worst-case query count at least `q^(n-1)-n`**, up to the harmless origin-accounting convention. At `GF(2)^32`, that number is `2^31-32=2,147,483,616` distinct oracle queries, while the randomized repair above requires fewer than **94 expected** total calls under a fresh uniform sampler. The deterministic lower bound applies even when computation is free and the algorithm may choose queries adaptively. It does **not** apply to randomized expected complexity, finite-error Monte Carlo guarantees, structured source families, or target inversion given additional promises. It does not imply code confidentiality: a full-control adversary can run the distributed code and use random queries.

A separate elementary small-domain construction was checked in Python with `n=5`, `H` the 16-point output hyperplane, 10 distinct adaptive-query placeholders and a proposed standard basis; extending the transcript to a full permutation yielded mapped basis outputs `[1,2,4,8,10]`, of rank **4**. This is only a sanity witness; the lower bound is established by the counting proof. The argument is a standard adversarial-oracle technique and is not claimed as novel.

## Adversarial completion executable check

A separate [deterministic hyperplane completion simulator](../sims/common-basis-deterministic-hyperplane.js) accepts an arbitrary list of chosen-query inputs and a proposed input basis, assigns each queried input and proposed basis input a distinct output **inside the same hyperplane**, and completes all other domain points to a full bijection. Its seed-fixed width-5 sample probes **2,000** query/basis scenarios, each with 10 distinct queried inputs including zero plus a separate five-element proposed input basis. Every resulting mapping is an exact permutation, and every proposed output basis remains singular with rank three or four within the dimension-four output hyperplane. It also checks a boundary standard-basis proposal with overlapping and unqueried points. This is a finite constructive example rather than a standalone proof for all widths.

The initial fixture incorrectly asserted that **every** proposed output basis would have rank exactly four; a set of five distinct nonzero outputs in a four-dimensional binary hyperplane can have rank **three** as well, consistent with the tight rank bound above. Both operating systems exposed the incorrect assertion `3 !== 4` at source `368449e54ce527c1211d5f0969d455b096f6d9ca` in [red CI 45057483117](https://github.com/FlareZ123/obfs/actions/runs/45057483117). The repaired assertion requires rank **three or four**, and exact source `b4e2e8d9377ddc9f73b204e5f2e094f1a1d5a0c3` passed the focused **Ubuntu and Windows** regression and both strict JSDoc gates in [green CI 45057547989](https://github.com/FlareZ123/obfs/actions/runs/45057547989). This corrects a test expectation, leaving the mathematical lower-bound claim unchanged.

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

The independent randomized repair simulator locally enumerated all **5,040** zero-fixed binary width-3 permutations with seeded replay. Exactly **1,008** had singular standard-basis output columns, and all **1,008** were repaired; maximum sampled *valid* oracle trials in this finite run was **8** and maximum distinct oracle calls including calibration was **5**. For a deliberately adversarial **32-bit bijective involution** constructed from 26 disjoint transpositions of independent basis elements with distinct six-bit non-basis values, the initial output interpolant had rank **6**, attaining the exact minimum possible rank for 32 distinct nonzero output columns. The algorithm raised it to rank **32** with exactly 26 accepted replacements, **29** valid candidate evaluations, **30** random draws and **62** distinct oracle queries including the initial 33. This verifies behavior well outside the tiny exhaustive domain without claiming that the 32-bit population is random or representative. A separate independently authored Python oracle checker also repaired 3,000 seeded width-4 random permutations without a failure (1,129 singular, 1,871 full rank; maximum **11** candidate oracle evaluations in its sampled population). The independent randomized repair implementation, finite tables and high-deficiency 32-bit stress passed the existing focused [Ubuntu + Windows GitHub CI 45055595876](https://github.com/FlareZ123/obfs/actions/runs/45055595876) at exact source `724b87777210f5fdf496481405c97b5bb982e229`, including strict project JSDoc and external JSDoc on both operating systems. The local Python test was a separate independently written check and is not included in that CI run.

## Independent ternary-field cross-check

The counting and rank-repair argument extends to prime powers `q>2`, where two nonzero distinct output vectors can be scalar multiples. To check that different circuit-size boundary, [common-basis-gf3-exhaustive.js](../sims/common-basis-gf3-exhaustive.js) independently enumerates **all 8!=40,320** zero-fixed permutations of `GF(3)^2`, tests all **48** ordered input bases in each, and repairs every singular standard-basis interpolation by oracle calls. Exactly **5,760** permutations (1/7 of the population) start with rank one, and all repair under a seeded sampler, with at most **8** valid trials and **4** distinct evaluated oracle inputs in this finite corpus. The exact common-basis count histogram is **40 for 23,040 permutations; 42 for 12,288; 44 for 4,608; 48 for 384**. This supports the all-field proof only at `q=3,n=2`; it gives no universal success-rate distribution.

The established general probability bound is at least **5/8** when `q>=3` with a circuit of size two. At `q=3,n=2`, the actual eligible-candidate success probability for the singular standard basis is **6/8**, because zero is excluded and the output span has only two nonzero images. Those distinctions prevent mistaking the bound for an empirically observed mean.

The focused [Ubuntu + Windows CI 45055984144](https://github.com/FlareZ123/obfs/actions/runs/45055984144) at exact source `d81e48abd3f9e5182d5e1aeebb3803cd96d7d110` passed the independent `test/common-basis-gf3-exhaustive.test.js` and both strict JSDoc stages. The source enumerator uses arithmetic modulo 3 with no dependency on the binary repair helper; thus this is a different representation and implementation cross-check.

## Pinned cross-platform validation and existing stronger solver

The focused [Ubuntu and Windows CI 45054376204](https://github.com/FlareZ123/obfs/actions/runs/45054376204) at exact source `7a1e8406b613dfd69589f3b26fed7093cd2730c9` passed the independent exhaustive and seeded check plus both strict project and external JSDoc stages. Both jobs executed through the preexisting `manual-validation.yml` focused-test lane; no new active CI workflow was introduced.

**Do not confuse this existence lemma with a new best inversion attack.** [Agent 39's already independently peer-reviewed singular-interpolant randomized quotient completion](affine-low-rank-oracle-inversion-2026-11-21.md) obtains a stronger source-independent expected number of extra queries: at most `k+1.607` expected completion samples followed by a `2^r` orbit, where `k<=r` is observed nullity. [Agent 7's deterministic output-column completion](affine-low-rank-deterministic-completion-2026-11-21.md) has a separate `n+1+2^(r+k)` exact bound. These prior methods **already avoid requiring a nonsingular initial calibration basis**. This note is a structural basis-existence observation and alternative geometric perspective, and it does not supersede those algorithms or imply a stronger attacker-query estimate.

## Connection to established matroid intersection

The binary or finite-field common-basis problem has a direct matroid interpretation. Let the ground set be `E=GF(q)^n\\{0}`. Give each x in E two vector labels: `x` and `G(x)`. Input-linear independence and output-linear independence define two rank-n **representable matroids** on the **same ground set**. A common basis of these matroids is exactly the sought simultaneous input/output basis. This identification connects the problem to the established theory of common bases and matroid intersection, including [Ghosh and Gurjar, APPROX/RANDOM 2021](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.APPROX/RANDOM.2021.41), which explicitly studies the common-base decision/search problem for linearly representable matroids. It is a prior-art anchor, **not** a claim that that paper proves the special 3/7 sampling probability or this oracle lower bound.

The ground set here contains **`q^n-1`** elements. Algorithms polynomial in an explicitly enumerated ground-set size can therefore make exponentially many calls in the compressed `n`-coordinate, black-box-value model. Thus ordinary deterministic matroid-intersection algorithms and the above `q^(n-1)-n` chosen-input deterministic lower bound have different complexity parameters. The particular fast randomized replacement proof exploits the fact that both matroid representations arise from one **fixed bijection on the entire finite vector space**. Neither its constants nor their novelty is established by the generic matroid intersection citation.

## End-to-end repaired-basis inversion of singular low-rank permutations

To verify that the new calibration can actually feed the preexisting rank-r orbit inverter, an independent [all-target reproduction fixture](../sims/low-rank-repaired-basis-inversion.js) was added. It constructs explicit **eight-bit** source permutations with initially **singular** standard-basis affine interpolants:

- **Rank one:** swap the inputs `3` and `4`, fix all other points, giving residual output displacement `7` on exactly those two points. The canonical interpolant has rank **7**.
- **Rank two:** additionally swap `24` and `32`, compose with an invertible three-bit byte rotation, and XOR output constant `165`. The two independent displacement vectors have rank **2**, the canonical interpolant has rank **6**, and `F(0)=165` tests an actual nonzero affine offset.

For each permutation, the verifier independently checks the complete 256-point bijection and exact global residual-image span rank. The attacker path receives **only** a forward evaluation callback and a requested target. It first uses `findCommonBasis` to repair the output rank, computes the new `M_B^{-1}` from the calibrated output columns, then walks the conjugated residual permutation `P(z)=M_B^{-1}(F(Bz)-F(0))` until finding the cycle predecessor of `M_B^{-1}(y-F(0))`. Because `P(z)-z` remains inside a subspace of dimension at most r, **each orbit closes in at most `2^r` forward transitions**. Every returned preimage is verified directly by the test oracle.

The focused [Ubuntu + Windows CI 45057787940](https://github.com/FlareZ123/obfs/actions/runs/45057787940) at exact source `4b12071ce1cf22adb474ef058aae687a10f9e5f1` passed the complete **512/512** target enumerations and both strict JSDoc stages:

| Frozen source family | Native canonical affine rank | Verified targets | Max orbit calls | Max distinct total oracle calls per target | Sum of distinct calls across targets |
| --- | ---: | ---: | ---: | ---: | ---: |
| Binary 8-bit rank-one swap | 7/8 (singular) | 256/256 | 2 | 20 | 3,075 |
| Binary 8-bit rank-two disjoint swaps, output rotation and offset | 6/8 (singular) | 256/256 | 4 | 22 | 3,610 |

This is direct evidence for the exact source-conditioned cycle-inversion composition following a randomized basis repair, and the maximal observed **20** or **22** distinct queries per target is a sample, **not** a universal cap or expected-value equality. The separately proven binary-32 finite cap concerns the common-basis discovery stage; orbit calls add at most `2^r` under an independently justified rank-r global promise. The repaired-basis method remains **inferior in expected chosen-query count to Agent39's earlier quotient-completion attack** and establishes no code protection or defender runtime overhead guarantee.

## Research significance and limits

The common-basis lemma and random repair theorem rule out an existential obstruction and provide an **O(n) expected chosen-query** calibration method for every black-box fixed permutation, without an output-residual-rank promise. A separate strict worst-case query bound below the domain size remains open for arbitrary permutations. These are attacker-side linear-algebra results, with no source recovery, unauthorized execution, runtime extraction, integrity, domain locking, or 2.5x protected runtime claim.

There is substantial preexisting general [matroid intersection literature](https://arxiv.org/abs/2407.03229), so this note does **not** assert academic novelty or priority for common-basis exchange. Existing Agent39 and Agent7 singular-completion attacks are already better for the protected low-rank target-inversion application. Peer-review the counting proof, the exact sampled-oracle model, and whether the new basis construction has a distinct operational use before considering `results/`. Keep the repository's **RELEASE-BLOCKED** decision.
