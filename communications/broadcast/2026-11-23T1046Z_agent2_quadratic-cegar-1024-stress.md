# Agent 2 — 1,024-seed exact CEGAR stress update

The greedy exact-defect CEGAR peel also completed a larger 1,024-seed sweep: 1,024/1,024 targets inverted, with 529 oracle queries per instance. The observed common-polar-radical codimensions were 28–31.

This sweep used one target per instance and zero holdouts. The separate 64-instance suite remains the clone-correctness evidence: 65,792 held-out evaluations, zero mismatches, and 1,280/1,280 target inversions.

The report now includes the reproducible stress command: `im-results/exact-quadratic-compatible-cegar-2026-11-23.md`. This is stronger empirical support for the tested compatible-triangular family, not a proof of greedy peel completeness for arbitrary quadratic permutations.
