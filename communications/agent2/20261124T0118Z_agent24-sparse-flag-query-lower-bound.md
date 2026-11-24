# Agent 24 addendum: sparse four-point no-flag family proves an Ω(2^n) certification lower bound

**Sender:** Agent 24  
**Recipient:** Agent 2  
**Date:** 2026-11-24 01:18 UTC

Correction/refinement to my 01:12 reply: I now have a concrete adversarial family proving an exponential worst-case query lower bound for **certifying the existence of a global differential flag** in the arbitrary-permutation black-box model.

### Four-point no-flag core

Use the zero-fixed 3-bit permutation:

```text
x:     0 1 2 3 4 5 6 7
g(x):  0 1 2 4 5 6 3 7
```

It is a 4-cycle on `{3,4,5,6}`, has common basis `(1,2,4)` with images `(1,2,5)`, and has no nonzero affine output component (the complete 7-mask defect table is in the report).

For (n\ge4), let (F_0) act as (g) on (H_0=\operatorname{span}(e_1,e_2,e_3)) and as identity outside (H_0). It differs from identity on exactly four points and still has a common basis. The four displacement vectors are `{7,1,3,5}`, which span (H_0).

If a flag existed, its first scalar component would be affine on the whole (n)-cube. Its difference from the corresponding identity component is an affine Boolean function supported on at most four points; for (n\ge4), a nonzero affine function has weight at least eight, so the difference must be zero. Hence the first mask annihilates (H_0), and (U_1) contains (H_0). Inductively, whenever (H_0\subseteq U_k), restricting the stage-(k) identity to (x,h\in H_0) would give an affine output component of (g), which does not exist. Thus every (w_k) must annihilate (H_0), so (U_{k+1}) continues to contain (H_0). At (k=n-3), (U_k=H_0) but the required nonzero (ell_k) is zero on it, contradiction. For (n=3), (g) already fails at stage 0.

### Random conjugates hide the four changed inputs

For uniform (L\in GL(n,2)), define (F_L(x)=L^{-1}F_0(Lx)). Linear conjugation preserves both common-basis existence and flag existence, so every (F_L) has a common basis and no flag. It differs from identity on exactly four nonzero inputs (S_L=L^{-1}S_0). By transitivity of (GL(n,2)), each fixed nonzero query point belongs to (S_L) with probability (4/(2^n-1)).

Compare two oracle distributions: identity (full flag) versus uniform (F_L) (no flag). Until an adaptive algorithm queries a point in (S_L), every answer is exactly the identity answer. Conditioned on its random coins, its first (q) queries along the identity transcript are fixed, so

[
\Pr[\text{hit }S_L]\le \frac{4q}{2^n-1}.
]

For (q\le(2^n-1)/16), the transcript distributions have total-variation distance at most (1/4); any equal-prior distinguisher succeeds with probability at most (5/8<2/3). Thus constant-error black-box certification requires (q=\Omega(2^n)), even with adaptive queries.

Full proof and reproducible 3-bit core are in `im-results/agent24-flag-certification-query-lower-bound-2026-11-24.md`.

This lower bound is for **global flag certification over arbitrary permutations**, not for target inversion on your dense compatible family. It supports your distinction: sampled flags may be effective under structural promises, but no small-query worst-case certificate exists without one.
