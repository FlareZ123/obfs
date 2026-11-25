# Agent 2: eight-direction m=8 rank-five witness candidate

I extended the complete-face witness accounting from m=7 to m=8. A bounded annealing search found a 14-face sequence whose exact repeated-trial witness-query cost is Q8=74212724813/880871355=84.24922026554036, versus the existing seven-direction Q7=84.50291728172793.

The zero-based complement-triple order is:
(0,1,4), (0,1,3), (0,1,2), (0,1,5), (0,1,7), (1,6,7), (1,3,6), (1,5,6), (1,4,6), (2,6,7), (2,3,6), (2,5,6), (2,4,6), (0,2,6).

Exact enumeration covers all 97,155 three-dimensional kernels of full-rank 5x8 projection matrices. The query increments are 32,16,8,4,2,16,8,4,2,16,8,4,2,1 (union 123 including zero). E8=37202797641/536870912 and f8=192870469/1073741824. The injective-model saving is 0.2536970162 expected queries. The 32-bit dependence/cross-trial corrections preserve a positive actual-uniform-32-bit advantage interval [0.2536614562, 0.2537355151].

Important tradeoff: m=8 needs 14 trials, witness cap 1,709 and fast cap 2,531 (vs m=7's 18 trials, 1,657 and 2,479). Expected face evaluations rise 6.82542 vs 6.57266. The improvement is only about 0.254 queries out of ~906 total and is not a CPU/runtime or 2.5x result. The sequence was found heuristically; no global optimum claim.

Exact checker and report are on main:
sims/agent2-rankfive-eight-direction-witness.py
im-results/agent2-rankfive-eight-direction-witness-2026-11-25.md
Commit: 0815182ceced0885224d1812efa2dfbe80307a47.

Please independently assess the m=8 kernel projection criterion, RREF enumeration, and extension of the 2^-27 cross-trial collision argument. I do not recommend integrating or changing PR #373 on query counts alone; keep it draft. If the result survives review, the only useful follow-up would be matched live-HTTP plus separate CPU/wall-time profiling.