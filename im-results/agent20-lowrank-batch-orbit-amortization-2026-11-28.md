# Batched low-rank permutation inversion by whole-cycle indexing

**Agent 20 — 28 November 2026. Classification: intermediate mathematical/attacker-side engineering, not a new obfuscator or a release claim.**

Implementation: [`sims/agent20-lowrank-batch-index.js`](../sims/agent20-lowrank-batch-index.js). Reproducer: [`test/agent20-lowrank-batch-index.test.js`](../test/agent20-lowrank-batch-index.test.js). Current study source/test commit: `32a1116384e04b2cf49cfcd846937f6ad69e8e57`. This experiment generalizes Agent 20's [eight-target rank-two fixture](agent20-quintic-multitarget-amortization-2026-11-24.md) from shared setup to **global output-to-preimage cycle indexing** for any fixed promised low-rank permutation. Its underlying algebra and orbit step are already known from [Agent 7's deterministic completion](affine-low-rank-deterministic-completion-2026-11-21.md) and [Agent 39/50's sampled residual completion](affine-low-rank-oracle-inversion-2026-11-21.md). The reuse lemma is elementary; **academic originality is not claimed**.

## Scope: finite binary permutation, known rank upper bound

Let `V=GF(2)^n`, and let `F:V→V` be an unknown **fixed deterministic permutation** available by chosen forward queries. Query `F(0)` and `F(e_i)` (`n+1` inputs), set `c=F(0)` and let `M e_i=F(e_i)⊕c`. Define its **public affine-interpolation residual**
\[
D(x)=F(x)\oplus c\oplus Mx,\quad
R=\operatorname{span}\{D(x):x\in V\},\quad \dim R\le r.
\]
The bound `r` is an **external promise**, not something a finite sample certifies. From surjectivity, `V=\operatorname{im}(M)+R`, so the observable nullity `d=n-\operatorname{rank}(M)` satisfies `d≤r`.

### Reuse lemma and proof

Choose an invertible linear completion `H` of `M`:

- **Deterministic:** replace exactly `d` dependent columns by an independent standard-basis direction; `\operatorname{rank}(H-M)≤d`. Define `U=H^{-1}(R+\operatorname{im}(H-M))`; thus `\dim U≤r+d`.
- **Sampled residual:** query uniform random inputs until `d` residual classes extend `\operatorname{im}(M)` to all of `V`; use those residuals as the column-completion differences. Then `\operatorname{im}(H-M)⊆R` and `U=H^{-1}R` has dimension at most `r`. The finite implementation has a sampling cap and explicitly throws if exhausted.

Set `\phi(x)=H^{-1}(F(x)\oplus c)`. It is a permutation, and
\[
\phi(x)\oplus x
=H^{-1}\bigl(D(x)\oplus(M-H)x\bigr)\in U.
\]
Therefore every `\phi`-cycle stays entirely inside a single coset of `U`; each such coset has at most `2^{\dim U}` states. Given output target `y`, its normalized target `z=H^{-1}(y\oplus c)=\phi(F^{-1}(y))` lies in the same `U`-coset as its preimage. Starting at `z`, walk its forward `\phi`-cycle. A query `F(x)=v` reveals **the preimage of `v`**, not merely whether one target was hit. Index every visited `v↦x`. After the cycle closes, all outputs in that cycle have been inverted; any later target in it costs **zero new queries**. Caching oracle inputs ensures each underlying `F(x)` is requested at most once.

Let `C` be the number of **distinct U-cosets** among the normalized targets of an arbitrarily large batch. Every explored orbit stays in their union. The deterministic algorithm has the **pointwise distinct-query cap**
\[
Q_{\mathrm{det}}\le (n+1)+C\,2^{\min(n,r+d)},
\]
not `K` times a per-target cap for `K` supplied targets. `C` is an analysis-side parameter; the attacker does not need `U` or its coset labels.

In residual-sampled completion `U=H^{-1}R`, the number `C` equals the number of distinct **R-cosets of the target outputs** (independent of sampled completion `H`). Every uniform input yields a uniform `F(x)`, and hence a uniform quotient residual class. Standard spanning gives expected sample draws
\[
\mathbb E[S]=\sum_{j=0}^{d-1}\frac{1}{1-2^{j-d}}<d+1.607.
\]
Thus an **uncapped** fresh-uniform-draw algorithm has expected distinct calls bounded by
\[
\mathbb E[Q_{\mathrm{sampled}}]
\le n+1+\mathbb E[S]+C\,2^r
<n+1+d+1.607+C\,2^r.
\]
This expectation is **not** claimed for the deterministic seeded samplers used solely for reproduction, or as a guaranteed completion when the actual implementation's finite cap is exceeded. The upper bound is a conditional attacker cost, not measured defender runtime.

For the special case where targets cover every one of the `2^r` possible outputs in a hidden rank-`r` fiber, learning an arbitrary unknown fiber permutation from forward queries requires at least `2^r-1` queries in the worst case even if the fiber and affine envelope are supplied; the batch-cycle enumeration's `2^r` calls are within one. This is the same elementary permutation-oracle lower bound used by the existing single-target analysis, **not** a claim of a new lower bound.

## Matching whole-batch forward-query lower bound (elementary extension)

The existing Agent 50 [single-target random-permutation lower bound](affine-low-rank-oracle-query-lower-bound-2026-11-21.md) extends directly to complete batches over independent output fibers. Fix `N=2^r` and `C` publicly known distinct high-bit cosets. Define a family of permutations `F(h,l)=(h,P_h(l))`, where each unknown `P_h` is an arbitrary, independent permutation on the `N` low-bit values, and let other cosets act as identity. This family has output nonlinear displacement rank at most `r` and even exposes its exact affine envelope and fiber labels to the attacker.

Suppose a zero-error algorithm must output **all N inverse inputs** for **all N outputs** in each of the chosen `C` cosets. If it queries at most `N−2` distinct source inputs in any one coset, choose two unqueried inputs there and exchange their as-yet-unknown output assignments. Both possible permutations agree on the entire transcript, but the correct requested inverse vectors differ. Thus any deterministic algorithm certain to invert the complete batch for every member needs **at least `C(N−1)=C(2^r−1)` total distinct forward queries**, even with public fiber decomposition. The same zero-error worst-case lower bound applies to a randomized Las Vegas algorithm per adversarial choice of member, although its expected query count against a random family is a separate question.

The batch cycle-index upper `n+1+C2^r` under residual completion is therefore within `n+1+C` calls of this elementary worst-case lower bound for complete-fiber demands. It does not imply equality for arbitrary partial target sets, reveal unknown source syntax, or establish a novel cryptographic lower bound. The C=1 lower-bound mechanism was already recorded by Agents 39/50; this is a direct-product observation to make batch query accounting explicit.

## Computational evidence and counted oracles

All attacker counts below are **distinct input requests actually passed through the attacker's memoized oracle**, not duplicated target-generation, whole-truth-table verification, matrix-generation, or source-private rank-audit calls. The test code isolates those latter controls from the attacker API. Every reported inversion has an exact output-to-preimage check.

| Corpus | Conditions | Attacker observations |
|---|---|---|
| **40,320/40,320** width-three permutations; **eight targets per permutation** | All `8!` permutations, deterministic **and** fixed cycling-residual completion (two independent completion arms) | Both arms recover **322,560/322,560** targets each (**645,120** exact comparisons total); each learns the complete 8-input truth table with exactly eight distinct queries. The cycling sampler is not a random-expectation test. |
| Eight-bit, two disjoint 16-point residual cosets, **32 targets** | Outer nonlinear rank **4**, full-rank affine interpolant `d=0`; hidden input bit permutation plus invertible output mixing and an eleven-cycle/five fixed points per coset | **41 unique queries** for the whole batch, comprising nine shared interpolation plus **32** cycle queries. The fair **unshared cold-start** control across 32 independent inversions uses **540** total calls; it deliberately does not share basis/cache between callers. |
| Eight-bit, singular interpolation | Source-private residual rank at most four, `d=1`; 16 target outputs from one hidden coset | Deterministic method exactly inverts all targets within its `2^5=32` orbit cap; a residual-sampled completion has the sharper `2^4=16` cap and reuses the same indexed outputs. Invalid sample/cap/promise paths explicitly throw. |
| **32-bit** hidden affine wrapped rank-four shear, **16 targets** | Two independently seeded dense invertible 32×32 input/output matrices, biases `0x13579bdf` and `0x2468ace0`, four independent low-pair-controlled high-bit toggles, source-private 256 probes verifying residual rank 4; public `M` nullity `d=2` | Deterministic completion needs **96** queries (33 setup, 63 new orbit). Residual completion uses **53** (33 interpolation, **four** fixed-seed quotient draws, 16 new orbit). The 16 outputs occupy one R-coset, so another inversion of each target costs zero. |
| Same **32-bit** oracle, **32 targets in two distinct R-cosets** | Second hidden source group differs in a coordinate outside the four-dimensional residual support | Residual completion needs **69** unique queries total: **33+4+16+16**. After both cosets have been indexed, repeating all 32 inversions costs zero. |

The 32-bit fixture is a triangular bijection in hidden coordinates: each of four independent functions of low input-bit pairs toggles a different high bit. Low controlling bits never change, so this is bijective regardless of the four Boolean conditions. Dense invertible wrappers preserve injectivity and bound the nonlinear residual output span by four. In the seeded instance, 256 source-private probe residuals span **exactly rank four**, and the affine interpolant has nullity **two**. Neither the wrappers, secret preimages, rank witness probes, nor coset labels are passed to the inversion algorithm.

## Independent seeded fiber-permutation stress (96 families)

The additional [`test/agent20-lowrank-batch-fiber-fuzz.test.js`](../test/agent20-lowrank-batch-fiber-fuzz.test.js) uses an independently implemented source-private population generator rather than importing either attack's 32-bit fixture. It composes 8-bit invertible input/output binary matrices, translations, and a separately shuffled permutation within **every** low-bit fiber. Ranks `r=1,2,3,4` each have 24 fixed-seed families. An exhaustive 256-point oracle table for each verifies bijectivity and that true affine-interpolation residual rank does **not exceed** the offered bound. Targets are taken from up to six distinct hidden fibers per family, and both attack modes receive only an ordinary fixed forward-oracle callback. For sampled completion, the test uses a deterministic cyclic 256-point sample schedule to guarantee eventual coverage, **not** to validate the uniform random expected waiting time.

Across **96 independent oracle families**, the test checks **1,836 exact inversions per arm (3,672 comparisons in total)**, **62** families with singular M, independent raw-oracle counters, per-family `9+C*2^(r+d)` deterministic and `9+sampleCalls+C*2^r` sampled bound assertions, and zero additional queries when all targets are repeated. Summing unique-query costs within each independent family gives **6,153** calls for deterministic completion versus **4,602** for sampled completion; these sums are **not** one global shared cache. Maximum per-family costs were **176** and **100**, respectively. The sampled strategy used **335** total completion draws across the 96 independent families (including repeats if any), and every direct inversion was exactly verified. This result measures particular seeded populations, not an unknown-distribution success probability.

The exact focused [Ubuntu/Windows CI run 46087159189](https://github.com/FlareZ123/obfs/actions/runs/46087159189), source `1d890c84d0b728188eb250a7b7892db857681b32`, **passed** its seeded-fiber test and configured project, external and paired-budget strict JSDoc on both platforms. The test suite is separate from the prior complete three-bit and 32-bit witness file; neither full product acceptance nor academic novelty is implied.

## Limits and decisions

This is a **black-box target-inversion** improvement when many desired outputs share one fixed low-rank deterministic oracle. It does **not** reconstruct original JS source, certify that a real deployed program has low residual rank, defeat server authorization, bypass domain locks, or show SNO filesystem-integrity bypass. It is **invalid for stateful/non-deterministic endpoints** where memoizing an input changes meaning; account-scoped or nonce-scoped oracles require separate evaluation. A full 32-bit domain has roughly `2^{32-r}` independent residual cosets, so reducing inversion cost on a few cosets is not a general full-domain clone.

This experiment suggests a sharper **candidate-selection warning**: for static rank-`r` private maps with many queries on the *same hidden fiber*, do not benchmark only one target and multiply its cost by target count. One shared completed basis plus a cycle map can invert every supplied output in that fiber in at most `2^r` post-setup calls. Explicitly preserve a same-trust minified baseline and separately measure runtime/integrity/source reconstruction for any real candidate.

## Prior-art orientation — no originality assertion

The broader idea of amortizing function inversion across many targets is **not new**. Martin Hellman's 1980 [*A Cryptanalytic Time–Memory Trade-Off*](https://www-ee.stanford.edu/~hellman/publications/36.pdf) explicitly studies offline preprocessing/storage versus online inversion for generic functions; later theory such as [*Lower Bounds on the Time/Memory Tradeoff of Function Inversion*](https://arxiv.org/abs/2105.00761) formalizes advice bits and oracle-query complexity. The review [*Perfect Rainbow Tradeoff with Checkpoints Revisited*](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0166404) summarizes multiple-target cryptanalytic tradeoffs and their earlier literature. These references **do not establish** this specific low-affine-residual-rank coset-cycle bound, but they do independently show that caching and multi-target amortization are longstanding attack concepts. The repository's earlier [Agent 7/39/50 low-rank inversion work](affine-low-rank-deterministic-completion-2026-11-21.md) supplies the necessary structural orbit construction. No novelty or priority is claimed for this batched implementation or direct-product lower bound, and no comprehensive specialist prior-art review has been completed.

## Reproduction status

Local Node 22.16.0 run: `node --test --test-reporter=spec test/agent20-lowrank-batch-index.test.js` returned **6/6 tests passed** (about 0.2–0.3 seconds) at locally byte-equal script revisions. Existing two-platform manual focused receipts: [46086401135](https://github.com/FlareZ123/obfs/actions/runs/46086401135) (deterministic base, `bc324aad`) and [46086548077](https://github.com/FlareZ123/obfs/actions/runs/46086548077) (both completion strategies, `ab42b569`) were **GREEN** Ubuntu/Windows, including configured strict JSDoc. [46086660729](https://github.com/FlareZ123/obfs/actions/runs/46086660729) at `65f167a3` **GREEN** Ubuntu/Windows for the 32-bit single-coset test. The newest second-coset source/test revision `32a1116384e04b2cf49cfcd846937f6ad69e8e57` was included in [two-platform focused run 46086801687](https://github.com/FlareZ123/obfs/actions/runs/46086801687), **GREEN** on Ubuntu and Windows, with all six tests, project/external/paired-budget strict JSDoc. The workflow checked full repository SHA `63544eb01082b029ed1a2a64942aee319a822e4e`; the intervening `Agent 49` commit touched only `communications/agent47/...` and did not modify the batch source or regression from `32a11163`. The result is focused CI, **not** the full product release gate.

**No release recommendation.** Existing mainline project `results/README.md` remains authoritative and the full product remains **RELEASE-BLOCKED**. Independent peer mathematical review and a current-head CI receipt are appropriate before treating this elementary batch analysis as a consolidated result, and literature originality is unassessed.
