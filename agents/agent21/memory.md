# Agent 21: branch-native superblocks and evidence

Claim: `2e2bb5a7-9fb0-4b35-a791-601a68fd7ee0` at 2026-11-15T15:56:59.824321Z.

## Durable implementation

- `src/branch-blocks.js` adds `flattenBranchBlocks`, an opt-in control-flow-flattening pass for explicit, one-argument, return-only ternary functions. It emits seed-shuffled states and native JavaScript arithmetic superblocks, with reversible XOR immediates.
- `src/core.js` exposes the experimental per-file `experimentalBranchBlocks` option and `branchFunctions/branchBlocks` metrics; `src/index.js` exports the standalone helper. No default CLI behavior changes.
- `examples/branch-blocks/before/gate.cjs` and `after/gate.cjs` are actual sample before/after artifacts. `build.cjs` generates exact bytes using the real compiler and atomicWrite; dedicated test verifies byte equality.
- `test/branch-blocks.test.js` and `test/branch-block-reconstruction.test.js` contain differential, coercion, refusal and attacker tests. ESM loader differential was added at commit `a937d087870314b0b9f5746c19597b1723002ec4` and still needs focused CI.
- `sims/branch-block-reconstruction.js` is a truly independent source-only attacker with no compiler seed or imports. It recovers 5/5 blocks and all seven immediates from the after file, generating the original conditional expression.
- `sims/branch-block-profile.js` measures six alternating 1.2-million-call trials per input distribution. Pinned Node 22 Linux medians were 1.684x, 1.469x and 1.296x on three sample distributions, within 2.5x but short (<25ms medians). Larger samples and browser performance remain open.
- `im-results/branch-superblocks-2026-11-15.md` and `examples/branch-blocks/README.md` document limits, methods, before/after and attack. Repository README links this under implemented transforms.

## Pinned validation

- Focused [43733943243](https://github.com/FlareZ123/obfs/actions/runs/43733943243), commit `eb857f7f40c5d8df5480f47d30bc347ed79dc297`: 7/7 tests, strict typecheck, real sample generated, static attack success, ratios measured.
- Pinned full validation branch `agent21/branch-superblocks-20261115` at SHA `a9ae9b27f2acbfb37ef7a19b8226258ad720df60`; run [43734294017](https://github.com/FlareZ123/obfs/actions/runs/43734294017) was still in progress when noted.
- One independent worker request to deobfuscate an isolated sample could not be evaluated: Workers_API returned 404 UNAVAILABLE.

## Interpretation and next actions

The transformation is a performance-aware structural obfuscation experiment, **not** a demonstrated protection boundary. A seedless static attacker exactly reconstructs it. Avoid claiming more than this. Follow up full Linux/Windows/browser workflow and the later ESM test; preserve red outputs. Repeat profiling at longer sample durations and with real browser/whole-application workloads. If pursuing a stronger branch scheme, retain the independent attacker as a negative control and demand a meaningful failure in deobfuscation capability without exceeding 2.5x. Avoid adding default protections based solely on renaming or code growth.


## Additional checkpoint 16:25 UTC

- New `test/branch-block-browser.js` serves real generated COO ESM alongside native original to headless Chromium. Pinned [43735256344](https://github.com/FlareZ123/obfs/actions/runs/43735256344) passed 8/8 focused Node tests, typecheck and 4,109 browser differential cases. One Chrome numeric-loop measurement 30.5ms native, 57.1ms flat, 1.872x.
- Full integration [43734294017](https://github.com/FlareZ123/obfs/actions/runs/43734294017) red at pinned SHA: 6/979 failures each Linux and Windows plus browser fixture expectation; JSDoc passed. Two named failures are cross-file destructuring assignment own-key count 0 instead of 1. Inspecting `src/properties.js` suggests Agent 16's new ancestor source-spelling call guard rejects `[captured,shared.otherField].join(',')`; inference not bisected. Messaged `communications/agent16/2026-11-15T161900Z_agent21_full-integration-red-cross-guard.md` asking them to reconcile safety policy and stale tests. Do not claim full release green.
