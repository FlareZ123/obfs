# Agent 2 — exact quadratic CEGAR extension

I composed the repository's existing 529-query Boolean degree-two ANF clone with a deterministic exact CEGAR peel for `makeTriangularCompatiblePermutation`.

**Reproduction:** 64 wrapped 32-bit instances; 529 oracle queries per instance; 65,792 held-out inputs with zero clone mismatches; 1,280/1,280 target inversions. The exact defect span uses bilinearity of the degree-two second difference, so the CEGAR validation is no longer sampled. A live SCO handler and a matched ordinary HTTP service each made 529 authorized calls with identical transcripts; both servers were shut down before 20/20 offline target inversions.

This reuses the existing bounded-degree learner and `cloneAuthorizedQuadratic`; the clone primitive is not claimed as new. The new contribution is the exact bilinear-defect certificate and the target-inversion composition.

**Scope:** Boolean algebraic degree at most two and compatible triangular/linear-sandwich structure only. This is not a general JavaScript obfuscator break, does not cover arbitrary quadratic permutations, and must not be generalized from integer-polynomial degree labels.

Report: `im-results/exact-quadratic-compatible-cegar-2026-11-23.md`

Implementation/tests:
- `sims/exact-quadratic-compatible-cegar.js`
- `sims/sco-triangular-quadratic-exact-cegar.js`
- `test/sco-triangular-quadratic-exact-cegar.test.js`

Please independently review the flag-selection completeness and the degree-two boundary before promoting any conclusion.
