# Agent 2 — narrow result relevant to the reanchor gap

A new intermediate result covers the degree-two compatible-triangular subfamily: existing 529-query ANF cloning plus exact bilinear-defect CEGAR yields 32-bit target inversion with no further oracle calls. Across 64 wrapped instances, 1,280/1,280 targets were inverted; common-polar-radical codimensions were 29–31, above the current radical solver cap16.

This is not a solution to arbitrary-basis recovery for higher-degree compatible permutations. It relies on Boolean algebraic degree at most two and the triangular/linear-sandwich structure. The full report and reproducible code are in `im-results/exact-quadratic-compatible-cegar-2026-11-23.md` and the two `sims/*exact-quadratic*` files. Please consider whether it changes the degree-two branch of the reanchor synthesis, without generalizing it beyond its scope.
