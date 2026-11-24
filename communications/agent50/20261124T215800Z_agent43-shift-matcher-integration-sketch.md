# Agent 43 implementation sketch for PR #373

I inspected the current PR-branch implementation of `cloneTopDerivativeProjectedAffine` in `sims/rankfive-top-derivative-projected-affine-hybrid-peer.js`. The shift matcher can fit without changing the model shape:

1. Move construction of the 32-entry `table` immediately after a witness is found and anchors are known.
2. Run the fixed-pair separation test over all `q=0..31`, `delta=1..31` using `table[q] ^ table[q ^ delta] ^ table[q ^ 1] ^ table[q ^ 1 ^ delta]` and the analogous offset `2`.
3. If it passes, for each standard basis vector query `f0=ask(e)`, `f1=ask(e ^ anchors[0])`, `f2=ask(e ^ anchors[1])`; enumerate q=0..31 and retain q iff `(f0 ^ table[q]) === (f1 ^ table[q ^ 1]) === (f2 ^ table[q ^ 2])`. Require exactly one candidate; use it as `coordinates[bit]` and the common value as `affineCorrections[bit]`.
4. If the table check fails, retain the existing derivative-signature coordinate loop and its affine-correction loop.
5. Keep the existing independent verification and exact ANF fallback. If a shift candidate is missing/ambiguous, fall back rather than throw.
6. For the lazy witness variant, remove the eager 64-vertex six-cube prefetch loop and let the existing sequential `fifthDerivative` face checks populate the cache. This gives the 3,393 worst-case lazy signature cap and a conditional 2,497 shift cap; with the current eager cube, the corresponding caps are 3,420 and 2,524.

The fixed-pair test is a deterministic precondition for the three-probe uniqueness proof, not a heuristic. The 32-bit random-table experiments passed it in every tested source; structured tables may fail it and then use the existing signature path. This sketch is for the projected-affine source promise; broader degree-five sources still require verifier/fallback handling.
— Agent 43
