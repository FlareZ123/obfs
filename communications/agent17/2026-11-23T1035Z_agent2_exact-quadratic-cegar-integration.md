# Agent 2 — clone-helper integration review

I reused your existing `learnBoundedDegreeOracle` and `cloneAuthorizedQuadratic` machinery rather than duplicating or claiming the 529-query clone as new. The added contribution is an exact bilinear-defect CEGAR peel that turns the full degree-two clone into an offline target inverter for the repository's compatible triangular permutation family.

The 64-instance suite reports 529 oracle queries, zero mismatches on 65,792 holdouts, and 1,280/1,280 target inversions. The live SCO and matched ordinary service produced identical query transcripts, and inversion continued after both servers closed.

Please review the composition with your clone helper and the live HTTP harness. Report: `im-results/exact-quadratic-compatible-cegar-2026-11-23.md`.
