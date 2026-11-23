# SCO unqualified free-reference migration guard — 23 November 2026

**Classification:** intermediate correctness donor, not an established academic or security result. Agent 35; branch [agent35/sco-free-name-lexical-guard-20261123](https://github.com/FlareZ123/obfs/tree/agent35/sco-free-name-lexical-guard-20261123). Candidate compiler source: 6de66674807c2a06aabbd2c38e80d0677f7d808f.

## Reproduced failure

Selected SCO source is relocated from a client realm to a trusted Node server. A browser can expose an application-specific unqualified global such as externalBridge that the server does not have; originally the selected export might read its value, but relocated execution might throw ReferenceError. Earlier free-typeof and globalThis-member diagnostics do not cover this ordinary bare-identifier read.

Prior Agent 36 red [run 45000543068](https://github.com/FlareZ123/obfs/actions/runs/45000543068) first observed the gap. Independent **red-first** test-only source da404942ac64613b8e386c19d1d37abb92c2a31f, [run 45267304325](https://github.com/FlareZ123/obfs/actions/runs/45267304325), reproduced it on Ubuntu and Windows Node 22.23.4: four tests, two passing controls and two failures. The first failed test was ordinary return externalBridge; the second was a same-spelled formal parameter in a separate nested function, which does not lexically bind the selected export's read.

The expanded negatives exercise direct, optional-chain, nullish-member, called-closure, object-shorthand, called-nested-function and array-element reads in both selected source and audited private static ESM dependency source. Positive controls exercise proved local const, direct parameters, inert record keys, known Math intrinsic, explicit primitive server constant, and correct absence of the selected private computation body from the client facade.

## Candidate guard

src/sco-selective-partition.js adds firstUnprovedUnqualifiedReference after the existing source/host-effect and free-typeof diagnostics. It resolves visible declarations in enclosing program, function, block, catch, for and switch scopes, explicit server imports/constants/helpers, selected formals, and an intentionally bounded known-global set already handled by the existing host and intrinsic guards. A sibling function's formal is not a reference owner. Ordinary functions' implicit arguments bindings are distinguished from arrows.

The old direct typeof of a **lazy** unexecuted function expression is preserved; immediately invoked functions and constructors reading the unknown global remain refused. DOMException is preserved as an existing known global. Selected parameter defaults/destructuring remain restricted by the preexisting plain-parameter RPC partition gate: this donor **does not** add that syntax as a supported SCO input.

## Two-platform validation pins

At candidate 6de66674807c2a06aabbd2c38e80d0677f7d808f, all four focused Node 22.23.4 Ubuntu/Windows workflows passed and executed strict project/external JSDoc:
- [New lexical negatives and nonzero private positive controls: 45268706031](https://github.com/FlareZ123/obfs/actions/runs/45268706031).
- [Existing host-effect closure, including lazy typeof: 45268524357](https://github.com/FlareZ123/obfs/actions/runs/45268524357).
- [Static private graph admission boundary: 45268533448](https://github.com/FlareZ123/obfs/actions/runs/45268533448).
- [Selected SCO graph: 45268542538](https://github.com/FlareZ123/obfs/actions/runs/45268542538).

Earlier candidate 4fec1a213f348ef02e32e4c9ef6910ed7d8f747b also passed the [selected handler 45268245419](https://github.com/FlareZ123/obfs/actions/runs/45268245419) and [private graph 45268253752](https://github.com/FlareZ123/obfs/actions/runs/45268253752) suites on both platforms. The intermediate [host-effect failure 45268239122](https://github.com/FlareZ123/obfs/actions/runs/45268239122) was **real**: the new guard initially changed established typeof diagnostics and rejected a lazy function-literal control; the later green source fixed both. Two other intermediate failing checks were invalid fixture contracts (unsupported selected destructuring; treating retained public RPC parameter spellings as leaked private bodies). These tests were corrected, not treated as compiler bugs.

For local reproduction: npm ci --ignore-scripts --no-audit --no-fund, then node --test test/sco-private-unqualified-free-reference.test.js, test/sco-private-host-effect-closure.test.js, test/sco-private-graph-admission-boundary.test.js and test/sco-selected-graph.test.js at the indicated source SHA.

## Bounds / disposition

This is source-admission correctness only. A known name can still be a changed/mutated host intrinsic; the existing separate realm-effect checks are not a formal proof of all client-versus-Node behavior. Indirect global reflection, host loader remapping, runtime instrumentation, source extraction and relay attacks remain out of scope. The branch has no comprehensive full Node/Chromium acceptance pin, no whole-session 2.5x measurement and no independent attacker-cost improvement. The global release decision remains **RELEASE-BLOCKED**.

Preserve the focused red and green receipts as an independently reviewable donor. Route overlap through Agent 3's canonical intake; Agent 10 owns comprehensive acceptance. Do not merge or create a competing compiler integration on the basis of these focused checks.

## Repeated source-paired compiler-time comparison

This is an **obfuscator compilation-time** check, not protected hot-path compute under the 2.5x objective. The same deterministic 720-read selected-private source is compiled with and without memoizing per-scope proof decisions; the source/seed and test helper are identical. For each Node22.23.4 OS job, four independent sequential compile calls produce an identical serialized-output SHA-256 digest across all repeats **and both branches**: `6900efb60ebe475a0749cebf34cbbfd84319be79b26d11e737a3ea919725e4a2`. Each focused suite passed all nine tests and strict JSDoc.

| OS | Pre-cache per-call ms, 4 samples | Cached per-call ms, 4 samples | Median pre/cache ratio |
| --- | --- | --- | --- |
| Ubuntu | 1435.235, 1377.663, 1365.137, 1355.130 | 128.117, 86.784, 62.512, 55.241 | 1371.400/74.648 = 18.37x |
| Windows | 1298.442, 1313.473, 1296.131, 1452.631 | 61.007, 45.624, 36.746, 29.930 | 1305.958/41.185 = 31.71x |

**Before:** source `31bea6a2220aeee0e0859dd9e70981fd4dfd52c4`, [run 45270935278](https://github.com/FlareZ123/obfs/actions/runs/45270935278). **After:** source `353a4a75935af7a75d7e61c43f5c9ba6af919982`, [run 45270943151](https://github.com/FlareZ123/obfs/actions/runs/45270943151). This is a narrow, intentionally pathological hoisted-name proof workload, not representative end-to-end compilation performance. Each job ran four repeats in one process; medians are descriptive and not statistically independent CPU samples across runners. The optimized checker caches (scope, name, function parameter-versus-body visibility) facts; no execution output or runtime interpreter changed. Negative original admission proof and project-wide release verdict remain unchanged.

## Lexical-scope index experiment and evidence correction

The memoized proof still visits all declarations for each **distinct** identifier. A separate research branch, [agent35/sco-free-name-indexed-20261123](https://github.com/FlareZ123/obfs/tree/agent35/sco-free-name-indexed-20261123), replaces repeated per-name scans with lazy one-time `Set` inventories of each enclosing lexical scope's declared bindings and function/program var hoists. It preserves the parameter-default versus body-var visibility split, function-expression names, class/catch/loop/switch bindings, and eager rejection of unknown host globals. This is a compiler-only change; it does not rewrite admitted code differently.

Source-paired unique-name fixture: 840 uniquely named `const` bindings used in one selected private function, same source and seed on both branches. **Cached baseline:** `2d3d84f8e1c9bf0c01e6781a8d1c52b541456360`, [run 45271616433](https://github.com/FlareZ123/obfs/actions/runs/45271616433). **Scope-indexed:** `adf20d6a2c52f47890d29352c3ec6660e2bbee4c`, [run 45271626366](https://github.com/FlareZ123/obfs/actions/runs/45271626366). Both passed all focused tests and strict JSDoc on Node22.23.4 Ubuntu and Windows.

| OS | Cached 3 samples, ms | Indexed 3 samples, ms | Median cached/indexed |
| --- | --- | --- | --- |
| Ubuntu | 1059.487, 1037.672, 1040.525 | 126.465, 140.461, 116.540 | 1040.525 / 126.465 = 8.23x |
| Windows | 1609.890, 1579.899, 1617.063 | 151.648, 168.179, 158.506 | 1609.890 / 158.506 = 10.16x |

The original 720-repeated-hoisted-read CPU fixture remains fast on the indexed variant. At those source pins the observed Ubuntu/Windows indexed medians were 44.383 ms and 93.239 ms, versus 49.097 ms and 70.030 ms in cached runs; independent runner contention and JIT effects make these small cross-run differences unsuitable for ranking the two fast variants on the *repeated-name* case. Distinct-name scaling is the decision-changing experiment.

Five further source-pinned two-OS focused plus strict-typecheck runs at `adf20d6` all GREEN: [host-effect closure 45271975700](https://github.com/FlareZ123/obfs/actions/runs/45271975700), [static dependency admission 45271984690](https://github.com/FlareZ123/obfs/actions/runs/45271984690), [selected graph 45271991771](https://github.com/FlareZ123/obfs/actions/runs/45271991771), [static graph fuzz 45271999669](https://github.com/FlareZ123/obfs/actions/runs/45271999669), [actual selected HTTP handler 45272007397](https://github.com/FlareZ123/obfs/actions/runs/45272007397). A larger adversarial lexical-binding corpus (sibling-only declarations, loop-head escaping, catch default, class static var and positive catch/loop/hoist/destructure/switch) passed both OS at `f67cf531d88bbc49a8a58e2bfe195e98ab8e5d01`, [run 45272223641](https://github.com/FlareZ123/obfs/actions/runs/45272223641).

**Digest-scope clarification:** The reported SHA-256 `6900efb6...` is the hash of a JSON representation of **the returned public publication manifest/facade** (clientFile, RPC method names, public/private name arrays). `ScoModulePartition` intentionally returns **no serverFile** or private server source, so the serialized `serverFile:undefined` property does not contribute bytes. The identical digest therefore supports public-facade byte equivalence for each same-source paired variant; it is **not** a private-source digest, complete execution-state proof, or independent anti-reconstruction claim. It is expected that two fixtures with the same public signatures and seed share the same facade hash even when their undistributed private bodies differ.

No comprehensive current-main Node/Chromium acceptance, whole-session runtime budget, or independently measured attacker-cost improvement exists for the indexed variant. Preserve as a research donor and keep RELEASE-BLOCKED.
