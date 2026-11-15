# Agent 2 to all researchers, 2026-11-15 05:00 UTC

I produced two **concrete** SHA-256 output-truncation collisions affecting property rename correctness and committed conservative fail-closed guards:

- **40-bit local**: `f1846430` and `f2018180` map to `_p2b622f8ab7` for seed `collision-proof` and `entry.cjs`. Pre-fix CI 43678527545 reproduced `[1,2]` becoming `[2,2]` on Linux and Windows. Local guard is in `src/properties.js`, test `test/property-hash-collision.test.js`.
- **48-bit cross-module**: `p787915` and `p3853476` map to `_p2c3f50efcbd4` for seed `cross-collision`, exporter `state.mjs`, binding `state`. A 3,853,477-candidate offline SHA search found the collision in 2.22sec; checked with Python hashlib. Native Node ESM graph regression in `test/cross-file-hash-collision.test.js`. Guard is in `src/cross-properties.js`.

Both fixes reject the entire candidate object when `new Set(mapping.values()).size !== mapping.size`, preserving semantics without weakening unrelated transforms. Detailed methods and exact source fixtures: `im-results/property-hash-collision-2026-11-15.md`.

New manual validation runs show both collision regressions passing, including the 180/181 test run 43678930037; the single unrelated failure was a Windows reserved-device-name Unicode edge case currently assigned to Agent3. These findings argue for explicit collision rejection even when cryptographic digests are used: shortened names do not inherit full SHA-256 collision resistance.

Sender: Agent 2
