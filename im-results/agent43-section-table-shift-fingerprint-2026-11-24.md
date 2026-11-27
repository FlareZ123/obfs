# Section-table shift fingerprint for rank-r oracle learning

**Date:** 2026-11-24  
**Status:** intermediate algorithmic result; local Python prototype only, not yet implemented in the Node.js learner or validated over HTTP.

## Observation

For a promised projected-affine oracle
\[
F(x)=A(x)\oplus b\oplus h(Px),
\]
where (P: \mathbb F_2^n\to\mathbb F_2^r) has rank (r\), choose quotient-basis anchors (a_0,\ldots,a_{r-1}) and define the section table
\[
H(t)=F\left(\sum_i t_i a_i\right).
\]
For every input (x), there is a quotient coordinate (q(x)) and an affine correction (L(x)) such that
\[
F\left(x+\sum_i t_i a_i\right)=H(q(x)+t)\oplus L(x)
\]
for every (t\in\mathbb F_2^r). This follows because the affine parts of (F) and (H) differ by (A(x)\oplus A(s(q(x)))), independent of (t).

Thus (q(e_j)) can be recovered by matching a small number of translated section-table entries, rather than computing all (r) top-derivative contractions for every standard basis vector.

## Exact two-offset separation test

Use the first two anchor coordinates (u=1) and (v=2). Check from the already-known table (H) whether

\[
H(q)\oplus H(q+\delta)\oplus H(q+u)\oplus H(q+u+\delta)
\]
or
\[
H(q)\oplus H(q+\delta)\oplus H(q+v)\oplus H(q+v+\delta)
\]
is nonzero for every basepoint (q\) and every nonzero shift (\delta\).

Call this the fixed-pair separation property. It is a deterministic (O(4^r)) table-only check. If it passes, then for each standard basis vector (e_j), make just three oracle queries:
\[
F(e_j),\quad F(e_j+a_0),\quad F(e_j+a_1).
\]
Enumerate (q\in\mathbb F_2^r) and retain candidates satisfying
\[
F(e_j)\oplus H(q)
=F(e_j+a_0)\oplus H(q+1)
=F(e_j+a_1)\oplus H(q+2).
\]
The true (q(e_j)) always satisfies these equations. If another candidate (q+\delta) also satisfied them, both second differences above would be zero at basepoint (q), contradicting the checked separation property. Therefore the coordinate is unique. Set the affine correction to (L(e_j)=F(e_j)\oplus H(q(e_j))).

The linear assignments (e_j\mapsto q(e_j)) and (e_j\mapsto L(e_j)) define the candidate
\[
G(x)=H(q(x))\oplus L(x).
\]
It is degree at most (r) and exactly equals every promised projected-affine source. Retain the independent RM postfit verifier to reject sources outside the promise; on mismatch, use the exact degree-(r) ANF fallback.

If the fixed-pair separation check fails, an optional greedy offset-cover search can find a larger separating set U; if that is too expensive or yields no query saving, use the original derivative-signature recovery instead. The signature path recovers quotient coordinates under the codimension-(r) top-derivative promise; exact source reconstruction additionally requires the projected-affine residual promise. For broader degree-at-most-r sources, treat the result only as a candidate and retain the independent RM verifier plus exact ANF fallback. The shift fast cap is conditional on the fixed-pair check passing; if it fails, the old lazy derivative-signature cap remains the worst-case promised-family cap. For (r=2), three queries per basis vector equal the original (2^r-1=3) signature queries, so there is no saving.

## Local rank-r reproduction

I independently ported the rank-r reference with the same source/witness/verifier seed schedule used by Agent 50, then added the fixed-pair shift matcher. For each (r=2,\ldots,8), all 50 generated 32-bit projected-table sources passed the fixed-pair separation check; the selected coordinate was unique for every standard basis vector. Both the previous lazy derivative-signature model and the shift-matched model were checked against the oracle on 128 independent heldouts per source (44,800 comparisons for the shift model). No promised-family fallback occurred.

| (r) | Lazy derivative-signature mean | Shift-fingerprint mean | Mean queries saved | Reduction | Shift fast cap |
|---:|---:|---:|---:|---:|---:|
| 2 | 185.86 | 185.86 | 0 | 0.00% | 310 |
| 3 | 418.64 | 290.64 | 128 | 30.58% | 620 |
| 4 | 874.88 | 490.88 | 384 | 43.89% | 1,234 |
| 5 | 1,809.38 | 913.38 | 896 | 49.52% | 2,497 |
| 6 | 3,650.24 | 1,730.24 | 1,920 | 52.60% | 4,962 |
| 7 | 7,411.72 | 3,443.72 | 3,968 | 53.54% | 9,891 |
| 8 | 14,735.70 | 6,671.72 | 8,063.98 | 54.72% | 19,751 |

The shift fast cap is the lazy witness cap plus (3n=96) shift probes and the same verifier sample count. For comparison, the lazy derivative-signature caps are 310, 748, 1,618, 3,393, 6,882, 13,859, and 27,815 for (r=2,\ldots,8). The optimization is therefore cap-neutral at (r=2) and strictly improves the cap for (r\ge3), whenever the fixed-pair check passes. The table is a local deterministic-seed experiment, not a CSPRNG or HTTP benchmark.

## Fallback checks

I also tested the shift/fallback control path on constructed low-width sources for every (r=2,\ldots,8), exhaustively comparing the returned model on all (2^{r+2}) inputs:

- degree-((r-1)) source: no witness, then exact ANF fallback;
- codimension-((r+1)) top derivative: shift ambiguity or signature overflow, then exact fallback;
- silent codimension-((r+2)) source: postfit verification mismatch, then exact fallback;
- lower-degree residual outside the quotient for (r\ge3): postfit verification mismatch, then exact fallback;
- projected-affine monomial-table controls: fixed-pair check may fail and the original derivative signatures still reconstruct exactly.

All returned models matched the source over their complete small domains. These are selected deterministic controls, not a statistical false-accept experiment.

## Why the fixed-pair check often passes for random 32-bit tables

For independent uniform 32-bit table entries, each second-difference equation is a parity of four table words. For fixed (q,\delta), the two equations for (u=1,v=2) are independent except for the three special shifts (\delta\in\{1,2,3\}), where one equation is zero or the two equations coincide. A union bound for failure of the fixed-pair property is approximately
\[
\frac{3\cdot2^r}{2^{32}}+\frac{2^r(2^r-4)}{2^{64}}.
\]
At (r=8), this is below (1.8\times10^{-7}). This is only a heuristic bound for the random-table generator (which forces the top coefficient nonzero); correctness does not depend on it because the property is checked exactly before using the fast path.

## Limits and next validation

- The fixed-pair method is exact when its explicit table check passes; otherwise the original derivative-signature path is retained.
- The RM verifier remains necessary for out-of-promise degree-at-most-(r) sources; exact fallback cost is outside the fast-path cap.
- The source family is synthetic and fixed. No arbitrary-JavaScript, runtime-budget, or 2.5x-compute claim follows.
- Implement this as an optional signature strategy in the Node.js learner, add tests for both fixed-pair branches and the four fallback controls, then rerun manual peer and HTTP workflows on Ubuntu and Windows with fresh independent tapes.


## Standalone Node.js reproduction

The deterministic-seed experiment is now preserved as `sims/agent43-section-table-shift-fingerprint.js` (Node.js, built-in `crypto` only). It independently implements both lazy derivative signatures and the shift matcher, reproduces the same means/maxima, asserts the fixed-pair property for all 350 generated sources, and checks both candidate models against all 44,800 independent heldouts. Local execution used Node v22.16.0 and produced:

- 350 sources, 50 per rank (r=2,\ldots,8);
- 44,800 heldout comparisons, all passing;
- fixed-pair separation passed 350/350;
- total shift-matcher savings: 767,999 distinct oracle queries.

This is a reproducible Node.js simulation, but it is still not the repository's production learner, a browser test, a peer-worker test, an HTTP test, a CSPRNG experiment, or a measurement of the 2.5x runtime budget.


## Independent review and scope clarification

Agent 2 independently reproduced the rank-five shift path in a separate Node 22 script, checked all (32\cdot31) fixed-pair conditions, recovered unique coordinates, and checked 10,000 additional random inputs. The same reviewer found no algebraic counterexample in the promised path and independently confirmed that a structured top-monomial table fails the fixed-pair check, selecting the derivative-signature branch.

Important implementation boundary: the committed Node simulation is only a promised projected-affine fast-path experiment. It throws on shift ambiguity, signature overflow, no witness, or verifier mismatch; it does not implement the production fallback state machine. The selected fallback controls described above were exercised in a separate local Python prototype, not in that committed Node script. Production routing should be explicit: fixed-pair failure → old derivative-signature candidate path; ambiguity/no unique shift candidate → derivative-signature candidate path or exact ANF; signature overflow/no witness/postfit mismatch → exact degree-(r) ANF fallback. Keep the source-family promise explicit: the shift identity is exact for (F=A+b+h(Px)), not for every degree-(le r) function with a codimension-(r) top-derivative radical.


## PR #373 finite positive-matrix cross-check

I also replayed the exact rank-five positive-source SHA seed schedule from `sims/rankfive-top-derivative-projected-affine-hybrid-peer.js` for (n=5,6,7,8), eight cases each. The fixed-pair check passed 32/32; eager-signature, lazy-signature, and shift-matched models all matched the oracle over the complete finite domains (3,840 input checks). Mean query counts (eager signature / lazy signature / shift) were:

| (n) | Eager | Lazy signature | Shift |
|---:|---:|---:|---:|
| 5 | 32 | 32 | 32 |
| 6 | 64 | 64 | 64 |
| 7 | 128 | 128 | 128 |
| 8 | 253.875 | 253.625 | 245.625 |

The small savings here are expected because the six-cube and signature queries nearly saturate these tiny input domains. This is a local Python replay of the PR's source/witness/verifier seed schedule, not execution of the PR branch itself or live HTTP validation.


## Greedy offset-cover extension (Agent 2; independently cross-checked)

The fixed pair ({1,2}) is a special case of a more general shift-separating set (U\subseteq\mathbb F_2^r\setminus\{0\}). For every basepoint (q) and nonzero shift (delta), require at least one (u\in U) with
\[
g_{q,\delta}(u)=H(q)\oplus H(q+\delta)\oplus H(q+u)\oplus H(q+u+\delta)\ne0.
\]
Then the same translated-table matcher uniquely recovers each (q(e_j)) from the probes at offsets ({0\}\cup U), using (1+|U|) oracle queries per standard basis vector.

Under the nonzero top-(r)-coefficient promise, (u\mapsto g_{q,\delta}(u)) is a nonzero vector-valued polynomial of degree exactly (r-1): contracting the nonzero top (r)-form with (delta\ne0) leaves a nonzero top ((r-1))-form. At least one scalar output coordinate is therefore a nonzero RM((r-1,r)) word, whose minimum weight is 2. Since (g_{q,\delta}(0)=0), its support contains at least two nonzero offsets. Consequently **any** set of (2^r-2) distinct nonzero offsets is a separating set. A greedy set-cover search can therefore stop by (2^r-2) offsets; the per-basis query count (1+|U|\le2^r-1) never exceeds the original derivative-signature count. If the set-cover computation is too expensive or a table fails the top-coefficient promise, retain the original signature/fallback route. The straightforward coverage construction is (O(8^r)) and is only a practical suggestion for small (r) (the current suite uses (r\le8)).

Agent 2's exploratory (r=5) table-only sample (50 random tables per output width, with nonzero top XOR coefficient forced) found fixed-pair pass counts of 0/50, 0/50, 6/50, 48/50, 50/50, 50/50 for output widths 1,2,4,8,16,32; greedy-set medians were 7,4,2,2,2,2 (maxima 15,6,3,2,2,2). I independently sampled 50 tables per width with a separate SHA seed schedule and obtained fixed-pair counts 0/50, 0/50, 7/50, 48/50, 50/50, 50/50; greedy medians 7,4,2,2,2,2 (maxima 11,5,3,2,2,2). This is table-only evidence, not an end-to-end low-output oracle experiment or a benchmark. It suggests greedy offsets can preserve savings when the two fixed offsets fail, especially for low-output-rank tables.
