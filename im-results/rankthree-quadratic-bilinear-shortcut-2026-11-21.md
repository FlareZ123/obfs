# Deterministic quadratic projected-oracle cloning with early bilinear-rank certificate

**Agent:** 41  
**Date:** 21 November 2026  
**Status:** intermediate adversarial efficiency candidate.  
**Reproducer:** [sims/rankthree-quadratic-bilinear-shortcut.js](../sims/rankthree-quadratic-bilinear-shortcut.js).  
**Related prior method:** [Agent 22's rank-three projected polynomial clone](../sims/rankthree-polarization-oracle-clone.js).

## Problem and exact promise

A client has chosen-input access to a fixed vector oracle \(F:\mathbb F_2^n\to\mathbb F_2^m\) with unknown representation
\[
F(x)=c+Ax+g(Vx),\qquad\operatorname{rank}(V)\le r,
\]
where the **whole function has algebraic degree at most two**. The attack makes no invertibility assumption on \(F\) or \(A\), needs no private source or key, and constructs a callable offline clone. The current implementation handles \(n\le32\), \(m=32\) encoded in unsigned JS words, and the test fixes \(r=3\).

This attack applies directly to a family known in advance to be quadratic. If a larger rank-three projected family may contain cubic members, the ordinary cubic detection step must precede this procedure. Replacing a quadratic fallback within a probabilistic cubic detector preserves the detector's residual false-negative risk; the shortcut alone does not recognize cubic functions.

## Exact reconstruction proof

For a quadratic \(F\), define its second polarization
\[
B(x,y)=F(x+y)+F(x)+F(y)+F(0).
\]
\(B\) is alternating and bilinear in its two input words. Its radical \(K=\{x:B(x,y)=0\;\forall y\}\) contains \(\ker(V)\), so \(\operatorname{codim}(K)\le r\).

Query \(F(0)\) and the \(n\) one-hot values. Then reveal successive columns of \(B\) by querying pairs \(F(e_i+e_j)\). After examining pivot columns \(e_0,\ldots,e_j\), define the publicly computable linear signature
\[
S_j(x)=(B(x,e_0),\ldots,B(x,e_j)).
\]
If \(\operatorname{rank}(S_j)=r\), then \(K\subseteq\ker(S_j)\), while both have dimension \(n-r\) by the promised radical bound. Hence \(K=\ker(S_j)\) exactly. This is a **deterministic certificate** that the observed columns span the entire bilinear interaction, with no untested input directions remaining.

Pick \(r\) standard-basis input vectors \(u_a=e_{i_a}\) whose signatures form a basis of \(\operatorname{im}(S_j)\). Each \(e_i\) has a unique quotient coordinate \(z_i\in\mathbb F_2^r\) such that \(S_j(e_i)=\sum_a(z_i)_aS_j(u_a)\). Their difference lies in \(K\), therefore
\[
B(e_i,e_k)=B\bigl(\sum_a (z_i)_a u_a,\sum_b(z_k)_b u_b\bigr).
\]
Only the \(r(r-1)/2\) pair coefficients \(B(u_a,u_b)\) are needed. Let \(Q(z)=\sum_{a<b}z_az_bB(u_a,u_b)\). The original function is recovered for every \(x\) as
\[
F(x)=F(0)+\sum_i x_i\bigl(F(e_i)+F(0)+Q(z_i)\bigr)
+Q\bigl(\sum_i x_i z_i\bigr).
\]
The stored clone executes this expression without calling the source oracle.

If the observed signature rank never reaches the promised upper bound \(r\), the procedure simply completes all one-/two-hot queries and uses the ordinary exact quadratic ANF. Its **deterministic worst-case query count never exceeds**
\[
1+n+\binom n2,
\]
which is **529** at \(n=32\). The early path can be much less expensive, and requires neither a stochastic correctness assumption nor a guessed nonlinear coefficient.

When the first \(k\) basis-pivot columns certify rank \(r\), at most
\[
1+n+\sum_{j=0}^{k-1}(n-1-j)+\binom r2
\]
distinct queries suffice (many of the final pairs are already cached). This is a *conditioned* bound: attaining signature rank \(r\) early depends on the instance's nonlinear structure and chosen coordinate order. It is not a universal upper bound for every rank-at-most-\(r\) instance.

## Independent implementation and tested outputs

The Node.js CommonJS reproducer implements a column-signature rank test with exact GF(2) elimination using BigInt concatenations of all 32 output bits. Its fast evaluator stores quotient coordinates, adjusted affine coefficients and at most three quadratic output vectors. When the rank test cannot establish full rank three, it returns the exact 529-query generic interpolation model. An explicit state switch rejects any attempted source-oracle call after training.

Local Node.js **v22.16.0**, strict JSDoc check with Node types, deterministic xorshift seed \`0x65a2f11\`:

| Population | Models | Offline outputs checked | Early exact rank-three certificate | Maximum distinct training calls |
| --- | ---: | ---: | ---: | ---: |
| Exhaustive 3-bit vector-valued quadratic coefficient triples | 512 | 4,096 | 462 | 7 |
| 32-bit full-input oracles with rank-two projected quadratic term | 96 | 12,288 | 0 | 529 |
| 32-bit full-input oracles with rank-three projected quadratic term | 96 | 12,288 | 96 | 178 |

All **28,672 / 28,672** offline outputs matched. The 96 seeded rank-three models had **median 94** and **mean 108.65625** distinct training calls, compared with 529 for unconditionally completing the general 32-bit quadratic ANF. That corresponds to an observed mean-call reduction of about **79.46%** on this one seeded population. These are chosen-oracle query counts, not CPU benchmarks.

For the rank-three models, the projection was hidden behind three independently chosen 32-bit parity masks, a full random 32-bit affine output map, and a randomly generated eight-entry projected function table whose cubic ANF coefficient was constrained to zero. The randomized rank-two models intentionally require the generic fallback when configured with the **rank-three** upper bound. The smaller exhaustive control enumerated all \(8^3=512\) choices of three output-vector quadratic coefficients on a three-bit input, not every affine output and input wrapper; the derivation covers those affine terms.

## Decision and limitations

This improves **attack efficiency** against source families known to be quadratic with low input projection rank, and demonstrates a useful exact early-termination criterion for vector-valued Boolean quadratic interpolation. It is a standard finite-field linear-algebra argument pending independent novelty assessment. It does **not** establish general source recovery, unauthorized SCO access, or protection beyond ordinary same-trust minification. No product security release claim follows. A genuine cubic outside the degree-two promise can invalidate the shortcut. The global three-mode release decision remains **RELEASE-BLOCKED**.

A concrete integration path is to replace the generic degree-two branch in Agent 22's rank-three cubic-or-quadratic oracle learner with this exact rank-certified/fallback method, preserving the existing cubic-witness confidence accounting and measuring distinct query savings on source-pinned application traffic. This report keeps that integration as an unperformed next step.
