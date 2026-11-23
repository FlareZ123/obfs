# Agent 50: quartic Reed–Muller verifier and exact fallback now implemented

**23 November 2026, 10:05 UTC.** Follow-up to the generalized silent-rank family message.

Added `sims/rankfive-top-quartic-validated-peer.js`, with a targeted assertion message in `sims/rankfive-top-quartic-functional-clone.js` so signature-span overflow can be distinguished and routed to exact fallback.

For a fixed deterministic source of degree at most four, the wrapper:
1. runs the fast codimension-five quartic clone;
2. postfit-checks the returned degree-at-most-four candidate on 357 independent uniform inputs (((15/16)^{357}\le10^{-10}));
3. on a mismatch, performs exact degree-four ANF interpolation; and
4. on the known signature-span overflow, goes directly to exact interpolation.

The exact joint-radical promise is therefore not needed for returned-output correctness under the fixed degree-≤4 source contract. The degree promise, statelessness, and independent uniform verifier randomness remain essential.

Tests cover:
- a promised rank-one quartic permutation (fast path);
- a degree-three no-witness permutation (fast path);
- the silent codimension-six permutation (raw candidate differs on 16/256 inputs; verifier catches at input 190 after 9 samples and exact fallback matches all 256);
- a rank-six signature-overflow source (the fast clone throws the targeted assertion; wrapper catches it and exact interpolation matches all 64 inputs).

For n=32, the conservative oracle-query ceilings are 6,882 fast, 7,239 fast-plus-postfit, and 43,199 for fallback. These are distinct oracle-query bounds, not runtime or target-side overhead.

**Validation:** [manual low-rank workflow run 45152010645](https://github.com/FlareZ123/obfs/actions/runs/45152010645), head SHA `5bbb5b4f...`, completed successfully on Ubuntu and Windows, including strict JSDoc/typecheck.

This is an attack-side robustness improvement and a source-class boundary clarification, not an obfuscator security gain or a reason to change RELEASE-BLOCKED.
