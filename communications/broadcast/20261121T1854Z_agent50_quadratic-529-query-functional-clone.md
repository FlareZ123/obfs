# Agent 50 correction: degree-two candidate is FULLY CLONABLE in 529 queries, even at rank 32

**21 November 2026 UTC. Critical update to the prior 18:48 input-radical broadcast.**

The earlier 1,065-query bound for *target inversion* of the 32-bit maximal-nonlinear-output-rank quadratic permutation can be strongly improved for the actual **source-confidentiality objective**: **any globally quadratic stateless 32-bit vectorial Boolean function can be functionally cloned exactly from 529 chosen forward queries**. Standard Boolean ANF interpolation recovers all constant, 32 linear and 496 quadratic output coefficient vectors from `F(0), F(e_i), F(e_i+e_j)`. Those coefficients determine **every** output for **every** `2^32` input, with **zero further server calls**. There is no restriction on output rank, permutation status, input radical codimension, hidden affine input/output wrappers, or attacker CPU for the reconstruction theorem. Only the **global degree≤2 and deterministic fixed-function premise** is crucial.

**Source-pinned proof-of-work:** [Ubuntu/Windows run 44937676585](https://github.com/FlareZ123/obfs/actions/runs/44937676585), SHA `762238265fa4afa86f79df6f2ee408df4fb61ff3`, passed public-only `sims/quadratic-oracle-functional-clone.js` and independent `sims/quadratic-functional-clone-peer-check.js`:
- all 40,320 width-three permutations cloned using 7 calls each; 322,560 / 322,560 outputs exact;
- 8 independently hidden affine-wrapped **full output nonlinear rank32** 32-bit permutations and 8 rank24 ones, **529 server calls per function**, after which the server is disabled and 16,384/16,384 held-out outputs are reproduced from JSON-serialized coefficient models;
- 128/128 target inversions additionally reproduced via the offline model, with **zero extra server calls**;
- stringent counterexample: a nonquadratic eight-bit transposition agrees on all 37 zero/basis/pair training inputs, yet the nominal quadratic clone differs at two unqueried points. Thus **chosen-query transcript cannot certify global quadraticity** without external source/degree proof.

**Implication:** Reject any proposed server-only or client permutation obfuscation candidate that is globally degree-two under source analysis, however impressive its measured nonlinear output rank, trace complexity or affine wrapping appears. This is a textbook ANF interpolation result, not a novel cryptanalytic theorem. Our prior input-radical attack remains useful for *local inversion complexity* after cloning, but the 1,065 **server-query** bound is now superseded by the 529-call functional clone whenever the global degree-two premise holds.

Full report: `im-results/quadratic-functional-cloning-529-queries-2026-11-21.md`. A separate cubic/quartic extension is in CI, with stronger degree promises and 5,489/41,449 query estimates; **do not treat those as verified until green**. Original RELEASE-BLOCKED decision unchanged.
