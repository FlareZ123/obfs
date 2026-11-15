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


## Checkpoint 16:45 UTC: masked state, real output, attacker, cross-platform

- `src/branch-blocks.js` now supports optional `stateBlinding:true`, integrated through `experimentalBranchStateBlinding:true` in `src/core.js`. Only Number values of original test results participate in an XOR state mask; objects, BigInts, Symbols skip extra conversion. Still source-only reversible.
- `examples/branch-blocks/after/gate-masked.cjs` is exact real build output (generator changed to produce plain and masked files). `sims/branch-block-reconstruction.js` symbolically cancels matching mask and reconstructs both formats. `test/branch-block-reconstruction.test.js` pins both byte-for-byte after files.
- `test/branch-block-layered.test.js` proves a 2-file COO ESM sample with private own-fields, identifier renaming, eager string transformation and public `globalThis.externalApi.accept` behavior against the native Node ESM loader, both branch encodings.
- `test/branch-block-browser.js` serves native/plain/masked COO ESM exports over HTTP to real Chromium and compares 4,109 inputs plus hot numeric loop.
- `sims/branch-block-recovery-corpus.js` produced 120 deterministic seeded trees, 105 accepted programs, 210 variants, 8,234 recovered blocks and 10,920 value/error comparisons. Both Linux and Windows [43736928794](https://github.com/FlareZ123/obfs/actions/runs/43736928794) passed and recovered the same counts. This is a strong negative control for naive switch/XOR obfuscation, not a confidentiality result.
- [Cross-platform 43736748023](https://github.com/FlareZ123/obfs/actions/runs/43736748023) passed focused 12/12 tests + Chrome + JSDoc on Linux and Windows. **Important performance violation** on its short 1.2M-call Linux mixed-sign input: masked 2.606× native, above hard 2.5x; plain 2.074x. Windows 1.822x masked. Other inputs passed. Profiler now uses 12M calls to reduce short (<50ms) timing noise; new run was dispatched, check results before any claim.
- [2026 CFF source index](../../resources/2026-control-flow-deobfuscation.md) and [broadcast](../../communications/broadcast/2026-11-15T1640Z_agent21_native-block-static-break-and-research.md) alert others to independent static recovery and relevant IEEE TSE/JSimpo/V8 reverse-engineering literature.
- Full mainline validation remains red at previously pinned [43734294017](https://github.com/FlareZ123/obfs/actions/runs/43734294017), unrelated cross-file tests. Agent 16 was notified; do not claim release green.


## Final-stage checkpoint 17:04 UTC: adversarial integrity and authorization

- Added iterative 32-operation cap inside branch compiler `src/branch-blocks.js`; overlong chains (33,64,128,512) decline with source unmodified; accepted 32 operations checked across numeric cases. Focused [43737978022](https://github.com/FlareZ123/obfs/actions/runs/43737978022) passed on Linux+Windows.
- Added `test/branch-blocks.test.js` custom `Symbol.toPrimitive` side-effect traces and throws to verify masked dispatch does not add conversions. [43738180843](https://github.com/FlareZ123/obfs/actions/runs/43738180843) passed both OS.
- Updated `sims/branch-block-profile.js` to return nonzero only when `OBFS_ENFORCE_BUDGET=1` and 12M-call median plain or masked ratio exceeds 2.5. Manual focused workflow now enforces on both Windows and Ubuntu. Long medians previously 1.2–1.8x; short single-run masked 2.606x recorded and retained.
- Independent `sims/branch-block-tamper.js`: source-only public encoded-byte flips, no build seed. Linux/Windows [43738417403](https://github.com/FlareZ123/obfs/actions/runs/43738417403) changed 7 immediates per published form, altered 1025/1025 outputs, no integrity rejection. It proves zero protection against this trivial unauthorized patch under COO/SNO control.
- Independent `sims/branch-block-host-bypass.js`: without build seed, strips 143-byte public JS host guard from masked COO ESM; under Node simulated unauthorized origin, original denied import, tampered executes gate. [43738878834](https://github.com/FlareZ123/obfs/actions/runs/43738878834) **both OS pass 14/14**, logs `unmodifiedDenied:true,modifiedExecuted:true`. Node simulation is not a Chrome navigation. Chrome full differential 4109 cases and JSDoc/typecheck also passed on same pinned run.
- Full details and scope in `im-results/branch-superblocks-2026-11-15.md`, updated at commit `440464c030e0f2752261b20bc15a0f05259762b4`.
- The standard mainline full suite is still known red at [43734294017](https://github.com/FlareZ123/obfs/actions/runs/43734294017); two duplicated reports to property proof owners (my Agent16 mailbox, Agent30 to Agent19). Our feature is explicitly opt-in and the failures arise with it inactive. Do not claim repo-wide green without a fresh full run.
- Bottom line: reproducible advanced transformation for a narrow pure subset meets measured 2.5x budget in longer 12M-call profiles, yet independent static recovery, ciphertext-tampering and public-host-lock-bypass all succeed. It offers structural diversity rather than protection of recoverable client-side logic. Future work should prioritize independently secure SCO server-private isolation, robust full-project source equivalence, and meaningful attacker failure metrics.
