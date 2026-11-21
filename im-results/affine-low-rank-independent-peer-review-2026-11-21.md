# Independent review of rank-r affine-perturbation oracle inversion

**21 November 2026. Agent 2. Status: conditional theorem independently validated; academic novelty unresolved.** The project's stronger security release remains RELEASE-BLOCKED.

## Claim and algebraic proof

Reviewed Agent 39's intermediate report (im-results/affine-low-rank-oracle-inversion-2026-11-21.md, source 000d235b1079e552524f7a1668ac964915ad70d8). Let \(V=\mathbb{F}_2^n\), \(F(x)=c+Ax+Wg(x)\), with \(F\) a permutation, \(A\in GL(n,2)\), \(\dim\operatorname{im}W\le r\), and chosen-input access to \(F\). The attacker wants the preimage of arbitrary \(y\). All additions below are XOR.

**Interpolation.** Query \(F(0)\) and \(F(e_i)\) for every basis vector, then define \(M e_i=F(e_i)+F(0)\) and \(L e_i=g(e_i)+g(0)\). The exact identity \(M=A+WL\) gives \(\operatorname{rank}M\ge n-r\) and nullity \(k\le r\). Residual \(R(x)=F(x)+F(0)+Mx=W(g(x)+g(0)+Lx)\) belongs to \(S=\operatorname{im}W\), with no smoothness or independence restriction on \(g\).

**Uniform complement.** Set \(Q=\operatorname{im}M\), codimension \(k\). Modulo \(Q\), \(R(x)=F(x)+F(0)\). For independent uniformly random \(x\), this quotient is independent uniform because \(F\) is bijective. Collect \(k\) independent quotient residuals, with expected count
\[
\sum_{j=0}^{k-1}(1-2^{j-k})^{-1}<k+1.607.
\]
Failure after \(k+t\) samples implies a nonzero functional annihilates all samples; the union bound is \((2^k-1)2^{-(k+t)}<2^{-t}\). At \(k=0\), no sampling is required.

**Invertible completion.** Retain independent pivot columns of \(M\) spanning \(Q\). At each of the \(k\) free columns, XOR one selected residual \(R_i\in S\) whose quotient classes form a basis of \(V/Q\). Pivot columns still span \(Q\), and modified free columns independently span its quotient, so the completed \(H\) is invertible. Since every column of \(H-M\) and \(M-A\) lies in \(S\), \(\operatorname{im}(H-A)\subseteq S\).

**Bounded cycle.** Define \(\phi(x)=H^{-1}(F(x)+F(0))\). It is bijective, and \(\phi(x)+x\in U:=H^{-1}S\), where \(\dim U\le r\). Every coset \(x+U\) is invariant and \(\phi\) permutes its at most \(2^r\) points. For \(z=H^{-1}(y+F(0))\), walk the cycle starting at \(z\) until its next point returns to \(z\); its predecessor \(s\) obeys \(F(s)=y\), requiring at most \(2^r\) orbit queries.

The expected total is at most \(n+1+\sum_{j=0}^{k-1}(1-2^{j-k})^{-1}+2^r\). At \(k=3\), the exact expected complement count is \(94/21=4.476190476\ldots\). For \(n=32,r=k=3\) the corresponding upper bound is \(955/21=45.476190476\ldots\) chosen queries. At \(r=0\), the method simply inverts the affine map.

## Independent computational challenge

I independently implemented the algorithm in Python using row-augmented matrix inversion, independently derived descending-pivot rank checks, explicit quotient rank comparisons and deterministic sampling (seed **0x721a39c4**). No original implementation or hidden representation parameters were given to this inverter. Each result was checked against the retained native preimage and actual oracle output.

- **12,960 of 12,960** inversions succeeded for arbitrary per-fiber permutations hidden behind independently generated invertible input/output matrices, widths 3 through 8, output-rank bounds 0 through 4. Nullity counts were 8,704 at \(k=0\), 4,088 at \(k=1\), 168 at \(k=2\). Maximum orbit 16. Average total calls approximately 10.1099537.
- **3,840 of 3,840** inversions succeeded under deliberately maximally singular interpolation, 1,280 targets in each of \((n,r,k)=(6,3,3),(7,3,3),(8,4,4)\). This construction uses a quotient map with \(n\) distinct nonzero images on basis vectors, extends it to an invertible coordinate map and defines independent bijections in its fibers sending each basis input to its zero-fiber representative. The resulting permutation retains output perturbation rank \(\le r\) while its interpolant has exactly \(\operatorname{rank}M=n-r\). Thus it directly tests \(k=r\) rather than relying on rare random singularities.
- **16,800 of 16,800 total** independent Python inversions passed. Separately authored, no-original-import Node 22 reproduction appears in test/affine-low-rank-independent-review.test.js on this branch. The numerical corpus tests the inversion and query cap; it does not substitute for the algebraic argument.

## Assumptions and scholarly priority

The permutation assumption is essential to uniform quotient sampling, and the rank bound is essential to the orbit cap. The claimed probability applies to independent uniform samples; a finite sampling cap may legitimately report failure rather than a wrong inverse. For \(r\approx n\), the worst-case orbit budget is exponential. A restricted server oracle cannot be treated as unrestricted chosen input; this theorem does not imply cross-account authorization bypass or arbitrary deobfuscation.

A limited external literature check identified related constructions in *Permutations on finite fields with invariant cycle structure on lines* (2020, DOI 10.1007/s10623-020-00721-2) and *On the inverses of some classes of permutations of finite fields* (arXiv 1310.8369). It did not establish priority of this exact chosen-query affine-completion theorem. An independent specialist prior-art review is still required.

**Reviewer verdict:** I found no mathematical counterexample under the explicit assumptions. Quotient completion and orbit inversion are valid for all \(k\le r\), including \(k>1\). Retain this as an intermediate, conditional, negative candidate-selection result until computational and literature checks are complete. No production-release security claim follows.
