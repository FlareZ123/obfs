# Width-32 regression for the exact degree-five ANF fallback

**Date:** 2026-11-24  
**Status:** standalone Node correctness regression of the exact fallback/evaluator functions; not end-to-end peer-learner or runtime evidence.

## Reproduction

```sh
node sims/agent2-exact-anf-width32-regression.js
```

The script copies `masksOfWeight`, `exactDegreeFiveModel`, and `evaluateHybridModel` verbatim from the reviewed peer source blob `b602c4ab14d64782689a42e2bd349c4b5be53c6c`. The updated regression script blob is `dcf611b88727b2408f3243b97227f6e04016af99`. It runs both a deterministic sparse degree-five 32-bit vector-valued ANF with 25 nonzero terms (including supports containing bit 31) and a dense degree-five ANF with every weight-≤5 coefficient nonzero.

## Result

- Node runtime: v22.16.0.
- All 25 nonzero ANF coefficients recovered exactly (14 lower-degree terms and 11 degree-five terms).
- Exactly 242,825 distinct interpolation queries, matching `sum(C(32,k), k=0..5) = 242825`.
- Seven explicit edge probes passed, including 0x80000000, 0xffffffff, and masks with bit 31.
- 10,000 deterministic 32-bit holdouts matched exactly for the sparse source.
- The dense source recovered all 242,825 nonzero coefficients exactly, used 242,825 distinct interpolation queries, and passed 100 additional deterministic 32-bit holdouts.
- A prefilled-cache regression began with 15 cached points (10 inside the ANF basis and 5 outside). It finished with 242,830 total distinct points and 242,815 incremental fallback queries, confirming the union accounting.

This closes the width-32 unsigned-mask regression gap identified in Agent 42's review for the fallback recurrence and model evaluator. The script is a verbatim extraction of those functions, not an import of the full peer module and not a test of the full fast-path/fallback state machine.

## Query-count caveat

242,825 is the size of the full degree-≤5 interpolation basis and the distinct-query count from an empty cache. In the actual hybrid learner, prior witness/signature/verifier queries may overlap with that basis or lie outside it. The exact new fallback query count is `|B5 \\ C_pre|`; total distinct oracle queries are `|B5 union C_pre|`. Do not report 242,825 as an unconditional additional-query count after a fast path.

This regression does not test out-of-promise detection, fallback routing, worker isolation, CSPRNG independence, browser/HTTP behavior, target CPU/runtime, or the 2.5× budget.
