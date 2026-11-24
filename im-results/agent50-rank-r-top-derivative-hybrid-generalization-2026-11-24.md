# Rank-r top-derivative quotient/section learner: exploratory generalization

**Status:** intermediate exploratory evidence; not an established result, production implementation, or release approval  
**Date:** 24 November 2026  
**Owner:** Agent 50  
**Reference implementation:** `sims/rank-r-top-derivative-hybrid-reference.py` (Python standard library only)  
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

The verifier uses (m) independent uniform inputs. Both the source and candidate are degree at most (r); any nonzero vector-valued difference has at least the relative weight (2^{-r}), by the minimum-distance bound for (RM(r,n)). Hence a wrong candidate passes with probability at most ((1-2^{-r})^mledelta), assuming a fixed oracle and verifier draws independent of training/witness draws. A mismatch must exact-fallback to degree-(r) ANF interpolation. The fallback query count is (sum_{j=0}^rinom nj).

## Deterministic reference experiment

Run:

```bash
python3 sims/rank-r-top-derivative-hybrid-reference.py
```

Configuration:
- (n=32), (delta=10^{-10}), 50 paired replications per rank (r=2,ldots,8) (350 total pairs).
- Each replication generates a fresh rank-(r) parity projection and truth table; the table top coefficient is forced nonzero if necessary.
- Each baseline/hybrid model is checked on 128 heldout inputs (89,600 model-output comparisons total).
- All streams are deterministic SHA-256 counter tapes. They provide reproducibility, not proof of independent uniform randomness.
- The baseline is a Python reference port of `learnProjectedAffineOracle`; the hybrid is an eager-cube Python reference port of the quotient/section algorithm. This is not a JavaScript implementation and does not exercise fallback behavior on out-of-promise sources.

| Rank (r) | Baseline mean queries | Hybrid mean queries | Mean reduction | Hybrid lower pairs | Fast cap | Exact ANF queries |
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

## Limitations and next work

- This is a mathematical generalization and deterministic reference simulation, not a JavaScript implementation or live HTTP result for ranks other than five.
- The experiment only samples the promised projected-table family. It does not test arbitrary degree-(r) functions, side effects, stateful oracles, or higher-rank sources that might pass a signature-shape check. Such sources need independent adversarial controls and exact-fallback validation.
- The reference hybrid eagerly prefetches the full ((r+1))-cube. A separate lazy-face optimization was found for rank five, but is not implemented here.
- No CPU, wall-time, memory, initialization, or 2.5× compute-budget measurement is made. No COO/SNO, general-JavaScript, static/dynamic resistance, tamper-resistance, or domain-locking claim follows.
- Prior-art/novelty review is outstanding. Treat this as an intermediate hypothesis and do not promote it to `results/` or change the project release gate.

**Decision:** preserve in `im-results/` as a rank-parameterized research direction. The next useful step is an independently reviewed generic JavaScript implementation with out-of-promise fallback controls, not a product merge.
