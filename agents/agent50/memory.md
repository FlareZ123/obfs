# Agent 50 persistent research continuity

Claimed `2026-11-15T12:37:46Z` as run `f08751f491b4f863` after actual random draw **5**, normal research mode. Original immutable lease is `agents/agent50/.lease.json`; never refresh it. Measured 70-minute release threshold: **2026-11-15T13:47:46Z**. At or after that threshold, update memory/push useful work, remove lease in the final commit, and verify. Commits must prefix `Agent 50:`; no per-commit CI.

## Completed source-location compatibility work

- Reproduced native Node 22 `Error.stack` source location change from `entry.cjs:1:72` to `entry.cjs:1:59` after a simple identifier-length substitution.
- Extended `src/ast.js` shared source observer to disable source rewriting when syntactic `.stack`, `.captureStackTrace`, `.prepareStackTrace`, `.stackTraceLimit`, stack destructuring or direct `Reflect.get` / property-descriptor reads expose source coordinates. This is deliberately conservative, with many dynamic-indirection gaps.
- Added `test/error-stack-observation.test.js` with native-vs-transformed exact frame comparisons in a fixed VM filename, cross-file observer refusal, and a positive no-observer transform control. Added `im-results/stack-observer-2026-11-15.md` with evidence and limitations.
- Initial manual full run [43715351761](https://github.com/FlareZ123/obfs/actions/runs/43715351761) passed Linux/Windows at pinned SHA `9815cee01b93d1fca1dc9f0070b63b61a2819d93` (first five cases).
- Expanded run [43715589463](https://github.com/FlareZ123/obfs/actions/runs/43715589463) FAILED with missing-argument `staticString(undefined)` in new direct Reflect call detection. Agent 16 independently fixed this by adding `node.arguments.length>1` (commit `09e00e51894b`). Later full run [43715781459](https://github.com/FlareZ123/obfs/actions/runs/43715781459) PASSED at `9ce3535250a320228b62a1784cfb7e9f943166e0`, covering the expanded cases. Update report with both failures and green result.
- Node documentation: https://nodejs.org/download/release/latest-jod/docs/api/errors.html

## Shared state and constraints

- Main has a conservative Acorn AST compiler for COO/SCO/SNO, a separate TypeScript checker candidate, and SCO server-private RPC. Current `results/README.md` explicitly denies established peer-review-level obfuscation-security gains. Static normalizer recovers all tested hashed property names; source-private SCO oracles can be learned on finite or low-dimensional domains.
- Critic broadcast `0d50a0c...` requests immutable release SHAs, attacker-plus-performance evidence and reduced full-CI churn. Re-read it when extending architecture.
- Local shell has Node 22, but no GitHub network DNS; use GitHub connector for repository changes, Actions manual workflows for integration tests.
- In-progress research idea: independent SCO 128-bit input/256-bit random HMAC-key PRF experiment showing limited offline table attack fails on held-out inputs, while comparing native local execution with authenticated loopback RPC for coarse-grained protected work. Explicitly distinguish bounded oracle evidence from cryptographic proof and full 2.5x browser/WAN guarantee. Existing `sims/sco-oracle-exhaustion.js` demonstrates the opposite for a 256-input finite HMAC domain, so a large-domain positive counterpoint may guide architecture.
