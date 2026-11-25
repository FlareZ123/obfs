# Restart-aware rank-five witness search: optimal seven-direction cutoff

**Date:** 2026-11-24  
**Status:** exact intermediate result; proposed attack-side optimization, not yet integrated into PR #373.

## Finding

The full 21-face seven-direction search is not the best use of a seven-direction batch. If the learner tests only the first ten faces in an optimized order and restarts with fresh directions after ten failures, its exact expected witness-query cost is **84.502917281728**, below the six-direction strategy's **86.009926933736**. The seven-direction cutoff is also the global optimum among all cutoffs from 1 through 21 and all ordered choices of complete fifth-derivative faces.

The optimal ten complementary pairs are:
\[
(0,1),(0,2),(0,3),(0,4),(0,5),
(1,6),(2,6),(3,6),(4,6),(5,6).
\]
This is a double-star graph \(K_{2,5}\): two center directions, each paired with the five middle directions. The newly exposed query counts are
\[
(32,16,8,4,2,16,8,4,2,1),
\]
for a total of 93 distinct subset-sum vertices per trial.

## Exact model and objective

There are 2,667 two-dimensional kernels of full-rank 5-by-7 projected-direction matrices. For a tested-face set \(A\), let \(R(A)\) be the number of those kernels on which all tested faces fail, and let \(C(A)\) be the union of subset-sum vertices already queried.

The unconditional probability that another face is reached is
\[
r(A)=(1-p_7)+p_7\frac{|R(A)|}{2667},
\qquad
p_7=\prod_{i=0}^{4}(1-2^{i-7})
=\frac{26043255}{33554432}.
\]
The first term accounts for rank-deficient projected matrices, which cannot have a successful fifth-derivative face.

For an ordered face sequence, let \(E\) be the expected number of distinct queries in one fresh trial (including the zero input), and \(f\) its unconditional failure probability. Since the zero input is cached across trials, each subsequent trial costs one fewer new query in expectation. The total expected query count over repeated trials is therefore
\[
Q=E+f(E-1)+f^2(E-1)+\cdots
=\frac{E-f}{1-f}.
\]

For each cutoff \(k=1,\ldots,21\), the C++ program optimizes this fractional objective over every ordered sequence of \(k\) faces. It uses Dinkelbach iterations: for a trial value \(\lambda\), minimize \(E+\lambda f\) by a Bellman DP over all \(2^{21}\) face subsets, then update \(\lambda\leftarrow(E-f)/(1-f)\). The DP enumerates all 2,667 kernels exactly; this is not Monte Carlo.

## Optimal cutoff comparison

| Faces per trial | Optimal expected witness queries | Failure probability per trial | Query union per trial |
|---:|---:|---:|---:|
| 6 | 86.009926933736 | 0.413304328918 | 63 |
| 7 | 85.590594377712 | 0.289911985397 | 89 |
| 8 | 85.057416274316 | 0.284091591835 | 90 |
| 9 | 84.694318982044 | 0.274196922779 | 92 |
| **10** | **84.502917281728** | **0.269249588251** | **93** |
| 11 | 84.776281468001 | 0.268958568573 | 94 |
| 12 | 85.272057269646 | 0.236073344946 | 105 |
| 13 | 85.532726450826 | 0.234909266233 | 107 |
| 14 | 85.750563129009 | 0.234327226877 | 108 |
| 15 | 86.010989872957 | 0.234036207199 | 109 |
| 16 | 86.704625324162 | 0.226469695568 | 114 |
| 17 | 86.954151133818 | 0.226178675890 | 115 |
| 18 | 87.211384066926 | 0.225887656212 | 116 |
| 19 | 87.632896481960 | 0.224432557821 | 118 |
| 20 | 87.889295903085 | 0.224141538143 | 119 |
| 21 | 88.145503048678 | 0.223850518465 | 120 |

Cutoffs 1–5 are also evaluated by the script; their expected witness costs are 105.025396825397, 95.477282812767, 90.463535952015, 87.924703874381, and 86.649102290934 respectively. Thus cutoff 10 is the minimum over all 21 cutoffs.

The exact ten-face values are:
\[
f_{10}=\frac{9034517}{33554432},\quad
1-f_{10}=\frac{24519915}{33554432},
\]
\[
E_{10}=\frac{1040519433}{16777216},\quad
Q_{10}=\frac{2072004349}{24519915}
=84.502917281728.
\]

## Reliability and query caps

With \(f_{10}=0.2692495882511139\), 18 independent trials give
\[
f_{10}^{18}=5.5308370176\times10^{-11}<10^{-10},
\]
whereas 17 trials give \(2.0541673076\times10^{-10}\). The witness stage therefore needs 18 trials, each drawing seven directions and testing ten faces.

The first trial uses at most 93 witness queries; each later trial reuses the zero input and adds at most 92. Hence:
- witness cap: \(93+17\cdot92=1657\);
- fast-path cap including 96 shift probes and 726 verifier samples: **2479**;
- signature-fallback cap including 992 signature probes instead of 96 shift probes: **3375**.

For comparison, the current six-direction strategy uses 27 trials, a 1,675 witness-query cap, and a 2,497 fast-path cap. The ten-face seven-direction strategy lowers the expected witness cost by 1.507009652008 queries and the fast-path cap by 18 queries. It draws 126 direction words rather than 162. It does evaluate 180 complete faces across all trials rather than 162, so this is a query-count result, not a CPU-runtime or 2.5× compute result.

Adding the same 96 shift probes and 726 verifier samples gives expected total query counts of:
- six directions: **908.009926933736**;
- seven directions, ten-face restart policy: **906.502917281728**.

## Shift-stage compatibility

The exact frozen source table has differential uniformity 2 for every nonzero offset. This property is invariant under an invertible change of the five quotient coordinates induced by choosing a different successful witness face. For each nonzero \(\delta\), the derivative map \(D_\delta H(q)=H(q)\oplus H(q+\delta)\) is exactly 2-to-1, with fibers \(\{q,q+\delta\}\). Therefore \(D_uD_\delta H(q)=0\) for nonzero \(u\) only when \(u=\delta\). Any two distinct nonzero fixed offsets separate every \(\delta\), so the fixed-pair shift strategy remains valid in any successful face basis for this exact table. This is a property of the frozen source table, not a general guarantee for arbitrary tables.

## Reproduction and scope

The exact C++ implementation is sims/agent2-rankfive-witness-restart-dp.cpp. Reproduce with:

~~~sh
g++ -O3 -std=c++20 sims/agent2-rankfive-witness-restart-dp.cpp -o /tmp/rank7restartdp
/tmp/rank7restartdp
~~~

The local run completed in 3.39 seconds with maximum resident memory 728,576 KiB. Dinkelbach converged in two or three iterations for each cutoff.

This result is optimal only among restart policies that draw seven random directions, query complete fifth-derivative faces sequentially, and restart after a fixed cutoff. It does not prove optimality over other direction counts, partial-face queries, nonuniform/adaptive direction generation, or different algebraic witness methods. The result should be peer-reviewed and benchmarked before any production change.
