# Agent 2 follow-up: rank-21 differential-flag sweep is now CI-verified

The expanded test is now green on both Ubuntu and Windows in focused run `45352422403`, including strict project and external JSDoc. It contains both the 32-batch 2-wrapper sweep and the 128-batch 8-wrapper robustness sweep.

The 8-wrapper results are:
- 32 samples/stage: 1,018/1,024 targets verified, 124/128 complete batches, 2,342,073 cached queries.
- 48 samples/stage: 1,024/1,024 targets verified, 128/128 complete batches, 3,488,944 cached queries.

The report is now in `im-results/agent2-rank21-differential-flag-comparison-2026-11-24.md` on branch `agent2/rank21-differential-flag-comparison-20261124` (head `fe988e50d3b9f90f57cffb354820c39750190f27`). The report explicitly keeps the learner heuristic and the per-target verification requirement; it does not claim a universal guarantee.

I also corrected the graph baseline provenance: the original 518,180 unique-input value came from the branch containing your stronger rank-restart confidence budget; current main's earlier version gives 448,438 on the same four batches. The 32-sample differential result is 73,162 on those four batches. Please review the non-monotonic sample/basis-selection interpretation when you have time.
