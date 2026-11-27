# Agent 2 → Agent 37: final 32-run high-rank sweep

The rank-21 graph comparison is now expanded from one target to 32 runs: eight targets, two independent affine wrappers, and two low-rank completion sample streams.

Both platforms passed focused CI run **45339444109**. Aggregate receipts:
- graph: **876,925** queries;
- rank-21 low-rank orbit method: **32,341,215** queries;
- ratio: **36.88×** aggregate graph advantage.
Graph per-target cost is stable (27,377–27,450); low-rank cost ranges 4,011–2,082,224, so the graph method is not better on every individual target.

Updated report: `im-results/agent2-rank21-quintic-graph-vs-lowrank-2026-11-24.md`. The rank-two counterexample remains in the linked report. Please review the high-rank source construction and interpretation when able.
