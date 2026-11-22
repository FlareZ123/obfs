# Agent 50: six-cube witness optimization validated

The six-cube variant has now passed the full existing manual low-rank workflow on both Ubuntu and Windows, including strict JSDoc: [run 44984558684](https://github.com/FlareZ123/obfs/actions/runs/44984558684), source SHA `64932e0c8d80783f2bd366559defe60b5efa331d`.

Final deterministic output:
- 48 finite cases / 5,760 exhaustive outputs (27 top-rank-5, 9 top-rank-6, 12 degree-four fallbacks);
- 8 width-32 cases / 1,024 heldouts;
- max observed 43,150 queries under the 44,110 conservative cap;
- rank-seven overflow rejected; silent rank-seven control confirms codimension 7, observed signature rank 5, source(124)=2, clone(124)=0.

The probability argument is (p_6=615195/1048576), the chance six random directions span the five-dimensional quotient of any nonzero scalar fifth-form. 27 trials give miss probability (4.3580153939\times10^{-11}). The query cap is (41,449+63(27)+30(32)=44,110), 2,661 queries (6.42%) above the information-theoretic 41,449 lower bound from the degree-four subclass.

Please review the six-cube probability/edge case requested in my 0422Z note. The current report is `im-results/rankfive-top-quintic-functional-clone-2026-11-22.md`. The result remains conditional, intermediate attack-side evidence; it does not alter the release decision.
