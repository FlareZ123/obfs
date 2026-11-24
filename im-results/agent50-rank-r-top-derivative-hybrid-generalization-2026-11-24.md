# Rank-r projected-affine top-derivative section learner: exploratory generalization

**Status:** intermediate exploratory evidence; not an established result, production implementation, or release approval  
**Date:** 24 November 2026  
**Owner:** Agent 50  
**Reference implementations:** `sims/rank-r-top-derivative-hybrid-reference.py` and `sims/rank-r-top-derivative-fallback-controls.py` (Python standard library only)  
**Reference simulator commit:** `418a5c9ec80004f7c3ffcd7b95befec993fd2ef4`

## Question

Does the rank-five top-derivative quotient/section-table learner generalize to arbitrary quotient rank (r), and does it retain a query-count advantage over the existing projected-affine profile learner?

The experiment tests the promised source family

[
F(x)=A(x)+b+h(Px),qquad P:mathbb F_2^n	omathbb F_2^r,quad operatorname{rank}(P)=r,
]

where (A) is linear, (b) is constant, (h) is an arbitrary (r)-bit truth table with nonzero top ANF coefficient, and (n=32). The tested ranks are (r=2,ldots,8). Rank one is deliberately excluded: (h(Px)) is affine when (r=1), so the first derivative also contains the affine residual and does not isolate the hidden quotient; direct affine reconstruction is simpler.

## Algebraic derivation

Let

[
c=igoplus_{yinmathbb F_2^r}h(y)
e0.
]

For (rge2), the (r)-th finite-difference derivative annihilates the affine part and satisfies

[
T_r(v_1,ldots,v_r)
=igoplus_{Ssubseteq[r]}Fleft(igoplus_{iin S}v_iight)
=cdet(Pv_1,ldots,Pv_r).
]

Thus its joint radical is (ker P), and the quotient (V/ker P) has dimension (r). If anchors (a_0,ldots,a_{r-1}) have nonzero witness (c=T_r(a_0,ldots,a_{r-1})), their quotient classes form a basis. The contractions

[
T_r(e_j,a_0,ldots,widehat{a_i},ldots,a_{r-1})
]

are either zero or (c), and encode the (i)-th quotient coordinate of each standard basis vector (e_j).

Let (q:V	omathbb F_2^r) be the recovered quotient map, (s(y)=igoplus_{i:y_i=1}a_i), and (H[y]=F(s(y))). Since (s(q(x))) and (x) have the same image under (P),

[
F(x)oplus H[q(x)]=A(x)oplus A(s(q(x))),
]

which is linear in (x). The values at the standard basis therefore recover the affine correction, giving an exact projected-affine reconstruction for the promised source family.

## Witness probability and query bound

A trial samples (r+1) independent uniform directions. Their images under (P) are (r+1) uniform vectors in (mathbb F_2^r). The trial succeeds exactly when the (r	imes(r+1)) matrix has rank (r), with probability

[
p_{r+1}=prod_{i=0}^{r-1}(1-2^{i-(r+1)}).
]

If this occurs, at least one of the (r+1) (r)-subsets is a basis and gives a nonzero witness. With

[
k=leftlceilrac{logdelta}{log(1-p_{r+1})}ightceil,
]

the witness-miss probability is at most (delta). A miss is an exact-fallback condition, not a false-accept event.

For each standard basis vector, the (r) derivative faces use at most (2^r-1) new inputs: the anchor-only face is already cached from the witness cube. The section table and affine corrections are also cached. The eager-prefetch fast-path cap is therefore

[
Q_{m fast}le
2^{r+1}+(2^{r+1}-1)(k-1)+(2^r-1)n+m,
]

where

[
m=leftlceilrac{logdelta}{log(1-2^{-r})}ightceil.
]

The verifier uses (m) independent uniform inputs. Both the source and candidate are degree at most (r); any nonzero vector-valued difference has at least the relative weight (2^{-r}), by the minimum-distance bound for (RM(r,n)). Hence a wrong candidate passes with probability at most ((1-2^{-r})^mledelta), assuming a fixed oracle and verifier draws independent of training/witness draws. A mismatch must exact-fallback to degree-(r) ANF interpolation. Let (B_r) be the degree-(le r) ANF interpolation basis and (C_pre) the cache before fallback. The basis size is (|B_r|=sum_{j=0}^r\binom nj), but the actual total distinct query count after fallback is (|C_pre\cup B_r|), and incremental fallback queries are (|B_r\\setminus C_pre|). The tabulated ANF count is the empty-cache basis size, not an unconditional additional-query count.

## Deterministic reference experiment

Run:

```bash
python3 sims/rank-r-top-derivative-hybrid-reference.py
```

Configuration:
- (n=32), (delta=10^{-10}), 50 same-source comparisons per rank (r=2,ldots,8) (350 total comparisons). Each comparison uses the same generated source for both learners, but distinct baseline and hybrid SHA-counter streams; this is not common-random-number matched sampling.
- Each replication generates a fresh rank-(r) parity projection and truth table; the table top coefficient is forced nonzero if necessary.
- Each baseline/hybrid model is checked on 128 heldout inputs (89,600 model-output comparisons total).
- All streams are deterministic SHA-256 counter tapes. They provide reproducibility, not proof of independent uniform randomness.
- The baseline is a Python reference port of `learnProjectedAffineOracle`; the hybrid is an eager-cube Python reference port of the quotient/section algorithm. This is not a JavaScript implementation and does not exercise fallback behavior on out-of-promise sources.

| Rank (r) | Baseline mean queries | Hybrid mean queries | Mean reduction | Hybrid lower same-source comparisons | Fast cap | ANF basis size (empty cache) |
|---:|---:|---:|---:|---:|---:|---:|
| 2 | 252.54 | 189.62 | 24.91% | 50/50 | 332 | 529 |
| 3 | 498.38 | 424.40 | 14.84% | 49/50 | 773 | 5,489 |
| 4 | 1,012.40 | 886.36 | 12.45% | 47/50 | 1,644 | 41,449 |
| 5 | 2,052.32 | 1,832.40 | 10.72% | 47/50 | 3,420 | 242,825 |
| 6 | 4,212.80 | 3,690.82 | 12.39% | 50/50 | 6,909 | 1,149,017 |
| 7 | 8,367.98 | 7,490.60 | 10.48% | 47/50 | 13,886 | 4,514,873 |
| 8 | 16,886.82 | 14,913.68 | 11.68% | 48/50 | 27,842 | 15,033,173 |

The maximum observed hybrid query counts were respectively 213, 488, 1,055, 2,097, 4,115, 8,786, and 16,089, all below the corresponding fast caps. Every heldout check passed. Witness probabilities, witness-trial caps, and verifier sample counts are emitted by the script for each rank.

The seed schedule is fixed in the script:
- source: `0x70000000 + (replicate + 1000*rank)`
- baseline: `0x71000000 + (replicate + 1000*rank)`
- hybrid witness: `0x72000000 + (replicate + 1000*rank)`
- hybrid verifier: `0x73000000 + (replicate + 1000*rank)`
- heldout: `0x74000000 + (replicate + 1000*rank)`

As an additional port check, the Python baseline/hybrid implementations exactly reproduced the 1,000-element baseline-query, hybrid-query, baseline-attempt, and hybrid-trial arrays from the existing rank-five JavaScript frozen-source simulation when run with that script's original SHA counter seed schedule. The rank-five source-ensemble arrays were also reproduced exactly from their published seed schedule. For (r
e5), this report remains a Python-only exploratory extension.

## Independent lazy-face and section-table shift extension (Agent 43)

Agent 43 independently reproduced the eager rank-r query table, then removed the unused full-cube vertex by querying derivative faces sequentially. Across the same 350 source/replicate seeds, all eager and lazy models passed 44,800 heldout comparisons. Mean query counts and lazy caps were:

| Rank (r) | Eager mean | Lazy-face mean | Lazy fast cap |
|---:|---:|---:|---:|
| 2 | 189.62 | 185.86 | 310 |
| 3 | 424.40 | 418.64 | 748 |
| 4 | 886.36 | 874.88 | 1,618 |
| 5 | 1,832.40 | 1,809.38 | 3,393 |
| 6 | 3,690.82 | 3,650.24 | 6,882 |
| 7 | 7,490.60 | 7,411.72 | 13,859 |
| 8 | 14,913.68 | 14,735.70 | 27,815 |

The lazy witness cap is the eager cap minus (k), because the all-directions vertex is not used by any of the (r+1) derivative faces. This is an independent local Python reproduction, not a change to the reference implementation in this report.

Agent 43 then added a **fixed-pair section-table shift matcher**. After the anchor table (H) is available, check whether offsets (u=1) and (v=2) separate every pair ((q,delta\ne0)) by requiring at least one of the two second differences to be nonzero. If this exact table-only check passes, each standard basis vector needs only three oracle probes (F(e_j), F(e_j+a_0), F(e_j+a_1)) to uniquely recover its quotient coordinate and affine correction. If it fails, retain the original derivative-signature path. The RM verifier and exact ANF fallback remain necessary outside the projected-affine promise.

The independent rank-r Node simulation in [Agent 43's report](agent43-section-table-shift-fingerprint-2026-11-24.md) and [script](../sims/agent43-section-table-shift-fingerprint.js) found:

| Rank (r) | Lazy-signature mean | Shift mean | Shift fast cap |
|---:|---:|---:|---:|
| 2 | 185.86 | 185.86 | 310 |
| 3 | 418.64 | 290.64 | 620 |
| 4 | 874.88 | 490.88 | 1,234 |
| 5 | 1,809.38 | 913.38 | 2,497 |
| 6 | 3,650.24 | 1,730.24 | 4,962 |
| 7 | 7,411.72 | 3,443.72 | 9,891 |
| 8 | 14,735.70 | 6,671.72 | 19,751 |

All 350 generated 32-bit tables passed the fixed-pair check; all 44,800 heldouts passed; the Node simulation reports 767,999 fewer distinct oracle queries in aggregate than lazy signatures. Agent 42 independently reviewed the separation lemma, coordinate uniqueness, affine correction and cap, finding no counterexample under the projected-affine source promise. This is still a standalone deterministic-seed simulation: it is not the production learner, does not implement the complete fallback state machine, and is not HTTP/CSPRNG/runtime-budget evidence. The shift cap is conditional on the fixed-pair check passing; when it fails, the lazy signature cap remains the fallback candidate-path bound.

### Ideal random-table probability model for the fixed pair

For an ideal random table H: GF(2)^r -> GF(2)^w, fix distinct nonzero offsets u and v. The fixed-pair test fails at (q,delta) exactly when the three derivative values D_delta H(q), D_delta H(q+u), and D_delta H(q+v) are equal.

If delta is one of u, v, or u+v, two of the three unordered input pairs coincide, leaving two independent uniform pair-XOR words; the equality probability is 2^(-w). For each of the other 2^r-4 nonzero deltas, all three input pairs are disjoint, so the three pair-XORs are independent uniform words and the equality probability is 2^(-2w). A union bound over all q and nonzero delta gives:

P[fixed-pair test fails] <= 2^r * (3*2^(-w) + (2^r-4)*2^(-2w)).

At r=5 and w=32 this is 2.2351742e-8. The stronger differential-2-uniformity sufficient condition has failure bound 31*120/2^32 = 8.6613e-7, about 39 times looser; the matcher needs only the fixed-pair property, not full differential 2-uniformity.

This is an ideal independent-random-table model, not a theorem about a SHA-256-derived table. The frozen source table is checked exhaustively by the implementation, so no random-table assumption is needed for the reported fixed-table result.

Agent 2's greedy-offset-cover extension generalizes fixed-pair separation: any set of (2^r-2) distinct nonzero offsets intersects every nonzero support of the degree-(r-1) second-difference function, so a separating set always exists under the nonzero top-coefficient promise. A greedy search may find a smaller set when ({1,2}) fails, but its (O(8^r)) local computation and output-width-dependent behavior are not yet an end-to-end oracle benchmark. See the greedy-cover section of Agent 43's report and the independent review in [Agent 42's message](../communications/agent43/20261124T2213Z_agent42-shift-fingerprint-review.md).

For the specific monomial control in the rank-five peer suite, an independent deterministic calculation built all 31 offset masks over the 32*31=(q,delta) constraints. The fixed pair {1,2} fails; greedy set cover (maximum newly covered constraints, ties to the smallest offset) selected offsets 1 through 30 before covering all 992 constraints. In fact, the minimum separating-set size is exactly 30: when q and q+delta are both different from 31, the second-difference support over nonzero offsets is exactly {31+q, 31+q+delta}; as q and nonzero delta vary, these are all two-element subsets of the 31 nonzero offsets. A separating set must therefore intersect every two-element subset, so its complement has size at most one and its size is at least 30. Conversely, any 30 offsets intersect every such pair and also intersect the support for q=31 or q+delta=31. Thus no query saving over the 31-probe signature path is possible for this monomial table. The same proof applies to any point-mass table H[y]=c when y=a and zero otherwise, for arbitrary a and nonzero output word c: translate q by a, and the same two-element supports range over all pairs of nonzero offsets. Combined with the universal upper bound that any 2^r-2 distinct nonzero offsets suffice under the nonzero top-coefficient promise, this proves the worst-case minimum separating-set size over rank-r tables is exactly 2^r-2. This does not contradict the smaller greedy sets observed for random low-output-width tables. The deterministic calculation is reproducible with [sims/agent50-monomial-greedy-offset-cover-check.py](../sims/agent50-monomial-greedy-offset-cover-check.py).

## Validation

The rank-five JavaScript implementation is separately integrated in [draft PR #373](https://github.com/FlareZ123/obfs/pull/373) at head `635d51e8b48b6d0126108332b349d435d8ff49e2`; the focused peer run [45505921788](https://github.com/FlareZ123/obfs/actions/runs/45505921788) and matched HTTP run [45505927696](https://github.com/FlareZ123/obfs/actions/runs/45505927696) both passed on Ubuntu and Windows. This is rank-five evidence only, not rank-generic JavaScript/HTTP validation.

The updated fallback-control script was executed as part of the existing manual-only [low-rank target-inversion workflow](https://github.com/FlareZ123/obfs/actions/runs/45507605129). Both matrix jobs passed: Ubuntu and Windows. The workflow ran the script under Python 3.12 using the new step “Rank-r projected-affine fallback and diagnostic controls.” This validates the script, the full-cap no-witness diagnostic assertion, and its 34 constructed controls on both operating systems; it does not establish coverage of all degree-r functions or all higher ranks.

The separate monomial greedy-offset-cover reproduction was added as step 6 of the same manual workflow. The full workflow run [45510035379](https://github.com/FlareZ123/obfs/actions/runs/45510035379) subsequently completed successfully on both Ubuntu and Windows. Step 5 (rank-r fallback controls) and step 6 (monomial greedy-cover reproduction) both passed on both platforms; the rest of the low-rank suite also completed successfully. The monomial script verifies all 465 two-element offset supports and all 31 possible 30-offset sets for the structured table.

## Limitations and next work

- This is a mathematical generalization and deterministic Python reference simulation, not a JavaScript implementation or live HTTP result for ranks other than five. The fallback-control suite is also Python-only.
- The 350 same-source comparisons sample the promised projected-table family. The reported mean reductions and lower-comparison counts are descriptive; the two learners use independent deterministic tapes, so do not interpret them as a common-random-number paired statistical test. A separate exhaustive small-width control suite tests selected out-of-promise functions for every rank r=2..8: degree-(r-1) no-witness fallback, codimension-(r+1) signature overflow, silent codimension-(r+2) verification mismatch, and a lower-degree residual outside the quotient (r>=3). It checks 34 cases over their complete truth tables (10,144 output comparisons); all exact fallbacks reconstructed correctly. The control script is `sims/rank-r-top-derivative-fallback-controls.py`. This is a constructed suite, not exhaustive coverage of all degree-r functions or all higher-rank top forms.
- The Python rank-r reference in this report still eagerly prefetches the full ((r+1))-cube and uses derivative signatures. Separately, the rank-five JavaScript implementation now integrates lazy witness faces, conditional fixed-pair shift matching, signature fallback, exact fallback on ambiguity/no-witness/postfit mismatch, late verifier-tape release, and source pinning in PR #373 at head `635d51e8b48b6d0126108332b349d435d8ff49e2`. Its peer and live HTTP workflows passed on Ubuntu and Windows. This does not yet provide a rank-generic JavaScript implementation or rank-generic HTTP validation.
- No CPU, wall-time, memory, initialization, or 2.5× compute-budget measurement is made. No COO/SNO, general-JavaScript, static/dynamic resistance, tamper-resistance, or domain-locking claim follows.
- Prior-art review is now materially broader than higher-order differentiation and exterior algebra. The shared [finite-field oracle prior-art note](../resources/finite-field-polynomial-oracle-prior-art-2026-11-21.md) covers Gopalan–O'Donnell–Servedio–Shpilka–Wimmer (GOS), “Testing Fourier Dimensionality and Sparsity,” including Theorem 14's membership-query unique decoder for low-dimensional Boolean functions: it learns the invariance subspace and quotient truth table, so hidden parity-subspace recovery is direct prior art. Agent 42 derived an exact-oracle specialization of Theorem 14 with (O(n \\cdot 4^k\log(n2^k/\beta))) membership-query cost per Boolean output; this is a derivation from the proof, not a bound stated by the paper. For (n=32) and (beta=10^{-9}), the corrected exact-case illustration is 3,686,432 queries per Boolean output for (k=5) and 15,351,872 for (k=6); it includes the (2^{-32}) span-recovery failure term and the k-dependent exact binomial tail (8.36e-11 and 1.10e-10 respectively). Disregard the earlier (beta=10^{-10}) numeric totals. These are conservative per-output figures, not a direct same-model baseline: the repository promise is vector-valued with shared (P), low algebraic degree, and affine nuisance, while GOS is a Boolean Fourier-dimensional learner. The note also records exact sparse-Fourier/Kushilevitz–Mansour learning, Sălăgean et al.'s higher-order differentiation/cube-attack work, Carlet's derivative-subspace background, and adjacent exterior-algebra cryptanalysis. Do not claim novelty for Fourier dimension, parity juntas, hidden-subspace decoding, or higher-order differentiation alone. Any possible contribution is limited to lower-query exact reconstruction for the structured vector-valued, shared-(P), low-degree, affine-nuisance subclass, subject to full priority review.
- Internal source-class context: [Agent 11's quartic functional clone](rankfive-top-quartic-functional-clone-2026-11-21.md) treats degree-(le4) sources with a rank-four top derivative and arbitrary lower-degree background; it is a different source class and is not a baseline for the present degree-five source. [Agent 50's quintic functional clone](rankfive-top-quintic-functional-clone-2026-11-22.md) handles degree-(le5) functions with arbitrary lower-degree background and a codimension-six fifth-derivative promise, a broader class than this projected-affine family. The current section learner is a cheaper specialization whose exact linear-residual proof depends on (F(x)=A(x)+b+h(Px)); it is not a generalization of that arbitrary-background functional clone. The table's 10–25% comparison is specifically against the projected-affine profile learner on the same restricted family, not the strongest general degree-five attack baseline. The quartic/quintic functional clones have different promises and should be presented as complementary context, not interchangeable same-promise baselines.
- A diagnostic defect in the fallback-control harness was corrected: no-witness runs now report all attempted trials (the full cap), and the suite asserts that count. This does not change the fallback model or query results.
- Treat this as an intermediate hypothesis and do not promote it to `results/` or change the project release gate.

**Decision:** preserve in `im-results/` as a rank-parameterized research direction. The rank-five JavaScript integration is now implemented and cross-platform peer/HTTP validated in draft PR #373; keep that PR research-only. The next useful step is to generalize the integrated lazy-face/shift/signature/exact-fallback state machine from r=5 to rank-r, then add rank-generic two-platform peer/HTTP tests and broader out-of-promise controls. Measure CPU and the 2.5x budget separately. This is not a product merge or release candidate.
