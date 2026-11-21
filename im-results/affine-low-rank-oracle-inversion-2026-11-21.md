# Target inversion of arbitrary low-rank nonlinear affine perturbations

**21 November 2026, Agent 39. Classification: intermediate new algebraic candidate-elimination claim pending independent peer proof/reproduction.** This is an exact chosen-query target-inversion theorem under a stated representation promise, with a probabilistic finite sampling phase. It provides neither a static reconstruction of an unknown function nor a positive candidate for production obfuscation.

## Statement

Let \(V=\mathrm{GF}(2)^n\), and suppose the hidden oracle is a **permutation** \(F:V\to V\) with some representation

\[
F(x)=c\oplus A(x)\oplus W(g(x)),
\]

where \(A\in GL(n,2)\), \(W\) is any linear map whose image has dimension at most \(r\), and \(g\) is **completely arbitrary**. Its nonlinear output coordinates can interact, be state-dependent within the purely functional oracle, and have unknown/high algebraic degree. The attacker knows only \(n\), an upper bound \(r\), a target \(y\), and has chosen-input access to \(F\).

There is a Las Vegas exact inverter with at most \(2^r\) post-setup orbit queries and expected total oracle calls

\[
\mathbb E[Q]\le n+1+\sum_{j=0}^{k-1}\frac{1}{1-2^{j-k}}+2^r
< n+1+k+1.607+2^r,
\]

where \(k=n-\operatorname{rank}(M)\le r\), \(M\) is a known affine interpolant constructed in the first \(n+1\) queries, and the summation is zero when \(k=0\). The algorithm returns the exact preimage \(s=F^{-1}(y)\) for **every target** with probability one over an unbounded sequence of independent uniform samples; if the sampling phase is stopped after \(k+t\) independent uniform draws, its failure probability is strictly less than \(2^{-t}\) (for integer \(t\ge0\)). Under a finite implementation cap, failure is explicitly reported instead of inventing a preimage.

The bound is useful for **low rank**: at 32 bits and \(r=3\), \(k\le3\), giving fewer than \(32+1+4.477+8=45.477\) expected queries. No statement is made for arbitrary output-rank \(r\approx n\), for non-permutations, or when chosen-input access is absent.

## Constructive proof

**1. Affine interpolation.** Ask for \(c_0=F(0)\) and \(F(e_i)\) for every standard basis vector \(e_i\). Let \(M e_i=F(e_i)\oplus c_0\). Write \(L e_i=g(e_i)\oplus g(0)\). By linear extension,

\[
M=A+WL,\qquad\operatorname{rank}(M)\ge n-r.
\]

The observable residual \(R(x)=F(x)\oplus c_0\oplus Mx\) belongs to \(\operatorname{im}(W)\) for every \(x\).

**2. Complete any singular interpolant.** Let \(Q=\operatorname{im}(M)\), \(k=n-\dim Q\). Incrementally sample uniformly random inputs \(x\), query \(F(x)\), and collect \(k\) residuals \(R_i\) whose quotient classes form a basis for \(V/Q\). The quotient class of \(R(x)\) equals the class of \(F(x)\oplus c_0\), since \(Mx\in Q\). A uniform input yields a uniform \(F(x)\), because \(F\) is bijective; hence quotient samples are i.i.d. uniform in the \(k\)-dimensional quotient. The expected time to span is the displayed sum, and a union bound over its \(2^k-1\) nonzero linear functionals gives the \(2^{-t}\) failure tail after \(k+t\) samples.

Use Gaussian elimination on the columns of \(M\), retaining the pivot columns and listing its \(k\) dependent/free column positions \(q_1,\ldots,q_k\). Construct \(H\) by replacing column \(M e_{q_i}\) with \(M e_{q_i}\oplus R_i\), leaving all pivot columns identical. The pivot columns already span \(Q\), and the new columns independently span the missing quotient directions. Therefore \(H\) is invertible. Critically, every column of \(H-M\) is in \(\operatorname{im}(W)\); hence the same is true of \(H-A=(H-M)+(M-A)\).

**3. Restrict the hidden permutation to small cosets.** Define the fully observable permutation

\[
\phi(x)=H^{-1}(F(x)\oplus c_0).
\]

Because \(H-A\) and \(F(x)\oplus c_0\oplus Ax\) have images inside \(\operatorname{im}(W)\),

\[
\phi(x)\oplus x\in U=H^{-1}(\operatorname{im}(W)).
\]

The dimension of \(U\) is at most \(r\). Thus \(\phi\) maps each coset \(x+U\) into itself, and, because \(\phi\) is bijective, it permutes the points of that coset. Each cycle has at most \(2^r\) elements.

**4. Invert the target.** Set \(z=H^{-1}(y\oplus c_0)\). Starting at \(z\), repeatedly evaluate \(\phi\) until the next value would equal \(z\); let the current point be \(s\). Every finite permutation cycle returns to its starting point. By construction \(\phi(s)=z\), so \(F(s)=y\). This takes at most \(2^r\) additional evaluations, and works whether the observed interpolation \(M\) was singular or invertible.

## Reproducible implementation

- \`sims/affine-low-rank-oracle.js\`: JSDoc CommonJS implementation of the exact inverse, unsigned GF(2) matrices, genuine Node \`node:crypto.randomInt\` uniform default and explicit finite sampling cap; records interpolant nullity, random sampling and orbit lengths. The implementation supports \(1\le n\le32\) and practical \(r\le16\). Node 22's \`crypto.randomInt\` permits a range below \(2^{48}\), including all the unsigned 32-bit inputs used here; see official [Node 22 crypto docs](https://nodejs.org/download/release/v22.21.0/docs/api/crypto.html#cryptorandomintmin-max-callback).
- \`test/affine-low-rank-oracle.test.js\`: deterministic independent permutation generators and held-out oracle comparisons; it never passes the unknown affine map, nonlinear function, or secret to the inverter. A deterministic cycling sample callback ensures reproducibility; the stated high-probability query bound requires the **default independent random sampler**, not cycling.
- Locally on Node \`v22.16.0\`, five test suites passed in under one second (before repository CI verification). They cover: **322,560/322,560** targets across all 40,320 permutations on three bits; **4,608/4,608** targets across all rank-two fiber permutations on three bits; **26,784/26,784** hidden-input/output-linear randomized fiber examples at widths three through seven; **104/104** forced singular interpolants of nullities one, two, and three; and **240/240** 32-bit examples with hidden random linear coordinates and three-dimensional nonlinear fibers. **Total 354,296/354,296 exact target recoveries** in this one implementation's corpus. These cases are computational evidence, not substitutes for the algebraic proof or an independent implementation.

## Relation to previous established result

The [rank-one nonlinear perturbation inversion theorem](../results/rank-one-nonlinear-perturbation-inversion.md) achieves a **deterministic** worst-case \(n+3\) chosen-query bound for \(r=1\) and uses the extra injectivity-implied invariant \(g(x\oplus u)=g(x)\) to avoid searching a long orbit. This rank-\(r\) construction uses an arbitrary quotient-completion procedure and then a \(2^r\) cycle, giving a randomized expected bound. Its contribution is a different proof architecture that handles **arbitrary interacting rank-\(r\) residuals** (including \(r\ge2\)) under the same permutation assumption. It does not improve the rank-one bound and does not prove that every invertible triangular or WASM construction has low additive output rank.

A small additive output subspace is a structural reason to **reject** obfuscation candidates whose security depends entirely on a few nonlinear output coordinates, when the attacker is permitted legitimate chosen inputs. This attack is compatible with the COO public-copy attacker and the SNO owner runtime attacker. In SCO, the permitted server oracle and authorization boundary matter: arbitrary chosen queries are assumed, but a same-account permitted oracle does not entail cross-account compromise or hidden-source extraction.

## Independent review needed before promotion

1. Re-derive the quotient-completion and coset-cycle proof without this implementation, particularly the case where \(M\) is rank deficient by \(k>1\).
2. Implement an independent inverter, vary \(r=2,3,4\), and test both uniform and pathological fiber permutations with hidden input/output matrices.
3. Challenge the \(\operatorname{rank}(W)\le r\) promise and the uniform-query assumption in realistic workloads; measure actual online query costs and the effect of rate limits.
4. Compare literature on randomized inversion of bounded-rank perturbations and affine equivalence before claiming academic novelty. No priority or literature novelty is asserted here.

**Research decision:** This is a promising exact negative candidate-selection method with a complete mathematical argument and a local reproducible test corpus, awaiting independent validation. It does not alter the existing **RELEASE-BLOCKED** assessment.
