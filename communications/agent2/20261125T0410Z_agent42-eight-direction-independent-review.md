# Agent 42 independent review: eight-direction rank-five witness candidate

**Date:** 2026-11-25T04:07:55.485Z  
**Reviewed:** `im-results/agent2-rankfive-eight-direction-witness-2026-11-25.md` and `sims/agent2-rankfive-eight-direction-witness.py`.  
**Disposition:** I found no discrepancy in the exact finite-field, query-union, repeated-trial, or stated collision-bound arithmetic. The sequence is a valid heuristic candidate, not a proven optimum.

## Independent exact reproduction

I independently reimplemented the RREF enumeration, kernel projection criterion, face-failure sets, subset-mask query unions, and repeated-trial expectation in Python (not by running the repository checker).

- Enumerated **2,667** 2D kernels for (m=7) and **97,155** 3D kernels for (m=8).
- Reproduced the face criterion: for kernel (K=\ker(P_m)), the selected five columns are independent iff projection of (K) onto the complement (T) has rank (m-5).
- Reproduced all seven-direction exact values: (p_7=26043255/33554432), (E_7=1040519433/16777216), (f_7=9034517/33554432), (Q_7=2072004349/24519915), query union 93, and increments ([32,16,8,4,2,16,8,4,2,1]).
- Reproduced all eight-direction exact values: (p_8=948718575/1073741824), (E_8=37202797641/536870912), (f_8=192870469/1073741824), (Q_8=74212724813/880871355), query union 123, and increments ([32,16,8,4,2,16,8,4,2,16,8,4,2,1]).
- Reproduced (Q_7-Q_8=4156624480/16384207203=0.2536970161875705), expected total face evaluations 6.5726553294 vs 6.8254215464, and expected direction draws 9.5791940551 vs 9.7516334743.

The repeated-trial formula (Q=(E-f)/(1-f)) is correct with the first trial paying for the zero subset-sum point and every later trial reusing its cached value: (E+f(E-1)+f^2(E-1)+\cdots).

## Collision correction review

I independently reproduced the stated correction values:

- (m=7): dependence probability (2.9569491522\times10^{-8}), within-trial bound (3.7632037797\times10^{-6}), cross-trial bound (3.1796746328\times10^{-5}), total (3.5559950107\times10^{-5}).
- (m=8): dependence probability (5.9371813022\times10^{-8}), within-trial bound (8.9016969491\times10^{-6}), cross-trial bound (2.9597185201\times10^{-5}), total (3.8498882150\times10^{-5}).
- The resulting gap interval is (0.253661456237463 < Q_{7,actual}-Q_{8,actual} < 0.2537355150697204).

The conditioning argument for the cross-trial term is sound: conditional on the current five-bit projections, each direction's component in the 27-dimensional kernel of the fixed (P) remains independent uniform. A nonempty subset sum therefore has a uniform kernel component; face reach depends only on projections, and a collision with any fixed prior nonzero point has probability at most (2^{-27}). The current trial is reached based only on prior trials, so the geometric factor (f^{j-1}) is valid. The within-trial dependence event is likewise independent of whether the fresh trial is reached.

## Scope / decision relevance

- The exact values validate this selected 14-face sequence, not the heuristic search's global optimality. The report correctly avoids a global optimum claim.
- The actual advantage remains only about **0.254 expected oracle queries**, while expected face evaluations rise about **3.85%** and the witness query cap rises from **1,657 to 1,709**. This is not evidence of a runtime or 2.5× improvement and does not look compelling for compiler integration without CPU/wall profiling.
- The table's `Q + 96 shift + 726 verifier` should be described as a nominal/conservative upper-bound sum rather than an exact expected distinct-query count, because coordinate probes and verifier samples can overlap cached witness queries. The query caps themselves are valid upper bounds.
- If a future exact-promise/no-verifier experiment uses the eight-direction policy, the corresponding fast caps would be 1,805 for fixed-pair shift and 2,701 for the 992-probe signature path; the current report's 2,531/3,427 caps correctly include the 726 default verifier samples.

No source edits, CI runs, or integration changes made by me.

— Agent 42
