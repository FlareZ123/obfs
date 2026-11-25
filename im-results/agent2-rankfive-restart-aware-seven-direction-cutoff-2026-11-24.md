# Restart-aware rank-five witness search: optimal seven-direction cutoff

**Date:** 2026-11-24  
**Status:** exact combinatorial result in the injective-subset-sum query-cost model; a conservative upper bound for actual uniform 32-bit query cost. Attack-side research only; not yet integrated into PR #373.

## Finding

The full 21-face seven-direction search is not the best use of a seven-direction batch. If the learner tests only the first ten faces in an optimized order and restarts with fresh directions after ten failures, its exact injective-model expected witness-query cost is **84.502917281728**, below the six-direction strategy's **86.009926933736**. The seven-direction cutoff is also the global optimum among all cutoffs from 1 through 21 and all ordered choices of complete fifth-derivative faces.

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

For each cutoff \(k=1,\ldots,21\), the C++ program optimizes this fractional objective over every ordered sequence of \(k\) faces. Set \(\mu=Q-1\). For a trial \(\mu\), minimize \(E+\mu f\) by a Bellman DP over all \(2^{21}\) face subsets; the terminal penalty at state \(A\) is \(\mu r(A)\), and the transition cost for face \(j\) is \(r(A)\) times its newly exposed query count. Reconstruct the minimizing sequence, calculate \(Q=(E-f)/(1-f)\), then update \(\mu\leftarrow Q-1\). At the optimum, \(\min(E+\mu f)=Q=\mu+1\). The DP enumerates all 2,667 kernels exactly; this is not Monte Carlo. Its query-cost objective treats coordinate-subset masks as distinct query points (the injective-subset-sum model). For actual uniform 32-bit directions, collisions can only reduce the number of distinct oracle inputs, so the model's expected query count and caps are conservative upper bounds.

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

Adding the same 96 shift probes and 726 verifier samples, before negligible cross-stage cache collisions, gives nominal expected total query counts of:
- six directions: **908.009926933736**;
- seven directions, ten-face restart policy: **906.502917281728**.

## Shift-stage compatibility

The exact frozen source table has differential uniformity 2 for every nonzero offset. This property is invariant under an invertible change of the five quotient coordinates induced by choosing a different successful witness face. For each nonzero \(\delta\), the derivative map \(D_\delta H(q)=H(q)\oplus H(q+\delta)\) is exactly 2-to-1, with fibers \(\{q,q+\delta\}\). Therefore \(D_uD_\delta H(q)=0\) for nonzero \(u\) only when \(u=\delta\). Any two distinct nonzero fixed offsets separate every \(\delta\), so the fixed-pair shift strategy remains valid in any successful face basis for this exact table. This is a property of the frozen source table, not a general guarantee for arbitrary tables.

## Exact-integer exhaustive verification (2026-11-25)

The original cutoff DP used double-precision Bellman values and a floating tolerance when choosing transitions. A separate exact-integer implementation now checks the full cutoff sweep:

- Code: `sims/agent2-rankfive-witness-restart-dp-exact.cpp`.
- It independently reconstructs all 2,667 RREF kernels and all (2^{21}) face states.
- Every reach probability has common integer denominator (D=33,554,432\times2,667=89,489,670,144). For a Dinkelbach parameter (mu=a/b), transition and terminal costs are scaled to integers; all Bellman comparisons, Dinkelbach convergence checks, and cross-cutoff comparisons use unsigned 128-bit integer arithmetic. Floating point is used only to print decimal values.
- It reproduces every cutoff (k=1,ldots,21), and the exact minimum remains (k=10). The selected value is (5,526,035,598,783/65,394,613,305=2,072,004,349/24,519,915=84.502917281728). The nearest alternatives are (k=9) at 84.694318982044 and (k=11) at 84.776281468001.
- A local GCC 12-style C++20 build completed the full sweep in 5.61 seconds with 693,760 KiB peak RSS. The implementation uses the GCC/Clang `unsigned __int128` extension; it is a research verifier, not a portable MSVC build.

A second, lightweight Python check, `sims/agent2-rankfive-witness-independent-check.py`, independently enumerates the RREF kernels using exact `Fraction` arithmetic. It reproduces the ten-face prefix reach probabilities, increments, (E_7), (f_7), (Q_7), and the six-direction comparator. It also checks the trial-count and query-cap inequalities.

## Actual 32-bit query-collision bounds

The injective model treats all nonzero subset masks as distinct, both within a trial and across trials. The repeated-trial formula already accounts for the shared zero query. Actual uniform 32-bit direction draws can have two further kinds of collisions; both reduce, rather than increase, the number of distinct queries.

1. **Within-trial direction dependence.** For (m) uniform 32-bit directions, let (P_{dep,m}=1-\prod_{i=0}^{m-1}(1-2^{i-32})). If the directions are linearly dependent, subset masks can collide. Bounding the per-trial savings by the full face-union size gives a repeated-trial correction at most (C_{max}P_{dep,m}/(1-f_m)): less than (3.7632038\times10^{-6}) queries for seven directions and (1.5751008\times10^{-6}) for six.

2. **Nonzero collisions across different trials.** Fix the rank-five map (P:\mathbb F_2^{32}\to\mathbb F_2^5). Conditional on all five-bit projections, each direction's component in (ker P\cong\mathbb F_2^{27}) is independent uniform. Every nonempty subset sum in a fresh trial therefore has a uniform 27-bit kernel component, even after conditioning on the face-reach event (which depends only on the projections). Its probability of equaling any fixed previous nonzero query point is at most (2^{-27}). With at most (C_{max}-1) nonzero points per trial and trial (j) reached with probability (f_m^{j-1}), a pairwise union bound gives
   [
   \Delta_{cross,m}\le\frac{(C_{max}-1)^2}{2^{27}}\frac{f_m}{(1-f_m)^2}.
   ]
   This is less than (3.1796747\times10^{-5}) queries for seven directions and (3.4388853\times10^{-5}) for six.

Combining both corrections bounds the actual expected witness-query savings from the injective model by less than (3.5559951\times10^{-5}) (seven) and (3.5963954\times10^{-5}) (six). The injective-model gap (Q_6-Q_7=1.50700965200852) therefore implies an unconditional seven-direction advantage between **1.5069736880 and 1.5070452120 expected witness queries**, under the stated uniform independent direction model. This bound is intentionally conservative; it does not turn query savings into a CPU/runtime advantage.

## Reproduction and scope

The exact C++ implementation is sims/agent2-rankfive-witness-restart-dp.cpp. Reproduce with:

~~~sh
g++ -O3 -std=c++20 sims/agent2-rankfive-witness-restart-dp.cpp -o /tmp/rank7restartdp
/tmp/rank7restartdp
~~~

The local run completed in 3.10 seconds with maximum resident memory 728,576 KiB. Dinkelbach converged in two or three iterations for each cutoff.

This result is optimal only among restart policies that draw seven random directions, query complete fifth-derivative faces sequentially, and restart after a fixed cutoff. It does not prove optimality over other direction counts, partial-face queries, nonuniform/adaptive direction generation, or different algebraic witness methods. The result should be peer-reviewed and benchmarked before any production change.


**Error-bound interpretation:** the 18-trial witness-miss probability is a fast-path availability bound. In the hybrid learner, exhausting the witness cap routes to exact degree-five interpolation; it does not itself produce an incorrect accepted model. The independent 726-sample RM verifier retains its separate false-acceptance bound \((31/32)^{726}<10^{-10}\). Do not add the witness-miss and verifier bounds as though both were correctness failures; they describe different outcomes. Exact fallback has a substantially larger query cost and is outside the fast-path cap.
