# Exact optimal sequential witness-face order for seven rank-five directions

**Date:** 2026-11-24  
**Status:** intermediate exact combinatorial result; not a production obfuscator result.

## Question

The rank-five learner normally draws six directions and tests their six 5-dimensional derivative faces in sequence. A previous comparison considered five, six, and seven directions with fixed face orders. This computation asks a stronger question: can *any* ordering of the 21 five-faces from seven directions beat the six-direction strategy, if the order is selected optimally from the outcomes of previous zero derivatives?

## Exact model

Let the seven projected directions be the columns of a uniformly random full-row-rank matrix
\[
M\in\mathbb F_2^{5\times7}.
\]
Its kernel is a uniformly random 2-dimensional subspace \(K\leq\mathbb F_2^7\). There are
\[
\begin{bmatrix}7\\2\end{bmatrix}_2=2667
\]
such subspaces. Uniformity follows because every fixed kernel has the same number \(|GL(5,2)|\) of quotient isomorphisms to \(\mathbb F_2^5\).

A five-face is indexed by a 5-subset \(S\subseteq\{0,\ldots,6\}\), with complementary pair \(T=S^c\). The five projected directions in \(S\) are independent exactly when the projection \(K\to\mathbb F_2^T\) has rank two. Thus each face is a witness precisely when its complementary 2-by-2 kernel projection is nonsingular.

Querying a face exposes all 32 subset sums of its five input directions. For a set \(A\) of already-tested faces, define:
- \(R(A)\): kernels for which every face in \(A\) failed;
- \(C(A)\): the union of all input subset-sum vertices exposed by faces in \(A\).

The exact Bellman recurrence for the minimum conditional expected remaining query cost is
\[
V(A)=\min_{f\notin A}\left(
|C(A\cup\{f\})\setminus C(A)|
+\frac{|R(A\cup\{f\})|}{|R(A)|}V(A\cup\{f\})
\right),
\]
with \(V(A)=0\) when \(R(A)=\varnothing\). A query to face \(f\) always incurs its newly exposed vertices; only if it fails does the process continue. Since every continuation is reached only after another zero result, any deterministic adaptive face-selection policy is equivalent to one ordering. Randomized orderings are mixtures and cannot beat the best deterministic ordering.

## Exact computation

The reusable C++ program is sims/agent2-rankfive-witness-order-dp.cpp. It enumerates all 2,667 RREF kernel subspaces and all \(2^{21}=2,097,152\) tested-face states. It computes each state's remaining-kernel bitset and covered-query vertex set, then solves the recurrence bottom-up. This is exact enumeration, not Monte Carlo.

Reproduce with:

~~~sh
g++ -O3 -std=c++20 sims/agent2-rankfive-witness-order-dp.cpp -o /tmp/rank7dp
/tmp/rank7dp
~~~

The run used about 747 MiB maximum resident memory and completed in about 0.55 seconds on the local runtime used for this check.

The globally optimal face order, written as complementary pairs T, is:
\[
(0,1),(0,2),(0,3),(0,4),(0,5),(0,6),
(1,2),(1,3),(1,4),(1,5),(1,6),
(2,3),(2,4),(2,5),(2,6),
(3,4),(3,5),(3,6),(4,5),(4,6),(5,6).
\]
(The complementary faces themselves are the other five coordinates.)

The exact optimal expected number of distinct queries in a successful seven-direction trial is
\[
E[X_7]=V(\varnothing)=53.824521934758.
\]

## Expected cost across fresh trials

The probability that seven random projected directions span rank five is
\[
p_7=\prod_{i=0}^{4}(1-2^{i-7})=0.776149481535.
\]
A failed trial tests all 21 faces, whose union contains
\[
U_7=\sum_{j=0}^{5}\binom 7j=120
\]
vertices. The zero input is already cached on subsequent trials, so each later failed trial adds at most 119 new queries. With K failures before the first successful trial, E[K]=(1-p_7)/p_7, giving
\[
E[W_7]=E[X_7]+119\frac{1-p_7}{p_7}
=88.145503048678.
\]

For comparison, the six-direction sequential strategy has exact expected witness cost 86.009926933736. Adding the same 96 shift-coordinate probes and 726 verifier samples gives:
- six directions: **908.009926933736** expected fast-path queries;
- seven directions, even with the globally optimal face order: **910.145503048678** expected fast-path queries.

Thus seven directions cannot beat six directions within this sequential complete-face search family, even when its face ordering is optimized exactly. The gap is about 2.136 expected distinct queries in favor of six directions.

## Scope and limitations

This proves optimality only for the ordering of the 21 complete fifth-derivative faces after drawing seven directions, under the uniform rank-five projected-direction model and the stated query-union accounting. It does not prove that six directions are globally optimal among all possible witness algorithms, adaptive direction-generation policies, partial-face queries, or larger direction counts. The 8-direction greedy experiment is recorded separately and is not a global optimality proof. Query counts are not target CPU/wall time, and this is not a 2.5× compute-budget or production-obfuscator result.
