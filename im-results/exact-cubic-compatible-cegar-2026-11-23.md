# Exact cubic ANF clone and globally certified compatible-triangular inversion

**Status:** Intermediate research; mathematical conditional result with an experimental implementation. Focused CI receipt and independent peer review must be checked before any promotion.  
**Author:** Agent 2, 23 November 2026.  
**Files:** sims/exact-cubic-compatible-cegar.js and test/exact-cubic-compatible-cegar.test.js.

## Source and oracle model

The defender publishes a forward selected 32-bit function, and the attacker may ask chosen-input queries. Assume the *true source* is of the form

\[
F(x)=a\oplus B\,P(Ax\oplus b),\qquad
P_j(z)=z_j\oplus g_j(z_0,\ldots,z_{j-1}),
\]

where the binary matrices \(A,B\) are invertible, and the vector-valued Boolean map \(F\) has total algebraic degree **at most three** over GF(2). The gates \(g_j\) may contain every lower-prefix linear, quadratic, and cubic monomial, not merely a product of three linear forms. The attacker receives no matrices or private gate parameters. The degree/triangular facts are **promises about the source family**, not claims that 5,489 oracle calls can certify these facts for an unknown general service.

The generic low-weight ANF learner already in sims/bounded-degree-oracle-functional-clone.js reconstructs every coefficient of a degree-at-most-three vector-valued map from exactly

\[
Q(32,3)=\binom{32}{0}+\binom{32}{1}+\binom{32}{2}+\binom{32}{3}
=1+32+496+4960=\mathbf{5,489}
\]

distinct forward queries. The resulting clone is correct on the entire \(2^{32}\) input domain by the algebraic degree promise. All subsequent inversion uses the clone coefficients locally. This claim alone does not imply efficient inversion of arbitrary cubic permutations.

## Exact cubic derivative certification

Define the output-valued second difference

\[
Z(x,v)=F(x\oplus v)\oplus F(x)\oplus F(v)\oplus F(0).
\]

For a cubic vector-valued Boolean polynomial, fixing a direction \(v\) leaves a polynomial in \(x\) of degree at most two and with zero constant term:

\[
Z(x,v)=\bigoplus_i x_i L_i(v)
\oplus\bigoplus_{i<j}x_i x_j Q_{ij}(v).
\]

Here each vector coefficient \(L_i(v)\) has degree at most two in \(v\), while each \(Q_{ij}(v)\) is linear in \(v\). The cubic contractor derives the following **exact** values directly from the public ANF coefficients:

- For a quadratic source monomial \(c_{ij}x_ix_j\), its contribution to \(L_i(v)\) is \(c_{ij}v_j\) and to \(L_j(v)\) is \(c_{ij}v_i\).
- For a cubic source monomial \(c_{ijk}x_ix_jx_k\), its contribution to \(L_i(v)\) is \(c_{ijk}v_jv_k\), and analogously for \(L_j,L_k\); its contribution to \(Q_{ij}(v)\) is \(c_{ijk}v_k\), and analogously for the other two pairs.

Let \(U\) be the current input direction subspace, with basis \(u_1,\ldots,u_k\), and write \(v=\oplus_p t_p u_p\). Every possible defect vector \(Z(x,v)\) is in the span of the finite mixed ANF coefficient set

\[
\left\{L_i(u_p),\quad Q_{ij}(u_p),\quad
L_i(u_p\oplus u_q)\oplus L_i(u_p)\oplus L_i(u_q):
i<j,\ p<q\right\}.
\]

Conversely each member of this coefficient set is an XOR of values of the exact defect polynomial over selected \((x,t)\) assignments, by Boolean Möbius inversion. Hence their spans are **equal**: this is an exact global certificate, not a random sample.

At dimension \(k\), the set contains

\[
\left(32+\binom{32}{2}\right)k+32\binom{k}{2}
\]

coefficient vectors, requiring \(k+\binom{k}{2}\) ANF contractions (some vector coefficients may be zero). Across all 32 greedy stages, the implementation produces exactly **453,376** coefficient-vector entries and **5,984** contractions. These are local calculations after the 5,489 forward training queries.

The orthogonal complement of the exact defect span contains precisely those output scalar masks whose first derivative is constant at *every basepoint*, for *every direction in U*. This replaces the quadratic bilinear certificate of sims/exact-quadratic-compatible-cegar.js with an exact mixed-cubic certificate.

## Why greedy inversion completes for this source family

The general global-derivative flag theorem is already recorded in im-results/affine-differential-flag-oracle-inversion-2026-11-23.md, with exhaustive 4-bit support in sims/compatible-derivative-greedy-exhaustive.js. It supplies a nonzero globally constant scalar derivative for every nonzero input subspace \(U\): choose the least source-coordinate bit \(j\) varying on \(AU\), and the output mask \(m^TB=e_j^T\). Then

\[
m^T(F(x\oplus h)\oplus F(x))=(Ah)_j
\]

for all \(x\) and \(h\in U\), which is nonzero for some \(h\).

The greedy algorithm maintains the invariant \(F(U)\oplus F(0)=V\), with \(V\) a linear output subspace and \(\dim U=\dim V\). The exact defect-annihilator basis includes a mask with nonzero restriction to \(V\); selecting an independent restriction cannot discard all such masks. Any accepted mask defines a nonzero linear form on \(U\); splitting its kernel reduces \(\dim U\) and \(\dim V\) by one while preserving the invariant. By induction, **every valid greedy choice completes** after 32 stages. The stored input toggles reconstruct the unique preimage of every target using only the local model.

This is a composition of an existing flag-existence lemma and an explicit cubic exact-certification construction. It applies to the promised affine-triangular degree-at-most-three class, **not** arbitrary degree-three permutations.

## Test design and falsification boundary

The independent test generator constructs arbitrary lower-prefix pairwise and triple ANF gates with dense invertible affine input/output wrappers and independent offsets. It compares the computed contraction with the source oracle's raw second differences at held-out points, compares the full clone on unqueried points, and checks exact target preimages. The inversion implementation does not import or inspect the test generator's private gates.

A source-proven fourth-degree triangular negative control flips a high output bit when four specified low input bits are simultaneously one. Every queried input of Hamming weight at most three sees identity, so the cubic learner obtains an **incorrect identity clone**. This witnesses that neither the source degree nor its correctness can be inferred from this restricted 5,489-query transcript. There is no universal query bound for unsupported source families in this record.

The result is an attacker-side candidate-elimination method under authorized chosen-query access. It does not recover original source bytes, bypass credentials, measure defender runtime against 2.5×, prove a generalized SCO protocol weakness, or establish any positive obfuscation security guarantee. An equally private conventional HTTP service exposing the same numeric oracle would leak the same chosen-input information.

## Reproduce

From a checkout of the source with declared dependencies:

    node --test test/exact-cubic-compatible-cegar.test.js
    npm run typecheck:external

For a full source-pinned receipt, use the existing manual-validation focused workflow with focused_test=test/exact-cubic-compatible-cegar.test.js on both Ubuntu and Windows. Only the focused test and strict typechecks run under that input; it is **not** a full regression-suite acceptance gate.
